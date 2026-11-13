import { describe, it, expect } from "vitest";
import { BillingKeyStore, canBillServices, canEditServiceFiscalProfile, canWriteServiceCatalog, nfseDisplayState, validateBillingSelection } from "@/lib/services/serviceBilling";
import { getAccessLevel } from "@/lib/permissions";
import { buildDpsXml, dpsId, validateDps, type DpsInput } from "../../../supabase/functions/_shared/nfse/dps";

describe("papéis de serviços", () => {
  it("catálogo e prestação: administrador, gestor e financeiro", () => {
    for (const r of ["administrador", "gestor", "financeiro"]) expect(canWriteServiceCatalog([r])).toBe(true);
    for (const r of ["vendedor", "consultor_tecnico", "parceiro_b2b", "superadmin", "gestor_comercial"]) expect(canWriteServiceCatalog([r])).toBe(false);
  });
  it("faturar e editar perfil fiscal: só administrador e financeiro", () => {
    expect(canBillServices(["administrador"])).toBe(true);
    expect(canBillServices(["financeiro"])).toBe(true);
    expect(canBillServices(["gestor"])).toBe(false);
    expect(canEditServiceFiscalProfile(["gestor"])).toBe(false);
  });
  it("aba Serviços do Catálogo segue a mesma matriz", () => {
    expect(getAccessLevel("financeiro", "/base-tecnica?tab=servicos")).toBe("rw");
    expect(getAccessLevel("gestor", "/base-tecnica?tab=servicos")).toBe("rw");
    expect(getAccessLevel("consultor_tecnico", "/base-tecnica?tab=servicos")).toBe("none");
    expect(getAccessLevel("financeiro", "/base-tecnica?tab=microrganismos")).toBe("none");
    expect(getAccessLevel("financeiro", "/base-tecnica?tab=produtos")).toBe("r");
  });
});

describe("faturamento", () => {
  const r = (id: string, customer_id: string, status: "READY" | "DRAFT" | "BILLED" = "READY") => ({ id, customer_id, status });
  it("só registros prontos de um único cliente", () => {
    expect(validateBillingSelection([])).toBe("empty");
    expect(validateBillingSelection([r("1", "a"), r("2", "b")])).toBe("mixed_customers");
    expect(validateBillingSelection([r("1", "a", "BILLED")])).toBe("not_ready");
    expect(validateBillingSelection([r("1", "a"), r("2", "a")])).toBeNull();
  });
  it("mesma seleção reaproveita a chave até resposta definitiva", () => {
    let n = 0; const s = new BillingKeyStore(() => `k${++n}`);
    expect(s.keyFor("u|o", ["b", "a"])).toBe("k1");
    expect(s.keyFor("u|o", ["a", "b", "a"])).toBe("k1");
    expect(s.keyFor("u|o2", ["a", "b"])).toBe("k2");
    s.settle("u|o", ["a", "b"]);
    expect(s.keyFor("u|o", ["a", "b"])).toBe("k3");
  });
  it("autorizada só com status AUTHORIZED e referência do provedor", () => {
    expect(nfseDisplayState({ normalized_status: "AUTHORIZED" })).toBe("DESCONHECIDO");
    expect(nfseDisplayState({ normalized_status: "AUTHORIZED", provider_reference: "123" })).toBe("AUTORIZADA");
    expect(nfseDisplayState({ normalized_status: "DRAFT" })).toBe("RASCUNHO");
    expect(nfseDisplayState({ normalized_status: "QUEUED" })).toBe("ENVIO_PENDENTE");
    expect(nfseDisplayState({ normalized_status: "REJECTED" })).toBe("REJEITADA");
  });
});

describe("DPS NFS-e Nacional (sintética, sem transmissão)", () => {
  const base: DpsInput = {
    environment: "HOMOLOGATION", issueDateTime: "2026-11-13T10:00:00-03:00", competence: "2026-11-13", series: "1", number: 7,
    emitter: { cnpj: "00.000.000/0001-91", municipalityIbge: "3147006", regime: { opSimpNac: "1", regEspTrib: "0" } },
    taker: { cnpjCpf: "111.444.777-35", name: "Cliente Sintético & Cia" },
    service: { nationalTaxCode: "070101", description: "Consultoria agronômica", locationIbge: "3147006", incidenceMunicipalityIbge: "3147006" },
    values: { serviceAmount: 1500, issRate: 3, issWithheld: false, totTrib: { mode: "IND" } },
  };
  it("monta XML de homologação com Id e valores", () => {
    const xml = buildDpsXml(base);
    expect(dpsId(base)).toBe("DPS3147006200000000000191" + "00001" + "000000000000007");
    expect(xml).toContain("<tpAmb>2</tpAmb>");
    expect(xml).toContain("<CPF>11144477735</CPF>");
    expect(xml).toContain("<vServ>1500.00</vServ>");
    expect(xml).toContain("Cliente Sintético &amp; Cia");
  });
  it("aponta campos faltantes e recusa montar", () => {
    const bad = { ...base, service: { ...base.service, nationalTaxCode: "", incidenceMunicipalityIbge: "31" }, values: { ...base.values, serviceAmount: 0 } };
    expect(validateDps(bad)).toEqual(expect.arrayContaining(["codigo_tributacao_nacional", "municipio_incidencia", "valor"]));
    expect(() => buildDpsXml(bad)).toThrow(/dps_invalid/);
  });
});

describe("chave de envio NFS-e por versão do rascunho", () => {
  it("é estável para a mesma versão e muda quando o rascunho é corrigido", async () => {
    const { nfseEmissionKey } = await import("@/hooks/useCatalogServices");
    const id = "00000000-0000-4000-8000-00000000abcd";
    expect(nfseEmissionKey(id, 3)).toBe(nfseEmissionKey(id, 3));
    expect(nfseEmissionKey(id, 4)).not.toBe(nfseEmissionKey(id, 3));
    expect(nfseEmissionKey(id, 3)).toMatch(/^[A-Za-z0-9_.:-]{16,128}$/);
    expect(() => nfseEmissionKey(id, 0)).toThrow();
  });
});
