import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  formatVolumeLabel,
  precoPorLitro,
  valorDose100ml,
  dosesPorVolume,
  formatPrecoLitro,
  formatDose100ml,
} from "@/hooks/useCatalogoVolumes";

const HOOK = resolve(process.cwd(), "src/hooks/useCatalogoVolumes.ts");
const hookSrc = readFileSync(HOOK, "utf8");

describe("FASE 28C — conversões de volume (determinismo)", () => {
  it("formatVolumeLabel prioriza o rótulo quando informado", () => {
    expect(formatVolumeLabel({ volume_ml: 1000, rotulo: "  Frasco 1L " })).toBe("Frasco 1L");
  });

  it("formatVolumeLabel deriva litros de volume_ml quando não há rótulo", () => {
    expect(formatVolumeLabel({ volume_ml: 1000, rotulo: null })).toBe("1 L");
    expect(formatVolumeLabel({ volume_ml: 20000, rotulo: "  " })).toBe("20 L");
    expect(formatVolumeLabel({ volume_ml: 500, rotulo: null })).toBe("0,5 L");
  });

  it("precoPorLitro = preco_brl / (volume_ml/1000)", () => {
    expect(precoPorLitro({ volume_ml: 1000, preco_brl: 120, preco_litro_brl: null })).toBe(120);
    expect(precoPorLitro({ volume_ml: 20000, preco_brl: 2000, preco_litro_brl: null })).toBe(100);
    expect(precoPorLitro({ volume_ml: 500, preco_brl: 60, preco_litro_brl: null })).toBe(120);
  });

  it("precoPorLitro respeita o valor persistido quando existir", () => {
    expect(precoPorLitro({ volume_ml: 1000, preco_brl: 999, preco_litro_brl: 88 })).toBe(88);
  });

  it("precoPorLitro protege contra volume zero", () => {
    expect(precoPorLitro({ volume_ml: 0, preco_brl: 100, preco_litro_brl: null })).toBe(0);
  });

  it("valorDose100ml = precoPorLitro / 10, ou valor persistido", () => {
    expect(
      valorDose100ml({ volume_ml: 1000, preco_brl: 120, preco_litro_brl: null, valor_dose_100ml_brl: null }),
    ).toBe(12);
    expect(
      valorDose100ml({ volume_ml: 1000, preco_brl: 120, preco_litro_brl: null, valor_dose_100ml_brl: 9.5 }),
    ).toBe(9.5);
  });

  it("dosesPorVolume = doses_por_volume ?? volume_ml/100", () => {
    expect(dosesPorVolume({ volume_ml: 1000, doses_por_volume: null })).toBe(10);
    expect(dosesPorVolume({ volume_ml: 20000, doses_por_volume: null })).toBe(200);
    expect(dosesPorVolume({ volume_ml: 1000, doses_por_volume: 8 })).toBe(8);
  });

  it("formatações monetárias são estáveis em pt-BR", () => {
    const v = { volume_ml: 1000, preco_brl: 120, preco_litro_brl: null, valor_dose_100ml_brl: null };
    expect(formatPrecoLitro(v)).toMatch(/^R\$\s?120,00\/L$/);
    expect(formatDose100ml(v)).toMatch(/^R\$\s?12,00 \/ 100 mL$/);
  });

  it("conversões são determinísticas em repetição", () => {
    const v = { volume_ml: 5000, preco_brl: 450, preco_litro_brl: null, valor_dose_100ml_brl: null };
    expect(precoPorLitro(v)).toBe(precoPorLitro(v));
    expect(valorDose100ml(v)).toBe(valorDose100ml(v));
  });
});

describe("FASE 28C — fórmulas congeladas por leitura estática", () => {
  it("litros continuam derivando de volume_ml / 1000", () => {
    expect(hookSrc).toContain("v.volume_ml / 1000");
  });

  it("doses continuam usando doses_por_volume ?? volume_ml / 100", () => {
    expect(hookSrc).toContain("if (v.doses_por_volume != null) return Number(v.doses_por_volume);");
    expect(hookSrc).toContain("return v.volume_ml / 100;");
  });

  it("dose de 100 mL continua sendo um décimo do preço por litro", () => {
    expect(hookSrc).toContain("return precoPorLitro(v) / 10;");
  });
});
