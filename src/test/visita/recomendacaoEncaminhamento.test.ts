import { describe, expect, it } from "vitest";
import { recCanForwardToLab } from "@/lib/visita/recomendacaoCatalogo";

describe("encaminhamento explícito — uma referência fabricável", () => {
  it("permite produto biológico", () => {
    expect(recCanForwardToLab("p", null, { id: "p", nome: "Bio", familia_catalogo: "biologico" }, undefined)).toBe(true);
  });
  it("permite somente microrganismo", () => {
    expect(recCanForwardToLab(null, "m", undefined, { id: "m", nome: "Micro", nome_cientifico: null })).toBe(true);
  });
  for (const family of ["quimico", "fertilizante_adubo", "fertilizante", null]) {
    it(`não encaminha família ${family}`, () => {
      expect(recCanForwardToLab("p", null, { id: "p", nome: "Produto", familia_catalogo: family }, undefined)).toBe(false);
    });
  }
  it("não encaminha referências duplas", () => {
    expect(recCanForwardToLab("p", "m", { id: "p", nome: "Bio", familia_catalogo: "biologico" }, { id: "m", nome: "Micro", nome_cientifico: null })).toBe(false);
  });
  it("não encaminha referências ausentes ou não carregadas", () => {
    expect(recCanForwardToLab(null, null, undefined, undefined)).toBe(false);
    expect(recCanForwardToLab("p", null, undefined, undefined)).toBe(false);
    expect(recCanForwardToLab(null, "m", undefined, undefined)).toBe(false);
  });
});