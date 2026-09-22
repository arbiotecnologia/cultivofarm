/**
 * Regras puras da tela Contas a Receber.
 *
 * Datas de negócio são dias civis em America/Sao_Paulo:
 * - Atraso: SOMENTE due_date < hoje (vencer hoje nunca é atraso, a qualquer hora).
 * - "Vencendo em 7 dias": hoje <= due_date <= hoje+7 (ambos inclusivos).
 * - "Recebido no mês": soma dos eventos de receivable_payments.amount_received
 *   por payment_date no intervalo [1º dia do mês, 1º dia do mês seguinte),
 *   incluindo estornos (linhas negativas) — mesma convenção do DRE em regime caixa.
 *   Nunca usa saldo acumulado da parcela nem paid_at.
 */

import { hojeSaoPaulo, somarDiasCivis, toDataCivil } from "@/lib/monitoramento/alertas";

export { hojeSaoPaulo, somarDiasCivis, toDataCivil };

export const DIAS_JANELA_VENCIMENTO = 7;

export const STATUS_PARCELA_EM_ABERTO = ["OPEN", "PARTIAL", "OVERDUE"] as const;

/** Primeiro dia civil do mês de `hoje` (YYYY-MM-DD). */
export function inicioDoMes(hoje: string): string {
  return `${hoje.slice(0, 7)}-01`;
}

/** Primeiro dia civil do mês seguinte (limite EXCLUSIVO). */
export function inicioDoProximoMes(hoje: string): string {
  const [y, m] = hoje.split("-").map(Number);
  const ano = m === 12 ? y + 1 : y;
  const mes = m === 12 ? 1 : m + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

export type ClassificacaoParcela = "vencida" | "vence_hoje" | "vence_em_7_dias" | "futura" | "sem_data";

export function classificarParcela(dueDate: unknown, hoje: string): ClassificacaoParcela {
  const due = toDataCivil(dueDate);
  if (!due) return "sem_data";
  if (due < hoje) return "vencida";
  if (due === hoje) return "vence_hoje";
  return due <= somarDiasCivis(hoje, DIAS_JANELA_VENCIMENTO) ? "vence_em_7_dias" : "futura";
}

export interface ParcelaKpi {
  original_amount?: unknown;
  received_amount?: unknown;
  interest_amount?: unknown;
  penalty_amount?: unknown;
  discount_amount?: unknown;
  due_date?: unknown;
  status?: unknown;
}

export interface PagamentoKpi {
  amount_received?: unknown;
  payment_date?: unknown;
}

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const cent = (v: number) => Math.round(v * 100) / 100;

/**
 * Saldo em aberto de uma parcela (nunca negativo).
 * Mesma fórmula de calcularSaldoRecebivel: inclui juros e multa acumulados.
 */
export function saldoParcela(p: ParcelaKpi): number {
  return Math.max(
    0,
    cent(
      num(p.original_amount) + num(p.interest_amount) + num(p.penalty_amount) -
        num(p.discount_amount) - num(p.received_amount),
    ),
  );
}

export interface KpisReceber {
  aberto: number;
  vencido: number;
  vence7: number;
  recebidoMes: number;
}

/**
 * KPIs derivados. `parcelas` alimenta aberto/vencido/vence7;
 * `pagamentos` (já recortados pelo período do mês) alimenta recebidoMes.
 */
export function calcularKpisReceber(
  parcelas: ParcelaKpi[],
  pagamentos: PagamentoKpi[],
  hoje: string,
): KpisReceber {
  let aberto = 0;
  let vencido = 0;
  let vence7 = 0;

  for (const p of parcelas) {
    const status = String(p.status ?? "");
    if (status === "CANCELED" || status === "PAID") continue;
    const saldo = saldoParcela(p);
    aberto += saldo;
    const classe = classificarParcela(p.due_date, hoje);
    if (classe === "vencida") vencido += saldo;
    else if (classe === "vence_hoje" || classe === "vence_em_7_dias") vence7 += saldo;
  }

  const de = inicioDoMes(hoje);
  const ate = inicioDoProximoMes(hoje);
  let recebidoMes = 0;
  for (const ev of pagamentos) {
    const data = toDataCivil(ev.payment_date);
    if (!data || data < de || data >= ate) continue;
    recebidoMes += num(ev.amount_received);
  }

  return { aberto: cent(aberto), vencido: cent(vencido), vence7: cent(vence7), recebidoMes: cent(recebidoMes) };
}

/**
 * Chaves de consulta REAIS dos consumidores financeiros afetados por
 * criação/baixa/cancelamento nesta tela (verificadas nos componentes).
 */
export const CHAVES_INVALIDACAO_RECEBER = [
  "ar-list",
  "ar-kpi-installments",
  "ar-kpi-payments",
  "ar-docs",
  "fin-conta",
  "fin-inst",
  "fin-payments",
  "fin-history",
  "fin-dashboard-summary",
  "fin-rankings",
  "fin-alerts",
  "financeiro-dashboard",
  "fluxo-caixa",
  "drill-receber",
  "drill-recebimentos",
  "dre",
  "dre-detail",
  "entregas-nao-faturadas",
] as const;

/** Mensagens seguras para falhas no cancelamento — nunca texto cru do servidor. */
const MENSAGENS_CANCELAMENTO: Record<string, string> = {
  "42501": "Você não tem permissão para cancelar esta conta.",
  "40001": "A conta foi alterada por outra pessoa. Recarregue a lista e tente novamente.",
  P0002: "Conta não encontrada. Recarregue a lista.",
  "23514": "A conta não está em um estado que permita cancelamento.",
  "23503": "Existem lançamentos vinculados que impedem o cancelamento.",
  ar_cancel_has_payments: "Esta conta possui recebimentos registrados e não pode ser cancelada.",
  ar_cancel_invalid_status: "Esta conta não pode ser cancelada no status atual.",
  ar_cancel_reason_required: "Informe um motivo de cancelamento com ao menos 5 caracteres.",
};

export const MSG_CANCELAMENTO_GENERICA = "Não foi possível cancelar a conta. Tente novamente.";

export function mapearErroCancelamento(erro: unknown): string {
  const e = (erro ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  if (code && MENSAGENS_CANCELAMENTO[code]) return MENSAGENS_CANCELAMENTO[code];
  const msg = typeof e.message === "string" ? e.message : "";
  const token = msg.match(/ar_cancel_[a-z_]+/)?.[0];
  if (token && MENSAGENS_CANCELAMENTO[token]) return MENSAGENS_CANCELAMENTO[token];
  return MSG_CANCELAMENTO_GENERICA;
}

/** Rótulo de vencimento derivado da data — nunca depende de escrita no banco. */
export function rotuloVencimento(dueDate: unknown, hoje: string): string {
  switch (classificarParcela(dueDate, hoje)) {
    case "vencida":
      return "Vencida";
    case "vence_hoje":
      return "Vence hoje";
    case "vence_em_7_dias":
      return "Vence em 7 dias";
    case "futura":
      return "A vencer";
    default:
      return "—";
  }
}
