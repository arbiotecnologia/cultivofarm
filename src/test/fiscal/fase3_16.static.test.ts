/**
 * Fase Fiscal 3.16 — Testes estáticos.
 * Cobrem flags, navegação, migration canônica, ausência de emissão,
 * bridge do SO, componente A1, edge functions e wizard.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import { navigation } from "@/config/navigation";
import {
  emptyRascunho,
  rascunhoSchema,
  DRAFT_STATUSES,
} from "@/lib/fiscal/rascunhoWizardValidation";

const ROOT = resolve(__dirname, "../../..");
const p = (...a: string[]) => resolve(ROOT, ...a);

const CANONICAL_MIGRATION = p("restoration/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql");
const RESTORATION_STUB_LEGACY = p("supabase/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql");
const WIZARD = p("src/components/fiscal/documentos/RascunhoWizard.tsx");
const A1 = p("src/components/fiscal/certificados/UploadCertificadoA1.tsx");
const BRIDGE = p("src/types/fiscalCertificateBridge.ts");
const ADAPTER = p("src/lib/fiscal/certificateOsAdapter.ts");
const EF_UPLOAD = p("supabase/functions/fiscal-certificate-upload/index.ts");
const EF_REVOKE = p("supabase/functions/fiscal-certificate-revoke/index.ts");

describe("Fase 3.16 — feature flags", () => {
  test("trava de emissão permanece false e reconciliação write bloqueada", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
    expect(FEATURE_FLAGS.fiscalReconciliationWrite).toBe(false);
    expect(FEATURE_FLAGS.fiscalDocumentManualEventRpc).toBe(false);
  });
  test("flags de preparação/homologação liberadas", () => {
    expect(FEATURE_FLAGS.fiscalConfigurationUi).toBe(true);
    expect(FEATURE_FLAGS.fiscalProductProfilesUi).toBe(true);
    expect(FEATURE_FLAGS.fiscalServiceProfilesUi).toBe(true);
    expect(FEATURE_FLAGS.fiscalCustomerProfilesUi).toBe(true);
    expect(FEATURE_FLAGS.fiscalDocumentWorkflowUi).toBe(true);
    expect(FEATURE_FLAGS.fiscalReadinessCenterUi).toBe(true);
  });
});

describe("Fase 3.16 — navegação", () => {
  test("itens fiscais estão registrados com featureFlag corretos", () => {
    const ids = navigation.map((n) => n.id);
    for (const id of [
      "fiscal-prontidao",
      "fiscal-perfis-produtos",
      "fiscal-perfis-servicos",
      "fiscal-perfis-clientes",
      "fiscal-rascunhos",
    ]) {
      expect(ids, `item ${id} ausente`).toContain(id);
    }
    const rasc = navigation.find((n) => n.id === "fiscal-rascunhos");
    expect(rasc?.featureFlag).toBe("fiscalDocumentWorkflowUi");
    // Labels em pt-BR
    expect(rasc?.label.toLowerCase()).toMatch(/rascunhos/);
  });
});

describe("Fase 3.16 — migration canônica aditiva", () => {
  test("canônica existe em restoration/migrations e nada em supabase/migrations", () => {
    expect(existsSync(CANONICAL_MIGRATION), "canônica ausente").toBe(true);
    // A promoção para supabase/migrations é passo manual pós-auditoria.
    expect(existsSync(RESTORATION_STUB_LEGACY)).toBe(false);
  });
  test("SQL aditivo, sem DROP TABLE/COLUMN, com objetos esperados", () => {
    const sql = readFileSync(CANONICAL_MIGRATION, "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS draft_version/);
    expect(sql).toMatch(/homologation_validation_status/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.fiscal_certificates/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.fiscal_certificate_material/);
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.v_fiscal_certificate_readiness/);
    expect(sql).toMatch(/security_invoker\s*=\s*true/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.rpc_fiscal_draft_save/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.rpc_fiscal_draft_validate_homologation/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.rpc_fiscal_certificate_register_os/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.rpc_fiscal_certificate_revoke/);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
    // Cofre: nenhum GRANT para anon/authenticated
    expect(sql).toMatch(/REVOKE ALL ON public\.fiscal_certificate_material FROM authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON public\.fiscal_certificate_material FROM anon/);
    expect(sql).toMatch(/GRANT ALL ON public\.fiscal_certificate_material TO service_role/);
    // fail-closed via função de chaves sensíveis
    expect(sql).toMatch(/fiscal_json_has_sensitive_key/);
    // Sem conteúdo de credencial em texto
    expect(sql).not.toMatch(/BEGIN CERTIFICATE/);
    expect(sql).not.toMatch(/PRIVATE KEY/);
    // Nenhuma trilha de emissão/autorização nas RPCs
    expect(sql).not.toMatch(/AUTHORIZED|ISSUED/);
  });
});

describe("Fase 3.16 — wizard: pt-BR, sem emissão, status restrito", () => {
  const src = readFileSync(WIZARD, "utf8");
  test("apenas status DRAFT/HOMOLOGATION", () => {
    expect(DRAFT_STATUSES).toEqual(["DRAFT", "HOMOLOGATION"]);
    const parsed = rascunhoSchema.safeParse({ ...emptyRascunho(), status: "AUTHORIZED" as never });
    expect(parsed.success).toBe(false);
  });
  test("nenhum botão de emissão/transmissão/autorização", () => {
    for (const rx of [/>Emitir</, />Transmitir</, />Autorizar</, />Cancelar\s*NF/i, />Consultar\s*SEFAZ</i]) {
      expect(src).not.toMatch(rx);
    }
  });
  test("nenhum fetch externo/URL de provedor", () => {
    expect(src).not.toMatch(/plugnotas|focusnfe|sefaz\./i);
    expect(src).not.toMatch(/fetch\s*\(\s*["']https?:/i);
  });
  test("textos essenciais em pt-BR", () => {
    for (const s of ["Documento", "Destinatário", "Revisão", "Salvar rascunho", "Validar para homologação"]) {
      expect(src).toContain(s);
    }
  });
});

describe("Fase 3.16 — bridge do sistema operacional", () => {
  const bridge = readFileSync(BRIDGE, "utf8");
  const adapter = readFileSync(ADAPTER, "utf8");
  test("contrato do bridge não expõe PFX/senha/chave", () => {
    expect(bridge).not.toMatch(/password|pfx|private_key|senha/i);
    // signDigest fora de escopo nesta fase
    expect(bridge).not.toMatch(/signDigest/);
  });
  test("adapter sanitiza retorno e não persiste segredo", () => {
    expect(adapter).toContain("listOsCertificatesSafe");
    expect(adapter).not.toMatch(/localStorage/);
    expect(adapter).not.toMatch(/password|senha|pfx/i);
  });
});

describe("Fase 3.16 — A1 upload frontend", () => {
  const src = readFileSync(A1, "utf8");
  test("aceita apenas .pfx/.p12; senha em type=password autocomplete=new-password", () => {
    expect(src).toMatch(/accept=\"\.pfx,\.p12\"/);
    expect(src).toMatch(/type=\"password\"/);
    expect(src).toMatch(/autoComplete=\"new-password\"/);
  });
  test("chama Edge Function fiscal-certificate-upload; não persiste no navegador", () => {
    expect(src).toContain('functions.invoke("fiscal-certificate-upload"');
    expect(src).not.toMatch(/localStorage|sessionStorage/);
  });
  test("limpa senha ao final via setPassword('')", () => {
    expect(src).toContain('setPassword("")');
  });
  test("tratamento de vault indisponível em pt-BR", () => {
    expect(src).toContain("CERTIFICATE_VAULT_NOT_CONFIGURED");
    expect(src).toContain("Cofre de certificados");
  });
});

describe("Fase 3.16 — Edge Functions", () => {
  const up = readFileSync(EF_UPLOAD, "utf8");
  const rv = readFileSync(EF_REVOKE, "utf8");
  test("upload: valida admin, master-key, extensão, tamanho e magic bytes", () => {
    expect(up).toContain("has_role");
    expect(up).toContain("administrador");
    expect(up).toContain("FISCAL_CERTIFICATE_MASTER_KEY");
    expect(up).toContain("CERTIFICATE_VAULT_NOT_CONFIGURED");
    expect(up).toContain("10 * 1024 * 1024");
    expect(up).toContain("PKCS12_MAGIC");
    expect(up).toContain("AES-GCM");
  });
  test("upload: nunca loga senha/body/JWT/chave", () => {
    // Nenhuma linha de log inclui os identificadores sensíveis
    for (const rx of [/console\.log\([^)]*password/i, /console\.log\([^)]*Authorization/i, /console\.log\([^)]*token/i, /console\.log\([^)]*service_role/i]) {
      expect(up).not.toMatch(rx);
    }
  });
  test("upload: rollback do objeto se metadata falhar", () => {
    expect(up).toMatch(/storage\.from\("fiscal-certificates"\)\.remove/);
  });
  test("revoke: admin-only, logical delete, remove material", () => {
    expect(rv).toContain("has_role");
    expect(rv).toContain("rpc_fiscal_certificate_revoke");
    expect(rv).toMatch(/storage\.from\("fiscal-certificates"\)\.remove/);
  });
  test("CORS por allowlist configurável", () => {
    expect(up).toContain("FISCAL_CORS_ALLOWLIST");
    expect(rv).toContain("FISCAL_CORS_ALLOWLIST");
  });
});
