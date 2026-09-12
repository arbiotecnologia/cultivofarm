/**
 * Agenda Técnica — navegação do calendário e limites de horário.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HOUR_START,
  HOUR_END,
  SLOT_HEIGHT,
  isWithinGridRange,
  resolveDropSlot,
  resolveDropDate,
} from "@/lib/agenda/grid";

const raiz = resolve(__dirname, "../../..");
const pagina = readFileSync(resolve(raiz, "src/pages/AgendaTecnica.tsx"), "utf8");
const grade = readFileSync(resolve(raiz, "src/components/agenda/AgendaCalendarGrid.tsx"), "utf8");

const at = (h: number, m = 0) => new Date(2026, 8, 12, h, m, 0, 0);

describe("Limites da grade", () => {
  it("aceita apenas horários desenhados na grade", () => {
    expect(isWithinGridRange(at(HOUR_START))).toBe(true);
    expect(isWithinGridRange(at(HOUR_END))).toBe(true);
    expect(isWithinGridRange(at(HOUR_END, 30))).toBe(false);
    expect(isWithinGridRange(at(HOUR_START - 1, 30))).toBe(false);
  });

  it("drop no fim da grade nunca cai em 19:30", () => {
    const fim = resolveDropSlot((HOUR_END - HOUR_START) * SLOT_HEIGHT + SLOT_HEIGHT - 1);
    expect(fim).toEqual({ hour: HOUR_END, minutes: 0 });
    const alem = resolveDropSlot((HOUR_END - HOUR_START + 5) * SLOT_HEIGHT);
    expect(alem).toEqual({ hour: HOUR_END, minutes: 0 });
  });

  it("drop acima do topo cai no primeiro horário", () => {
    expect(resolveDropSlot(-50)).toEqual({ hour: HOUR_START, minutes: 0 });
  });

  it("mantém o snap de 30 minutos no meio da grade", () => {
    expect(resolveDropSlot(SLOT_HEIGHT * 2 + SLOT_HEIGHT * 0.6)).toEqual({
      hour: HOUR_START + 2,
      minutes: 30,
    });
  });

  it("todo resultado de drop é visível na grade", () => {
    for (let y = -100; y < (HOUR_END - HOUR_START + 3) * SLOT_HEIGHT; y += 7) {
      expect(isWithinGridRange(resolveDropDate(at(9), y))).toBe(true);
    }
  });
});

describe("Navegação fora da data atual", () => {
  it("a grade recebe itens sem o filtro de período da página", () => {
    expect(pagina).toContain("filteredSemPeriodo");
    expect(pagina).toMatch(/<AgendaCalendarGrid[\s\S]*items=\{filteredSemPeriodo\}/);
  });

  it("o filtro de período não se aplica às visualizações de calendário", () => {
    expect(pagina).not.toMatch(/<AgendaCalendarGrid[\s\S]*items=\{filtered\}/);
    expect(pagina).toContain('view !== "diario" && view !== "semanal"');
  });

  it("a grade mantém cursor próprio com passo diário/semanal", () => {
    expect(grade).toContain("const step = mode === \"diario\" ? 1 : 7;");
  });
});

describe("Reagendamento — concorrência e ordem", () => {
  it("bloqueia novo reagendamento enquanto houver um pendente", () => {
    expect(pagina).toContain("if (moveMutation.isPending) return;");
    expect(pagina).toContain("isMoving={moveMutation.isPending}");
    expect(grade).toContain("draggable={!isCompleted && !isMoving}");
  });

  it("atualiza a visita antes de gravar o log e só depois sincroniza", () => {
    const i = pagina.indexOf('.from("portal_solicitacoes")');
    const j = pagina.indexOf('.from("visitas_logs")');
    const k = pagina.indexOf('"sync-calendar-event"');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);
    expect(j).toBeLessThan(k);
  });

  it("valida o horário no cliente e restaura o estado em caso de falha", () => {
    expect(pagina).toContain("HORARIO_FORA_DA_AGENDA");
    const onError = pagina.slice(pagina.indexOf("onError: (err: any) => {"));
    expect(onError).toContain("invalidateQueries");
  });
});
