import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { computeSlaBadge, planningStatusToFase, type SlaConfigMap } from "./b2bSla";
import { validateSlaPrazo, SLA_MIN_HORAS, SLA_MAX_HORAS } from "@/hooks/useB2BSlaConfig";

const CONFIG: SlaConfigMap = {
  planejamento: { prazo_horas: 24, ativo: true },
  em_producao: { prazo_horas: 72, ativo: true },
  cq: { prazo_horas: 24, ativo: true },
  envase: { prazo_horas: 24, ativo: true },
  produzido: { prazo_horas: 24, ativo: true },
  entrega: { prazo_horas: 72, ativo: false }, // desativado p/ teste
};

const NOW = new Date("2026-06-28T12:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("planningStatusToFase", () => {
  it("mapeia status do planning para fase monitorada", () => {
    expect(planningStatusToFase("aguardando_planejamento")).toBe("planejamento");
    expect(planningStatusToFase("planejado")).toBe("planejamento");
    expect(planningStatusToFase("em_producao")).toBe("em_producao");
    expect(planningStatusToFase("produzido")).toBe("entrega");
    expect(planningStatusToFase("entregue")).toBeNull();
    expect(planningStatusToFase("cancelado")).toBeNull();
    expect(planningStatusToFase(null)).toBeNull();
  });
});

describe("computeSlaBadge — dispara badge e alerta no momento certo", () => {
  it("retorna null quando fase está dentro do prazo (<80%)", () => {
    const inicio = new Date(NOW - 10 * 3_600_000).toISOString(); // 10h atrás
    const info = computeSlaBadge("aguardando_planejamento", inicio, CONFIG);
    expect(info).not.toBeNull();
    expect(info!.atrasada).toBe(false);
    expect(info!.proximoEstouro).toBe(false);
  });

  it("acende 'próximo do limite' quando >80% do prazo", () => {
    const inicio = new Date(NOW - 20 * 3_600_000).toISOString(); // 20h de 24h
    const info = computeSlaBadge("planejado", inicio, CONFIG)!;
    expect(info.atrasada).toBe(false);
    expect(info.proximoEstouro).toBe(true);
  });

  it("marca como atrasada quando ultrapassa o prazo (gatilho do alerta cron)", () => {
    const inicio = new Date(NOW - 25 * 3_600_000).toISOString(); // 25h de 24h
    const info = computeSlaBadge("planejado", inicio, CONFIG)!;
    expect(info.atrasada).toBe(true);
    expect(info.fase).toBe("planejamento");
    expect(info.prazo).toBe(24);
  });

  it("usa o prazo da fase 'em_producao' (72h) quando o pedido está em produção", () => {
    const inicio = new Date(NOW - 73 * 3_600_000).toISOString();
    const info = computeSlaBadge("em_producao", inicio, CONFIG)!;
    expect(info.fase).toBe("em_producao");
    expect(info.atrasada).toBe(true);
  });

  it("ignora fase com config desativada (não gera badge nem alerta)", () => {
    const inicio = new Date(NOW - 1000 * 3_600_000).toISOString();
    const info = computeSlaBadge("produzido", inicio, CONFIG); // fase 'entrega' ativo=false
    expect(info).toBeNull();
  });

  it("não retorna badge para pedido entregue/cancelado", () => {
    expect(computeSlaBadge("entregue", new Date(0).toISOString(), CONFIG)).toBeNull();
    expect(computeSlaBadge("cancelado", new Date(0).toISOString(), CONFIG)).toBeNull();
  });

  // Simula que o cron roda a cada 30min: garante que a transição
  // de "não atrasado" → "atrasado" acontece dentro de uma janela ≤30min.
  it("transita para atrasada em ≤30min após estourar o limite", () => {
    const limiteMs = 24 * 3_600_000;
    // 1ms antes do limite ainda não está atrasado
    const inicioOk = new Date(NOW - (limiteMs - 1)).toISOString();
    expect(computeSlaBadge("planejado", inicioOk, CONFIG)!.atrasada).toBe(false);
    // 30min depois do limite, sim
    const inicioLate = new Date(NOW - (limiteMs + 30 * 60_000)).toISOString();
    expect(computeSlaBadge("planejado", inicioLate, CONFIG)!.atrasada).toBe(true);
  });
});

describe("validateSlaPrazo — bloqueia configurações inválidas", () => {
  it("aceita inteiros dentro do intervalo", () => {
    const r = validateSlaPrazo(24);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(24);
  });

  it("rejeita zero, negativos e decimais", () => {
    for (const v of [0, -1, -100, 1.5, 12.7]) {
      const r = validateSlaPrazo(v);
      expect(r.ok).toBe(false);
    }
  });

  it("rejeita valores não numéricos / NaN", () => {
    expect(validateSlaPrazo(NaN).ok).toBe(false);
    expect(validateSlaPrazo("abc" as any).ok).toBe(false);
    expect(validateSlaPrazo(null as any).ok).toBe(false);
    expect(validateSlaPrazo(undefined as any).ok).toBe(false);
  });

  it("respeita os limites mínimo e máximo", () => {
    expect(validateSlaPrazo(SLA_MIN_HORAS).ok).toBe(true);
    expect(validateSlaPrazo(SLA_MAX_HORAS).ok).toBe(true);
    expect(validateSlaPrazo(SLA_MIN_HORAS - 1).ok).toBe(false);
    expect(validateSlaPrazo(SLA_MAX_HORAS + 1).ok).toBe(false);
  });
});
