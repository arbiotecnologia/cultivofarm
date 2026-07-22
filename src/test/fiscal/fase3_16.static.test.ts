/**
 * Fase Fiscal 3.16.2-A — Testes estáticos.
 * Cobrem canonicalidade da migration, ausência de emissão, hardening do
 * cofre A1 (RPC service-role, bucket privado, CORS fail-closed, PKCS#12
 * com chave privada e verificação chave↔certificado) e cálculo server-side
 * de gross/net no rascunho.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
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

const CANONICAL_MIGRATION = p("supabase/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql");
const RESTORATION_STUB    = p("restoration/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql");
const WIZARD  = p("src/components/fiscal/documentos/RascunhoWizard.tsx");
const A1      = p("src/components/fiscal/certificados/UploadCertificadoA1.tsx");
const BRIDGE  = p("src/types/fiscalCertificateBridge.ts");
const ADAPTER = p("src/lib/fiscal/certificateOsAdapter.ts");
const EF_UPLOAD = p("supabase/functions/fiscal-certificate-upload/index.ts");
const EF_REVOKE = p("supabase/functions/fiscal-certificate-revoke/index.ts");

describe("Fase 3.16 — feature flags", () => {
  test("trava de emissão permanece false", () => {
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
  test("itens fiscais registrados", () => {
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
  });
});

describe("Fase 3.16.2-A — canonicalidade (BLOQUEANTE)", () => {
  test("canônica EXISTE em supabase/migrations", () => {
    expect(existsSync(CANONICAL_MIGRATION), "canônica ausente em supabase/migrations").toBe(true);
    expect(statSync(CANONICAL_MIGRATION).size).toBeGreaterThan(5000);
  });
  test("restoration é APENAS stub (sem SQL executável)", () => {
    expect(existsSync(RESTORATION_STUB)).toBe(true);
    const stub = readFileSync(RESTORATION_STUB, "utf8");
    // Toda linha não-comentário deve ser em branco.
    const executable = stub.split("\n").filter((l) => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith("--");
    });
    expect(executable, `restoration contém SQL executável: ${JSON.stringify(executable.slice(0,3))}`).toEqual([]);
    expect(stub).toMatch(/STUB DOCUMENTAL/);
    expect(stub).toMatch(/supabase\/migrations\/20260724000000/);
  });
});

describe("Fase 3.16.2-A — migration canônica (schema + segurança)", () => {
  const sql = readFileSync(CANONICAL_MIGRATION, "utf8");

  test("aditiva: nunca DROP TABLE/COLUMN", () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/DROP\s+COLUMN/i);
  });

  test("customer_id com FK real para public.clientes ON DELETE RESTRICT", () => {
    expect(sql).toMatch(/CONSTRAINT\s+fi_customer_id_fk[\s\S]*REFERENCES\s+public\.clientes\(id\)[\s\S]*ON\s+DELETE\s+RESTRICT/i);
    // Não pode existir comentário TODO deixando a FK pendente
    expect(sql).not.toMatch(/--\s*ALTER TABLE public\.fiscal_invoices[\s\S]{0,200}customer_id[\s\S]{0,200}REFERENCES/i);
  });

  test("company_settings_id em fiscal_certificates é ON DELETE RESTRICT (nunca CASCADE)", () => {
    const table = sql.match(/CREATE TABLE IF NOT EXISTS public\.fiscal_certificates[\s\S]+?\);/);
    expect(table).not.toBeNull();
    expect(table![0]).toMatch(/company_settings_id[\s\S]*REFERENCES\s+public\.company_fiscal_settings\(id\)\s+ON\s+DELETE\s+RESTRICT/i);
    expect(table![0]).not.toMatch(/company_settings_id[\s\S]*ON\s+DELETE\s+CASCADE/i);
  });

  test("bucket privado idempotente com file_size_limit=10485760", () => {
    expect(sql).toMatch(/INSERT INTO storage\.buckets[\s\S]*'fiscal-certificates'[\s\S]*false[\s\S]*10485760/);
    expect(sql).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    // Sem policies em storage.objects para anon/authenticated
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*ON\s+storage\.objects[\s\S]*TO\s+(anon|authenticated)/i);
  });

  test("RPC service-role rpc_fiscal_certificate_register_a1 presente + REVOKE + GRANT service_role", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.rpc_fiscal_certificate_register_a1/);
    expect(sql).toMatch(/decode\(p_encrypted_password_b64,\s*'base64'\)/);
    expect(sql).toMatch(/decode\(p_password_iv_b64,\s*'base64'\)/);
    expect(sql).toMatch(/decode\(p_material_iv_b64,\s*'base64'\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_fiscal_certificate_register_a1[\s\S]*FROM authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_fiscal_certificate_register_a1[\s\S]*FROM anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.rpc_fiscal_certificate_register_a1[\s\S]*TO service_role/);
  });

  test("rpc_fiscal_draft_save força DRAFT/NONE/MANUAL_RECORD e ambiente restrito", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.rpc_fiscal_draft_save[\s\S]+?\$\$;/);
    expect(fn).not.toBeNull();
    const body = fn![0];
    // servidor força
    expect(body).toMatch(/'DRAFT'/);
    expect(body).toMatch(/'NONE'/);
    expect(body).toMatch(/'MANUAL_RECORD'/);
    expect(body).toMatch(/environment_not_allowed/);
    expect(body).toMatch(/emission_field_forbidden/);
    expect(body).toMatch(/items_count_out_of_range/);
    expect(body).toMatch(/nfe_requires_product_items/);
    expect(body).toMatch(/nfse_requires_service_items/);
    expect(body).toMatch(/item_quantity_must_be_positive/);
    expect(body).toMatch(/item_unit_value_negative/);
    expect(body).toMatch(/item_discount_gt_gross/);
    expect(body).toMatch(/customer_id_required/);
    expect(body).toMatch(/customer_not_found/);
    // cálculo servidor
    expect(body).toMatch(/v_gross\s*:=\s*round\(v_qty \* v_unit/);
    expect(body).toMatch(/v_net\s*:=\s*round\(v_gross - v_disc/);
    // não confia em gross/net do cliente: não usa NULLIF(v_item->>'gross_value'...)::numeric no cálculo,
    // apenas insere valores computados (v_computed_items)
    expect(body).toMatch(/v_computed_items/);
    // concorrência
    expect(body).toMatch(/FOR UPDATE/);
    expect(body).toMatch(/draft_version/);
    // snapshots persistidos e sanitizados
    expect(body).toMatch(/fiscal_profile_snapshot/);
    expect(body).toMatch(/tax_snapshot/);
    expect(body).toMatch(/sensitive_key_in_snapshot/);
    // DELETE itens ocorre depois da validação (aparece depois do laço FOR e do UPDATE)
    const deleteIdx = body.indexOf("DELETE FROM public.fiscal_invoice_items");
    const forIdx    = body.indexOf("FOR v_item IN SELECT");
    expect(deleteIdx).toBeGreaterThan(forIdx);
    // permissão restrita
    expect(body).toMatch(/administrador/);
    expect(body).toMatch(/financeiro/);
    expect(body).not.toMatch(/AUTHORIZED|ISSUED/);
  });

  test("rpc_fiscal_draft_validate_homologation é STABLE e retorna mensagens pt-BR por campo", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.rpc_fiscal_draft_validate_homologation[\s\S]+?\$\$;/);
    expect(fn).not.toBeNull();
    const body = fn![0];
    expect(body).toMatch(/LANGUAGE plpgsql STABLE/);
    for (const msg of [
      /Cliente destinatario/i,
      /Serie do documento/i,
      /Data de emissao/i,
      /Documento precisa de ao menos um item/i,
      /Certificado digital ativo/i,
      /Configuracao fiscal da empresa/i,
      /perfil fiscal/i,
    ]) {
      expect(body).toMatch(msg);
    }
    // não escreve
    expect(body).not.toMatch(/\bINSERT INTO\b/i);
    expect(body).not.toMatch(/\bUPDATE\s+public\./i);
    expect(body).not.toMatch(/\bDELETE FROM\b/i);
  });

  test("auditoria de certificados NÃO silencia falhas e NÃO grava campos sensíveis", () => {
    const fn = sql.match(/CREATE OR REPLACE FUNCTION public\.tg_fiscal_certificates_audit[\s\S]+?\$\$;/);
    expect(fn).not.toBeNull();
    const body = fn![0];
    expect(body).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS\s+THEN\s+NULL/i);
    // não deve gravar senha/IV/ciphertext/object_path/alias nativo
    for (const k of ["password", "encrypted_password", "password_iv", "material_iv", "object_path", "native_alias"]) {
      expect(body).not.toMatch(new RegExp(`'${k}'`));
    }
  });

  test("cofre material sem policies frontend e sem grants a authenticated/anon", () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.fiscal_certificate_material FROM authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON public\.fiscal_certificate_material FROM anon/);
    expect(sql).toMatch(/GRANT ALL ON public\.fiscal_certificate_material TO service_role/);
    expect(sql).not.toMatch(/CREATE POLICY\s+\w+\s+ON\s+public\.fiscal_certificate_material/);
    expect(sql).not.toMatch(/GRANT SELECT ON public\.fiscal_certificate_material TO authenticated/);
  });

  test("view de prontidão sanitizada e security_invoker", () => {
    const view = sql.match(/CREATE OR REPLACE VIEW public\.v_fiscal_certificate_readiness[\s\S]+?;\s/);
    expect(view).not.toBeNull();
    expect(view![0]).toMatch(/security_invoker\s*=\s*true/);
    // Nunca expor material do cofre
    expect(view![0]).not.toMatch(/encrypted_password|password_iv|material_iv|object_path/);
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
});

describe("Fase 3.16 — bridge do sistema operacional", () => {
  const bridge = readFileSync(BRIDGE, "utf8");
  const adapter = readFileSync(ADAPTER, "utf8");
  test("contrato do bridge não expõe PFX/senha/chave", () => {
    expect(bridge).not.toMatch(/password|pfx|private_key|senha/i);
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
    expect(src).toMatch(/accept="\.pfx,\.p12"/);
    expect(src).toMatch(/type="password"/);
    expect(src).toMatch(/autoComplete="new-password"/);
  });
  test("chama Edge Function fiscal-certificate-upload; não persiste no navegador", () => {
    expect(src).toContain('functions.invoke("fiscal-certificate-upload"');
    expect(src).not.toMatch(/localStorage|sessionStorage/);
  });
  test("limpa senha ao final via setPassword('')", () => {
    expect(src).toContain('setPassword("")');
  });
});

describe("Fase 3.16.2-A — Edge Function upload (hardening)", () => {
  const up = readFileSync(EF_UPLOAD, "utf8");

  test("CORS fail-closed: origem ausente/desconhecida => 403 e Origin nunca ecoa", () => {
    expect(up).toMatch(/cors_origin_not_allowed/);
    expect(up).toMatch(/allowed\s*\?\s*origin!?\s*:\s*"null"/);
    // Sem fallback como allow[0] ?? "" (pattern do bug antigo)
    expect(up).not.toMatch(/allow\[0\]\s*\?\?\s*""/);
  });

  test("validação de UUID e existência da company_settings", () => {
    expect(up).toMatch(/UUID_RE/);
    expect(up).toMatch(/from\("company_fiscal_settings"\)/);
    expect(up).toMatch(/company_settings_not_found/);
  });

  test("limites de nome/senha/tamanho de arquivo", () => {
    expect(up).toMatch(/MAX_PASSWORD/);
    expect(up).toMatch(/MAX_DISPLAY_NAME/);
    expect(up).toMatch(/MAX_BYTES/);
    expect(up).toMatch(/password_too_long/);
    expect(up).toMatch(/display_name_too_long/);
    expect(up).toMatch(/file_name_too_long/);
  });

  test("PKCS#12 exige certificado E chave privada com verificação criptográfica", () => {
    expect(up).toMatch(/pkcs12_missing_certificate/);
    expect(up).toMatch(/pkcs12_missing_private_key/);
    expect(up).toMatch(/pkcs8ShroudedKeyBag/);
    expect(up).toMatch(/private_key_does_not_match_certificate/);
    // Verificação por sign/verify com nonce aleatório
    expect(up).toMatch(/random\.getBytesSync/);
    expect(up).toMatch(/publicKey[\s\S]*verify/);
  });

  test("verifica notBefore E notAfter", () => {
    expect(up).toMatch(/certificate_not_yet_valid/);
    expect(up).toMatch(/certificate_expired/);
    expect(up).toMatch(/validity\.notBefore/);
    expect(up).toMatch(/validity\.notAfter/);
  });

  test("AES-256-GCM com IVs INDEPENDENTES para material e senha", () => {
    expect(up).toMatch(/AES-GCM/);
    // Duas chamadas distintas de aesGcmEncrypt (uma para bytes, uma para senha)
    const enc = (up.match(/aesGcmEncrypt\(masterKey,/g) ?? []).length;
    expect(enc).toBeGreaterThanOrEqual(2);
  });

  test("chama RPC service-role register_a1 com STRINGS base64 (nunca Uint8Array direto)", () => {
    expect(up).toMatch(/rpc\("rpc_fiscal_certificate_register_a1"/);
    expect(up).toMatch(/toB64\(encPassword\.cipher\)/);
    expect(up).toMatch(/toB64\(encPassword\.iv\)/);
    expect(up).toMatch(/toB64\(encMaterial\.iv\)/);
    // Não envia Uint8Array crua ao PostgREST (padrão .from().insert com bytea)
    expect(up).not.toMatch(/\.from\("fiscal_certificate_material"\)\.insert/);
    expect(up).not.toMatch(/encrypted_password:\s*encPassword\.cipher/);
  });

  test("rollback: remove objeto ao falhar RPC e não vaza mensagem interna", () => {
    expect(up).toMatch(/storage\.from\("fiscal-certificates"\)\.remove\(\[objectPath\]\)/);
    expect(up).toMatch(/certificate_register_failed/);
    // Não retorna a mensagem original do banco
    expect(up).not.toMatch(/regErr\.message/);
  });

  test("nunca loga senha/body/JWT/service_role/IV/object_path", () => {
    for (const rx of [
      /console\.(log|error|warn)\([^)]*password/i,
      /console\.(log|error|warn)\([^)]*Authorization/i,
      /console\.(log|error|warn)\([^)]*token/i,
      /console\.(log|error|warn)\([^)]*service_role/i,
      /console\.(log|error|warn)\([^)]*objectPath/i,
      /console\.(log|error|warn)\([^)]*\biv\b/i,
    ]) {
      expect(up).not.toMatch(rx);
    }
  });
});

describe("Fase 3.16.2-A — Edge Function revoke (hardening)", () => {
  const rv = readFileSync(EF_REVOKE, "utf8");
  test("CORS fail-closed", () => {
    expect(rv).toMatch(/cors_origin_not_allowed/);
    expect(rv).not.toMatch(/allow\[0\]\s*\?\?\s*""/);
  });
  test("valida certificado antes de qualquer ação", () => {
    expect(rv).toMatch(/certificate_not_found/);
    expect(rv).toMatch(/from\("fiscal_certificates"\)/);
  });
  test("não declara sucesso se remoção física falhar", () => {
    expect(rv).toMatch(/cleanup_incomplete/);
    expect(rv).toMatch(/storage_remove_failed/);
    expect(rv).toMatch(/material_delete_failed/);
    // Retorno 502 quando incompleto
    expect(rv).toMatch(/,\s*502,/);
  });
  test("admin-only e idempotente via RPC lógica", () => {
    expect(rv).toContain("has_role");
    expect(rv).toContain("rpc_fiscal_certificate_revoke");
  });
});

describe("Fase 3.16.2-B — hardening OS bridge + snapshots por item + labels pt-BR", () => {
  const sql = readFileSync(CANONICAL_MIGRATION, "utf8");

  test("RPC register_os aplica whitelist estrita de metadata", () => {
    expect(sql).toMatch(/ALLOWED_KEYS\s+text\[\]\s*:=\s*ARRAY\[/);
    expect(sql).toMatch(/metadata_key_not_allowed/);
    expect(sql).toMatch(/fingerprint_sha256_invalid/);
    expect(sql).toMatch(/validity_range_invalid/);
    expect(sql).toMatch(/certificate_expired/);
    expect(sql).toMatch(/subject_name_invalid/);
    expect(sql).toMatch(/issuer_name_invalid/);
    expect(sql).toMatch(/serial_number_invalid/);
  });

  test("rpc_fiscal_draft_save persiste snapshots por item", () => {
    expect(sql).toMatch(/fiscal_profile_snapshot['"]?,\s*v_item_profile/);
    expect(sql).toMatch(/tax_snapshot['"]?,\s*v_item_tax/);
    expect(sql).toMatch(/INSERT INTO public\.fiscal_invoice_items[\s\S]*fiscal_profile_snapshot,\s*tax_snapshot/);
  });

  test("rpc_fiscal_draft_validate_homologation exige perfil fiscal por item", () => {
    expect(sql).toMatch(/item_fiscal_profile/);
    expect(sql).toMatch(/NCM obrigatorio/);
    expect(sql).toMatch(/LC116 e CNAE obrigatorios/);
  });

  test("mapa pt-BR existe e cobre enums fiscais", () => {
    const labels = readFileSync(p("src/lib/fiscal/documentLabels.ts"), "utf8");
    for (const fn of [
      "labelDocumentModel","labelDocumentOrigin","labelStatus",
      "labelNormalizedStatus","labelEnvironment","labelReconciliationStatus",
      "labelInvoiceType","labelItemKind",
    ]) {
      expect(labels, `${fn} ausente`).toContain(fn);
    }
  });

  test("FiscalEmpresa restringe gestão de certificados a administrador", () => {
    const fe = readFileSync(p("src/pages/configuracoes/FiscalEmpresa.tsx"), "utf8");
    expect(fe).toMatch(/canManageCertificates\s*=\s*roles\.includes\(["']administrador["']\)/);
    expect(fe).toMatch(/canManageCertificates={canManageCertificates}/);
  });
});
