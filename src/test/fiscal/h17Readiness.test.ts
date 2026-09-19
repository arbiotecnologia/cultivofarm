import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildUpdatePayload, companyFiscalFormSchema, nfeChecklist } from "@/lib/fiscal/companyFiscalValidation";
import { certificateErrorMessage } from "@/lib/fiscal/certificateErrors";

const read = (p: string) => fs.readFileSync(p, "utf8");
describe("H17 safe readiness", () => {
  it.each([0, -1, 1000, 1.2, Infinity, NaN])("rejects invalid series %s", (n) => {
    expect(companyFiscalFormSchema.safeParse({ nfe_series_number: n }).success).toBe(false);
  });
  it.each([1, 999])("writes canonical series %s with homologation only", (n) => {
    const payload = buildUpdatePayload({ nfe_series_number: n, nfe_enabled: true, certificate_ref: "arbitrary" });
    expect(payload).toMatchObject({ nfe_series_number: n, nfe_environment_code: "2", nfe_enabled: false });
    expect(payload).not.toHaveProperty("certificate_ref");
    expect(payload).not.toHaveProperty("production_enabled");
    expect(payload).not.toHaveProperty("last_number");
  });
  it("cannot use legacy text as readiness or select production", () => {
    expect(nfeChecklist({ nfe_series: "1" }).find(x => x.key === "series")?.ok).toBe(false);
    expect(companyFiscalFormSchema.safeParse({ nfe_environment_code: "1" }).success).toBe(false);
  });
  it("authorizes company and certificate through RLS before elevated access", () => {
    for (const [action, table] of [["upload", "company_fiscal_settings"], ["revoke", "fiscal_certificates"]]) {
      const s = read(`supabase/functions/fiscal-certificate-${action}/index.ts`);
      const check = s.indexOf(`await authed.from("${table}")`);
      expect(check).toBeGreaterThan(0);
      expect(check).toBeLessThan(s.indexOf("const admin = createClient"));
      expect(s).toContain("isCanonicalSupabaseUrl(supabaseUrl)");
      expect(s).not.toMatch(/console\.(log|error|warn)/);
    }
  });
  it("retains material location when object deletion fails for retry", () => {
    const s = read("supabase/functions/fiscal-certificate-revoke/index.ts");
    expect(s).toContain('if (!rm.error) {');
    expect(s).toContain('authed.rpc("rpc_fiscal_certificate_revoke"');
    expect(s).toContain('cleanup_incomplete: true');
  });
  it("candidate tests both current certificate validity and company, without duplicating guard", () => {
    const s = read("restoration/fiscal-h17/20260919142300_h17_certificate_readiness.sql");
    for (const alias of ["r", "emit"]) {
      expect(s).toContain(`c.id::text = ${alias}.certificate_ref AND c.company_settings_id = ${alias}.id`);
    }
    for (const check of ["c.revoked_at IS NULL", "c.valid_from <= now()", "c.valid_until > now()", "c.status = 'AVAILABLE'", "c.environment = 'HOMOLOGATION'", "c.is_active IS TRUE"]) {
      expect(s.split(check)).toHaveLength(3);
    }
    expect(s).not.toMatch(/CREATE TRIGGER|INSERT INTO|UPDATE public|GRANT /);
    expect(s).toContain("IF NOT cert_ok OR emitter_status");
  });
  it("storage contract is private, 10 MiB, octet-stream and no client policies", () => {
    const spec = JSON.parse(read("restoration/fiscal-h17/storage-provisioning.json"));
    expect(spec).toMatchObject({ project_ref: "swzpzcwiasxmjutrmvkm", public: false, fileSizeLimit: 10485760, allowedMimeTypes: ["application/octet-stream"], objectPoliciesToAdd: [], status: "NOT_EXECUTED" });
  });
  it("UI removes reference input and locks series environment", () => {
    const s = read("src/pages/configuracoes/FiscalEmpresa.tsx");
    expect(s).not.toContain('<Input id="certificate_ref"');
    expect(s).toContain('id="nfe_series_number" type="number" min={1} max={999}');
    expect(s).toContain('value="Homologação (2)" readOnly');
  });
  it("never presents arbitrary server error content", async () => {
    const hostile = 'PFX senha=SECRET /private/file stack IV ciphertext';
    expect(await certificateErrorMessage(new Error(hostile), { error: hostile })).not.toContain("SECRET");
    const response = new Response(JSON.stringify({ error: "storage_upload_failed", detail: hostile }));
    expect(await certificateErrorMessage({ context: response })).toBe("Armazenamento do cofre indisponível. Contate o administrador.");
    expect(await certificateErrorMessage(null, { revoked: true, cleanup_incomplete: true })).toContain("limpeza pendente");
  });
});