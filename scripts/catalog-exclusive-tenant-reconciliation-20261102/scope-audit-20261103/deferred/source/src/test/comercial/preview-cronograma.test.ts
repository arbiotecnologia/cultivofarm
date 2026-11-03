import { describe, it, expect } from "vitest";
import { preview } from "@/pages/comercial/CommercialPaymentPlansPage";
import { planFinancialErrors } from "@/lib/comercial/validation";
import type { PaymentPlanPayload } from "@/hooks/useCommercialPaymentPlansAdmin";

const base: PaymentPlanPayload = {
  name: "Plano",
  code: "PL1",
  plan_type: "short_term",
  interest_type: "compound",
  pricing_mode: "discount_from_base",
  discount_percent: 10,
  monthly_interest_percent: 1.5,
  installment_count: 2,
  months_count: 2,
  max_days: 60,
  minimum_order_amount: 0,
  sort_order: 10,
  valid_from: "",
  valid_until: "",
  motivo: "",
} as unknown as PaymentPlanPayload;

describe("Preview do cronograma — parâmetros financeiros", () => {
  it('composto genérico legítimo não é reinterpretado como Price', () => {
    expect(Math.round((preview(base)?.final ?? NaN)*100)).toBe(9272025);
    expect(Math.round((preview({...base,amortization_type:'price'})?.final ?? NaN)*100)).not.toBe(9272025);
  });
  it("calcula quando todos os parâmetros são válidos", () => {
    const r = preview(base)!;
    expect(r).not.toBeNull();
    expect(r.liquido).toBe(90000);
    expect(r.final).toBeGreaterThan(r.liquido);
    expect(r.parcela).toBeGreaterThan(0);
  });

  it.each([
    ["desconto acima de 100", { discount_percent: 150 }],
    ["desconto negativo", { discount_percent: -10 }],
    ["desconto não finito", { discount_percent: NaN }],
    ["juros fora da faixa", { monthly_interest_percent: 120 }],
    ["juros negativo", { monthly_interest_percent: -1 }],
    ["meses fora da faixa", { months_count: 61 }],
    ["parcelas inválidas", { installment_count: 0 }],
    ["parcelas fracionadas", { installment_count: 2.5 }],
    ["prazo fora da faixa", { max_days: 2000 }],
    ["valor mínimo negativo", { minimum_order_amount: -5 }],
  ])("bloqueia o preview quando %s", (_label, patch) => {
    const form = { ...base, ...patch } as PaymentPlanPayload;
    expect(Object.keys(planFinancialErrors(form)).length).toBeGreaterThan(0);
    expect(preview(form)).toBeNull();
  });

  it("nunca produz valores negativos em nenhum cenário inválido", () => {
    for (const d of [-50, 150, 101, NaN]) {
      const r = preview({ ...base, discount_percent: d } as PaymentPlanPayload);
      expect(r).toBeNull();
    }
  });
});
