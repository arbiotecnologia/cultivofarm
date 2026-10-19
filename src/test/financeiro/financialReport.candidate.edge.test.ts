import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { execFileSync } from "node:child_process";
import * as XLSX from "xlsx";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../../../supabase/functions/_shared/comunicacao/cors";

// Reviewed CANDIDATE entrypoint (not deployed); SDK/env/PDF mocked, XLSX serializes and reads real local bytes. No network.
const source = readFileSync("scripts/financial-report-locator/edge/candidate.index.ts", "utf8")
  .replace(/^import .*;\s*/gm, "").replace(/^export /gm, "");
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const sentinel = "private-error-path-sentinel";
const org = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const auditId = "33333333-3333-4333-8333-333333333333";
type Failure = "auth" | "noUser" | "org" | "noOrg" | "rpc" | "upload" | "noUploadData" | "noUploadPath" | "wrongUploadPath" | "sign" | "noUrl" | "audit" | "noId";
type Result = { data?: unknown; error: unknown };
function deferred() {
  let resolve: (value: Result) => void = () => {};
  const promise = new Promise<Result>((done) => { resolve = done; });
  return { promise, resolve };
}
function setup(failure?: Failure, auditPending?: ReturnType<typeof deferred>, throws?: string, options: { rows?: unknown[]; fontFailure?: boolean; pdfBytes?: Uint8Array; xlsxBytes?: Uint8Array } = {}) {
  const effects: string[] = [];
  const rpc = vi.fn(async (name: string, _args?: Record<string, unknown>) => {
    effects.push(name); if (throws === name) throw new Error(sentinel);
    if (name === "h15_actor_organization") return { data: failure === "noOrg" ? null : org, error: failure === "org" ? sentinel : null };
    if (name === "register_financial_report_export") return auditPending?.promise ?? { data: failure === "noId" ? null : auditId, error: failure === "audit" ? sentinel : null };
    return { data: options.rows ?? [{ amount: 40 }], error: failure === "rpc" ? sentinel : null };
  });
  const upload = vi.fn(async (path: string, _bytes: Uint8Array) => {
    effects.push("upload"); if (throws === "upload") throw new Error(sentinel);
    return {
      data: failure === "noUploadData" ? null : failure === "noUploadPath" ? {} : { path: failure === "wrongUploadPath" ? "different-private-path" : path },
      error: failure === "upload" ? sentinel : null,
    };
  });
  const createSignedUrl = vi.fn(async () => {
    effects.push("sign"); if (throws === "sign") throw new Error(sentinel);
    return { data: failure === "noUrl" ? {} : { signedUrl: "signed-file-fixture" }, error: failure === "sign" ? sentinel : null };
  });
  const remove = vi.fn();
  const getUser = vi.fn(async () => {
    effects.push("auth"); if (throws === "auth") throw new Error(sentinel);
    return { data: { user: failure === "noUser" ? null : { id: actor } }, error: failure === "auth" ? sentinel : null };
  });
  const createClient = vi.fn(() => ({ auth: { getUser }, rpc, storage: { from: vi.fn(() => ({ upload, createSignedUrl, remove })) } }));
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const env = vi.fn((name: string): string | undefined => name === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : name === "SUPABASE_ANON_KEY" ? "mock-public-key" : undefined);
  const deno = { env: { get: env }, serve: (fn: typeof handler) => { handler = fn; } };
  const log = vi.fn();
  const pages: Array<{ drawText: ReturnType<typeof vi.fn> }> = [];
  const widthOfTextAtSize = vi.fn((text: string, size: number) => {
    if (options.fontFailure || text.includes("🧪")) throw new Error(sentinel);
    return [...text].reduce((width, char) => width + (char === "W" ? size : size / 2), 0);
  });
  const PDFDocument = { create: async () => ({
    embedFont: async () => ({ widthOfTextAtSize }),
    addPage: () => { const page = { drawText: vi.fn() }; pages.push(page); return page; },
    save: async () => options.pdfBytes ?? new Uint8Array([1]),
  }) };
  const spreadsheet = options.xlsxBytes ? { ...XLSX, write: () => options.xlsxBytes } : XLSX;
  new Function("Deno", "createClient", "PDFDocument", "StandardFonts", "rgb", "XLSX", "corsHeadersFor", "handlePreflight", "isTrustedOrigin", "console", javascript)(
    deno, createClient, PDFDocument, { Helvetica: "font", HelveticaBold: "bold" }, () => ({}), spreadsheet, corsHeadersFor, handlePreflight, isTrustedOrigin, { error: log, log, warn: log },
  );
  if (!handler) throw new Error("handler_not_registered");
  const invoke = (body: unknown = {}, method = "POST", origin = "https://app.cultivofarm.com.br", raw?: string) => handler(new Request("https://isolated.invalid", {
    method, headers: { Origin: origin, Authorization: "Bearer mock-caller", "Content-Type": "application/json" },
    ...(method === "GET" || method === "OPTIONS" ? {} : { body: raw ?? JSON.stringify(body) }),
  }));
  return { invoke, rpc, upload, createSignedUrl, remove, effects, createClient, env, log, pages, widthOfTextAtSize };
}
const valid = { report_type: "monthly", filters: { _from: "2026-10-01", _to: "2026-10-09" }, format: "CSV", title: "Mensal" };
async function failureResponse(response: Response, status: number) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(body).not.toHaveProperty("url"); expect(body).not.toHaveProperty("path");
  expect(JSON.stringify(body)).not.toContain(sentinel);
  expect(JSON.stringify(body)).not.toContain(org);
  expect(JSON.stringify(body)).not.toContain("signed-file-fixture");
}

