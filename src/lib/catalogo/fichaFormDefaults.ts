/**
 * CAT-09 — funções puras de estado inicial das fichas técnicas.
 * Nenhum valor pode vir do estado anterior: o formulário é sempre
 * derivado apenas da entidade atual (ou do profile existente).
 */

export type StatusValidacao = "rascunho" | "em_revisao" | "aprovado" | "arquivado";

export interface MicroFormState {
  resumo_curto: string;
  mecanismo_acao: string;
  beneficios_agronomicos: string;
  explicacao_tecnica: string;
  explicacao_produtor: string;
  explicacao_b2b: string;
  indicacoes_uso: string;
  cuidados_aplicacao: string;
  compatibilidade: string;
  armazenamento: string;
  observacoes_regulatorias: string;
  status_validacao: StatusValidacao;
}

export interface ProductFormState {
  resumo_curto: string;
  beneficio_combinado: string;
  explicacao_tecnica: string;
  explicacao_produtor: string;
  explicacao_b2b: string;
  indicacoes_uso: string;
  janela_aplicacao: string;
  cuidados_aplicacao: string;
  compatibilidade: string;
  observacoes_regulatorias: string;
  status_validacao: StatusValidacao;
}

interface MicroLike {
  descricao?: string | null;
  funcao_agronomica?: string | null;
  observacoes?: string | null;
}

interface ProdutoLike {
  descricao?: string | null;
  modo_acao?: string | null;
  funcao_completa?: string | null;
}

export function emptyMicroForm(): MicroFormState {
  return {
    resumo_curto: "",
    mecanismo_acao: "",
    beneficios_agronomicos: "",
    explicacao_tecnica: "",
    explicacao_produtor: "",
    explicacao_b2b: "",
    indicacoes_uso: "",
    cuidados_aplicacao: "",
    compatibilidade: "",
    armazenamento: "",
    observacoes_regulatorias: "",
    status_validacao: "rascunho",
  };
}

export function emptyProductForm(): ProductFormState {
  return {
    resumo_curto: "",
    beneficio_combinado: "",
    explicacao_tecnica: "",
    explicacao_produtor: "",
    explicacao_b2b: "",
    indicacoes_uso: "",
    janela_aplicacao: "",
    cuidados_aplicacao: "",
    compatibilidade: "",
    observacoes_regulatorias: "",
    status_validacao: "rascunho",
  };
}

/** Estado limpo derivado APENAS do microrganismo atual. */
export function buildMicroFormDefaults(micro: MicroLike | null | undefined): MicroFormState {
  const base = emptyMicroForm();
  if (!micro) return base;
  return {
    ...base,
    resumo_curto: micro.descricao ?? "",
    beneficios_agronomicos: micro.funcao_agronomica ?? "",
    observacoes_regulatorias: micro.observacoes ?? "",
  };
}

/** Estado limpo derivado APENAS do produto atual. */
export function buildProductFormDefaults(produto: ProdutoLike | null | undefined): ProductFormState {
  const base = emptyProductForm();
  if (!produto) return base;
  return {
    ...base,
    resumo_curto: produto.descricao ?? "",
    explicacao_tecnica: produto.modo_acao ?? "",
    indicacoes_uso: produto.funcao_completa ?? "",
  };
}

export function mapMicroProfileToForm(profile: Record<string, any>): MicroFormState {
  return {
    resumo_curto: profile.resumo_curto ?? "",
    mecanismo_acao: profile.mecanismo_acao ?? "",
    beneficios_agronomicos: profile.beneficios_agronomicos ?? "",
    explicacao_tecnica: profile.explicacao_tecnica ?? "",
    explicacao_produtor: profile.explicacao_produtor ?? "",
    explicacao_b2b: profile.explicacao_b2b ?? "",
    indicacoes_uso: profile.indicacoes_uso ?? "",
    cuidados_aplicacao: profile.cuidados_aplicacao ?? "",
    compatibilidade: profile.compatibilidade ?? "",
    armazenamento: profile.armazenamento ?? "",
    observacoes_regulatorias: profile.observacoes_regulatorias ?? "",
    status_validacao: (profile.status_validacao ?? "rascunho") as StatusValidacao,
  };
}

export function mapProductProfileToForm(profile: Record<string, any>): ProductFormState {
  return {
    resumo_curto: profile.resumo_curto ?? "",
    beneficio_combinado: profile.beneficio_combinado ?? "",
    explicacao_tecnica: profile.explicacao_tecnica ?? "",
    explicacao_produtor: profile.explicacao_produtor ?? "",
    explicacao_b2b: profile.explicacao_b2b ?? "",
    indicacoes_uso: profile.indicacoes_uso ?? "",
    janela_aplicacao: profile.janela_aplicacao ?? "",
    cuidados_aplicacao: profile.cuidados_aplicacao ?? "",
    compatibilidade: profile.compatibilidade ?? "",
    observacoes_regulatorias: profile.observacoes_regulatorias ?? "",
    status_validacao: (profile.status_validacao ?? "rascunho") as StatusValidacao,
  };
}
