import { describe, it, expect } from "vitest";
import {
  fmtEmb,
  computeTotals,
  findInvalidIds,
  clampQty,
  computeContentTotals,
  type EstoqueItemLike,
} from "./reservaCalc";

const big: EstoqueItemLike = { id: "a", quantidade: 1, volume_total: 20 };   // 1× 20 L
const small: EstoqueItemLike = { id: "b", quantidade: 3, volume_total: 3 };  // 3× 1 L
const unitless: EstoqueItemLike = { id: "c", quantidade: 5, volume_total: 0 };
const empty: EstoqueItemLike = { id: "d", quantidade: 0, volume_total: 0 };

describe("fmtEmb", () => {
  it("formata embalagem com volume unitário inteiro", () => {
    expect(fmtEmb(big)).toBe("1× 20 L");
    expect(fmtEmb(small)).toBe("3× 1 L");
  });
  it("formata embalagem com volume unitário fracionário", () => {
    expect(fmtEmb({ id: "x", quantidade: 4, volume_total: 1 })).toBe("4× 0.25 L");
  });
  it("usa 'un' quando não há volume", () => {
    expect(fmtEmb(unitless)).toBe("5 un");
  });
  it("retorna '—' quando vazio", () => {
    expect(fmtEmb(empty)).toBe("—");
  });
});

describe("computeTotals", () => {
  it("soma un e L do envase 1×20L + 3×1L = 4 un / 23 L", () => {
    const { totalUn, totalL } = computeTotals([big, small], { a: "1", b: "3" });
    expect(totalUn).toBe(4);
    expect(totalL).toBe(23);
  });

  it("recalcula ao reduzir quantidade do item pequeno", () => {
    const { totalUn, totalL } = computeTotals([big, small], { a: "1", b: "2" });
    expect(totalUn).toBe(3);
    expect(totalL).toBe(22); // 20 + (2/3)*3
  });

  it("ignora qtys vazias / inválidas", () => {
    const { totalUn, totalL } = computeTotals([big, small], { a: "", b: "abc" });
    expect(totalUn).toBe(0);
    expect(totalL).toBe(0);
  });

  it("conta apenas itens selecionados", () => {
    const { totalUn, totalL } = computeTotals([small], { a: "1", b: "3" });
    expect(totalUn).toBe(3);
    expect(totalL).toBe(3);
  });

  it("soma unidades mesmo sem volume", () => {
    const { totalUn, totalL } = computeTotals([unitless], { c: "2" });
    expect(totalUn).toBe(2);
    expect(totalL).toBe(0);
  });
});

describe("findInvalidIds — validação por embalagem", () => {
  it("aprova quantidades válidas dentro do disponível", () => {
    expect(findInvalidIds([big, small], { a: "1", b: "3" })).toEqual([]);
  });

  it("rejeita quantidade acima do disponível por embalagem", () => {
    // small tem só 3 disponíveis; pedir 4 deve invalidar
    expect(findInvalidIds([big, small], { a: "1", b: "4" })).toEqual(["b"]);
  });

  it("rejeita vazio, zero e negativo", () => {
    const ids = findInvalidIds([big, small], { a: "", b: "0" });
    expect(ids).toEqual(["a", "b"]);
    expect(findInvalidIds([small], { b: "-1" })).toEqual(["b"]);
  });

  it("rejeita texto não numérico", () => {
    expect(findInvalidIds([small], { b: "abc" })).toEqual(["b"]);
  });
});

describe("clampQty", () => {
  it("mantém vazio quando vazio", () => {
    expect(clampQty("", 10)).toBe("");
  });
  it("limita ao máximo disponível", () => {
    expect(clampQty("99", 3)).toBe("3");
  });
  it("eleva ao mínimo 1", () => {
    expect(clampQty("0", 10)).toBe("1");
    expect(clampQty("-5", 10)).toBe("1");
  });
  it("preserva valor válido", () => {
    expect(clampQty("2", 10)).toBe("2");
  });
});

