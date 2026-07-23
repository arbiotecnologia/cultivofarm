/**
 * Fase H5-A.1 — Auditoria dos deep-links da Prontidão contra as abas e
 * ids reais de FiscalEmpresa.
 *
 * Regras:
 *  - Todo deep-link deve apontar a uma aba que EXISTE em
 *    src/pages/configuracoes/FiscalEmpresa.tsx (TabsTrigger real).
 *  - Se houver âncora `#id`, o `id` deve existir de fato no arquivo
 *    (id="..." em algum FieldRow/Input/container) — sem duplicidade.
 *  - `productionAllowed` renomeado para `prerequisitesReadyForFutureProduction`
 *    (contrato semântico: nunca autoriza produção).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeConnectionsReadiness } from "@/lib/fiscal/connectionsReadiness";
import type { CompanyFiscalRow } from "@/hooks/useFiscalCompanySettings";

const PAGE_PATH = resolve(process.cwd(), "src/pages/configuracoes/FiscalEmpresa.tsx");
const SOURCE = readFileSync(PAGE_PATH, "utf8");

function extractTabs(src: string): string[] {
  return Array.from(src.matchAll(/<TabsTrigger[^>]*value="([a-z_-]+)"/g)).map((m) => m[1]);
}
function extractIds(src: string): string[] {
  return Array.from(src.matchAll(/id="([a-z][a-z0-9_-]*)"/g)).map((m) => m[1]);
}

const REAL_TABS = new Set(extractTabs(SOURCE));
const REAL_IDS = new Set(extractIds(SOURCE));

function baseRow(overrides: Partial<CompanyFiscalRow> = {}): CompanyFiscalRow {
  return {
    id: "cs-1", cnpj: null, legal_name: null, state: null, municipality_ibge_code: null,
    fiscal_environment: "HOMOLOGATION", fiscal_provider: "NONE",
    nfe_enabled: true, nfe_provider: "NONE", nfe_credential_ref: null, nfe_series: null,
    nfse_enabled: true, nfse_provider: "NONE", nfse_credential_ref: null, nfse_series: null,
    production_enabled: false, webhook_ref: null,
    ...overrides,
  } as unknown as CompanyFiscalRow;
}

describe("H5-A.1 · sanidade das extrações", () => {
  it("página exporta abas conhecidas", () => {
    for (const t of ["empresa", "nfe", "nfse", "certificado", "integracao"]) {
      expect(REAL_TABS.has(t)).toBe(true);
    }
  });
  it("página expõe ids reais usados nos deep-links", () => {
    for (const id of [
      "fiscal_environment", "nfe_provider", "nfe_credential_ref", "webhook_ref",
    ]) {
      expect(REAL_IDS.has(id)).toBe(true);
    }
  });
});

describe("H5-A.1 · deep-links reais para cada item de conexão", () => {
  it("todo deep-link aponta a aba existente e id existente (quando presente)", () => {
    const r = computeConnectionsReadiness(baseRow({ webhook_ref: "wh" }), []);
    for (const item of r.items) {
      const url = new URL(item.deepLink, "http://x");
      const aba = url.searchParams.get("aba");
      expect(aba, `item ${item.key}: aba ausente`).not.toBeNull();
      expect(REAL_TABS.has(String(aba)), `item ${item.key}: aba '${aba}' inexistente`).toBe(true);
      // Certificado A1 usa id externo (#certificado-a1) definido em CertificadoDigitalSecao,
      // não em FiscalEmpresa.tsx; ignorado nesta verificação de página.
      if (item.key === "certificado_a1") continue;
      const hash = url.hash.replace(/^#/, "");
      if (hash.length > 0) {
        expect(REAL_IDS.has(hash), `item ${item.key}: id '${hash}' inexistente na página`).toBe(true);
      }
    }
  });

  it("provedor e credenciais apontam à aba 'integracao' (não à inexistente 'provedor')", () => {
    const r = computeConnectionsReadiness(baseRow(), []);
    const prov = r.items.find((i) => i.key === "provedor")!;
    const cred = r.items.find((i) => i.key === "credenciais_provedor")!;
    expect(prov.deepLink).toContain("?aba=integracao");
    expect(cred.deepLink).toContain("?aba=integracao");
    expect(prov.deepLink).not.toContain("?aba=provedor");
    expect(cred.deepLink).not.toContain("?aba=provedor");
  });

  it("webhook aponta à aba 'integracao' com #webhook_ref", () => {
    const r = computeConnectionsReadiness(baseRow(), []);
    const wh = r.items.find((i) => i.key === "webhook")!;
    expect(wh.deepLink).toBe("/configuracoes/fiscal/empresa?aba=integracao#webhook_ref");
  });

  it("ambiente aponta a #fiscal_environment na aba empresa", () => {
    const r = computeConnectionsReadiness(baseRow(), []);
    const amb = r.items.find((i) => i.key === "ambiente")!;
    expect(amb.deepLink).toBe("/configuracoes/fiscal/empresa?aba=empresa#fiscal_environment");
  });

  it("nenhum deep-link vaza segredo ou expõe credencial bruta", () => {
    const r = computeConnectionsReadiness(baseRow({ webhook_ref: "wh" }), []);
    for (const item of r.items) {
      expect(item.deepLink).not.toMatch(/token|senha|password|secret|pfx|p12|pem/i);
      expect(item.description).not.toMatch(/token|senha|password|secret|pfx|p12|pem/i);
    }
  });
});

describe("H5-A.1 · semântica de produção", () => {
  it("o resultado NÃO expõe mais `productionAllowed`; usa nome inequívoco", () => {
    const r = computeConnectionsReadiness(baseRow(), []);
    // @ts-expect-error — propriedade renomeada intencionalmente
    expect(r.productionAllowed).toBeUndefined();
    expect(typeof r.prerequisitesReadyForFutureProduction).toBe("boolean");
  });
  it("mesmo com todos os pré-requisitos, `production_enabled` do row não é ativado", () => {
    const row = baseRow({
      cnpj: "11.222.333/0001-81", legal_name: "ACME", state: "SP",
      municipality_ibge_code: "3550308",
      nfe_provider: "TECNOSPEED", nfe_credential_ref: "cred-1", nfe_series: "1",
      nfse_enabled: false,
      webhook_ref: "wh", fiscal_environment: "HOMOLOGATION",
      production_enabled: false,
    });
    const r = computeConnectionsReadiness(row, [{
      certificate_id: "c", company_settings_id: "cs-1", source_type: "A1_UPLOAD",
      environment: "HOMOLOGATION", status: "AVAILABLE", display_name: null,
      subject_name: null, issuer_name: null, valid_from: null, valid_until: null,
      fingerprint_sha256: null, is_active: true, revoked_at: null, days_until_expiration: 90,
    }]);
    // Flag informativo pode ser true, mas produção do banco permanece false.
    expect(r.prerequisitesReadyForFutureProduction).toBe(true);
    expect(row.production_enabled).toBe(false);
  });
});
