/**
 * Fase H4-A — Suíte pura para `computeCompanyMissingFields`.
 * Sem I/O, sem Supabase; usa fixtures mínimas do Row.
 */
import { describe, it, expect } from "vitest";
import {
  computeCompanyMissingFields,
  SECTION_LABEL,
  SEVERITY_LABEL,
} from "@/lib/fiscal/companyMissingFields";
import type { CompanyFiscalRow } from "@/hooks/useFiscalCompanySettings";

function emptyRow(): CompanyFiscalRow {
  // Cast controlado: fixture mínima; testes só leem colunas usadas pelo derivador.
  return {
    id: "00000000-0000-0000-0000-000000000000",
    cnpj: null, legal_name: null, trade_name: null, fiscal_email: null,
    phone: null, tax_regime: null, crt: null, primary_cnae: null,
    municipal_registration: null, state_registration: null,
    municipality_ibge_code: null, postal_code: null, street: null,
    number: null, complement: null, neighborhood: null, city: null,
    state: null, country_code: null,
    fiscal_environment: "NOT_CONFIGURED",
    configuration_status: "DRAFT",
    nfe_enabled: false, nfse_enabled: false,
    production_enabled: false,
    nfe_series: null, nfse_series: null,
    nfe_configuration: {}, nfse_configuration: {},
    nfe_provider: "NONE", nfse_provider: "NONE",
    nfe_credential_ref: null, nfse_credential_ref: null,
    certificate_ref: null, webhook_ref: null,
    fiscal_provider: "NONE",
    configuration_notes: null,
    configuration_version: 1,
    accounting_validated_at: null,
    is_active: true,
  } as unknown as CompanyFiscalRow;
}

describe("computeCompanyMissingFields", () => {
  it("row nulo → tudo zero, NF-e e NFS-e não aplicáveis", () => {
    const r = computeCompanyMissingFields(null);
    expect(r.total).toBe(0);
    expect(r.blocking).toBe(0);
    expect(r.recommended).toBe(0);
    expect(r.notApplicable).toEqual(["nfe", "nfse"]);
  });

  it("row vazio → lista todos os obrigatórios de empresa+endereço, NF-e/NFS-e N/A", () => {
    const r = computeCompanyMissingFields(emptyRow());
    expect(r.bySection.empresa.some((f) => f.key === "cnpj" && f.severity === "bloqueia_homologacao")).toBe(true);
    expect(r.bySection.empresa.some((f) => f.key === "fiscal_email")).toBe(true);
    expect(r.bySection.empresa.some((f) => f.key === "crt")).toBe(true);
    expect(r.bySection.endereco.some((f) => f.key === "municipality_ibge_code")).toBe(true);
    expect(r.bySection.nfe).toHaveLength(0);
    expect(r.bySection.nfse).toHaveLength(0);
    expect(r.notApplicable).toContain("nfe");
    expect(r.notApplicable).toContain("nfse");
    // Recomendados presentes
    expect(r.bySection.empresa.some((f) => f.key === "trade_name" && f.severity === "recomendado")).toBe(true);
    expect(r.recommended).toBeGreaterThan(0);
    expect(r.blocking).toBeGreaterThan(0);
  });

  it("nfe_enabled=true expõe pendências NF-e incluindo série e CFOPs", () => {
    const row = emptyRow();
    row.nfe_enabled = true;
    const r = computeCompanyMissingFields(row);
    expect(r.bySection.nfe.map((f) => f.key)).toEqual(
      expect.arrayContaining(["state_registration", "nfe_series", "cfop_in_state", "cfop_interstate"]),
    );
    expect(r.notApplicable).not.toContain("nfe");
    // Deep-link para aba correta (pode incluir `&campo=` conforme allow-list)
    expect(r.bySection.nfe.every((f) => f.deepLink.includes("aba=nfe"))).toBe(true);
  });

  it("série NF-e informada na coluna dedicada satisfaz o requisito", () => {
    const row = emptyRow();
    row.nfe_enabled = true;
    row.nfe_series = "1";
    const r = computeCompanyMissingFields(row);
    expect(r.bySection.nfe.some((f) => f.key === "nfe_series")).toBe(false);
  });

  it("série NF-e informada em nfe_configuration.series também satisfaz", () => {
    const row = emptyRow();
    row.nfe_enabled = true;
    row.nfe_configuration = { series: "1" } as never;
    const r = computeCompanyMissingFields(row);
    expect(r.bySection.nfe.some((f) => f.key === "nfe_series")).toBe(false);
  });

  it("nfse_enabled=true exige IM, modo, LC116 e recomenda ISS", () => {
    const row = emptyRow();
    row.nfse_enabled = true;
    const r = computeCompanyMissingFields(row);
    expect(r.bySection.nfse.map((f) => f.key)).toEqual(
      expect.arrayContaining(["municipal_registration", "nfse_mode", "lc116_item", "iss_rate"]),
    );
    const iss = r.bySection.nfse.find((f) => f.key === "iss_rate");
    expect(iss?.severity).toBe("recomendado");
  });

  it("row totalmente preenchido → nenhuma pendência", () => {
    const row = emptyRow();
    row.cnpj = "12345678000199";
    row.legal_name = "Empresa Teste LTDA";
    row.trade_name = "Empresa Teste";
    row.fiscal_email = "fiscal@teste.com";
    row.phone = "1130000000";
    row.tax_regime = "SIMPLES";
    row.crt = "1";
    row.primary_cnae = "0111301";
    row.postal_code = "01310100";
    row.street = "Av. Paulista";
    row.number = "1000";
    row.neighborhood = "Bela Vista";
    row.city = "São Paulo";
    row.state = "SP";
    row.municipality_ibge_code = "3550308";
    // NF-e/NFS-e desativados → N/A
    const r = computeCompanyMissingFields(row);
    expect(r.blocking).toBe(0);
    expect(r.recommended).toBe(0);
    expect(r.total).toBe(0);
  });

  it("deep-links respeitam a aba de cada seção", () => {
    const row = emptyRow();
    row.nfe_enabled = true;
    row.nfse_enabled = true;
    const r = computeCompanyMissingFields(row);
    expect(r.bySection.empresa.every((f) => f.deepLink.endsWith("aba=empresa"))).toBe(true);
    expect(r.bySection.endereco.every((f) => f.deepLink.endsWith("aba=empresa"))).toBe(true);
    expect(r.bySection.nfe.every((f) => f.deepLink.endsWith("aba=nfe"))).toBe(true);
    expect(r.bySection.nfse.every((f) => f.deepLink.endsWith("aba=nfse"))).toBe(true);
  });

  it("rótulos pt-BR presentes para seções e severidades", () => {
    expect(SECTION_LABEL.empresa).toBe("Dados da empresa");
    expect(SECTION_LABEL.endereco).toBe("Endereço");
    expect(SEVERITY_LABEL.bloqueia_homologacao).toBe("Bloqueia homologação");
    expect(SEVERITY_LABEL.recomendado).toBe("Recomendado");
  });
});
