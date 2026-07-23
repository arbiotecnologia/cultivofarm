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

  it("nfe_enabled=true expõe pendências NF-e incluindo série e CFOPs (ids reais)", () => {
    const row = emptyRow();
    row.nfe_enabled = true;
    const r = computeCompanyMissingFields(row);
    expect(r.bySection.nfe.map((f) => f.key)).toEqual(
      expect.arrayContaining(["state_registration", "nfe_series", "nfe_cfop_in", "nfe_cfop_out"]),
    );
    expect(r.notApplicable).not.toContain("nfe");
    // IE é bloqueante mas o campo mora na aba empresa: deep-link vai para lá.
    const ie = r.bySection.nfe.find((f) => f.key === "state_registration");
    expect(ie?.severity).toBe("bloqueia_homologacao");
    expect(ie?.deepLink).toContain("aba=empresa");
    expect(ie?.deepLink).toContain("campo=state_registration");
    // CFOP sugerido é recomendado (regra canônica vive nos perfis).
    const cfopIn = r.bySection.nfe.find((f) => f.key === "nfe_cfop_in");
    expect(cfopIn?.severity).toBe("recomendado");
    expect(cfopIn?.deepLink).toContain("aba=nfe");
    expect(cfopIn?.deepLink).toContain("campo=nfe_cfop_in");
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

  it("nfse_enabled=true exige IM e modo (bloqueantes); LC116 e ISS são recomendados", () => {
    const row = emptyRow();
    row.nfse_enabled = true;
    const r = computeCompanyMissingFields(row);
    expect(r.bySection.nfse.map((f) => f.key)).toEqual(
      expect.arrayContaining(["municipal_registration", "nfse_mode", "lc116_item", "iss_rate"]),
    );
    const im = r.bySection.nfse.find((f) => f.key === "municipal_registration");
    expect(im?.severity).toBe("bloqueia_homologacao");
    expect(im?.deepLink).toContain("aba=empresa");
    expect(im?.deepLink).toContain("campo=municipal_registration");
    const modo = r.bySection.nfse.find((f) => f.key === "nfse_mode");
    expect(modo?.severity).toBe("bloqueia_homologacao");
    expect(modo?.deepLink).toContain("campo=nfse_mode");
    const lc = r.bySection.nfse.find((f) => f.key === "lc116_item");
    expect(lc?.severity).toBe("recomendado");
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

  it("deep-links respeitam a aba onde o campo realmente é renderizado", () => {
    const row = emptyRow();
    row.nfe_enabled = true;
    row.nfse_enabled = true;
    const r = computeCompanyMissingFields(row);
    expect(r.bySection.empresa.every((f) => f.deepLink.includes("aba=empresa"))).toBe(true);
    expect(r.bySection.endereco.every((f) => f.deepLink.includes("aba=empresa"))).toBe(true);
    // IE/IM ficam agrupadas em nfe/nfse mas o input é renderizado na aba empresa.
    for (const f of r.bySection.nfe) {
      const expected = f.key === "state_registration" ? "aba=empresa" : "aba=nfe";
      expect(f.deepLink).toContain(expected);
    }
    for (const f of r.bySection.nfse) {
      const expected = f.key === "municipal_registration" ? "aba=empresa" : "aba=nfse";
      expect(f.deepLink).toContain(expected);
    }
  });

  it("campos da allow-list expõem `&campo=<key>` e hasFieldTarget=true", () => {
    const r = computeCompanyMissingFields(emptyRow());
    const cnpj = r.bySection.empresa.find((f) => f.key === "cnpj");
    expect(cnpj?.hasFieldTarget).toBe(true);
    expect(cnpj?.deepLink).toContain("&campo=cnpj");
    const email = r.bySection.empresa.find((f) => f.key === "fiscal_email");
    expect(email?.deepLink).toContain("&campo=fiscal_email");
    const ibge = r.bySection.endereco.find((f) => f.key === "municipality_ibge_code");
    expect(ibge?.hasFieldTarget).toBe(true);
    expect(ibge?.deepLink).toContain("&campo=municipality_ibge_code");
  });

  it("campos sem alvo mapeado caem no fallback (só a aba, sem `campo=`)", () => {
    const row = emptyRow();
    row.nfse_enabled = true;
    const r = computeCompanyMissingFields(row);
    const lc = r.bySection.nfse.find((f) => f.key === "lc116_item");
    expect(lc?.hasFieldTarget).toBe(false);
    expect(lc?.deepLink).not.toContain("campo=");
    const iss = r.bySection.nfse.find((f) => f.key === "iss_rate");
    expect(iss?.hasFieldTarget).toBe(false);
    expect(iss?.deepLink).not.toContain("campo=");
  });


  it("rótulos pt-BR presentes para seções e severidades", () => {
    expect(SECTION_LABEL.empresa).toBe("Dados da empresa");
    expect(SECTION_LABEL.endereco).toBe("Endereço");
    expect(SEVERITY_LABEL.bloqueia_homologacao).toBe("Bloqueia homologação");
    expect(SEVERITY_LABEL.recomendado).toBe("Recomendado");
  });
});
