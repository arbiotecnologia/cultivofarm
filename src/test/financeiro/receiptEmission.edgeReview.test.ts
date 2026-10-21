import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../../../supabase/functions/_shared/comunicacao/cors";
const root = "scripts/receipt-emission-attachments-20261021/edge-review/";
const candidate = readFileSync(root + "index.ts.review", "utf8");
const baseline = readFileSync(root + "baseline.ts.review", "utf8");
const runtime = readFileSync("supabase/functions/generate-financial-receipt/index.ts", "utf8");
const org = "007bb519-cba0-4704-be2c-cb93ad010048";
const id = "00000000-0000-4000-8000-000000000002";
const path = `${org}/2026/REC-2026-000001.pdf`;
function harness(failure = "", source = runtime) {
  const effects: string[] = [];
  const rec = { id, organization_id: org, receipt_number: "REC-2026-000001", receipt_year: 2026, customer_id: "client", amount: 100, issued_at: "2026-10-21", payment_date: "2026-10-21", status: "ISSUED" };
  const filters: any[] = [];
  const from = (table: string) => {
    const q: any = { eq: (...args: any[]) => { filters.push([table, ...args]); return q; }, select: () => q,
      maybeSingle: async () => { effects.push(table); return { data: failure === table ? null : table === "financial_receipts" ? rec : { nome: "Fictício" }, error: null }; },
      update: () => { effects.push("update"); const u: any = { eq: () => u, then: (r: any) => r({ error: failure === "update" ? "sensitive-transport" : null }) }; return u; } };
    return q;
  };
  const sign = vi.fn(async () => { effects.push("sign"); return { data: { signedUrl: "https://bearer.invalid" }, error: null }; });
  const upload = vi.fn(async () => { effects.push("upload"); return { error: failure === "upload" ? "sensitive-transport" : null }; });
  const client = { from, auth: { getUser: async () => { effects.push("auth"); return { data: { user: failure === "auth" ? null : { id: "actor" } } }; } },
    rpc: async () => { effects.push("tenant"); return { data: failure === "tenant" ? null : org, error: null }; }, storage: { from: () => ({ upload, createSignedUrl: sign }) } };
  const createClient = vi.fn(() => client);
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const pdf = { create: async () => ({ embedFont: async () => ({}), addPage: () => ({ drawText() {}, drawLine() {}, drawRectangle() {} }), save: async () => new Uint8Array([1, 2, 3]) }) };
  const javascript = ts.transpileModule(source.replace(/^import .*;\s*/gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("Deno", "createClient", "PDFDocument", "StandardFonts", "rgb", "corsHeadersFor", "handlePreflight", "isTrustedOrigin", javascript)(
    { env: { get: (key: string) => key === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : "mock-anon" }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient, pdf, { Helvetica: "regular", HelveticaBold: "bold" }, () => ({}), corsHeadersFor, handlePreflight, isTrustedOrigin);
  const invoke = (body = { receipt_id: id }, origin = "https://app.cultivofarm.com.br") => {
    if (!handler) throw new Error("Missing handler");
    return handler(new Request("https://isolated.invalid", { method: "POST", headers: { Authorization: "Bearer synthetic-actor", Origin: origin }, body: JSON.stringify(body) }));
  };
  return { invoke, sign, upload, effects, filters, createClient };
}
it("runtime is exact reviewed candidate, changing only signing/response", () => {
  expect(candidate).toBe(baseline.replace('    const { data: signed, error: signedError } = await supabase.storage.from("financial-receipts").createSignedUrl(path, 60 * 60);\n    if (signedError || !signed?.signedUrl) throw new Error("URL do recibo indisponível");\n', '').replace('JSON.stringify({ url: signed?.signedUrl, path, receipt_number: rec.receipt_number })', 'JSON.stringify({ path, receipt_number: rec.receipt_number })'));
  // v91/v93 ficam como fixtures históricas; runtime é a v95 (layout) byte-exata.
  expect(runtime).toBe(readFileSync("scripts/receipt-cancel-currency-20261021/edge-layout-review/index.ts.review", "utf8"));
});
it("actor-authenticated candidate returns locator only, without issuing bearer capability", async () => {
  const h = harness(); const response = await h.invoke(); expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ path, receipt_number: "REC-2026-000001", status: "ISSUED" }); expect(h.sign).not.toHaveBeenCalled();
  expect(h.filters).toContainEqual(["financial_receipts", "organization_id", org]); expect(h.filters).toContainEqual(["clientes", "organization_id", org]);
  expect(h.createClient).toHaveBeenCalledWith("https://swzpzcwiasxmjutrmvkm.supabase.co", "mock-anon", { global: { headers: { Authorization: "Bearer synthetic-actor" } } });
});
it("baseline really issues a bearer signature for the same actor input", async () => {
  const h = harness("", baseline); const response = await h.invoke(); expect((await response.json()).url).toBe("https://bearer.invalid"); expect(h.sign).toHaveBeenCalledTimes(1);
});
it.each(["auth", "tenant", "financial_receipts", "clientes", "upload", "update"])("candidate denies %s without URL or raw errors", async failure => {
  const h = harness(failure); const response = await h.invoke(); expect(response.status).toBe(failure === "auth" ? 401 : failure === "tenant" ? 403 : 500);
  const body = await response.json(); expect(body).not.toHaveProperty("url"); expect(body).not.toHaveProperty("path"); expect(JSON.stringify(body)).not.toContain("sensitive-transport"); expect(h.sign).not.toHaveBeenCalled();
});
it("invalid body and foreign origin are denied before resource queries", async () => {
  const h = harness(); expect((await h.invoke({ receipt_id: "invalid" })).status).toBe(400); expect(h.upload).not.toHaveBeenCalled();
  expect((await h.invoke({ receipt_id: id }, "https://foreign.invalid")).status).toBe(403); expect(h.upload).not.toHaveBeenCalled();
});