const live = readFileSync("supabase/functions/generate-financial-report/index.ts", "utf8");
const candidate = readFileSync("scripts/financial-report-locator/edge/candidate.index.ts", "utf8");
describe("generate-financial-report CANDIDATE — no signature, private locator", () => {
  it("source delta vs repo baseline is only the signing block and the response", () => {
    expect(candidate).not.toMatch(/createSignedUrl|signedUrl|getPublicUrl/);
    const signStart = live.indexOf("    // Keep the signed URL private in memory");
    const signEnd = live.indexOf("    const { data: exportId");
    expect(signStart).toBeGreaterThan(0); expect(signEnd).toBeGreaterThan(signStart);
    const expected = (live.slice(0, signStart) + candidate.slice(signStart, candidate.indexOf("    const { data: exportId")) + live.slice(signEnd))
      .replace("JSON.stringify({ url: signed?.signedUrl, path, row_count: rows.length })", 'JSON.stringify({ bucket: "financial-reports", path, export_id: exportId, row_count: rows.length })');
    expect(candidate).toBe(expected);
    const inserted = candidate.slice(signStart, candidate.indexOf("    const { data: exportId")).split("\n").filter((l) => l.trim());
    expect(inserted.every((l) => l.trim().startsWith("//"))).toBe(true);
  });
  it.each(["PDF", "XLSX", "CSV"])("%s success returns {bucket,path,export_id,row_count} after upload+audit, never signs", async (format) => {
    const s = setup(); const response = await s.invoke({ ...valid, format }); expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["bucket", "export_id", "path", "row_count"]);
    expect(body).toMatchObject({ bucket: "financial-reports", export_id: auditId, row_count: 1 });
    expect(body.path).toMatch(new RegExp(`^${org}/${actor}/monthly_\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z\\.${format.toLowerCase()}$`));
    expect(body).not.toHaveProperty("url"); expect(s.createSignedUrl).not.toHaveBeenCalled();
    expect(s.effects).toEqual(["auth", "h15_actor_organization", "get_report_monthly_financial", "upload", "register_financial_report_export"]);
    expect(s.createClient).toHaveBeenCalledWith("https://swzpzcwiasxmjutrmvkm.supabase.co", "mock-public-key", { global: { headers: { Authorization: "Bearer mock-caller" } } });
    expect(s.env).not.toHaveBeenCalledWith("SUPABASE_SERVICE_ROLE_KEY"); expect(s.remove).not.toHaveBeenCalled();
  });
  for (const failure of ["auth", "noUser", "org", "noOrg", "rpc", "upload", "noUploadData", "noUploadPath", "wrongUploadPath", "audit", "noId"] as const) {
    it(`denied generation ${failure}: no locator, sanitized, no cleanup`, async () => {
      const s = setup(failure);
      await failureResponse(await s.invoke(valid), ["auth", "noUser"].includes(failure) ? 401 : ["org", "noOrg"].includes(failure) ? 403 : 500);
      expect(s.createSignedUrl).not.toHaveBeenCalled(); expect(s.remove).not.toHaveBeenCalled(); expect(s.log).not.toHaveBeenCalled();
    });
  }
  it("does not return the locator while audit is pending", async () => {
    const pending = deferred(), s = setup(undefined, pending); let returned = false;
    const response = s.invoke(valid).then((r) => { returned = true; return r; });
    await vi.waitFor(() => expect(s.effects).toContain("register_financial_report_export"));
    expect(returned).toBe(false);
    pending.resolve({ data: auditId, error: null }); expect((await (await response).json()).path).toContain(`${org}/${actor}/`);
  });
});
