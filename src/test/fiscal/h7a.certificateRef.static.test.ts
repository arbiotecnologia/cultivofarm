import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(resolve(ROOT, file), "utf8");

const APPLY = read("restoration/homologacao-h7/76-h7a-certificate-ref-guard-apply.sql");
const ROLLBACK = read("restoration/homologacao-h7/77-h7a-certificate-ref-guard-rollback.sql");
const UPLOAD = read("supabase/functions/fiscal-certificate-upload/index.ts");
const REVOKE = read("supabase/functions/fiscal-certificate-revoke/index.ts");

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("$$;", start) + 3);
}

describe("H7A — vínculo seguro do certificado A1", () => {
  test("apply é restrito ao staging e preserva o contrato SIGNING_BUNDLE_V2", () => {
    expect(APPLY).toContain("ikaauvsflpmamgxmkhoq");
    expect(APPLY).toContain("environment_label = 'STAGING'");
    expect(APPLY).toContain("production_emission_allowed = false");
    expect(APPLY).toContain("SIGNING_BUNDLE_V2");
    expect(APPLY).toContain("AES-256-GCM");
    expect(APPLY).not.toMatch(/encrypted_password|password_iv|p_encrypted_password_b64|p_password_iv_b64/);
  });

  test("certificate_ref só aceita certificado ativo, válido e da mesma empresa", () => {
    const guard = functionBody(APPLY, "fn_fiscal_certificate_ref_guard");
    expect(guard).toContain("certificate_ref_invalid");
    expect(guard).toContain("certificate_ref_not_active_homologation");
    expect(guard).toContain("fc.company_settings_id = NEW.id");
    expect(guard).toContain("fc.environment = 'HOMOLOGATION'");
    expect(guard).toContain("fc.status = 'AVAILABLE'");
    expect(guard).toContain("fc.is_active = true");
    expect(guard).toContain("fc.valid_until > now()");
  });

  test("registro atualiza a referência somente depois de persistir o material", () => {
    const register = functionBody(APPLY, "rpc_fiscal_certificate_register_a1");
    expect(register).toContain("INSERT INTO public.fiscal_certificate_material");
    expect(register).toContain("SET certificate_ref = v_id::text");
    expect(register.indexOf("INSERT INTO public.fiscal_certificate_material"))
      .toBeLessThan(register.indexOf("SET certificate_ref = v_id::text"));
    expect(APPLY).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_fiscal_certificate_register_a1[\s\S]*FROM anon/);
    expect(APPLY).toMatch(/REVOKE ALL ON FUNCTION public\.rpc_fiscal_certificate_register_a1[\s\S]*FROM authenticated/);
    expect(APPLY).toMatch(/GRANT EXECUTE ON FUNCTION public\.rpc_fiscal_certificate_register_a1[\s\S]*TO service_role/);
  });

  test("revogação limpa a referência e a função Edge usa a RPC canônica", () => {
    const revoke = functionBody(APPLY, "rpc_fiscal_certificate_revoke");
    expect(revoke).toContain("SET certificate_ref = NULL");
    expect(REVOKE).toContain("rpc_fiscal_certificate_revoke");
    expect(REVOKE).toContain("fiscal-certificates");
    expect(REVOKE).not.toMatch(/console\.(log|info|warn|error|debug)/);
  });

  test("rollback não reintroduz senha e exige revogação antes de reverter", () => {
    expect(ROLLBACK).toContain("H7A rollback abortado");
    expect(ROLLBACK).not.toMatch(/encrypted_password|password_iv|p_encrypted_password_b64|p_password_iv_b64/);
    expect(ROLLBACK).toContain("DROP TRIGGER IF EXISTS trg_fiscal_certificate_ref_guard");
  });

  test("upload mantém a chamada RPC sem argumentos de senha", () => {
    expect(UPLOAD).toContain("rpc_fiscal_certificate_register_a1");
    expect(UPLOAD).toContain("p_material_format: SIGNING_BUNDLE_FORMAT");
    expect(UPLOAD).toContain("p_material_algorithm: SIGNING_BUNDLE_ALGORITHM");
    expect(UPLOAD).not.toMatch(/p_encrypted_password_b64|p_password_iv_b64|encrypted_password|password_iv/);
  });
});
