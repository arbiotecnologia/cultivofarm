import { describe, expect, it } from "vitest";
import {
  addStockContent,
  formatStockContent,
  formatStockContentTotals,
  formatStockPackage,
  isValidStockQuantity,
  stockContentTotal,
  type StockQuantityLike,
} from "./stockUnits";

const grams = (quantity = 2): StockQuantityLike => ({
  quantidade: quantity,
  quantidade_reservada: null,
  volume_total: null,
  origem_estoque: "compra_produto_acabado_revenda",
  unidade_comercial: "unidade",
  conteudo_por_unidade: 500,
  unidade_conteudo: "g",
  quantidade_conteudo: quantity * 500,
});

describe("unidades do estoque de revenda", () => {
  it("2 UN de 500 g formam 1.000 g e nunca 1 L", () => {
    expect(stockContentTotal(grams())).toEqual({ value: 1000, unit: "g" });
    expect(formatStockContent(grams())).toBe("1.000 g");
    expect(formatStockPackage(grams())).toBe("2× 500 g");
    expect(formatStockContent(grams())).not.toContain("L");
  });

  it("0,500 kg por UN permanece peso, inclusive na reserva parcial", () => {
    const item = { ...grams(2), conteudo_por_unidade: 0.5, unidade_conteudo: "kg", quantidade_conteudo: 1 };
    expect(formatStockContent(item)).toBe("1 kg");
    expect(formatStockContent(item, 1)).toBe("0,5 kg");
    expect(formatStockPackage(item)).toBe("2× 0,5 kg");
  });

  it("L e mL seguem a apresentação, sem transformar peso em volume", () => {
    const liquid = { ...grams(2), conteudo_por_unidade: 500, unidade_conteudo: "ml", quantidade_conteudo: 1000, volume_total: 1 };
    expect(formatStockContent(liquid)).toBe("1.000 mL");
    expect(formatStockContent({ ...liquid, conteudo_por_unidade: 0.5, unidade_conteudo: "l" })).toBe("1 L");
  });

  it("legado biológico conserva litros", () => {
    expect(formatStockContent({ quantidade: 3, volume_total: 30 })).toBe("30 L");
    expect(formatStockPackage({ quantidade: 3, volume_total: 3 })).toBe("3× 1 L");
  });

  it("whole-pack aceita 1 e 2, mas recusa 0,5, NaN e excesso", () => {
    expect(isValidStockQuantity(grams(), "1", 2)).toBe(true);
    expect(isValidStockQuantity(grams(), "2", 2)).toBe(true);
    expect(isValidStockQuantity(grams(), "0.5", 2)).toBe(false);
    expect(isValidStockQuantity(grams(), "NaN", 2)).toBe(false);
    expect(isValidStockQuantity(grams(), "3", 2)).toBe(false);
  });

  it("totais não misturam dimensões nem convertem g em L", () => {
    const totals = addStockContent({}, grams(), 2);
    addStockContent(totals, { ...grams(), unidade_conteudo: "ml", volume_total: 1 }, 1);
    expect(totals).toEqual({ g: 1000, ml: 500 });
    expect(formatStockContentTotals(totals)).toBe("1.000 g · 500 mL");
  });
});
