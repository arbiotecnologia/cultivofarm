import { describe, expect, it } from "vitest";
import payloads from "./fixtures/capabilityPayloads.mirror-20261112.json";
import { readInternalOrderEntryCapability, resolveInternalOrderTarget } from "@/lib/comercial/internalOrderEntry";
import { parseSellerCapability } from "@/hooks/useSellerPortfolio";

// Respostas capturadas do PostgreSQL descartável com 02e instalado (scripts/vendedor-role-20261111/gestor-capability-reader-20261112).
describe("capacidades reais do espelho 20261112", () => {
  it("gestor comercial abre só com parceiros da própria empresa", () => {
    const g = payloads.gestor_comercial;
    const cap = readInternalOrderEntryCapability(g.payload, g.org);
    expect(cap.state).toBe("allowed");
    if (cap.state !== "allowed") return;
    expect(cap.targets.map(t => t.partnerId)).toContain("00000000-0000-0000-0000-000000000011");
    expect(resolveInternalOrderTarget(cap, "00000000-0000-0000-0000-000000000013")).toBeNull();
  });
  it("mesma resposta lida por ator de outra empresa fica fechada", () => {
    const cap = readInternalOrderEntryCapability(payloads.gestor_comercial.payload, "00000000-0000-0000-0000-000000000002");
    expect(cap).toEqual({ state: "blocked", reason: "invalid_response" });
  });
  it("vendedor e financeiro não entram pela capacidade do gestor", () => {
    expect(readInternalOrderEntryCapability(payloads.vendedor.payload, payloads.vendedor.org)).toEqual({ state: "blocked", reason: "actor_not_allowed" });
    expect(readInternalOrderEntryCapability(payloads.financeiro.payload, payloads.financeiro.org)).toEqual({ state: "blocked", reason: "actor_not_allowed" });
  });
  it("vendedor exclusivo lê a carteira v2 com um único parceiro", () => {
    const s = parseSellerCapability(payloads.vendedor.seller) as unknown as Record<string, unknown>;
    expect(JSON.stringify(s)).toContain("00000000-0000-0000-0000-000000000011");
    expect(JSON.stringify(s)).not.toContain("00000000-0000-0000-0000-000000000085");
  });
});
