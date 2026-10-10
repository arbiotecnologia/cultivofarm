import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../../../supabase/functions/_shared/comunicacao/cors";

// Real entrypoint; SDK, env and renderers injected locally. No network or Storage bytes.
const source = readFileSync("supabase/functions/generate-financial-report/index.ts", "utf8")
  .replace(/^import .*;\s*/gm, "").replace(/^export /gm, "");
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const sentinel = "private-error-path-sentinel";
const org = "11111111-1111-4111-8111-111111111111";
const actor = "22222222-2222-4222-8222-222222222222";
const auditId = "33333333-3333-4333-8333-333333333333";
type Failure = "auth" | "noUser" | "org" | "noOrg" | "rpc" | "upload" | "sign" | "noUrl" | "audit" | "noId";
type Result = { data?: unknown; error: unknown };
function deferred() {
  let resolve: (value: Result) => void = () => {};
  const promise = new Promise<Result>((done) => { resolve = done; });
  return { promise, resolve };
}
function setup(failure?: Failure, auditPending?: ReturnType<typeof deferred>, throws?: string) {
  const effects: string[] = [];
  const rpc = vi.fn(async (name: string) => {
    effects.push(name); if (throws === name) throw new Error(sentinel);
    if (name === "h15_actor_organization") return { data: failure === "noOrg" ? null : org, error: failure === "org" ? sentinel : null };
    if (name === "register_financial_report_export") return auditPending?.promise ?? { data: failure === "noId" ? null : auditId, error: failure === "audit" ? sentinel : null };
    return { data: [{ amount: 40 }], error: failure === "rpc" ? sentinel : null };
  });
  const upload = vi.fn(async () => { effects.push("upload"); if (throws === "upload") throw new Error(sentinel); return { error: failure === "upload" ? sentinel : null }; });
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
  const env = vi.fn((name: string) => name === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : name === "SUPABASE_ANON_KEY" ? "mock-public-key" : undefined);
  const deno = { env: { get: env }, serve: (fn: typeof handler) => { handler = fn; } };
  const log = vi.fn();
  const page = { drawText: vi.fn() };
  const PDFDocument = { create: async () => ({ embedFont: async () => ({}), addPage: () => page, save: async () => new Uint8Array([1]) }) };
  const XLSX = { utils: { json_to_sheet: vi.fn(), book_new: vi.fn(), book_append_sheet: vi.fn() }, write: () => [1] };
  new Function("Deno", "createClient", "PDFDocument", "StandardFonts", "rgb", "XLSX", "corsHeadersFor", "handlePreflight", "isTrustedOrigin", "console", javascript)(
    deno, createClient, PDFDocument, { Helvetica: "font", HelveticaBold: "bold" }, () => ({}), XLSX, corsHeadersFor, handlePreflight, isTrustedOrigin, { error: log, log, warn: log },
  );
  if (!handler) throw new Error("handler_not_registered");
  const invoke = (body: unknown = {}, method = "POST", origin = "https://app.cultivofarm.com.br", raw?: string) => handler(new Request("https://isolated.invalid", {
    method, headers: { Origin: origin, Authorization: "Bearer mock-caller", "Content-Type": "application/json" },
    ...(method === "GET" || method === "OPTIONS" ? {} : { body: raw ?? JSON.stringify(body) }),
  }));
  return { invoke, rpc, upload, createSignedUrl, remove, effects, createClient, env, log };
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
describe("generate-financial-report — handler real isolado", () => {
  for (const failure of ["auth", "noUser", "org", "noOrg", "rpc", "upload", "sign", "noUrl", "audit", "noId"] as const) {
    it(`nega sucesso em ${failure} e interrompe efeitos`, async () => {
      const s = setup(failure); await failureResponse(await s.invoke(valid), ["auth", "noUser"].includes(failure) ? 401 : ["org", "noOrg"].includes(failure) ? 403 : 500);
      expect(s.remove).not.toHaveBeenCalled();
      if (["auth", "noUser", "org", "noOrg", "rpc"].includes(failure)) expect(s.upload).not.toHaveBeenCalled();
      if (failure === "upload") expect(s.createSignedUrl).not.toHaveBeenCalled();
      if (["sign", "noUrl"].includes(failure)) expect(s.rpc.mock.calls.some(([name]) => name === "register_financial_report_export")).toBe(false);
      expect(s.log).not.toHaveBeenCalled();
    });
  }
  for (const stage of ["auth", "h15_actor_organization", "get_report_monthly_financial", "upload", "sign", "register_financial_report_export"]) {
    it(`sanitiza exceção em ${stage}`, async () => {
      const s = setup(undefined, undefined, stage); await failureResponse(await s.invoke(valid), 500); expect(s.remove).not.toHaveBeenCalled();
    });
  }
  it.each(["GET", "PUT", "DELETE"])("rejeita método %s antes de efeitos", async (method) => {
    const s = setup(); await failureResponse(await s.invoke(valid, method), 405); expect(s.createClient).not.toHaveBeenCalled();
  });
  const invalid: unknown[] = [null, [], "text", 42, {}, { ...valid, filters: [] }, { ...valid, filters: null },
    { ...valid, filters: "text" }, { ...valid, title: 42 }, { ...valid, title: "x".repeat(256) },
    ...["pdf", "csv", "TXT", "", null, 42].map((format) => ({ ...valid, format })),
    ...["constructor", "toString", "__proto__", "unknown", null, 42].map((report_type) => ({ ...valid, report_type })),
    ...["organization_id", "tenant_id"].flatMap((key) => [{ ...valid, [key]: org }, { ...valid, filters: { ...valid.filters, [key]: org } }]),
  ];
  it.each(invalid.map((body, index) => ({ body, index })))("rejeita payload $index antes RPC/Storage", async ({ body }) => {
    const s = setup(); await failureResponse(await s.invoke(body), 400); expect(s.rpc).not.toHaveBeenCalled(); expect(s.upload).not.toHaveBeenCalled();
  });
  it("JSON malformado retorna400 sem efeitos", async () => {
    const s = setup(); await failureResponse(await s.invoke(valid, "POST", undefined, "{"), 400); expect(s.rpc).not.toHaveBeenCalled();
  });
  it("preserva CORS confiável e bloqueia origem estranha/preflight", async () => {
    const s = setup(); const preflight = await s.invoke({}, "OPTIONS"); expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("https://app.cultivofarm.com.br");
    await preflight.text();
    const denied = await s.invoke(valid, "POST", "https://foreign.invalid"); await failureResponse(denied, 403);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull(); expect(s.createClient).not.toHaveBeenCalled();
  });
  it.each(["PDF", "XLSX", "CSV"])("sucesso %s somente após upload/assinatura/audit e usa caller", async (format) => {
    const s = setup(); const response = await s.invoke({ ...valid, format }); expect(response.status).toBe(200);
    expect((await response.json()).url).toBe("signed-file-fixture");
    expect(s.effects).toEqual(["auth", "h15_actor_organization", "get_report_monthly_financial", "upload", "sign", "register_financial_report_export"]);
    expect(s.createClient).toHaveBeenCalledWith("https://swzpzcwiasxmjutrmvkm.supabase.co", "mock-public-key", { global: { headers: { Authorization: "Bearer mock-caller" } } });
    expect(s.rpc).toHaveBeenNthCalledWith(2, "get_report_monthly_financial", valid.filters);
    expect(s.rpc.mock.calls[2][1]).toMatchObject({ p_status: "SUCCESS", p_filters: valid.filters });
    expect(s.env).not.toHaveBeenCalledWith("SUPABASE_SERVICE_ROLE_KEY"); expect(s.remove).not.toHaveBeenCalled();
  });
  it("não devolve URL enquanto auditoria está pendente", async () => {
    const pending = deferred(), s = setup(undefined, pending); let returned = false;
    const response = s.invoke(valid).then((r) => { returned = true; return r; });
    await vi.waitFor(() => expect(s.effects).toContain("register_financial_report_export"));
    expect(returned).toBe(false); expect(s.effects.indexOf("sign")).toBeLessThan(s.effects.indexOf("register_financial_report_export"));
    pending.resolve({ data: auditId, error: null }); expect((await (await response).json()).url).toBe("signed-file-fixture");
  });
});