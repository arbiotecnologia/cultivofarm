import { describe, it, expect } from "vitest";
import { simulationKey, describeSimulationFailure } from "@/lib/b2bSimulationState";

const base = { userId: "u", organizationId: "o", partnerId: "p", planId: "pl", items: [{ item_id: "x", quantidade: 1 }] };

describe("chave de simulação B2B", () => {
  it("muda ao trocar condição, carrinho, parceiro, usuário ou tenant", () => {
    const k = simulationKey(base);
    expect(simulationKey({ ...base, planId: "pl2" })).not.toBe(k);
    expect(simulationKey({ ...base, items: [{ item_id: "x", quantidade: 2 }] })).not.toBe(k);
    expect(simulationKey({ ...base, partnerId: "p2" })).not.toBe(k);
    expect(simulationKey({ ...base, userId: "u2" })).not.toBe(k);
    expect(simulationKey({ ...base, organizationId: "o2" })).not.toBe(k);
  });
  it("sem contexto completo ou carrinho vazio não simula", () => {
    expect(simulationKey({ ...base, items: [] })).toBeNull();
    expect(simulationKey({ ...base, planId: null })).toBeNull();
    expect(simulationKey({ ...base, userId: undefined })).toBeNull();
  });
});

describe("falha da simulação", () => {
  it("fence do catálogo vira erro visível com código e nova tentativa", () => {
    const f = describeSimulationFailure("k", { code: "42501", message: "tenant_catalog_fence_denied" });
    expect(f.code).toBe("42501");
    expect(f.retryable).toBe(true);
    expect(f.title).toMatch(/Não foi possível calcular/);
    expect(f.detail).toMatch(/Nenhum valor foi aplicado/);
  });
  it("configuração de crédito incompleta informa indisponibilidade e bloqueia operação", () => {
    const f = describeSimulationFailure("k", { code: "PT409", message: "CREDIT_SETTINGS_INCOMPLETE" });
    expect(f.title).toBe("Condição financeira indisponível.");
    expect(f.detail).toMatch(/limite de crédito explícito/);
    expect(f.detail).toMatch(/pedido não pode ser enviado/);
    expect(f.retryable).toBe(false);
  });
  it("erro de cálculo financeiro não vira apto nem credit null", () => {
    const f = describeSimulationFailure("k", { code: "22023", message: "CREDIT_CALCULATION_INVALID" });
    expect(f.title).toBe("Condição financeira indisponível.");
    expect(f.detail).toMatch(/Nenhum valor foi aplicado/);
    expect(f.retryable).toBe(false);
  });
  it("erro desconhecido nunca inventa valor", () => {
    const f = describeSimulationFailure("k", new Error("boom"));
    expect(f.detail).toMatch(/Nenhum valor foi aplicado/);
    expect(f.key).toBe("k");
  });
});
