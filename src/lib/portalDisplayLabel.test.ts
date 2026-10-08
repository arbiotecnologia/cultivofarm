import { describe, expect, it } from "vitest";
import { getPortalDisplayLabel, getPortalGreetingLabel } from "./portalDisplayLabel";

describe("getPortalDisplayLabel — distinção de papéis técnicos", () => {
  it("administrador em contexto technical mantém rótulo e saudação reais", () => {
    const input = { activeCtx: "technical", primaryRole: "administrador", roles: ["administrador"] } as const;
    const props = { ...input, roles: [...input.roles] };
    expect(getPortalDisplayLabel(props)).toBe("Administrador da empresa");
    expect(getPortalGreetingLabel(props)).toBe("administrador da empresa");
  });

  it("contexto technical sem papel não inventa consultor", () => {
    const input = { activeCtx: "technical", primaryRole: null, roles: [] } as const;
    const props = { ...input, roles: [...input.roles] };
    expect(getPortalDisplayLabel(props)).toBe("—");
    expect(getPortalGreetingLabel(props)).toBe("—");
  });

  it("preserva papel técnico real em usuário multipapel", () => {
    expect(getPortalDisplayLabel({ activeCtx: "technical", primaryRole: "administrador", roles: ["administrador", "consultor_tecnico"] })).toBe("Consultor Técnico");
  });

  it("preserva contextos B2B e produtor", () => {
    expect(getPortalDisplayLabel({ activeCtx: "b2b", primaryRole: "parceiro_b2b", roles: ["parceiro_b2b", "consultor_tecnico"] })).toBe("Parceiro B2B (Gestor)");
    expect(getPortalDisplayLabel({ activeCtx: "producer", primaryRole: "cliente_produtor", roles: ["cliente_produtor"] })).toBe("Produtor");
  });

  it("mapeia tecnico_agronomo para 'Técnico Agrônomo'", () => {
    expect(
      getPortalDisplayLabel({
        activeCtx: "technical",
        primaryRole: "tecnico_agronomo",
        roles: ["tecnico_agronomo"],
      }),
    ).toBe("Técnico Agrônomo");
  });

  it("mapeia consultor_tecnico para 'Consultor Técnico'", () => {
    expect(
      getPortalDisplayLabel({
        activeCtx: "technical",
        primaryRole: "consultor_tecnico",
        roles: ["consultor_tecnico"],
      }),
    ).toBe("Consultor Técnico");
  });

  it("não confunde os dois rótulos sem contexto ativo", () => {
    const agronomo = getPortalDisplayLabel({
      activeCtx: null,
      primaryRole: "tecnico_agronomo",
      roles: ["tecnico_agronomo"],
    });
    const consultor = getPortalDisplayLabel({
      activeCtx: null,
      primaryRole: "consultor_tecnico",
      roles: ["consultor_tecnico"],
    });
    expect(agronomo).toBe("Técnico Agrônomo");
    expect(consultor).toBe("Consultor Técnico");
    expect(agronomo).not.toBe(consultor);
  });

  it("respeita o papel primário quando o usuário tem ambos os papéis", () => {
    expect(
      getPortalDisplayLabel({
        activeCtx: "technical",
        primaryRole: "tecnico_agronomo",
        roles: ["consultor_tecnico", "tecnico_agronomo"],
      }),
    ).toBe("Técnico Agrônomo");
  });

  it("saudação distingue os dois papéis", () => {
    expect(
      getPortalGreetingLabel({ activeCtx: "technical", primaryRole: "tecnico_agronomo", roles: ["tecnico_agronomo"] }),
    ).toBe("técnico agrônomo");
    expect(
      getPortalGreetingLabel({ activeCtx: "technical", primaryRole: "consultor_tecnico", roles: ["consultor_tecnico"] }),
    ).toBe("consultor");
  });
});
