// Auditoria SOMENTE LEITURA de referências órfãs a produtos.
// Protegida por JWT + has_role('administrador'). Usa service role apenas
// para leitura (nenhum INSERT/UPDATE/DELETE é feito por esta função).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";

type Target = { table: string; column: string };

const TARGETS: Target[] = [
  { table: "catalogo_volumes", column: "produto_id" },
  { table: "commercial_campaign_products", column: "product_id" },
  { table: "cq_parametros_referencia", column: "produto_id" },
  { table: "entregas", column: "produto_id" },
  { table: "estoque_embalagens", column: "produto_id" },
  { table: "estoque_produto", column: "produto_id" },
  { table: "formulacoes", column: "produto_id" },
  { table: "formulacoes", column: "component_insumo_id" },
  { table: "lotes", column: "produto_id" },
  { table: "ordens_servico", column: "produto_id" },
  { table: "ordens_servico_onfarm", column: "produto_id" },
  { table: "os_faturamento_base", column: "produto_id" },
  { table: "partner_order_items", column: "product_id" },
  { table: "partner_product_prices", column: "product_id" },
  { table: "partner_simulation_items", column: "product_id" },
  { table: "product_crop_recommendations", column: "produto_id" },
  { table: "product_fiscal_profiles", column: "product_id" },
  { table: "product_target_recommendations", column: "produto_id" },
  { table: "product_technical_profiles", column: "produto_id" },
  { table: "produto_etiquetas", column: "produto_id" },
  { table: "programacao_producao", column: "produto_id" },
  { table: "registros_consultor_recomendacoes", column: "produto_biologico_sugerido_id" },
];

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return handlePreflight(req);
  if (origin && !isTrustedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeadersFor(origin), "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await asUser.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return json(401, { error: "Unauthorized" });

    const userId = claims.claims.sub as string;
    const { data: isAdmin, error: rpcErr } = await asUser.rpc("has_role", {
      _user_id: userId,
      _role: "administrador",
    });
    if (rpcErr) return json(500, { error: "role_check_failed" });
    if (!isAdmin) return json(403, { error: "forbidden" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) IDs canônicos
    const { data: produtos, error: prodErr } = await admin
      .from("produtos")
      .select("id, codigo, nome, ativo")
      .order("codigo");
    if (prodErr) return json(500, { error: "produtos_read_failed", detail: prodErr.message });

    const validIds = new Set((produtos ?? []).map((p: { id: string }) => p.id));

    // 2) Para cada tabela/coluna: paginar todos os valores não nulos e contar órfãos.
    const results: Array<{
      tabela: string;
      coluna: string;
      total_referencias: number;
      orfaos: number;
      distinct_ids_orfaos: number;
      sample_ids: string[];
      error?: string;
    }> = [];
    const globalOrphanIds = new Set<string>();

    for (const t of TARGETS) {
      let total = 0;
      const orphanSet = new Set<string>();
      let from = 0;
      const pageSize = 1000;
      let err: string | undefined;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await admin
          .from(t.table)
          .select(t.column)
          .not(t.column, "is", null)
          .range(from, from + pageSize - 1);
        if (error) {
          err = error.message;
          break;
        }
        if (!data || data.length === 0) break;
        for (const row of data as Record<string, string | null>[]) {
          const v = row[t.column];
          if (!v) continue;
          total++;
          if (!validIds.has(v)) {
            orphanSet.add(v);
            globalOrphanIds.add(v);
          }
        }
        if (data.length < pageSize) break;
        from += pageSize;
      }
      // orfaos = quantas linhas apontam para IDs órfãos (recontagem para exatidão)
      let orfaosRows = 0;
      if (!err) {
        for (const t2 of [t]) {
          // já temos total e distinct; para contagem exata de linhas órfãs,
          // recontar com filtro not-in usando os IDs órfãos coletados.
          if (orphanSet.size === 0) {
            orfaosRows = 0;
            break;
          }
          const ids = [...orphanSet];
          // filtro in.(...) suporta várias centenas; se explodir, dividimos em chunks
          const chunks: string[][] = [];
          for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));
          for (const chunk of chunks) {
            const { count, error: cErr } = await admin
              .from(t2.table)
              .select(t2.column, { count: "exact", head: true })
              .in(t2.column, chunk);
            if (cErr) {
              err = cErr.message;
              break;
            }
            orfaosRows += count ?? 0;
          }
        }
      }
      results.push({
        tabela: t.table,
        coluna: t.column,
        total_referencias: total,
        orfaos: orfaosRows,
        distinct_ids_orfaos: orphanSet.size,
        sample_ids: [...orphanSet].slice(0, 10),
        ...(err ? { error: err } : {}),
      });
    }

    results.sort((a, b) => b.orfaos - a.orfaos || a.tabela.localeCompare(b.tabela));

    return json(200, {
      generated_at: new Date().toISOString(),
      catalogo_v13: produtos,
      total_produtos: produtos?.length ?? 0,
      resumo: {
        distinct_ids_orfaos_global: globalOrphanIds.size,
        tabelas_com_orfaos: results.filter((r) => r.orfaos > 0).length,
      },
      por_tabela: results,
      sample_ids_orfaos_global: [...globalOrphanIds].slice(0, 50),
    });
  } catch (e) {
    console.error("admin_audit_failed", e instanceof Error ? e.name : "unknown");
    return json(500, { error: "internal_error" });
  }
});
