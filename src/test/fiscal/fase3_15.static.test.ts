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
const VALIDATION = resolve(__dirname, "../../lib/fiscal/companyFiscalValidation.ts");
const NAV = resolve(__dirname, "../../config/navigation.ts");
// Fonte canônica de tipos do banco Cultivo Farm. O arquivo legado
// src/integrations/supabase/types.ts pertence a outro ambiente e não é usado
// pelo aplicativo — conferir o contrato contra ele produzia falso negativo.
const TYPES = resolve(__dirname, "../../integrations/supabase/cultivofarm.types.ts");
const CANONICAL_MIGRATION = resolve(
  __dirname,
  "../../../supabase/migrations/20260723000000_fiscal_fase3_15_central_config.sql",
);
const RESTORATION_STUB = resolve(
  __dirname,
  "../../../restoration/migrations/20260723000000_fiscal_fase3_15_central_config.sql",
);

describe("Fase 3.15 — feature flags (compat com 3.16)", () => {
  test("fiscalConfigurationUi permanece true e a TRAVA de emissão fica false", () => {
    expect(FEATURE_FLAGS.fiscalConfigurationUi).toBe(true);
    // A partir da fase 3.16 outras flags de preparação/homologação podem
    // ficar true; apenas a trava de emissão precisa permanecer bloqueada.
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
    expect(FEATURE_FLAGS.fiscalReconciliationWrite).toBe(false);
  });
});

