/**
 * Regras puras da tela Contas a Pagar.
 *
 * Alinhado ao servidor (banco canônico):
 *   saldo = original_amount + interest_amount + penalty_amount
 *           - discount_amount - paid_amount   (nunca negativo)
 *
 * Datas de negócio são dias civis em America/Sao_Paulo:
 * - Atraso: SOMENTE due_date < hoje (vencer hoje nunca é atraso).
 * - "Vencendo em 7 dias": hoje <= due_date <= hoje+7 (inclusivos).
 * - "Pago no mês": soma dos eventos payable_payments.amount_paid por
 *   payment_date em [1º dia do mês, 1º dia do mês seguinte), incluindo
 *   parciais e estornos (linhas negativas). Nunca usa paid_at da parcela.
 */

import {
  classificarParcela,
  inicioDoMes,
  inicioDoProximoMes,
  toDataCivil,
} from "@/lib/financeiro/contasReceber";

export { classificarParcela, inicioDoMes, inicioDoProximoMes };

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const cent = (v: number) => Math.round(v * 100) / 100;

export interface ParcelaPagarKpi {
  original_amount?: unknown;
  paid_amount?: unknown;
  interest_amount?: unknown;
  penalty_amount?: unknown;
  discount_amount?: unknown;
  due_date?: unknown;
  status?: unknown;
}

export interface PagamentoPagarKpi {
  amount_paid?: unknown;
  payment_date?: unknown;
}

/** Saldo em aberto de uma parcela a pagar (nunca negativo). */
export function saldoParcelaPagar(p: ParcelaPagarKpi): number {
  return Math.max(
    0,
    cent(
      num(p.original_amount) + num(p.interest_amount) + num(p.penalty_amount) -
        num(p.discount_amount) - num(p.paid_amount),
    ),
  );
}

export interface ResumoSaldoPagar {
  original: number;
  pago: number;
  juros: number;
  multa: number;
  desconto: number;
  saldo: number;
}

/**
 * Resumo consolidado da conta a pagar. Parcelas canceladas são ignoradas.
 * O saldo usa exatamente a mesma fórmula dos KPIs (saldoParcelaPagar).
 */
export function resumoSaldoPagar(parcelas: ParcelaPagarKpi[]): ResumoSaldoPagar {
  const r = { original: 0, pago: 0, juros: 0, multa: 0, desconto: 0, saldo: 0 };
  for (const p of parcelas) {
    if (String(p.status ?? "") === "CANCELED") continue;
    r.original += num(p.original_amount);
    r.pago += num(p.paid_amount);
    r.juros += num(p.interest_amount);
    r.multa += num(p.penalty_amount);
    r.desconto += num(p.discount_amount);
    r.saldo += saldoParcelaPagar(p);
  }
  return {
    original: cent(r.original),
    pago: cent(r.pago),
    juros: cent(r.juros),
    multa: cent(r.multa),
    desconto: cent(r.desconto),
    saldo: cent(r.saldo),
  };
}

export interface KpisPagar {
  aberto: number;
  vencido: number;
  vence7: number;
  pagoMes: number;
}

/**
 * KPIs derivados. `parcelas` alimenta aberto/vencido/vence7 (PAID e CANCELED
 * ficam fora); `pagamentos` alimenta pagoMes por evento de caixa.
 */
export function calcularKpisPagar(
  parcelas: ParcelaPagarKpi[],
  pagamentos: PagamentoPagarKpi[],
  hoje: string,
): KpisPagar {
  let aberto = 0;
  let vencido = 0;
  let vence7 = 0;

  for (const p of parcelas) {
    const status = String(p.status ?? "");
    if (status === "CANCELED" || status === "PAID") continue;
    const saldo = saldoParcelaPagar(p);
    aberto += saldo;
    const classe = classificarParcela(p.due_date, hoje);
    if (classe === "vencida") vencido += saldo;
    else if (classe === "vence_hoje" || classe === "vence_em_7_dias") vence7 += saldo;
  }

  const de = inicioDoMes(hoje);
  const ate = inicioDoProximoMes(hoje);
  let pagoMes = 0;
  for (const ev of pagamentos) {
    const data = toDataCivil(ev.payment_date);
    if (!data || data < de || data >= ate) continue;
    pagoMes += num(ev.amount_paid);
  }

  return { aberto: cent(aberto), vencido: cent(vencido), vence7: cent(vence7), pagoMes: cent(pagoMes) };
}

/** Chaves de consulta REAIS afetadas por cancelamento/baixa nesta tela. */
export const CHAVES_INVALIDACAO_PAGAR = [
  "ap-list",
  "ap-kpi-installments",
  "ap-kpi-payments",
  "ap-docs-count",
  "fin-conta",
  "fin-inst",
  "fin-payments",
  "fin-history",
  "fin-dashboard-summary",
  "fin-rankings",
  "fin-alerts",
  "financeiro-dashboard",
  "fluxo-caixa",
  "drill-pagar",
  "drill-pagamentos",
  "dre",
  "dre-detail",
] as const;
