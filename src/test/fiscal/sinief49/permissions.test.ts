import { describe, expect, it } from "vitest";
import { canUseSinief49Operations, SINIEF49_ALLOWED_ROLES } from "@/lib/fiscal/sinief49/permissions";

describe("SINIEF 49/2025 · gate de permissão", () => {
  it("permite apenas administrador e financeiro", () => {
    expect(canUseSinief49Operations("administrador")).toBe(true);
    expect(canUseSinief49Operations("financeiro")).toBe(true);
  });
  it("nega demais papéis", () => {
    const others = [
      "gestor",
      "consultor_tecnico",
      "aplicador",
      "operador_onfarm",
      "cliente_produtor",
      "administrativo",
      "tecnico_agronomo",
      "producao",
      "gestor_comercial",
      "parceiro_b2b",
      "parceiro_b2b_tecnico",
    ] as const;
    for (const r of others) expect(canUseSinief49Operations(r)).toBe(false);
  });
  it("nega null/undefined/desconhecido", () => {
    expect(canUseSinief49Operations(null)).toBe(false);
    expect(canUseSinief49Operations(undefined)).toBe(false);
    expect(canUseSinief49Operations("desconhecido")).toBe(false);
  });
  it("SINIEF49_ALLOWED_ROLES é imutável e contém exatamente admin+financeiro", () => {
    expect([...SINIEF49_ALLOWED_ROLES].sort()).toEqual(["administrador", "financeiro"]);
    expect(Object.isFrozen(SINIEF49_ALLOWED_ROLES)).toBe(true);
  });
});