describe("Fase 3.15 — página não expõe inputs sensíveis nem emissão", () => {
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
  test("nenhum fetch externo/functions.invoke/URL de provedor", () => {
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/fetch\s*\(\s*["']https?:/i);
    expect(src).not.toMatch(/plugnotas|focusnfe|sefaz\./i);
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
  test("payload nunca inclui production_enabled nem colunas de auditoria/sistema", () => {
    const payload = buildUpdatePayload({
      legal_name: "X",
      nfe_configuration: { series: "1" },
      nfse_configuration: { iss_rate: 5 },
    });
    for (const forbidden of [
      "production_enabled", "id", "created_at", "created_by", "updated_at",
      "updated_by", "accounting_validated_at", "accounting_validated_by",
      "is_active", "last_validation_at", "configuration_version",
    ]) {
      expect(payload, `payload contém ${forbidden}`).not.toHaveProperty(forbidden);
    }
  });

  test("payload força fiscal_provider = NONE", () => {
    const payload = buildUpdatePayload({ legal_name: "X" });
    expect(payload.fiscal_provider).toBe("NONE");
  });

  test("nfe/nfse rejeitam chaves sensíveis (recursivo em objeto e array)", () => {
    expect(nfeConfigurationSchema.safeParse({ token: "abc" }).success).toBe(false);
    expect(nfseConfigurationSchema.safeParse({ password: "abc" }).success).toBe(false);
    expect(companyFiscalFormSchema.safeParse({
      nfe_configuration: { nested: { private_key: "x" } },
    }).success).toBe(false);
    // Chave sensível dentro de array aninhado também precisa ser detectada
    expect(companyFiscalFormSchema.safeParse({
      nfe_configuration: { list: [{ ok: 1 }, { PFX: "y" }] },
    }).success).toBe(false);
  });

  test("hasSensitiveKey detecta recursivamente sem loop infinito", () => {
    expect(hasSensitiveKey({ ok: 1, deep: { arr: [{ pfx: "y" }] } })).toBe(true);
    expect(hasSensitiveKey({ ok: 1, deep: { arr: [{ safe: "y" }] } })).toBe(false);
    // Caso patológico com estrutura profunda mas sem chave sensível
    const deep: Record<string, unknown> = {};
    let cur: Record<string, unknown> = deep;
    for (let i = 0; i < 50; i++) { cur.n = {}; cur = cur.n as Record<string, unknown>; }
    expect(hasSensitiveKey(deep)).toBe(false);
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
    // RPC é chamada de forma tipada, sem cast estrutural.
    expect(src).toMatch(/supabase\.rpc\(\s*["']rpc_fiscal_company_settings_init["']\s*\)/);
  });
  test("hook aplica concorrência otimista", () => {
    expect(src).toContain("configuration_version");
    expect(src).toContain("expectedVersion");
    expect(src).toContain("conflict");
  });
  test("hook não usa service_role nem segredo", () => {
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/SUPABASE_SERVICE/i);
  });
  test("hook e validation não contêm any nem casts estruturais 'as unknown as'", () => {
    for (const file of [HOOK, VALIDATION]) {
      const s = readFileSync(file, "utf8");
      // Zero `: any` e zero `as any` e zero `as unknown as`.
      expect(s, `${file} contém ': any'`).not.toMatch(/:\s*any\b/);
      expect(s, `${file} contém 'as any'`).not.toMatch(/\bas\s+any\b/);
      expect(s, `${file} contém 'as unknown as'`).not.toMatch(/\bas\s+unknown\s+as\b/);
    }
  });
});

describe("Fase 3.15 — navegação, migração canônica e stub", () => {
  test("navigation.ts lista rota + keywords fiscal", () => {
    const src = readFileSync(NAV, "utf8");
    expect(src).toContain("/configuracoes/fiscal/empresa");
    expect(src).toContain("config-fiscal");
    expect(src.toLowerCase()).toContain("nf-e");
    expect(src.toLowerCase()).toContain("nfs-e");
  });

  test("migration canônica vive em supabase/migrations e é aditiva", () => {
    const sql = readFileSync(CANONICAL_MIGRATION, "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    // View: CREATE OR REPLACE VIEW; nunca DROP VIEW.
    expect(sql).not.toMatch(/DROP\s+VIEW/i);
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.v_fiscal_company_readiness/);
    expect(sql).toMatch(/security_invoker\s*=\s*true/);
    expect(sql).toMatch(/GRANT SELECT ON public\.v_fiscal_company_readiness TO authenticated/);
    // Sem conteúdo de credencial/certificado.
    expect(sql).not.toMatch(/BEGIN CERTIFICATE/);
    expect(sql).not.toMatch(/PRIVATE KEY/);
    // Constraints e função recursiva presentes.
    expect(sql).toContain("cfs_nfe_provider_domain");
    expect(sql).toContain("cfs_nfse_provider_domain");
    expect(sql).toContain("fiscal_json_has_sensitive_key");
    expect(sql).toContain("cfs_no_sensitive_keys_in_jsonb");
    expect(sql).toContain("rpc_fiscal_company_settings_init");
    expect(sql).toContain("has_role");
    // Recursão real: função em PL/pgSQL com jsonb_each e jsonb_array_elements.
    expect(sql).toMatch(/LANGUAGE plpgsql[^$]*IMMUTABLE[\s\S]*fiscal_json_has_sensitive_key/i);
    expect(sql).toMatch(/jsonb_each\(/);
    expect(sql).toMatch(/jsonb_array_elements\(/);
    // Padrão bug reprovado: `WHEN jsonb_typeof(v)='array' THEN v` (recursão infinita).
    expect(sql).not.toMatch(/jsonb_typeof\s*\(\s*v\s*\)\s*=\s*'array'\s*THEN\s*v\b/i);
    // Advisory lock anti-corrida no RPC init.
    expect(sql).toMatch(/pg_advisory_xact_lock/);
  });

  test("restoration/migrations contém apenas STUB, nunca cópia executável", () => {
    const stub = readFileSync(RESTORATION_STUB, "utf8");
    expect(stub).toMatch(/STUB DOCUMENTAL/);
    expect(stub).toMatch(/supabase\/migrations\/20260723000000_fiscal_fase3_15_central_config\.sql/);
    // Nenhuma linha executável (BEGIN;/ALTER/CREATE/GRANT/etc).
    for (const rx of [/^\s*BEGIN\s*;/mi, /\bALTER\s+TABLE\b/i, /\bCREATE\s+(OR\s+REPLACE\s+)?(FUNCTION|VIEW|TABLE|TRIGGER)/i, /\bGRANT\s+/i]) {
      expect(stub, `stub contém instrução executável ${rx}`).not.toMatch(rx);
    }
  });
});

describe("Fase 3.15 — types.ts contém colunas, view e RPC", () => {
  const src = readFileSync(TYPES, "utf8");
  test("company_fiscal_settings inclui todas as novas colunas", () => {
    const required = [
      "nfe_configuration", "nfse_configuration", "nfe_provider", "nfse_provider",
      "nfe_credential_ref", "nfse_credential_ref", "certificate_ref", "webhook_ref",
      "configuration_notes", "configuration_version", "last_validation_at",
      "last_validation_status", "last_validation_summary",
    ];
    // Row deve conter cada coluna
    const rowStart = src.indexOf("company_fiscal_settings: {");
    expect(rowStart).toBeGreaterThan(0);
    const block = src.slice(rowStart, rowStart + 8000);
    for (const col of required) {
      expect(block, `coluna ${col} ausente em company_fiscal_settings`).toContain(col);
    }
  });
  test("v_fiscal_company_readiness exposto com novos campos", () => {
    const viewStart = src.indexOf("v_fiscal_company_readiness: {");
    expect(viewStart).toBeGreaterThan(0);
    const block = src.slice(viewStart, viewStart + 6000);
    for (const col of [
      "nfe_provider", "nfse_provider", "configuration_version",
      "last_validation_status", "last_validation_at",
      "nfe_configuration_field_count", "nfse_configuration_field_count",
    ]) {
      expect(block, `view sem ${col}`).toContain(col);
    }
  });
  test("Functions.rpc_fiscal_company_settings_init declarado com Args vazios", () => {
    expect(src).toMatch(/rpc_fiscal_company_settings_init:\s*\{[\s\S]{0,300}Args:\s*(?:Record<PropertyKey,\s*never>|never)/);
    expect(src).toMatch(/rpc_fiscal_company_settings_init:[\s\S]{0,400}Returns:\s*(?:Database\["public"\]\["Tables"\]\["company_fiscal_settings"\]\["Row"\]|\{)/);
  });
  test("fiscal_json_has_sensitive_key e jsonb_object_keys_count expostos", () => {
    expect(src).toMatch(/fiscal_json_has_sensitive_key:\s*\{/);
    expect(src).toMatch(/jsonb_object_keys_count:\s*\{/);
  });
});
