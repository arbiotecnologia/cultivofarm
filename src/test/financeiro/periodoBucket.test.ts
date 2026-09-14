import { describe, expect, it } from "vitest";
import {
  dataIsoValida, fimDoMes, intervaloDetalhe, intervaloDoBucket, intersectarIntervalos, somarDias,
} from "@/lib/financeiro/periodoBucket";

describe("aritmética de datas somente data", () => {
  it("valida formato e existência do dia", () => {
    expect(dataIsoValida("2026-02-31")).toBe(false);
    expect(dataIsoValida("2026-02-28")).toBe(true);
    expect(dataIsoValida("2026-2-8")).toBe(false);
  });

  it("não desloca o dia em fuso UTC-3", () => {
    const tz = process.env.TZ;
    process.env.TZ = "America/Sao_Paulo";
    expect(somarDias("2026-03-01", 6)).toBe("2026-03-07");
    expect(intervaloDoBucket("2026-03-01", "DAY")).toEqual({ from: "2026-03-01", to: "2026-03-01" });
    expect(fimDoMes("2026-02-01")).toBe("2026-02-28");
    process.env.TZ = tz;
  });

  it("cobre semana e mês completos", () => {
    expect(intervaloDoBucket("2026-03-02", "WEEK")).toEqual({ from: "2026-03-02", to: "2026-03-08" });
    expect(intervaloDoBucket("2026-01-01", "MONTH")).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });

  it("recorte parcial: nunca expande além do filtro", () => {
    // Semana cruzando o fim do filtro.
    expect(intervaloDetalhe("2026-03-02", "WEEK", { from: "2026-03-01", to: "2026-03-05" }))
      .toEqual({ from: "2026-03-02", to: "2026-03-05" });
    // Mês cruzando o início do filtro.
    expect(intervaloDetalhe("2026-03-01", "MONTH", { from: "2026-03-10", to: "2026-03-20" }))
      .toEqual({ from: "2026-03-10", to: "2026-03-20" });
    // Bucket fora do recorte.
    expect(intervaloDetalhe("2026-05-01", "MONTH", { from: "2026-03-01", to: "2026-03-31" })).toBeNull();
  });

  it("interseção rejeita período inválido", () => {
    expect(intersectarIntervalos({ from: "2026-03-01", to: "2026-03-05" }, { from: "x", to: "2026-03-05" })).toBeNull();
    expect(intersectarIntervalos(null, { from: "2026-03-01", to: "2026-03-05" })).toBeNull();
  });
});
