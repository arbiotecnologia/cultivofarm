import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const edge = readFileSync("supabase/functions/fiscal-sefaz-transport/index.ts", "utf8");
const xmlEngine = readFileSync("supabase/functions/fiscal-xml-engine/index.ts", "utf8");
const canonical = readFileSync("supabase/functions/_shared/fiscal/canonicalProject.ts", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");
const migration = readFileSync("supabase/migrations/20261034000000_fiscal_transport_preview_safety.sql", "utf8");

const FORBIDDEN_REFS = [
  "ikaauvsflpmamgxmkhoq",
  "navfzbwgwzruipouyfnk",
  "yzszlzjpovmcteuxjznj",
  "chkgpuawcswhefiabwsm",
];

describe("Fiscal safety regression contracts (not remote E2E)", () => {
  it("blocks unconfirmed SENT before attempting external POST", () => {
    expect(edge.indexOf("if (sent.error")).toBeLessThan(edge.indexOf("postAttempted = true"));
    expect(edge).toContain('sent.data?.state !== "SENT"');
    expect(edge).toContain('code: "FISCAL_SENT_PERSISTENCE_FAILED"');
  });

  it("does not confirm success if final persistence fails", () => {
    expect(edge).toContain("if (recorded.error");
    expect(edge).toContain("reconciliationRequired: true, authorized: false, retrySafe: false");
  });

  it("keeps uncertain POSTs pending reconciliation", () => {
    expect(edge).toContain("if (postAttempted)");
    expect(edge).not.toContain("retrySafe: isRetryable(result)");
  });

  it("keeps a single canonical target shared by both fiscal functions", () => {
    expect(canonical).toContain('CANONICAL_PROJECT_REF = "swzpzcwiasxmjutrmvkm"');
    for (const source of [edge, xmlEngine]) {
      expect(source).toContain('from "../_shared/fiscal/canonicalProject.ts"');
      expect(source).toContain("isCanonicalSupabaseUrl(supabaseUrl)");
      expect(source.indexOf("isCanonicalSupabaseUrl(supabaseUrl)"))
        .toBeLessThan(source.indexOf("const authed = createClient"));
    }
  });

  it("never points executable fiscal transport code at forbidden projects", () => {
    for (const ref of FORBIDDEN_REFS) {
      expect(edge).not.toContain(ref);
      expect(xmlEngine).not.toContain(ref);
      expect(canonical).not.toContain(ref);
    }
  });

  it("refuses preflight from origins outside the allowlist in both functions", () => {
    expect(edge).toContain('return new Response("cors_denied", { status: 403, headers })');
    expect(xmlEngine).toContain('return new Response("cors_denied", { status: 403, headers })');
  });

  it("requires the internal fiscal profile in the edge layer too", () => {
    expect(xmlEngine).toContain('authed.rpc("fn_fiscal_can_operate"');
    expect(xmlEngine.indexOf('authed.rpc("fn_fiscal_can_operate"'))
      .toBeLessThan(xmlEngine.indexOf('const action = String(body.action'));
    expect(edge).toContain('authed.rpc("fn_fiscal_can_operate"');
  });

  it("declares verify_jwt explicitly for both fiscal edge functions", () => {
    expect(config).toContain("[functions.fiscal-sefaz-transport]\nverify_jwt = true");
    expect(config).toContain("[functions.fiscal-xml-engine]\nverify_jwt = true");
    expect(config).toContain("static_files");
  });

  it("stages restricted record privileges and blocks merchandise preview for services", () => {
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("inv.document_model IS DISTINCT FROM 'NFE'");
  });
});
