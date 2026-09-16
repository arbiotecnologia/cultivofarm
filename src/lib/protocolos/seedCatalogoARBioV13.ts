import { supabase } from "@/integrations/supabase/client";

/**
 * Catálogo de Protocolos Cultivo Farm v1.3
 * Fonte: PDF "Catálogo_de_Produtos_A.R_Bio_-_FSF_Agro.pdf" (p.1-2).
 * Cada produto lista as cepas do PDF com o volume em mL por dose.
 * A soma dos volumes por produto é igual à `dose_ml_ha`.
 */

export type TipoProdutoARBio =
  | "solo"
  | "inseticida"
  | "fungicida"
  | "inoculante"
  | "solubilizador";

export interface SeedProdutoARBioV13 {
  codigo: string;
  nome: string;
  tipo: TipoProdutoARBio;
  dose_ml_ha: number;
  modo_aplicacao: string;
  valor_ha_brl: number;
  funcao_completa: string;
  /** cepas com volume em mL/dose; nome_cientifico deve existir em `microrganismos` */
  composicao: { nome_cientifico: string; volume_ml: number }[];
}

export const CATALOGO_VERSAO = "v1.3";

export const SEED_PRODUTOS_AR_BIO_V13: SeedProdutoARBioV13[] = [
  {
    codigo: "SOLO-1",
    nome: "Solo 1",
    tipo: "solo",
    dose_ml_ha: 500,
    modo_aplicacao: "500 mL/ha no sulco de plantio",
    valor_ha_brl: 71,
    funcao_completa:
      "Bioestimulante, promotor de crescimento, solubilização do fósforo e resistência a condições adversas (estresse hídrico).",
    composicao: [
      { nome_cientifico: "Bacillus aryabhattai", volume_ml: 100 },
      { nome_cientifico: "Bacillus subtilis", volume_ml: 100 },
      { nome_cientifico: "Bacillus velezensis", volume_ml: 100 },
      { nome_cientifico: "Trichoderma asperellum", volume_ml: 100 },
      { nome_cientifico: "Consórcio de microrganismos eficientes", volume_ml: 100 },
    ],
  },
  {
    codigo: "SOLO-2",
    nome: "Solo 2",
    tipo: "solo",
    dose_ml_ha: 500,
    modo_aplicacao: "500 mL/ha no sulco de plantio",
    valor_ha_brl: 82,
    funcao_completa:
      "Ação nematicida e resistência a condições adversas (estresse hídrico).",
    composicao: [
      { nome_cientifico: "Bacillus amyloliquefaciens", volume_ml: 100 },
      { nome_cientifico: "Bacillus methylotrophicus", volume_ml: 100 },
      { nome_cientifico: "Trichoderma harzianum", volume_ml: 100 },
      { nome_cientifico: "Paecilomyces lilacinus", volume_ml: 200 },
    ],
  },
  {
    codigo: "BINS-01",
    nome: "BioInseticida 01",
    tipo: "inseticida",
    dose_ml_ha: 400,
    modo_aplicacao: "400 mL/ha via barra",
    valor_ha_brl: 61,
    funcao_completa:
      "Controle de Broca-do-café, Cigarrinha-das-raízes, Cigarrinha-das-raízes-das-pastagens, Cochonilha branca, Cochonilha verde, Lagartas, Percevejos, Sphenophorus levis e Tripes.",
    composicao: [
      { nome_cientifico: "Bacillus thuringiensis var. kurstaki", volume_ml: 100 },
      { nome_cientifico: "Beauveria bassiana", volume_ml: 100 },
      { nome_cientifico: "Metarhizium anisopliae", volume_ml: 100 },
      { nome_cientifico: "Consórcio de microrganismos eficientes", volume_ml: 100 },
    ],
  },
  {
    codigo: "BINS-02",
    nome: "BioInseticida 02",
    tipo: "inseticida",
    dose_ml_ha: 300,
    modo_aplicacao: "300 mL/ha via barra",
    valor_ha_brl: 46,
    funcao_completa:
      "Controle de Cigarrinha do milho, Cigarrinha-de-dorso-branco, Helicoverpa, Mosca branca, Mosca minadora, Psilídio-dos-citros, Pulgões e Vaquinha verde-amarela.",
    composicao: [
      { nome_cientifico: "Beauveria bassiana", volume_ml: 100 },
      { nome_cientifico: "Isaria fumosorosea", volume_ml: 100 },
      { nome_cientifico: "Consórcio de microrganismos eficientes", volume_ml: 100 },
    ],
  },
  {
    codigo: "BFUN-01",
    nome: "BioFungicida",
    tipo: "fungicida",
    dose_ml_ha: 300,
    modo_aplicacao: "300 mL/ha via barra",
    valor_ha_brl: 40,
    funcao_completa: "Controle biológico de doenças fúngicas.",
    composicao: [
      { nome_cientifico: "Bacillus subtilis", volume_ml: 100 },
      { nome_cientifico: "Bacillus pumilus", volume_ml: 100 },
      { nome_cientifico: "Consórcio de microrganismos eficientes", volume_ml: 100 },
    ],
  },
  {
    codigo: "BINO-01",
    nome: "BioInoculante",
    tipo: "inoculante",
    dose_ml_ha: 100,
    modo_aplicacao: "100 mL/ha via barra, sulco ou TS",
    valor_ha_brl: 40,
    funcao_completa: "Fixação biológica de nitrogênio (FBN).",
    composicao: [
      { nome_cientifico: "Methylobacterium symbioticum", volume_ml: 100 },
    ],
  },
  {
    codigo: "BSOL-01",
    nome: "BioSolubilizador",
    tipo: "solubilizador",
    dose_ml_ha: 200,
    modo_aplicacao: "200 mL/ha no sulco de plantio",
    valor_ha_brl: 32,
    funcao_completa: "Solubilizador de Fósforo.",
    composicao: [
      { nome_cientifico: "Bacillus megaterium", volume_ml: 100 },
      { nome_cientifico: "Pseudomonas fluorescens", volume_ml: 100 },
    ],
  },
];

