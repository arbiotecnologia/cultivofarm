/**
 * Regras puras do Planejamento de Produção (/operacao/planejamento).
 *
 * Contrato observado (não inventar status nem conversões):
 * - public.production_planning.status usa o enum production_planning_status:
 *   'aguardando_planejamento' | 'planejado' | 'em_producao' | 'produzido' |
 *   'entregue' | 'cancelado' (+ 'replanejar', adicionado em migration posterior).
 * - production_planning.partner_order_id é UNIQUE, mas deduplicamos no cliente
 *   para nunca contar o mesmo pedido duas vezes caso a consulta retorne
 *   linhas repetidas por join/roteamento.
 * - Datas de pedido (requested/estimated) são colunas `date` (YYYY-MM-DD).
 *   Comparações de atraso usam a data civil em America/Sao_Paulo, nunca UTC.
 */

export const TIMEZONE_OPERACIONAL = "America/Sao_Paulo";

export const STATUS_PLANEJAMENTO = [
  "aguardando_planejamento",
  "planejado",
  "em_producao",
  "produzido",
  "entregue",
  "cancelado",
  "replanejar",
] as const;

export type StatusPlanejamento = (typeof STATUS_PLANEJAMENTO)[number];

export const STATUS_LABEL: Record<StatusPlanejamento, string> = {
  aguardando_planejamento: "Aguardando",
  planejado: "Planejado",
  em_producao: "Em produção",
  produzido: "Produzido",
  entregue: "Entregue",
  cancelado: "Cancelado",
  replanejar: "Replanejar",
};

export const STATUS_VARIANT: Record<StatusPlanejamento, "default" | "secondary" | "outline" | "destructive"> = {
  aguardando_planejamento: "secondary",
  planejado: "outline",
  em_producao: "default",
  produzido: "default",
  entregue: "default",
  cancelado: "destructive",
  replanejar: "destructive",
};

/** Status que não sofrem atraso de entrega nem contam como fila ativa. */
export const STATUS_TERMINAIS: StatusPlanejamento[] = ["entregue", "cancelado"];

export function statusConhecido(s: unknown): s is StatusPlanejamento {
  return typeof s === "string" && (STATUS_PLANEJAMENTO as readonly string[]).includes(s);
}

export function rotuloStatus(s: unknown): string {
  return statusConhecido(s) ? STATUS_LABEL[s] : typeof s === "string" && s ? s : "—";
}

export function varianteStatus(s: unknown): "default" | "secondary" | "outline" | "destructive" {
  return statusConhecido(s) ? STATUS_VARIANT[s] : "secondary";
}

/** Data civil YYYY-MM-DD em America/Sao_Paulo (nunca UTC). */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE_OPERACIONAL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return partes; // en-CA já devolve YYYY-MM-DD
}

