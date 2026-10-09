import { describe, expect, it } from "vitest";
import { formatCivilDateDisplay, formatDateDisplay } from "@/lib/date-utils";

describe("data civil de atendimento técnico em America/Sao_Paulo", () => {
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