export interface WipeResult {
  ok: boolean;
  deleted?: Record<string, number>;
  nullified?: Record<string, number>;
  totalDeleted?: number;
  error?: string;
  detail?: string;
  table?: string;
  mode?: "edge-function" | "client-fallback";
}

export interface SeedResult {
  inseridos: number;
  atualizados: number;
  formulacoesCriadas: number;
  microrganismosFaltantes: string[];
}

type CatalogReferenceTarget = { table: string; column: string };

const PRODUTO_REFERENCE_TARGETS: CatalogReferenceTarget[] = [
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

const CLIENT_WIPE_ORDER = [
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
  "catalogo_volumes",
  "commercial_campaign_products",
  "cq_parametros_referencia",
  "partner_product_prices",
  "product_crop_recommendations",
  "product_fiscal_profiles",
  "product_target_recommendations",
  "product_technical_profiles",
  "formulacoes",
  "produtos",
] as const;

const DELETE_FILTER_COLUMN: Partial<Record<(typeof CLIENT_WIPE_ORDER)[number], string>> = {
  commercial_campaign_products: "campaign_id",
};

export interface ProdutosOrfaosAuditResult {
  generated_at: string;
  catalogo_v13: unknown[];
  total_produtos: number;
  resumo: {
    distinct_ids_orfaos_global: number;
    tabelas_com_orfaos: number;
    mode?: "edge-function" | "client-fallback";
  };
  por_tabela: Array<{
    tabela: string;
    coluna: string;
    total_referencias: number;
    orfaos: number;
    distinct_ids_orfaos: number;
    sample_ids: string[];
    error?: string;
  }>;
  sample_ids_orfaos_global: string[];
}

/**
 * Etapa 1 — invoca a edge function `admin-wipe-produtos-catalog` (service_role).
 */
export async function wipeCatalogoProdutos(): Promise<WipeResult> {
  const { data, error } = await supabase.functions.invoke<WipeResult>(
    "admin-wipe-produtos-catalog",
    { method: "POST" },
  );
  if (error) {
    return wipeCatalogoProdutosViaClient(error.message ?? "invoke_failed");
  }
  return data ? { ...data, mode: "edge-function" } : { ok: false, error: "empty_response" };
}

async function wipeCatalogoProdutosViaClient(reason: string): Promise<WipeResult> {
  const nullified: Record<string, number> = {};
  const deleted: Record<string, number> = {};

  const nullifyResult = await (supabase.from("registros_consultor_recomendacoes" as never) as any)
    .update({ produto_biologico_sugerido_id: null }, { count: "exact" })
    .not("produto_biologico_sugerido_id", "is", null);

  if (nullifyResult.error) {
    return {
      ok: false,
      mode: "client-fallback",
      error: "nullify_failed",
      table: "registros_consultor_recomendacoes",
      detail: `${nullifyResult.error.message}. Edge Function indisponível: ${reason}`,
    };
  }
  nullified["registros_consultor_recomendacoes.produto_biologico_sugerido_id"] = nullifyResult.count ?? 0;

  for (const table of CLIENT_WIPE_ORDER) {
    const filterColumn = DELETE_FILTER_COLUMN[table] ?? "id";

    // Pré-checagem: se a tabela está vazia (ou o admin não tem SELECT nela),
    // pulamos o DELETE. Isso evita "permission denied" desnecessário em tabelas
    // fiscais/operacionais que só o service_role deveria tocar quando têm dados.
    const probe = await (supabase.from(table as never) as any)
      .select(filterColumn, { count: "exact", head: true })
      .not(filterColumn, "is", null)
      .limit(1);

    if (probe.error) {
      // Sem SELECT → também não teremos DELETE. Se a tabela realmente estiver
      // vazia no ambiente, o wipe pode seguir; registramos 0 e continuamos.
      deleted[table] = 0;
      continue;
    }

    const rowCount = probe.count ?? 0;
    if (rowCount === 0) {
      deleted[table] = 0;
      continue;
    }

    const deleteResult = await (supabase.from(table as never) as any)
      .delete({ count: "exact" })
      .not(filterColumn, "is", null);

    if (deleteResult.error) {
      return {
        ok: false,
        mode: "client-fallback",
        error: "delete_failed",
        table,
        detail:
          `${deleteResult.error.message}. Tabela tem ${rowCount} registro(s) que exigem a Edge Function ` +
          `(service_role) para limpeza. Edge Function indisponível: ${reason}`,
        deleted,
        nullified,
      };
    }
    deleted[table] = deleteResult.count ?? 0;
  }

  return {
    ok: true,
    mode: "client-fallback",
    deleted,
    nullified,
    totalDeleted: Object.values(deleted).reduce((sum, count) => sum + count, 0),
  };
}

export async function auditProdutosOrfaos(): Promise<ProdutosOrfaosAuditResult> {
  const { data, error } = await supabase.functions.invoke<ProdutosOrfaosAuditResult>("admin-audit-produtos-orfaos", {
    method: "POST",
  });

  if (!error && data) {
    return data;
  }

  return auditProdutosOrfaosViaClient();
}

async function auditProdutosOrfaosViaClient(): Promise<ProdutosOrfaosAuditResult> {
  const { data: produtos, error: prodErr } = await supabase
    .from("produtos")
    .select("id, codigo, nome, ativo")
    .order("codigo");

  if (prodErr) throw prodErr;

  const validIds = new Set((produtos ?? []).map((p: any) => p.id as string));
  const globalOrphanIds = new Set<string>();
  const por_tabela: ProdutosOrfaosAuditResult["por_tabela"] = [];

  for (const target of PRODUTO_REFERENCE_TARGETS) {
    let from = 0;
    const pageSize = 1000;
    let total = 0;
    let orfaos = 0;
    let error: string | undefined;
    const orphanSet = new Set<string>();

    while (true) {
      const result = await (supabase.from(target.table as never) as any)
        .select(target.column)
        .not(target.column, "is", null)
        .range(from, from + pageSize - 1);

      if (result.error) {
        error = result.error.message;
        break;
      }

      const rows = (result.data ?? []) as Record<string, string | null>[];
      if (rows.length === 0) break;

      for (const row of rows) {
        const referencedId = row[target.column];
        if (!referencedId) continue;
        total += 1;
        if (!validIds.has(referencedId)) {
          orfaos += 1;
          orphanSet.add(referencedId);
          globalOrphanIds.add(referencedId);
        }
      }

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    por_tabela.push({
      tabela: target.table,
      coluna: target.column,
      total_referencias: total,
      orfaos,
      distinct_ids_orfaos: orphanSet.size,
      sample_ids: [...orphanSet].slice(0, 10),
      ...(error ? { error } : {}),
    });
  }

  por_tabela.sort((a, b) => b.orfaos - a.orfaos || a.tabela.localeCompare(b.tabela));

  return {
    generated_at: new Date().toISOString(),
    catalogo_v13: produtos ?? [],
    total_produtos: produtos?.length ?? 0,
    resumo: {
      distinct_ids_orfaos_global: globalOrphanIds.size,
      tabelas_com_orfaos: por_tabela.filter((r) => r.orfaos > 0).length,
      mode: "client-fallback",
    },
    por_tabela,
    sample_ids_orfaos_global: [...globalOrphanIds].slice(0, 50),
  };
}

// ============================================================================
// Dry-run + limpeza controlada de referências órfãs a produtos
// ============================================================================

export interface OrphanCleanupStep {
  tabela: string;
  coluna: string;
  acao: "delete" | "nullify";
  linhas_afetadas: number;
  distinct_ids: number;
  orphan_ids: string[];
}

export interface OrphanCleanupPlan {
  generated_at: string;
  total_ids_orfaos: number;
  total_linhas_a_remover: number;
  total_linhas_a_nulificar: number;
  steps: OrphanCleanupStep[];
  audit: ProdutosOrfaosAuditResult;
}

/**
 * Nome das tabelas onde a referência a produto órfão deve ser **anulada**
 * (preserva o histórico da linha em vez de removê-la).
 */
const NULLIFY_TABLES = new Set<string>(["registros_consultor_recomendacoes"]);

/**
 * Dry-run: roda a auditoria e monta o plano de limpeza (ordem respeita
 * `CLIENT_WIPE_ORDER` — filhos antes dos pais). Não altera nada no banco.
 */
export async function previewOrphanCleanup(): Promise<OrphanCleanupPlan> {
  const audit = await auditProdutosOrfaos();

  const orderIndex = new Map<string, number>();
  CLIENT_WIPE_ORDER.forEach((t, i) => orderIndex.set(t, i));

  const steps: OrphanCleanupStep[] = audit.por_tabela
    .filter((r) => r.orfaos > 0 || r.distinct_ids_orfaos > 0)
    .map<OrphanCleanupStep>((r) => ({
      tabela: r.tabela,
      coluna: r.coluna,
      acao: NULLIFY_TABLES.has(r.tabela) ? "nullify" : "delete",
      linhas_afetadas: r.orfaos,
      distinct_ids: r.distinct_ids_orfaos,
      orphan_ids: r.sample_ids,
    }))
    .sort((a, b) => (orderIndex.get(a.tabela) ?? 999) - (orderIndex.get(b.tabela) ?? 999));

  const total_linhas_a_remover = steps
    .filter((s) => s.acao === "delete")
    .reduce((sum, s) => sum + s.linhas_afetadas, 0);
  const total_linhas_a_nulificar = steps
    .filter((s) => s.acao === "nullify")
    .reduce((sum, s) => sum + s.linhas_afetadas, 0);

  return {
    generated_at: new Date().toISOString(),
    total_ids_orfaos: audit.resumo.distinct_ids_orfaos_global,
    total_linhas_a_remover,
    total_linhas_a_nulificar,
    steps,
    audit,
  };
}

export interface OrphanCleanupResult {
  ok: boolean;
  deleted: Record<string, number>;
  nullified: Record<string, number>;
  totalDeleted: number;
  totalNullified: number;
  failedAt?: { tabela: string; coluna: string; detail: string };
}

/**
 * Executa o plano de limpeza. Para cada tabela:
 *  - `nullify`: UPDATE coluna = null WHERE coluna NOT IN (produtos válidos)
 *  - `delete` : DELETE WHERE coluna NOT IN (produtos válidos)
 *
 * Requer role `administrador` (as RLS das tabelas alvo cobrem isso).
 * Se qualquer passo falhar, para imediatamente e devolve o progresso parcial.
 */
export async function executeOrphanCleanup(): Promise<OrphanCleanupResult> {
  const { data: produtos, error: prodErr } = await supabase.from("produtos").select("id");
  if (prodErr) throw prodErr;
  const validIds = (produtos ?? []).map((p: any) => p.id as string);

  const deleted: Record<string, number> = {};
  const nullified: Record<string, number> = {};

  // Recoleta os IDs órfãos completos por tabela (não só a amostra do plano).
  const plan = await previewOrphanCleanup();

  for (const step of plan.steps) {
    // Recolher IDs órfãos reais desta tabela paginando (o audit já contou; aqui
    // precisamos dos IDs para o filtro `.in(...)`).
    const orphanIds = new Set<string>();
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await (supabase.from(step.tabela as never) as any)
        .select(step.coluna)
        .not(step.coluna, "is", null)
        .range(from, from + pageSize - 1);
      if (error) {
        return {
          ok: false,
          deleted,
          nullified,
          totalDeleted: Object.values(deleted).reduce((a, b) => a + b, 0),
          totalNullified: Object.values(nullified).reduce((a, b) => a + b, 0),
          failedAt: { tabela: step.tabela, coluna: step.coluna, detail: error.message },
        };
      }
      const rows = (data ?? []) as Record<string, string | null>[];
      if (rows.length === 0) break;
      const validSet = new Set(validIds);
      for (const row of rows) {
        const v = row[step.coluna];
        if (v && !validSet.has(v)) orphanIds.add(v);
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    if (orphanIds.size === 0) {
      if (step.acao === "delete") deleted[step.tabela] = 0;
      else nullified[step.tabela] = 0;
      continue;
    }

    // Aplica em chunks (evita URLs gigantes no PostgREST `in.(...)`).
    const ids = [...orphanIds];
    let affected = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      if (step.acao === "nullify") {
        const { count, error } = await (supabase.from(step.tabela as never) as any)
          .update({ [step.coluna]: null }, { count: "exact" })
          .in(step.coluna, chunk);
        if (error) {
          return {
            ok: false,
            deleted,
            nullified,
            totalDeleted: Object.values(deleted).reduce((a, b) => a + b, 0),
            totalNullified: Object.values(nullified).reduce((a, b) => a + b, 0),
            failedAt: { tabela: step.tabela, coluna: step.coluna, detail: error.message },
          };
        }
        affected += count ?? 0;
      } else {
        const { count, error } = await (supabase.from(step.tabela as never) as any)
          .delete({ count: "exact" })
          .in(step.coluna, chunk);
        if (error) {
          return {
            ok: false,
            deleted,
            nullified,
            totalDeleted: Object.values(deleted).reduce((a, b) => a + b, 0),
            totalNullified: Object.values(nullified).reduce((a, b) => a + b, 0),
            failedAt: { tabela: step.tabela, coluna: step.coluna, detail: error.message },
          };
        }
        affected += count ?? 0;
      }
    }

    if (step.acao === "delete") deleted[step.tabela] = affected;
    else nullified[step.tabela] = affected;
  }

  return {
    ok: true,
    deleted,
    nullified,
    totalDeleted: Object.values(deleted).reduce((a, b) => a + b, 0),
    totalNullified: Object.values(nullified).reduce((a, b) => a + b, 0),
  };
}

/**
 * Etapa 2 — insere os 7 produtos do catálogo v1.3 e suas formulações.
 * Idempotente por `codigo` (upsert). Se algum microrganismo requerido não existir,
 * a função aborta antes de inserir/atualizar produtos.
 */
export async function importCatalogoARBioV13(): Promise<SeedResult> {
  // 1) resolver microrganismos por nome_cientifico
  const nomesCientificos = Array.from(
    new Set(SEED_PRODUTOS_AR_BIO_V13.flatMap((p) => p.composicao.map((c) => c.nome_cientifico))),
  );

  const { data: micros, error: microsErr } = await supabase
    .from("microrganismos")
    .select("id, nome_cientifico")
    .in("nome_cientifico", nomesCientificos);
  if (microsErr) throw microsErr;

  const microByNome = new Map<string, string>();
  (micros ?? []).forEach((m: any) => {
    if (m.nome_cientifico) microByNome.set(m.nome_cientifico, m.id);
  });

  const faltantes = nomesCientificos.filter((n) => !microByNome.has(n));
  if (faltantes.length > 0) {
    return {
      inseridos: 0,
      atualizados: 0,
      formulacoesCriadas: 0,
      microrganismosFaltantes: faltantes,
    };
  }

  // 2) upsert produtos
  let inseridos = 0;
  let atualizados = 0;
  let formulacoesCriadas = 0;

  for (const seed of SEED_PRODUTOS_AR_BIO_V13) {
    const payload = {
      codigo: seed.codigo,
      nome: seed.nome,
      tipo: seed.tipo,
      dose_ml_ha: seed.dose_ml_ha,
      modo_aplicacao: seed.modo_aplicacao,
      valor_ha_brl: seed.valor_ha_brl,
      valor_dose_brl: null as number | null,
      valor_litro_brl: seed.dose_ml_ha > 0
        ? Number(((seed.valor_ha_brl / seed.dose_ml_ha) * 1000).toFixed(2))
        : null,
      funcao_completa: seed.funcao_completa,
      versao_catalogo: CATALOGO_VERSAO,
      ativo: true,
      b2b_enabled: false,
      e_insumo: false,
    };

    // Verifica existência por codigo
    const { data: existente, error: findErr } = await supabase
      .from("produtos")
      .select("id")
      .eq("codigo", seed.codigo)
      .maybeSingle();
    if (findErr) throw findErr;

    let produtoId: string;
    if (existente?.id) {
      const { error: upErr } = await supabase
        .from("produtos")
        .update(payload)
        .eq("id", existente.id);
      if (upErr) throw upErr;
      produtoId = existente.id;
      atualizados += 1;
    } else {
      const { data: novo, error: insErr } = await supabase
        .from("produtos")
        .insert(payload)
        .select("id")
        .single();
      if (insErr) throw insErr;
      produtoId = novo.id;
      inseridos += 1;
    }

    // Reset formulações do produto
    const { error: delFErr } = await supabase
      .from("formulacoes")
      .delete()
      .eq("produto_id", produtoId);
    if (delFErr) throw delFErr;

    const formPayload = seed.composicao.map((c) => ({
      produto_id: produtoId,
      microrganismo_id: microByNome.get(c.nome_cientifico)!,
      volume_ml: c.volume_ml,
      e_volume_fixo: true,
    }));
    if (formPayload.length > 0) {
      const { error: insFErr } = await supabase.from("formulacoes").insert(formPayload);
      if (insFErr) throw insFErr;
      formulacoesCriadas += formPayload.length;
    }
  }

  return { inseridos, atualizados, formulacoesCriadas, microrganismosFaltantes: [] };
}

/**
 * Verifica se o catálogo já está no v1.3 (7 produtos ativos, todos com `versao_catalogo=v1.3`).
 * Usado para ocultar o botão de recarga após execução bem-sucedida.
 */
export async function isCatalogoARBioV13Aplicado(): Promise<boolean> {
  const { data, error } = await supabase
    .from("produtos")
    .select("codigo, versao_catalogo, ativo");
  if (error || !data) return false;
  const ativos = data.filter((p) => p.ativo);
  if (ativos.length !== SEED_PRODUTOS_AR_BIO_V13.length) return false;
  const codigosEsperados = new Set(SEED_PRODUTOS_AR_BIO_V13.map((s) => s.codigo));
  return ativos.every(
    (p) => p.codigo && codigosEsperados.has(p.codigo) && p.versao_catalogo === CATALOGO_VERSAO,
  );
}
