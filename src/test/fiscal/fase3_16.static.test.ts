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
const EF_LEAF_HELPER = p("supabase/functions/fiscal-certificate-upload/certificateLeaf.ts");

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
  const leafHelper = readFileSync(EF_LEAF_HELPER, "utf8");

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
    expect(up).toMatch(/selectCertificateLeafForPrivateKey/);
    expect(up).not.toMatch(/const certBag = allCertBags\[0\]/);
    // Verificação por sign/verify com nonce aleatório
    expect(up).toMatch(/random\.getBytesSync/);
    expect(leafHelper).toMatch(/publicKey[\s\S]*verify/);
  });

  test("verifica notBefore E notAfter", () => {
    expect(up).toMatch(/certificate_not_yet_valid/);
    expect(up).toMatch(/certificate_expired/);
    expect(up).toMatch(/validity\.notBefore/);
    expect(up).toMatch(/validity\.notAfter/);
  });

  // H7d — a senha do PFX deixou de ser cifrada e persistida: só o bundle de
  // assinatura é cifrado, com um único IV independente por importação.
  test("AES-256-GCM aplicado ao bundle de assinatura (sem cifra de senha)", () => {
    expect(up).toMatch(/AES-GCM/);
    const enc = (up.match(/aesGcmEncrypt\(masterKey,/g) ?? []).length;
    expect(enc).toBe(1);
    expect(up).not.toMatch(/encPassword/);
  });

  test("chama RPC service-role register_a1 com STRINGS base64 (nunca Uint8Array direto)", () => {
    expect(up).toMatch(/rpc\("rpc_fiscal_certificate_register_a1"/);
    expect(up).toMatch(/toB64\(encMaterial\.iv\)/);
    expect(up).not.toMatch(/p_encrypted_password_b64|p_password_iv_b64/);
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
    // 3.16.2-C: mensagens/campos mais específicos
    expect(sql).toContain("sem NCM no perfil fiscal");
    expect(sql).toContain("sem item LC 116 no perfil fiscal");
    expect(sql).toContain("sem CNAE no perfil fiscal");
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
    expect(fe).toMatch(/roles\.includes\(["']administrador["']\)/);
    expect(fe).toMatch(/canManageCertificates={canManageCertificates}/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Fase 3.16.2-C — Ajustes finais de segurança e usabilidade
// ────────────────────────────────────────────────────────────────────────
describe("Fase 3.16.2-C — travas de emissão/produção", () => {
  test("todas as flags de emissão permanecem false", () => {
    expect(FEATURE_FLAGS.fiscalEmissionEnabled).toBe(false);
    expect(FEATURE_FLAGS.fiscalReconciliationWrite).toBe(false);
    expect(FEATURE_FLAGS.fiscalDocumentManualEventRpc).toBe(false);
  });
});

describe("Fase 3.16.2-C — CertificadoDigitalSecao", () => {
  const CDS = p("src/components/fiscal/certificados/CertificadoDigitalSecao.tsx");
  const src = readFileSync(CDS, "utf8");

  test("não oculta a seção via canEdit=false", () => {
    expect(src).not.toMatch(/if\s*\(\s*canEdit\s*===\s*false\s*\)\s*return\s+null/);
  });

  test("expõe helpers de mascaramento e mensagens padronizadas", () => {
    expect(src).toContain("export function maskFingerprint");
    expect(src).toContain("export function maskSerial");
    expect(src).toContain("export function environmentLabel");
    expect(src).toContain('VAULT_UNAVAILABLE_MESSAGE');
    expect(src).toContain('OS_BRIDGE_MISSING_MESSAGE');
    expect(src).toContain("Cofre de certificados ainda não ativado neste ambiente");
    expect(src).toContain("Conector do sistema operacional não instalado");
  });

  test("botão de detecção renomeado", () => {
    expect(src).toContain("Atualizar detecção");
    expect(src).not.toMatch(/>\s*Detectar\s*</);
  });

  test("statusBadge não retorna enum cru", () => {
    // status default cai em "Status indisponível"; NOT_CONFIGURED → "Não configurado"
    expect(src).toContain('Status indisponível');
    expect(src).toContain('Não configurado');
    // não deve renderizar `{status}` diretamente dentro de <Badge>
    expect(src).not.toMatch(/<Badge[^>]*>\{status\}<\/Badge>/);
  });

  test("environmentLabel jamais rotula ambiente diferente como Produção", () => {
    expect(src).toMatch(/env === "HOMOLOGATION" \? "Homologação" : "Indisponível"/);
  });

  test("fingerprint nunca renderizado integralmente na tabela/lista SO", () => {
    // A tabela usa maskFingerprint (não o valor bruto)
    expect(src).toContain('maskFingerprint(c.fingerprint_sha256)');
    // não deve haver template exibindo o fingerprint bruto sem máscara
    expect(src).not.toMatch(/SHA-256:\s*\{c\.fingerprint_sha256\}/);
  });

  test("refetch após upload A1", () => {
    expect(src).toContain("onUploaded={() => {");
    expect(src).toContain("listQ.refetch()");
  });
});

describe("Fase 3.16.2-C — hook useFiscalRascunho", () => {
  const HOOK = readFileSync(p("src/hooks/useFiscalRascunho.ts"), "utf8");

  test("payload por item não envia gross/net como fonte", () => {
    // gross_value e net_value não devem aparecer como chaves no payload
    // do item enviado à RPC
    const itemBlock = HOOK.slice(HOOK.indexOf("itemsPayload"), HOOK.indexOf("rpc(\"rpc_fiscal_draft_save\""));
    expect(itemBlock).not.toMatch(/gross_value\s*:/);
    expect(itemBlock).not.toMatch(/net_value\s*:/);
  });

  test("usa buildItemSnapshots (whitelist) para construir snapshots", () => {
    expect(HOOK).toContain('from "@/lib/fiscal/rascunhoSnapshots"');
    expect(HOOK).toContain("buildItemSnapshots(args.values.invoice_type, it)");
  });
});

describe("Fase 3.16.2-C — migration RPC SYSTEM_STORE", () => {
  const SQL = readFileSync(CANONICAL_MIGRATION, "utf8");

  test("exige company_settings_id existente", () => {
    expect(SQL).toContain("company_settings_id_required");
    expect(SQL).toContain("company_settings_not_found");
    expect(SQL).toMatch(/FROM public\.company_fiscal_settings WHERE id = p_company_settings_id/);
  });

  test("notBefore server-side v_from <= now() < v_until", () => {
    expect(SQL).toContain("certificate_not_yet_valid");
    expect(SQL).toMatch(/IF v_from > now\(\) THEN/);
    expect(SQL).toMatch(/IF now\(\) >= v_until THEN/);
  });

  test("key_usage limites (helper fail-closed)", () => {
    expect(SQL).toContain("fiscal_validate_key_usage");
    expect(SQL).toContain("key_usage_too_many");
    expect(SQL).toContain("key_usage_item_not_string");
    expect(SQL).toContain("key_usage_item_length_invalid");
    expect(SQL).toMatch(/v_len > 20/);
    expect(SQL).toMatch(/char_length\(v_el #>> '\{\}'\) < 1 OR char_length\(v_el #>> '\{\}'\) > 80/);
  });
});

describe("Fase 3.16.2-C — snapshots fail-closed no rpc_fiscal_draft_save", () => {
  const SQL = readFileSync(CANONICAL_MIGRATION, "utf8");

  test("whitelist NF-e (perfil e tributos) presente", () => {
    expect(SQL).toContain("fiscal_validate_snapshot_keys");
    expect(SQL).toContain("'ncm','cest','cfop','origem_mercadoria','cst_icms','csosn','unidade'");
    expect(SQL).toContain("'pis','cofins','ipi','icms'");
    expect(SQL).toContain("'cst','csosn','aliquota','base_calculo_modalidade'");
  });

  test("whitelist NFS-e (perfil e tributos) presente", () => {
    expect(SQL).toContain("'lc116_item','cnae','municipal_tax_code','national_tax_code','municipality_ibge_code'");
    expect(SQL).toContain("'iss_rate','iss_withheld','retencoes_suportadas'");
    expect(SQL).toMatch(/nfse_iss_rate_out_of_range/);
    expect(SQL).toMatch(/nfse_iss_withheld_not_boolean/);
    expect(SQL).toContain("'pis','cofins','csll','irrf','inss'");
  });

  test("valida existência do source_item_id (produto e serviço)", () => {
    expect(SQL).toContain("source_item_product_not_found");
    expect(SQL).toContain("source_item_product_profile_missing");
    expect(SQL).toContain("source_item_service_profile_missing");
    expect(SQL).toMatch(/FROM public\.product_fiscal_profiles pfp\s+WHERE pfp\.product_id = v_source_id/);
    expect(SQL).toMatch(/FROM public\.service_fiscal_profiles sfp\s+WHERE sfp\.service_id = v_source_id/);
  });

  test("validate_homologation exige CFOP+CST/CSOSN e ISS rate", () => {
    expect(SQL).toMatch(/item_cfop/);
    expect(SQL).toMatch(/item_cst_csosn/);
    expect(SQL).toMatch(/item_iss_rate/);
    expect(SQL).toContain("sem aliquota de ISS definida");
  });
});

