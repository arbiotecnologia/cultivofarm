import { describe, it, expect } from "vitest";

/**
 * Phase 7 — Versioned tests for financial reversal rule.
 *
 * Simulates the server-side recalculation logic enforced by triggers
 * trg_recalc_ar_inst / trg_recalc_ap_inst and fn_reverse_payment.
 *
 * Reversal rule (canonical):
 *  - Reversal = NEW row with NEGATIVE amount and reversed_payment_id set
 *  - Installment.paid_amount = SUM(all payments, including negatives)
 *  - Status reopens to PARTIAL/OPEN when sum drops below total
 *  - DRE / Cashflow include the negative row on the reversal date
 */

type Payment = {
  id: string;
  installment_id: string;
  amount: number; // positive = baixa, negative = estorno
  reversed_payment_id?: string | null;
  is_reversal?: boolean;
  canceled?: boolean;
};

function recalcInstallment(totalDue: number, payments: Payment[]) {
  const active = payments.filter((p) => !p.canceled);
  const paid = active.reduce((s, p) => s + p.amount, 0);
  let status: "OPEN" | "PARTIAL" | "PAID";
  if (paid <= 0) status = "OPEN";
  else if (paid < totalDue) status = "PARTIAL";
  else status = "PAID";
  return { paid_amount: Math.round(paid * 100) / 100, status };
}

function reversePayment(
  payments: Payment[],
  paymentId: string,
  nextId = "rev-1"
): { payments: Payment[]; error?: string } {
  const target = payments.find((p) => p.id === paymentId);
  if (!target) return { payments, error: "Pagamento não encontrado" };
  if (target.canceled) return { payments, error: "Pagamento cancelado" };
  if (target.is_reversal) return { payments, error: "Não é possível estornar um estorno" };
  if (payments.some((p) => p.reversed_payment_id === paymentId))
    return { payments, error: "Pagamento já foi estornado" };

  const reversal: Payment = {
    id: nextId,
    installment_id: target.installment_id,
    amount: -target.amount,
    reversed_payment_id: target.id,
    is_reversal: true,
  };
  return { payments: [...payments, reversal] };
}

describe("Financeiro — regra de estorno (Fase 7)", () => {
  const inst = "inst-1";
  const totalDue = 1000;

  it("baixa total marca parcela como PAID", () => {
    const payments: Payment[] = [{ id: "p1", installment_id: inst, amount: 1000 }];
    expect(recalcInstallment(totalDue, payments)).toEqual({ paid_amount: 1000, status: "PAID" });
  });

  it("estorno reabre a parcela para OPEN (soma negativa)", () => {
    let payments: Payment[] = [{ id: "p1", installment_id: inst, amount: 1000 }];
    const res = reversePayment(payments, "p1");
    expect(res.error).toBeUndefined();
    payments = res.payments;
    expect(payments).toHaveLength(2);
    expect(payments[1].amount).toBe(-1000);
    expect(payments[1].is_reversal).toBe(true);
    expect(payments[1].reversed_payment_id).toBe("p1");
    expect(recalcInstallment(totalDue, payments)).toEqual({ paid_amount: 0, status: "OPEN" });
  });

  it("estorno parcial reabre para PARTIAL", () => {
    let payments: Payment[] = [
      { id: "p1", installment_id: inst, amount: 600 },
      { id: "p2", installment_id: inst, amount: 400 },
    ];
    expect(recalcInstallment(totalDue, payments).status).toBe("PAID");
    payments = reversePayment(payments, "p2").payments;
    expect(recalcInstallment(totalDue, payments)).toEqual({ paid_amount: 600, status: "PARTIAL" });
  });

  it("bloqueia estorno duplicado", () => {
    let payments: Payment[] = [{ id: "p1", installment_id: inst, amount: 1000 }];
    payments = reversePayment(payments, "p1").payments;
    const second = reversePayment(payments, "p1", "rev-2");
    expect(second.error).toBe("Pagamento já foi estornado");
  });

  it("bloqueia estorno de estorno", () => {
    let payments: Payment[] = [{ id: "p1", installment_id: inst, amount: 1000 }];
    payments = reversePayment(payments, "p1", "rev-1").payments;
    const reverseTheReversal = reversePayment(payments, "rev-1", "rev-2");
    expect(reverseTheReversal.error).toBe("Não é possível estornar um estorno");
  });

  it("DRE/Fluxo somam estorno como valor negativo na data do estorno", () => {
    const payments: Payment[] = [
      { id: "p1", installment_id: inst, amount: 1000 },
      { id: "rev-1", installment_id: inst, amount: -1000, is_reversal: true, reversed_payment_id: "p1" },
    ];
    const totalCaixa = payments.reduce((s, p) => s + p.amount, 0);
    expect(totalCaixa).toBe(0);
    const qtdBaixas = payments.filter((p) => !p.is_reversal).length;
    expect(qtdBaixas).toBe(1);
  });
});
