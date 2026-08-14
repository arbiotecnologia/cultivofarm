import { describe, it, expect } from "vitest";
import {
  fmtEmb,
  computeTotals,
  findInvalidIds,
  clampQty,
  type EstoqueItemLike,
} from "@/components/cockpit/reservaCalc";

const item = (over: Partial<EstoqueItemLike> = {}): EstoqueItemLike => ({
  id: "i1",
  quantidade: 3,
  volume_total: 3,
  status: "disponivel",
  ...over,
});

describe("FASE 28C — fmtEmb", () => {
  it("formata embalagem inteira como 'q× v L'", () => {
    expect(fmtEmb(item({ quantidade: 3, volume_total: 3 }))).toBe("3× 1 L");
    expect(fmtEmb(item({ quantidade: 1, volume_total: 20 }))).toBe("1× 20 L");
  });

  it("usa 2 casas decimais para volume unitário fracionário", () => {
    expect(fmtEmb(item({ quantidade: 3, volume_total: 1 }))).toBe("3× 0.33 L");
  });

  it("sem volume retorna contagem em unidades", () => {
    expect(fmtEmb(item({ quantidade: 3, volume_total: 0 }))).toBe("3 un");
    expect(fmtEmb(item({ quantidade: 2, volume_total: null }))).toBe("2 un");
  });

  it("sem quantidade retorna travessão", () => {
    expect(fmtEmb(item({ quantidade: 0, volume_total: 10 }))).toBe("—");
    expect(fmtEmb(item({ quantidade: null, volume_total: null }))).toBe("—");
  });
});

describe("FASE 28C — computeTotals", () => {
  it("soma unidades e litros pró-rata", () => {
    const selecionados = [
      item({ id: "a", quantidade: 4, volume_total: 4 }),
      item({ id: "b", quantidade: 2, volume_total: 40 }),
    ];
    const { totalUn, totalL } = computeTotals(selecionados, { a: 2, b: 1 });
    expect(totalUn).toBe(3);
    expect(totalL).toBe(22); // 2*(4/4) + 1*(40/2)
  });

  it("ignora quantidade vazia, zero ou inválida", () => {
    const selecionados = [
      item({ id: "a", quantidade: 4, volume_total: 4 }),
      item({ id: "b", quantidade: 4, volume_total: 4 }),
      item({ id: "c", quantidade: 4, volume_total: 4 }),
    ];
    expect(computeTotals(selecionados, { a: "", b: 0, c: "abc" })).toEqual({
      totalUn: 0,
      totalL: 0,
    });
  });

  it("item sem volume soma apenas unidades", () => {
    const r = computeTotals([item({ id: "a", quantidade: 5, volume_total: 0 })], { a: 2 });
    expect(r).toEqual({ totalUn: 2, totalL: 0 });
  });

  it("lista vazia resulta em zeros", () => {
    expect(computeTotals([], {})).toEqual({ totalUn: 0, totalL: 0 });
  });
});

describe("FASE 28C — findInvalidIds", () => {
  const selecionados = [
    item({ id: "vazio", quantidade: 5 }),
    item({ id: "nan", quantidade: 5 }),
    item({ id: "zero", quantidade: 5 }),
    item({ id: "negativo", quantidade: 5 }),
    item({ id: "excede", quantidade: 5 }),
    item({ id: "ok", quantidade: 5 }),
    item({ id: "limite", quantidade: 5 }),
  ];

  it("invalida vazio, NaN, zero, negativo e acima do disponível", () => {
    const invalidos = findInvalidIds(selecionados, {
      vazio: "",
      nan: "abc",
      zero: 0,
      negativo: -1,
      excede: 6,
      ok: 3,
      limite: 5,
    });
    expect(invalidos.sort()).toEqual(["excede", "nan", "negativo", "vazio", "zero"]);
  });

  it("aceita quantidade exatamente igual ao disponível", () => {
    expect(findInvalidIds([item({ id: "ok", quantidade: 5 })], { ok: 5 })).toEqual([]);
  });

  it("invalida quando a quantidade não foi informada", () => {
    expect(findInvalidIds([item({ id: "ok", quantidade: 5 })], {})).toEqual(["ok"]);
  });
});

describe("FASE 28C — clampQty", () => {
  it("preserva string vazia", () => {
    expect(clampQty("", 10)).toBe("");
  });

  it("limita ao mínimo 1", () => {
    expect(clampQty("0", 10)).toBe("1");
    expect(clampQty("-5", 10)).toBe("1");
  });

  it("limita ao máximo informado", () => {
    expect(clampQty("50", 10)).toBe("10");
    expect(clampQty("10", 10)).toBe("10");
  });

  it("mantém valor válido dentro do intervalo", () => {
    expect(clampQty("4", 10)).toBe("4");
  });

  it("retorna vazio para max inválido ou entrada não numérica", () => {
    expect(clampQty("4", 0)).toBe("");
    expect(clampQty("4", Number.POSITIVE_INFINITY)).toBe("");
    expect(clampQty("abc", 10)).toBe("");
  });

  it("nunca devolve valor acima do máximo (invariante de reserva)", () => {
    for (const v of ["1", "7", "99", "1000"]) {
      const out = clampQty(v, 12);
      expect(Number(out)).toBeLessThanOrEqual(12);
      expect(Number(out)).toBeGreaterThanOrEqual(1);
    }
  });
});
