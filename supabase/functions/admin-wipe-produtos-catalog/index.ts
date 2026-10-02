// Edge Function: admin-wipe-produtos-catalog (v1.1)
// Objetivo: wipe total de `produtos` e cascata operacional/fiscal.
// Autorização: administrador (via user_roles), JWT obrigatório.
// NÃO executa nenhuma alteração de schema. Apenas DELETE de dados.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";

// Ordem de deleção (filhos → pais). Cada item vira `DELETE FROM <t>` sem where
// pois o wipe é total (usuário autorizou "Wipe total: apagar produtos e cascatear em lotes/ordens/aplicações/fiscais").
// `registros_consultor_recomendacoes` recebe UPDATE para preservar o histórico do consultor.
const WIPE_ORDER: string[] = [
  // L4 — leaves atreladas a entregas / lotes / ordens
  "fiscal_invoices",
  "entrega_checklist",
  "entrega_comprovantes",
  "entrega_documentos",
  "entrega_etiquetas",
  "entrega_ocorrencias",
  "controle_qualidade",
  "envase",
  "estoque_movimentacoes",
  "ordens_servico_onfarm_status_history",
  "production_order_link",
  "aplicacoes",
  // L3 — dependentes intermediários
  "produto_etiquetas",
  "estoque_embalagens",
  "estoque_produto",
  "entregas",
  "lotes",
  "programacao_producao",
  "os_faturamento_base",
  "ordens_servico_onfarm",
  "ordens_servico",
  "partner_order_items",
  "partner_simulation_items",
  // L2 — FK direto a produtos
  "catalogo_volumes",
  "commercial_campaign_products",
  "cq_parametros_referencia",
  "partner_product_prices",
  "product_crop_recommendations",
  "product_fiscal_profiles",
  "product_target_recommendations",
  "product_technical_profiles",
  "formulacoes",
  // L1 — pai
  "produtos",
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

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(origin, { error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json(origin, { error: "Unauthorized" }, 401);
    }
    const userId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Autorização — apenas administrador
    const { data: roleRow, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "administrador")
      .maybeSingle();
    if (roleErr) return json(origin, { error: "role_check_failed" }, 500);
    if (!roleRow) return json(origin, { error: "forbidden" }, 403);

    // 1) Preservar histórico do consultor: apenas anular referência a produto
    const nullified: Record<string, number> = {};
    {
      const { count, error } = await admin
        .from("registros_consultor_recomendacoes")
        .update({ produto_biologico_sugerido_id: null } as any, { count: "exact" })
        .not("produto_biologico_sugerido_id", "is", null);
      if (error) return json(origin, { error: "nullify_failed", table: "registros_consultor_recomendacoes" }, 500);
      nullified["registros_consultor_recomendacoes.produto_biologico_sugerido_id"] = count ?? 0;
    }

    // 2) Deletar em ordem
    const deleted: Record<string, number> = {};
    for (const table of WIPE_ORDER) {
      const { count, error } = await admin
        .from(table as any)
        .delete({ count: "exact" })
        .not("id", "is", null); // no-op filter para permitir DELETE sem WHERE via PostgREST
      if (error) {
        return json(
          origin,
          { error: "delete_failed", table, deleted, nullified },
          500,
        );
      }
      deleted[table] = count ?? 0;
    }

    const totalDeleted = Object.values(deleted).reduce((a, b) => a + b, 0);
    return json(origin, { ok: true, deleted, nullified, totalDeleted });
  } catch (e) {
    console.error("admin_wipe_failed", e instanceof Error ? e.name : "unknown");
    return json(origin, { error: "internal" }, 500);
  }
});

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(origin), "Content-Type": "application/json" },
  });
}