describe("fmtEmb — edge cases", () => {
  it("volume unitário muito grande", () => {
    expect(fmtEmb({ id: "x", quantidade: 1, volume_total: 1000 })).toBe("1× 1000 L");
  });
  it("quantidade muito grande", () => {
    expect(fmtEmb({ id: "x", quantidade: 100000, volume_total: 100000 })).toBe("100000× 1 L");
  });
  it("trunca volume unitário fracionário a 2 casas", () => {
    expect(fmtEmb({ id: "x", quantidade: 3, volume_total: 1 })).toBe("3× 0.33 L");
  });
  it("campos null/undefined caem em '—'", () => {
    expect(fmtEmb({ id: "x" })).toBe("—");
    expect(fmtEmb({ id: "x", quantidade: null, volume_total: null })).toBe("—");
    expect(fmtEmb({ id: "x", quantidade: undefined, volume_total: undefined } as any)).toBe("—");
  });
  it("strings numéricas são coeridas corretamente", () => {
    expect(fmtEmb({ id: "x", quantidade: "3" as any, volume_total: "9" as any })).toBe("3× 3 L");
  });
  it("strings não numéricas viram NaN e caem em '—'", () => {
    expect(fmtEmb({ id: "x", quantidade: "abc" as any, volume_total: "xyz" as any })).toBe("—");
  });
  it("quantidade negativa cai em '—'", () => {
    expect(fmtEmb({ id: "x", quantidade: -3, volume_total: 0 })).toBe("—");
  });
  it("quantidade > 0 sem volume usa 'un'", () => {
    expect(fmtEmb({ id: "x", quantidade: 7, volume_total: null })).toBe("7 un");
  });
});

describe("clampQty — edge cases", () => {
  it("preserva decimal dentro do range", () => {
    expect(clampQty("2.7", 10)).toBe("2.7");
  });
  it("limita decimal acima do max", () => {
    expect(clampQty("99.9", 3)).toBe("3");
  });
  it("limita valor extremamente grande", () => {
    expect(clampQty("1e20", 5)).toBe("5");
  });
  it("eleva valor extremamente negativo ao mínimo 1", () => {
    expect(clampQty("-9999", 10)).toBe("1");
  });
  it("aceita notação científica válida", () => {
    expect(clampQty("1e2", 1000)).toBe("100");
  });
  it("retorna '' para strings não numéricas", () => {
    expect(clampQty("abc", 10)).toBe("");
    expect(clampQty("--", 10)).toBe("");
    expect(clampQty("NaN", 10)).toBe("");
  });
  it("retorna '' quando max é 0 ou negativo (lote esgotado)", () => {
    expect(clampQty("3", 0)).toBe("");
    expect(clampQty("3", -1)).toBe("");
  });
  it("retorna '' para Infinity", () => {
    expect(clampQty("Infinity", 10)).toBe("");
  });
});

describe("computeTotals — edge cases", () => {
  it("lista vazia retorna zeros", () => {
    expect(computeTotals([], {})).toEqual({ totalUn: 0, totalL: 0 });
  });
  it("item sem volume soma só unidades", () => {
    const { totalUn, totalL } = computeTotals([unitless], { c: "3" });
    expect(totalUn).toBe(3);
    expect(totalL).toBe(0);
  });
  it("soma decimais corretamente", () => {
    const { totalUn, totalL } = computeTotals([small], { b: "1.5" });
    expect(totalUn).toBe(1.5);
    expect(totalL).toBe(1.5);
  });
  it("soma valores acima do disponível (validação é separada)", () => {
    const { totalUn, totalL } = computeTotals([small], { b: "10" });
    expect(totalUn).toBe(10);
    expect(totalL).toBe(10);
  });
});

describe("revenda por embalagem inteira", () => {
  const solid: EstoqueItemLike = {
    id: "solid", quantidade: 2, volume_total: null, origem_estoque: "compra_produto_acabado_revenda",
    unidade_comercial: "unidade", conteudo_por_unidade: 500, unidade_conteudo: "g", quantidade_conteudo: 1000,
  };
  it("formata 2× 500 g sem apresentar peso como litros", () => {
    expect(fmtEmb(solid)).toBe("2× 500 g");
  });
  it("recusa meia embalagem e aceita uma inteira", () => {
    expect(findInvalidIds([solid], { solid: "0.5" })).toEqual(["solid"]);
    expect(findInvalidIds([solid], { solid: "1" })).toEqual([]);
    expect(clampQty("1.5", 2, true)).toBe("1");
  });
  it("totais preservam g e mL separados", () => {
    const liquid = { ...solid, id: "ml", unidade_conteudo: "ml", volume_total: 1 };
    const totals = computeContentTotals([solid, liquid], { solid: 2, ml: 1 });
    expect(totals.totalUn).toBe(3);
    expect(totals.label).toBe("1.000 g · 500 mL");
  });
});

describe("findInvalidIds — edge cases", () => {
  it("lista vazia retorna []", () => {
    expect(findInvalidIds([], {})).toEqual([]);
  });
  it("decimal válido dentro do disponível é aceito", () => {
    expect(findInvalidIds([small], { b: "2.5" })).toEqual([]);
  });
  it("decimal acima do disponível é rejeitado", () => {
    expect(findInvalidIds([small], { b: "3.5" })).toEqual(["b"]);
  });
  it("qty ausente (undefined) é inválido", () => {
    expect(findInvalidIds([small], {})).toEqual(["b"]);
  });
  it("item com quantidade 0 invalida qualquer qty", () => {
    expect(findInvalidIds([empty], { d: "1" })).toEqual(["d"]);
  });
});
