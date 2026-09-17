import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const edge = readFileSync("supabase/functions/fiscal-sefaz-transport/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261034000000_fiscal_transport_preview_safety.sql", "utf8");

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
  it("validates canonical runtime before constructing clients", () => {
    expect(edge.indexOf('supabaseUrl !== "https://swzpzcwiasxmjutrmvkm.supabase.co"')).toBeLessThan(edge.indexOf("const authed = createClient"));
  });
  it("stages restricted record privileges and blocks merchandise preview for services", () => {
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("inv.document_model IS DISTINCT FROM 'NFE'");
  });
});