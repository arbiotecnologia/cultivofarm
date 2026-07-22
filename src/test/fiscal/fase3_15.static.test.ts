/**
 * Fase Fiscal 3.15 — Testes estáticos da Central de Configuração Fiscal.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import {
  buildUpdatePayload,
  companyFiscalFormSchema,
  nfeConfigurationSchema,
  nfseConfigurationSchema,
  integrationRefsSchema,
  hasSensitiveKey,
  ALLOWED_PROVIDERS,
} from "@/lib/fiscal/companyFiscalValidation";

const PAGE = resolve(__dirname, "../../pages/configuracoes/FiscalEmpresa.tsx");
const HOOK = resolve(__dirname, "../../hooks/useFiscalCompanySettings.ts");
const NAV = resolve(__dirname, "../../config/navigation.ts");
const MIGRATION = resolve(
  __dirname,
  "../../../restoration/migrations/20260723000000_fiscal_fase3_15_central_config.sql",
);

describe("Fase 3.15 — feature flags", () => {
  test("apenas fiscalConfigurationUi está true", () => {
    expect(FEATURE_FLAGS.fiscalConfigurationUi).toBe(true);
    const other: Array<keyof typeof FEATURE_FLAGS> = [
      "fiscalProductProfilesUi",
      "fiscalServiceProfilesUi",
      "fiscalCustomerProfilesUi",
      "fiscalDocumentWorkflowUi",
      "fiscalDocumentManualEventRpc",
      "fiscalReconciliationUi",
      "fiscalReconciliationWrite",
      "fiscalReadinessCenterUi",
      "fiscalEmissionEnabled",
    ];
    for (const f of other) expect(FEATURE_FLAGS[f]).toBe(false);
  });
});

describe("Fase 3.15 — página não expõe inputs sensíveis", () => {
  const src = readFileSync(PAGE, "utf8");

  test("nenhum input type=password", () => {
    expect(src).not.toMatch(/type=["']password["']/);
  });
  test("nenhum placeholder/accept sensível", () => {
    for (const rx of [
      /placeholder=["'][^"']*token[^"']*["']/i,
      /placeholder=["'][^"']*senha[^"']*["']/i,
      /placeholder=["'][^"']*password[^"']*["']/i,
      /accept=["'][^"']*(pfx|p12|pem)[^"']*["']/i,
      /<input[^>]+type=["']file["']/i,
    ]) {
      expect(src, `padrão ${rx} presente`).not.toMatch(rx);
    }
  });
  test("nenhum botão de emissão/transmissão/testar provedor", () => {
    for (const rx of [/>Emitir</, />Transmitir</, />Homologar</, />Testar\s*provedor</i]) {
      expect(src, `${rx}`).not.toMatch(rx);
    }
  });
  test("abas presentes", () => {
    expect(src).toMatch(/value="empresa"/);
    expect(src).toMatch(/value="nfe"/);
    expect(src).toMatch(/value="nfse"/);
    expect(src).toMatch(/value="integracao"/);
    expect(src).toMatch(/value="revisao"/);
  });
  test("banner de emissão desativada", () => {
    expect(src).toContain("Emissão fiscal desativada");
  });
});

describe("Fase 3.15 — payload e schemas", () => {
  test("payload nunca inclui production_enabled", () => {
    const payload = buildUpdatePayload({
      legal_name: "X",
      nfe_configuration: { series: "1" },
      nfse_configuration: { iss_rate: 5 },
    });
    expect(payload).not.toHaveProperty("production_enabled");
  });

  test("nfe/nfse rejeitam chaves sensíveis", () => {
    expect(nfeConfigurationSchema.safeParse({ token: "abc" }).success).toBe(false);
    expect(nfseConfigurationSchema.safeParse({ password: "abc" }).success).toBe(false);
    expect(companyFiscalFormSchema.safeParse({
      nfe_configuration: { nested: { private_key: "x" } },
    }).success).toBe(false);
  });

  test("hasSensitiveKey detecta recursivamente", () => {
    expect(hasSensitiveKey({ ok: 1, deep: { arr: [{ pfx: "y" }] } })).toBe(true);
    expect(hasSensitiveKey({ ok: 1, deep: { arr: [{ safe: "y" }] } })).toBe(false);
  });

  test("refs rejeitam URL/credencial e aceitam identificador curto", () => {
    expect(integrationRefsSchema.safeParse({ certificate_ref: "cert_prod_v1" }).success).toBe(true);
    expect(integrationRefsSchema.safeParse({ certificate_ref: "https://x?token=abc" }).success).toBe(false);
    expect(integrationRefsSchema.safeParse({ webhook_ref: "wh 1" }).success).toBe(false);
  });

  test("providers permitidos", () => {
    expect(ALLOWED_PROVIDERS).toContain("NONE");
    expect(ALLOWED_PROVIDERS).toContain("FOCUS_NFE");
    expect(ALLOWED_PROVIDERS).toContain("PLUGNOTAS");
    expect(ALLOWED_PROVIDERS).not.toContain("PRODUCTION");
  });
});

describe("Fase 3.15 — hook / RPC / concorrência", () => {
  const src = readFileSync(HOOK, "utf8");
  test("hook expõe useInitFiscalCompanySettings com RPC canônica", () => {
    expect(src).toContain("useInitFiscalCompanySettings");
    expect(src).toContain("rpc_fiscal_company_settings_init");
  });
  test("hook aplica concorrência otimista", () => {
    expect(src).toContain("configuration_version");
    expect(src).toContain("expectedVersion");
    expect(src).toContain("conflict");
  });
  test("hook não usa service_role", () => {
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/SUPABASE_SERVICE/i);
  });
});

describe("Fase 3.15 — navegação e migração canônica", () => {
  test("navigation.ts lista rota + keywords fiscal", () => {
    const src = readFileSync(NAV, "utf8");
    expect(src).toContain("/configuracoes/fiscal/empresa");
    expect(src).toContain("config-fiscal");
    expect(src.toLowerCase()).toContain("nf-e");
    expect(src.toLowerCase()).toContain("nfs-e");
  });

  test("migration canônica aditiva presente em restoration/migrations", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    expect(sql).not.toMatch(/BEGIN CERTIFICATE/);
    expect(sql).not.toMatch(/PRIVATE KEY/);
    expect(sql).toContain("cfs_nfe_provider_domain");
    expect(sql).toContain("cfs_nfse_provider_domain");
    expect(sql).toContain("fiscal_json_has_sensitive_key");
    expect(sql).toContain("cfs_no_sensitive_keys_in_jsonb");
    expect(sql).toContain("rpc_fiscal_company_settings_init");
    expect(sql).toContain("has_role");
    expect(sql).toContain("security_invoker=true");
  });
});
