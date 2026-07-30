import { describe, it, expect } from "vitest";
import { planErrorMessage } from "@/hooks/useCommercialPaymentPlansAdmin";

/**
 * Fase 6 — Administração segura dos planos comerciais B2B.
 * Cobre a tradução de erros de negócio do backend autoritativo.
 */
describe("Fase 6 · planErrorMessage", () => {
  it("traduz negação de permissão", () => {
    expect(planErrorMessage(new Error("not_authorized"))).toMatch(/permissão/i);
  });

  it("orienta versionamento em plano referenciado", () => {
    expect(planErrorMessage(new Error("plan_financial_immutable_create_new_version"))).toMatch(
      /nova versão/i,
    );
  });

  it("bloqueia exclusão de plano referenciado", () => {
    expect(planErrorMessage(new Error("plan_referenced_delete_blocked"))).toMatch(/Desative/i);
  });

  it("traduz plano fora da vigência", () => {
    expect(planErrorMessage(new Error("plan_not_selectable"))).toMatch(/vigência/i);
  });

  it("traduz limites de validação", () => {
    expect(planErrorMessage(new Error("discount_out_of_range"))).toMatch(/0% e 100%/);
    expect(planErrorMessage(new Error("installment_out_of_range"))).toMatch(/1 e 60/);
    expect(planErrorMessage(new Error("validity_window_invalid"))).toMatch(/posterior/i);
  });

  it("traduz código duplicado", () => {
    expect(planErrorMessage(new Error('duplicate key value violates unique constraint "code"'))).toMatch(
      /já existe/i,
    );
  });

  it("mantém mensagem original para erros desconhecidos", () => {
    expect(planErrorMessage(new Error("boom"))).toBe("boom");
  });
});
