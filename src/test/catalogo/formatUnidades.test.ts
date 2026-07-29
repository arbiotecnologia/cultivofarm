import { describe, it, expect } from "vitest";
import {
  round2,
  roundDose,
  roundArea,
  roundVolume,
  formatarMoeda,
  formatarMoedaOuTraco,
  formatarOuTraco,
  formatarDose,
  formatarArea,
  formatarVolume,
  formatarPercentual,
  formatarCustoHa,
  PLACEHOLDER_VAZIO,
  SOB_CONSULTA_LABEL,
  REFERENCIA_DOSE_LITRO,
} from "@/lib/catalogo/formatUnidades";

describe("arredondamento", () => {
  it("moeda em 2 casas half-up", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(null)).toBe(0);
  });
  it("dose, área e volume", () => {
    expect(roundDose(99.6)).toBe(100);
    expect(roundArea(12.499)).toBe(12.5);
    expect(roundVolume(1.23456)).toBe(1.235);
  });
});

describe("formatação", () => {
  it("moeda e placeholders", () => {
    expect(formatarMoeda(1234.5)).toContain("1.234,50");
    expect(formatarMoedaOuTraco(0)).toBe(PLACEHOLDER_VAZIO);
    expect(formatarMoedaOuTraco(null)).toBe(PLACEHOLDER_VAZIO);
    expect(formatarOuTraco("  ")).toBe(PLACEHOLDER_VAZIO);
    expect(formatarOuTraco("BAC-1")).toBe("BAC-1");
  });
  it("dose, área, volume, percentual", () => {
    expect(formatarDose(100)).toBe("100 mL/ha");
    expect(formatarDose(100, { comSufixo: false })).toBe("100 mL");
    expect(formatarDose(null)).toBe(PLACEHOLDER_VAZIO);
    expect(formatarArea(12.5)).toBe("12,50 ha");
    expect(formatarVolume(1)).toBe("1 L");
    expect(formatarVolume(1.5)).toBe("1,5 L");
    expect(formatarPercentual(10)).toBe("10%");
    expect(formatarPercentual(12.5)).toBe("12,5%");
  });
  it("referência de dose é única", () => {
    expect(REFERENCIA_DOSE_LITRO).toBe("Referência: 1 L = 10 doses de 100 mL.");
  });
});

describe("custo por hectare", () => {
  it("usa valor/ha explícito", () => {
    const r = formatarCustoHa({ tipo: "produto", valorHa: 150 });
    expect(r.valor).toBe(150);
    expect(r.sobConsulta).toBe(false);
  });
  it("deriva de dose 100 mL", () => {
    const r = formatarCustoHa({ tipo: "produto", doseMlHa: 200, valorDose: 30 });
    expect(r.valor).toBe(60);
    expect(r.doseTexto).toBe("200 mL/ha");
  });
  it("deriva de valor por litro", () => {
    const r = formatarCustoHa({ tipo: "produto", doseMlHa: 500, valorLitro: 200 });
    expect(r.valor).toBe(100);
  });
  it("microrganismo usa dose referencial de 100 mL/ha", () => {
    const r = formatarCustoHa({ tipo: "microrganismo", valorLitro: 250 });
    expect(r.valor).toBe(25);
  });
  it("sem base vira Sob consulta e nunca R$ 0,00", () => {
    const r = formatarCustoHa({ tipo: "produto" });
    expect(r.sobConsulta).toBe(true);
    expect(r.texto).toBe(SOB_CONSULTA_LABEL);
    expect(r.valor).toBeNull();
  });
});
