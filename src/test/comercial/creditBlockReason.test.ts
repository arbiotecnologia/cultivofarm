import { describe, expect, it } from "vitest";
import { creditBlockReasonLabel } from "@/components/comercial/creditBlockReason";

describe("creditBlockReasonLabel", () => {
  it("labels inactive/absent financial settings", () => {
    expect(creditBlockReasonLabel("configuracao_financeira_inativa")).toBe("Configuração financeira do parceiro ausente ou inativa");
  });
  it("labels undefined limit (zero is not unlimited)", () => {
    expect(creditBlockReasonLabel("limite_nao_definido")).toBe("Limite de crédito não definido");
  });
  it("keeps the existing guard reasons distinct", () => {
    expect(creditBlockReasonLabel("limite_excedido")).not.toBe(creditBlockReasonLabel("limite_excedido_bloqueado"));
    expect(creditBlockReasonLabel("inadimplencia")).toBe("Bloqueado por títulos vencidos");
  });
  it("never hides an unknown reason nor invents one for empty", () => {
    expect(creditBlockReasonLabel("motivo_futuro")).toBe("Bloqueio de crédito (motivo_futuro)");
    expect(creditBlockReasonLabel(null)).toBeNull();
    expect(creditBlockReasonLabel("")).toBeNull();
  });
});
