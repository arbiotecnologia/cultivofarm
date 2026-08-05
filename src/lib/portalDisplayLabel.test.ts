import { describe, expect, it } from "vitest";
import { getPortalDisplayLabel, getPortalGreetingLabel } from "./portalDisplayLabel";

describe("getPortalDisplayLabel — distinção de papéis técnicos", () => {
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
