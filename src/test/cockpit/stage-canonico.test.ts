import { describe, expect, it } from "vitest";
import { cockpitStage, STAGE_COLUMN } from "@/lib/cockpit/stage";

/**
 * Paridade do mapa canônico do frontend com public.fn_cockpit_stage.
 * Qualquer divergência aqui significa coluna do Kanban divergente do banco.
 */
describe("cockpit · estágio canônico", () => {
  const casos: Array<[string, string]> = [
    ["aberta", "aguardando"],
    ["aprovada", "aguardando"],
    ["programada", "aguardando"],
    ["em_producao", "em_producao"],
    ["aguardando_cq", "aguardando_cq"],
    ["em_cq", "aguardando_cq"],
    ["cq_aprovado", "aprovado_cq"],
    ["envase", "envase"],
    ["aguardando_reserva", "estoque_reserva"],
    ["pronto_entrega", "estoque_reserva"],
    ["entregue", "entregue"],
    ["finalizada", "finalizada"],
  ];

  it.each(casos)("status %s → estágio %s", (status, esperado) => {
    expect(cockpitStage(status)).toBe(esperado);
  });

  it("status desconhecido não quebra e cai em aguardando", () => {
    expect(cockpitStage("status_inexistente")).toBe("aguardando");
    expect(cockpitStage(null)).toBe("aguardando");
  });

  it("toda etapa canônica possui coluna visual", () => {
    for (const [, stage] of casos) {
      expect(STAGE_COLUMN[stage as keyof typeof STAGE_COLUMN]).toBeTruthy();
    }
  });
});
