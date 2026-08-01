import { describe, expect, it } from "vitest";
import { cockpitStage, isStageTerminal, STAGE_COLUMN, type CockpitStage } from "@/lib/cockpit/stage";

/**
 * Paridade do mapa canônico do frontend com public.fn_cockpit_stage.
 * Qualquer divergência aqui significa coluna do Kanban divergente do banco.
 */
describe("cockpit · estágio canônico", () => {
  const casos: Array<[string, CockpitStage]> = [
    ["programada", "programada"],
    ["em_producao", "em_producao"],
    ["aguardando_cq", "aguardando_cq"],
    ["em_cq", "aguardando_cq"],
    ["cq_aprovado", "cq_aprovado"],
    ["aprovado_cq", "cq_aprovado"],
    ["cq_reprovado", "cq_reprovado"],
    ["envase", "em_envase"],
    ["pronto_entrega", "estoque_disponivel"],
    ["estoque_reservado", "estoque_reservado"],
    ["em_entrega", "em_entrega"],
    ["entregue", "entregue"],
    ["finalizada", "finalizada"],
    ["cancelada", "cancelada"],
  ];

  it.each(casos)("status %s → estágio %s", (status, esperado) => {
    expect(cockpitStage(status)).toBe(esperado);
  });

  it("é insensível a caixa", () => {
    expect(cockpitStage("EM_PRODUCAO")).toBe("em_producao");
  });

  it("status desconhecido ou nulo cai em aguardando, sem lançar", () => {
    expect(cockpitStage("status_inexistente")).toBe("aguardando");
    expect(cockpitStage(null)).toBe("aguardando");
    expect(cockpitStage(undefined)).toBe("aguardando");
  });

  it("estoque reservado e entregue não compartilham o mesmo estágio", () => {
    expect(cockpitStage("estoque_reservado")).not.toBe(cockpitStage("entregue"));
  });

  it("apenas finalizada e cancelada são terminais", () => {
    expect(isStageTerminal("finalizada")).toBe(true);
    expect(isStageTerminal("cancelada")).toBe(true);
    expect(isStageTerminal("em_entrega")).toBe(false);
  });

  it("toda etapa canônica possui coluna visual", () => {
    for (const [, stage] of casos) {
      expect(STAGE_COLUMN[stage]).toBeTruthy();
    }
  });
});
