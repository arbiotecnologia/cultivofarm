import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../../../supabase/functions/_shared/comunicacao/cors";
const root = "scripts/receipt-cancel-currency-20261021/";
const candidate = readFileSync(root + "edge-review/index.ts.review", "utf8");
const baseline = readFileSync(root + "baseline/edge-index.ts.v91", "utf8");
const org = "007bb519-cba0-4704-be2c-cb93ad010048";
const id = "00000000-0000-4000-8000-000000000002";
const issued = `${org}/2026/REC-2026-000001.pdf`;
function harness(source: string, status: string, afterStatus = status) {
  const effects: string[] = []; const uploads: string[] = []; const updates: any[] = [];
  let receiptReads = 0;
  const rec = { id, organization_id: org, receipt_number: "REC-2026-000001", receipt_year: 2026, customer_id: null, amount: 1, issued_at: "2026-10-21", payment_date: "2026-10-21", status, cancel_reason: "teste" };
  const from = (table: string) => {
    const q: any = { eq: () => q, select: () => q,
      maybeSingle: async () => ({ data: table === "financial_receipts" ? (receiptReads++ === 0 ? rec : { status: afterStatus }) : null, error: null }),
      update: (v: any) => { updates.push(v); const u: any = { eq: () => u, then: (r: any) => r({ error: null }) }; return u; } };
    return q;
  };
  const upload = vi.fn(async (p: string) => { uploads.push(p); return { error: null }; });
  const client = { from, auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) },
    rpc: async () => ({ data: org, error: null }), storage: { from: () => ({ upload, createSignedUrl: vi.fn() }) } };
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const pdf = { create: async () => ({ embedFont: async () => ({}), addPage: () => ({ drawText() {}, drawLine() {}, drawRectangle() {} }), save: async () => new Uint8Array([1]) }) };
  const js = ts.transpileModule(source.replace(/^import .*;\s*/gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("Deno", "createClient", "PDFDocument", "StandardFonts", "rgb", "corsHeadersFor", "handlePreflight", "isTrustedOrigin", js)(
    { env: { get: () => "x" }, serve: (fn: typeof handler) => { handler = fn; } }, () => client, pdf, {}, () => ({}), corsHeadersFor, handlePreflight, isTrustedOrigin);
  const invoke = () => handler!(new Request("https://i.invalid", { method: "POST", headers: { Authorization: "Bearer s", Origin: "https://app.cultivofarm.com.br" }, body: JSON.stringify({ receipt_id: id }) }));
  return { invoke, uploads, updates, effects };
}
it("baseline v91 overwrites the historical ISSUED object when rendering a CANCELED receipt", async () => {
  const h = harness(baseline, "CANCELED"); const r = await h.invoke();
  expect(await r.json()).toEqual({ path: issued, receipt_number: "REC-2026-000001" }); expect(h.uploads).toEqual([issued]);
});
it("candidate renders CANCELED to its own path, preserves the ISSUED object/locator and reports status", async () => {
  const h = harness(candidate, "CANCELED"); const r = await h.invoke();
  expect(await r.json()).toEqual({ path: issued.replace(".pdf", ".canceled.pdf"), receipt_number: "REC-2026-000001", status: "CANCELED" });
  expect(h.uploads).toEqual([issued.replace(".pdf", ".canceled.pdf")]); expect(h.updates).toEqual([]);
});
it("candidate keeps ISSUED contract and locator update", async () => {
  const h = harness(candidate, "ISSUED"); const r = await h.invoke();
  expect(await r.json()).toEqual({ path: issued, receipt_number: "REC-2026-000001", status: "ISSUED" }); expect(h.updates).toHaveLength(1);
});
it("ISSUED render that loses a race with cancellation fails closed without updating locator", async () => {
  const h = harness(candidate, "ISSUED", "CANCELED"); const r = await h.invoke();
  expect(r.status).toBe(500); expect(await r.json()).toEqual({ error: "financial_receipt_failed" }); expect(h.updates).toEqual([]);
});
it("candidate never signs", () => { expect(candidate).not.toContain("createSignedUrl"); expect(candidate).not.toMatch(/\burl\b\s*:/); });
