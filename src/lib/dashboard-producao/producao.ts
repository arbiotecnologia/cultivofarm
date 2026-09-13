/**
 * Regras puras do Dashboard Produção B2B.
 *
 * Contrato atual (não inventar status nem conversões):
 * - public.production_planning.status é o enum production_planning_status:
 *   'aguardando_planejamento' | 'planejado' | 'em_producao' | 'produzido' | 'entregue' | 'cancelado'
 *   (+ 'replanejar', adicionado em migration posterior).
 * - production_planning.partner_order_id é UNIQUE: um planejamento por pedido.
 *   Ainda assim deduplicamos no cliente para não contar duas vezes caso a
 *   consulta retorne linhas repetidas (join/roteamento).
 * - rpc_b2b_capacity_kpis devolve litros já convertidos de volume_total_ml
 *   (mililitros → litros). É a única grandeza volumétrica inequívoca do contrato.
 */

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
  aguardando_planejamento: "Aguardando planejamento",
  planejado: "Planejado",
  em_producao: "Em produção",
  produzido: "Produzido",
  entregue: "Entregue",
  cancelado: "Cancelado",
  replanejar: "Replanejar",
};

/** Status que não representam pedidos ativos na fila de produção. */
export const STATUS_NAO_ATIVOS: StatusPlanejamento[] = ["cancelado"];

export type LinhaPlanejamento = {
  partner_order_id?: string | null;
  status?: string | null;
  total?: number | string | null;
};

export type ResumoProducao = {
  /** Contagem por status conhecido (exclusivos entre si). */
  porStatus: Record<StatusPlanejamento, number>;
  /** Linhas com status fora do enum conhecido — nunca somadas aos demais. */
  outros: number;
  /** Pedidos distintos (sem duplicidade). */
  total: number;
  /** Pedidos ativos (total menos cancelados). */
  totalAtivos: number;
  /** Soma dos totais dos pedidos ativos; null quando não há valor algum. */
  valorAtivos: number | null;
  /** Pedidos ativos sem valor informado (total nulo/ inválido). */
  pedidosSemValor: number;
  /** Linhas descartadas por duplicidade de pedido. */
  duplicadasIgnoradas: number;
};

function statusConhecido(s: unknown): s is StatusPlanejamento {
  return typeof s === "string" && (STATUS_PLANEJAMENTO as readonly string[]).includes(s);
}

export function numeroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function resumirPlanejamento(linhas: LinhaPlanejamento[] | null | undefined): ResumoProducao {
  const porStatus = STATUS_PLANEJAMENTO.reduce((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {} as Record<StatusPlanejamento, number>);

  const resumo: ResumoProducao = {
    porStatus,
    outros: 0,
    total: 0,
    totalAtivos: 0,
    valorAtivos: null,
    pedidosSemValor: 0,
    duplicadasIgnoradas: 0,
  };

  const vistos = new Set<string>();
  let soma = 0;
  let temValor = false;

  for (const [i, linha] of (linhas ?? []).entries()) {
    const chave = linha?.partner_order_id ?? `__sem_pedido_${i}`;
    if (vistos.has(chave)) {
      resumo.duplicadasIgnoradas += 1;
      continue;
    }
    vistos.add(chave);
    resumo.total += 1;

    const status = linha?.status;
    if (statusConhecido(status)) {
      resumo.porStatus[status] += 1;
    } else {
      resumo.outros += 1;
    }

    const ativo = !(statusConhecido(status) && STATUS_NAO_ATIVOS.includes(status));
    if (!ativo) continue;

    resumo.totalAtivos += 1;
    const valor = numeroOuNulo(linha?.total);
    if (valor === null) resumo.pedidosSemValor += 1;
    else {
      soma += valor;
      temValor = true;
    }
  }

  resumo.valorAtivos = temValor ? soma : null;
  return resumo;
}

/** Litros: só formata quando o valor é numérico finito; caso contrário "—". */
export function formatLitros(v: unknown): string {
  const n = numeroOuNulo(v);
  if (n === null) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`;
}

export function formatBRLouTraco(v: unknown): string {
  const n = numeroOuNulo(v);
  if (n === null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatInteiro(v: unknown): string {
  const n = numeroOuNulo(v);
  if (n === null) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export const ROTULO_INCONSISTENCIA: Record<string, string> = {
  pedido_sem_parceiro: "Pedidos sem parceiro vinculado",
  planejamento_sem_pedido: "Planejamentos sem pedido",
  os_sem_planejamento: "OS B2B sem vínculo de planejamento",
  timeline_orfa: "Eventos de timeline órfãos",
  os_orfa_b2b: "OS B2B sem vínculo de pedido/item",
  itens_sem_produto: "Itens de pedido sem produto",
  links_invalidos: "Vínculos de produção inválidos",
};

export type Inconsistencia = { chave: string; rotulo: string; quantidade: number };

/** Só expõe contagens numéricas (> 0). Nunca repassa conteúdo textual do servidor. */
export function listarInconsistencias(payload: unknown): Inconsistencia[] {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload as Record<string, unknown>)
    .map(([chave, valor]) => ({
      chave,
      rotulo: ROTULO_INCONSISTENCIA[chave] ?? chave.replace(/_/g, " "),
      quantidade: numeroOuNulo(valor) ?? 0,
    }))
    .filter((i) => i.quantidade > 0)
    .sort((a, b) => b.quantidade - a.quantidade);
}

export function mensagemErro(e: unknown, fallback: string): string {
  const msg = (e as { message?: string } | null)?.message;
  if (!msg) return fallback;
  if (/permission_denied|Acesso negado|42501/i.test(msg)) {
    return "Seu perfil não tem permissão para consultar estes indicadores.";
  }
  return msg;
}