const DATA_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza para data civil YYYY-MM-DD; devolve null quando não é data válida. */
export function dataCivil(v: unknown, tz: string = TIMEZONE_OPERACIONAL): string | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  if (DATA_ONLY.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type LinhaPlanejamento = {
  id?: string | null;
  partner_order_id?: string | null;
  status?: string | null;
  partner_nome?: string | null;
  order_numero?: string | null;
  order_total?: number | string | null;
  order_requested_date?: string | null;
  order_approved_at?: string | null;
  created_at?: string | null;
};

/** Remove linhas duplicadas do mesmo pedido, preservando a ordem de entrada. */
export function deduplicarPlanejamentos<T extends LinhaPlanejamento>(
  linhas: T[] | null | undefined,
): { linhas: T[]; duplicadasIgnoradas: number } {
  const vistos = new Set<string>();
  const saida: T[] = [];
  let duplicadasIgnoradas = 0;
  for (const [i, linha] of (linhas ?? []).entries()) {
    const chave = linha?.partner_order_id ?? linha?.id ?? `__sem_chave_${i}`;
    if (vistos.has(chave)) {
      duplicadasIgnoradas += 1;
      continue;
    }
    vistos.add(chave);
    saida.push(linha);
  }
  return { linhas: saida, duplicadasIgnoradas };
}

/** Atraso: data desejada anterior a hoje (America/Sao_Paulo) e status não terminal. */
export function estaAtrasado(linha: LinhaPlanejamento, hoje: string = hojeSaoPaulo()): boolean {
  const desejada = dataCivil(linha?.order_requested_date);
  if (!desejada) return false;
  if (statusConhecido(linha?.status) && STATUS_TERMINAIS.includes(linha.status)) return false;
  return desejada < hoje;
}

/** "Novo": aprovado há menos de 24h e ainda aguardando planejamento. */
export function ehNovo(linha: LinhaPlanejamento, agora: Date = new Date()): boolean {
  if (linha?.status !== "aguardando_planejamento") return false;
  const aprovado = linha?.order_approved_at ? new Date(linha.order_approved_at).getTime() : NaN;
  if (!Number.isFinite(aprovado)) return false;
  const delta = agora.getTime() - aprovado;
  if (delta < 0) return false; // aprovação no futuro: dado inconsistente, não sinaliza
  return delta < 24 * 60 * 60 * 1000;
}

export type KpisPlanejamento = {
  aguardando: number;
  planejado: number;
  em_producao: number;
  produzido: number;
  entregue: number;
  cancelado: number;
  replanejar: number;
  outros: number;
  atrasados: number;
  total: number;
};

export function resumirKpis(
  linhas: LinhaPlanejamento[] | null | undefined,
  hoje: string = hojeSaoPaulo(),
): KpisPlanejamento {
  const kpis: KpisPlanejamento = {
    aguardando: 0,
    planejado: 0,
    em_producao: 0,
    produzido: 0,
    entregue: 0,
    cancelado: 0,
    replanejar: 0,
    outros: 0,
    atrasados: 0,
    total: 0,
  };
  for (const linha of linhas ?? []) {
    kpis.total += 1;
    const s = linha?.status;
    if (s === "aguardando_planejamento") kpis.aguardando += 1;
    else if (statusConhecido(s)) kpis[s] += 1;
    else kpis.outros += 1;
    if (estaAtrasado(linha, hoje)) kpis.atrasados += 1;
  }
  return kpis;
}

export function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Moeda pt-BR; ausência/valor inválido vira "—" (nunca R$ 0,00 inventado). */
export function formatValorOuTraco(v: unknown): string {
  const n = numeroOuNulo(v);
  if (n === null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Volume em litros; null/negativo/ inválido vira "—". */
export function formatVolumeL(v: unknown): string {
  const n = numeroOuNulo(v);
  if (n === null || n < 0) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L`;
}

/** Quantidade inteira não negativa; inválido vira null para bloquear ação. */
export function quantidadeValida(v: unknown): number | null {
  const n = numeroOuNulo(v);
  if (n === null || n <= 0) return null;
  return n;
}

export function normalizarBusca(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Busca por número do pedido ou nome do parceiro. Termo vazio não filtra. */
export function filtrarPorBusca<T extends LinhaPlanejamento>(linhas: T[], termo: string): T[] {
  const t = normalizarBusca(termo);
  if (!t) return linhas;
  return linhas.filter((l) =>
    [l?.order_numero, l?.partner_nome].some((campo) => normalizarBusca(campo).includes(t)),
  );
}

/** Ordenação de fila: atrasados primeiro, depois data desejada, depois criação. */
export function ordenarFila<T extends LinhaPlanejamento>(linhas: T[], hoje: string = hojeSaoPaulo()): T[] {
  return [...linhas].sort((a, b) => {
    const atrasoA = estaAtrasado(a, hoje) ? 0 : 1;
    const atrasoB = estaAtrasado(b, hoje) ? 0 : 1;
    if (atrasoA !== atrasoB) return atrasoA - atrasoB;
    const da = dataCivil(a?.order_requested_date);
    const db = dataCivil(b?.order_requested_date);
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    const ca = a?.created_at ?? "";
    const cb = b?.created_at ?? "";
    if (ca === cb) return 0;
    return ca > cb ? -1 : 1; // mais recente primeiro
  });
}

export type ValidacaoDatas = { ok: boolean; erro?: string };

/** Início não pode ser posterior ao término; término sozinho é inconsistente. */
export function validarDatasPlanejamento(inicio: string | null, fim: string | null): ValidacaoDatas {
  const i = inicio?.trim() ? inicio.trim() : null;
  const f = fim?.trim() ? fim.trim() : null;
  if (i && !DATA_ONLY.test(i)) return { ok: false, erro: "Data de início inválida." };
  if (f && !DATA_ONLY.test(f)) return { ok: false, erro: "Data de término inválida." };
  if (!i && f) return { ok: false, erro: "Informe também o início previsto." };
  if (i && f && f < i) return { ok: false, erro: "O término previsto não pode ser anterior ao início." };
  return { ok: true };
}

/** Geração de OP só é permitida em status não terminal e sem OS já criada. */
export function podeGerarOrdens(params: {
  status?: string | null;
  hasOrders?: boolean | null;
  readyForProduction?: boolean | null;
  itens: Array<{ quantidade?: number | string | null }>;
}): ValidacaoDatas {
  const { status, hasOrders, readyForProduction, itens } = params;
  if (hasOrders) return { ok: false, erro: "As ordens de produção deste pedido já foram geradas." };
  if (statusConhecido(status) && STATUS_TERMINAIS.includes(status)) {
    return { ok: false, erro: "Pedido encerrado: não é possível gerar ordens de produção." };
  }
  if (readyForProduction !== true) {
    return { ok: false, erro: "Pedido ainda não liberado para produção. Conclua a aprovação comercial." };
  }
  if (!itens || itens.length === 0) return { ok: false, erro: "Pedido sem itens para produzir." };
  if (itens.some((it) => quantidadeValida(it?.quantidade) === null)) {
    return { ok: false, erro: "Há itens com quantidade inválida." };
  }
  return { ok: true };
}

/** Mensagem de erro amigável, sem vazar detalhe técnico de permissão. */
export function mensagemErro(e: unknown, fallback: string): string {
  const msg = (e as { message?: string } | null)?.message;
  if (!msg) return fallback;
  if (/permission denied|permission_denied|Acesso negado|42501|RLS/i.test(msg)) {
    return "Seu perfil não tem permissão para consultar o planejamento de produção.";
  }
  return msg;
}

/* ------------------------------------------------------------------ */
/* Publicação idempotente (H10)                                        */
/* ------------------------------------------------------------------ */

/** Chave de idempotência estável por planejamento + tentativa do usuário. */
export function gerarChaveIdempotencia(planningId: string, semente?: string): string {
  const base = semente && semente.trim() ? semente.trim() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `plan-pub:${planningId}:${base}`;
}

/** true quando a RPC idempotente ainda não existe no banco (migração não aplicada). */
export function rpcIndisponivel(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  const code = err?.code ?? "";
  const msg = err?.message ?? "";
  return (
    code === "42883" ||
    code === "PGRST202" ||
    /could not find the function|does not exist|schema cache/i.test(msg)
  );
}

/** Mensagem amigável para os erros previstos da publicação. */
export function mensagemPublicacao(e: unknown): string {
  const msg = (e as { message?: string } | null)?.message ?? "";
  if (/nao_autenticado/.test(msg)) return "Sessão expirada. Entre novamente para publicar.";
  if (/permissao_negada|permission denied|42501/i.test(msg)) {
    return "Seu perfil não tem permissão para gerar ordens de produção.";
  }
  if (/chave_idempotencia_conflitante|23505/.test(msg)) {
    return "Esta publicação já foi registrada para outro planejamento. Atualize a página.";
  }
  if (/chave_idempotencia_obrigatoria|planejamento_invalido/.test(msg)) {
    return "Não foi possível identificar a solicitação. Tente novamente.";
  }
  if (/planejamento_nao_encontrado|planning_not_found/.test(msg)) {
    return "Planejamento não encontrado. Atualize a página.";
  }
  if (/already_published/.test(msg)) return "As ordens deste pedido já foram geradas.";
  if (/no_items/.test(msg)) return "Pedido sem itens para produzir.";
  if (/invalid_dates/.test(msg)) return "Datas previstas inválidas.";
  if (/could not serialize|deadlock|lock/i.test(msg)) {
    return "Outra publicação está em andamento para este pedido. Tente novamente em instantes.";
  }
  return msg || "Falha ao publicar demanda no laboratório.";
}

/** Mensagem de sucesso, distinguindo repetição (replay) de publicação nova. */
export function mensagemSucessoPublicacao(r: { replay?: boolean; os_created?: number } | null): string {
  const n = Number(r?.os_created ?? 0);
  if (r?.replay) return "Este pedido já havia sido publicado; nenhuma ordem duplicada foi criada.";
  return `${n} ordem(ns) de produção enviada(s) ao Cockpit`;
}
