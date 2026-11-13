import { describe, it, expect } from "vitest";
import { productPendencies, customerPendencies, scenarioFor, fiscalEditorLink } from "@/lib/fiscal/preEmissionPendencies";

const okProduct = { ncm: "48021000", cfop_in_state: "5101", cfop_interstate: "6101", origin_code: "0", icms_cst: "00", pis_cst: "01", cofins_cst: "01", commercial_unit: "UN", profile_status: "DRAFT" };
const okCustomer = { cpf_cnpj: "12345678000190", taxpayer_indicator: "9", fiscal_state: "MG", fiscal_municipality_ibge_code: "3147006", fiscal_street: "Rua A", fiscal_number: "1", fiscal_postal_code: "38600000" };

describe("pendências pré-emissão", () => {
  it("produto sem perfil aponta o perfil, sem inventar campos", () => {
    expect(productPendencies(null, "interna").map(p => p.field)).toEqual(["perfil"]);
  });
  it("produto completo não tem pendências nos dois cenários (CRT 3)", () => {
    expect(productPendencies(okProduct, "interna", 3)).toEqual([]);
    expect(productPendencies(okProduct, "interestadual", 3)).toEqual([]);
  });
  it("interestadual exige CFOP iniciando por 6", () => {
    const r = productPendencies({ ...okProduct, cfop_interstate: "5101" }, "interestadual", 3);
    expect(r.map(p => p.field)).toEqual(["cfop_interstate"]);
  });
  it("interna sem CFOP interno aponta o campo", () => {
    expect(productPendencies({ ...okProduct, cfop_in_state: null }, "interna", 3).map(p => p.field)).toEqual(["cfop_in_state"]);
  });
  it("Simples exige CSOSN", () => {
    expect(productPendencies(okProduct, "interna", 1).map(p => p.field)).toEqual(["icms_csosn"]);
  });
  it("CRT 2 segue a regra do motor: exige CST, não CSOSN; CRT 4 exige CSOSN", () => {
    expect(productPendencies(okProduct, "interna", 2)).toEqual([]);
    expect(productPendencies({ ...okProduct, icms_cst: null, icms_csosn: "102" }, "interna", 2).map(p => p.field)).toEqual(["icms_cst"]);
    expect(productPendencies(okProduct, "interna", 4).map(p => p.field)).toEqual(["icms_csosn"]);
  });
  it("NCM com 9 dígitos é pendência", () => {
    expect(productPendencies({ ...okProduct, ncm: "480210000" }, "interna", 3).map(p => p.field)).toEqual(["ncm"]);
  });
  it("cliente completo MG/MG interna sem pendências; MG/SP interna acusa UF", () => {
    expect(customerPendencies(okCustomer, "interna", "MG")).toEqual([]);
    expect(customerPendencies({ ...okCustomer, fiscal_state: "SP" }, "interna", "MG").map(p => p.field)).toEqual(["fiscal_state"]);
  });
  it("cliente sem perfil e IBGE inválido", () => {
    expect(customerPendencies(null, "interna").map(p => p.field)).toEqual(["perfil"]);
    expect(customerPendencies({ ...okCustomer, fiscal_municipality_ibge_code: "31" }, "interestadual", "SP").map(p => p.field)).toEqual(["fiscal_municipality_ibge_code"]);
  });
  it("cenário não é inferido sem UF", () => {
    expect(scenarioFor("MG", null)).toBeNull();
    expect(scenarioFor("MG", "mg")).toBe("interna");
    expect(scenarioFor("MG", "SP")).toBe("interestadual");
  });
  it("link aponta ao mesmo editor das rotas existentes", () => {
    expect(fiscalEditorLink("produto", "abc")).toBe("/configuracoes/fiscal/produtos?produto=abc");
    expect(fiscalEditorLink("cliente", "x")).toBe("/configuracoes/fiscal/clientes?cliente=x");
  });
});
