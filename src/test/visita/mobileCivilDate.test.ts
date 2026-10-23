import { describe, expect, it } from "vitest";
import { formatCivilDateDisplay, formatDateDisplay } from "@/lib/date-utils";

describe("data civil de atendimento técnico em America/Sao_Paulo", () => {
  it.each(["2026-10-23", "2026-10-23T00:00:00+00:00", "2026-10-23 00:00:00+00"])("preserva início civil do plano em 23/10: %s", value => {
    expect(formatCivilDateDisplay(value)).toBe("23/10/2026");
  });
  it.each(["2026-10-30", "2026-10-30T00:00:00+00:00", "2026-10-30 00:00:00+00"])("preserva fim civil do plano em 30/10: %s", value => {
    expect(formatCivilDateDisplay(value)).toBe("30/10/2026");
  });
  it.skipIf(process.env.TZ !== "America/Sao_Paulo")("executa no fuso solicitado", () => {
    expect(new Date("2026-10-09T00:00:00Z").getTimezoneOffset()).toBe(180);
  });
  it.each(["2026-10-09", "2026-10-09T00:00:00+00:00", "2026-10-09T00:00:00Z"])("preserva 09/10 na data civil %s", value => {
    expect(formatCivilDateDisplay(value)).toBe("09/10/2026");
  });
  it.skipIf(process.env.TZ !== "America/Sao_Paulo")("não muda a conversão local de timestamps de eventos", () => {
    expect(formatDateDisplay("2026-10-09T00:00:00Z")).toBe("08/10/2026");
  });
});