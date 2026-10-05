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

export interface SeedResult {
  inseridos: number;
  atualizados: number;
  formulacoesCriadas: number;
  microrganismosFaltantes: string[];
}

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

export async function auditProdutosOrfaos(): Promise<ProdutosOrfaosAuditResult> {
  const { data, error } = await supabase.functions.invoke<ProdutosOrfaosAuditResult>("admin-audit-produtos-orfaos", {
    method: "POST",
  });

  if (!error && data) {
    return data;
  }

  throw new Error("catalog_audit_unavailable");
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
