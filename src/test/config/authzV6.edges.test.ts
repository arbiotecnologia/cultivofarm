import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Blob as NodeBlob } from "node:buffer";
import ts from "typescript";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../../../supabase/functions/_shared/comunicacao/cors";

function js(path: string): string {
  const source = readFileSync(path, "utf8").replace(/^import[\s\S]*?;\s*/gm, "").replace(/^export /gm, "");
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
}
const helper = js("scripts/authz-cache/v6/edges/serve-verified-attachment.ts.review");
type Handler = (req: Request) => Promise<Response>;
const org = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
function setup(name: string, denied = false, stale = false) {
  let handler: Handler | undefined;
  const download = vi.fn(async () => ({ data: new NodeBlob(["authenticated-bytes"]), error: null }));
  const sign = vi.fn(() => { throw new Error("sign_must_not_run"); });
  const path = `${org}/artifact.xml`;
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    for (const method of ["select", "eq", "limit"]) q[method] = vi.fn(() => q);
    q.maybeSingle = vi.fn(async () => ({ data: denied ? null : {
      id: runId, unsigned_path: path, signed_path: path, storage_bucket: "fiscal-xml",
      status: "assinado", assinado_em: "2026-10-17", pdf_path: path,
    }, error: null }));
    return q;
  });
  let contextReads = 0;
  const rpc = vi.fn(async (name: string) => {
    if (name === "h15_actor_organization") return { data: stale && ++contextReads > 1 ? "OTHER" : org, error: null };
    if (name === "register_financial_report_export") return { data: runId, error: null };
    if (name === "get_report_monthly_financial") return { data: [{ value: 2 }], error: null };
    return { data: !denied, error: null };
  });
  const sdk = { from, rpc, auth: {
    getUser: async () => ({ data: { user: { id: runId } }, error: null }),
    getClaims: async () => ({ data: { claims: { sub: runId } }, error: null }),
  }, storage: { from: vi.fn(() => ({ download, createSignedUrl: sign,
    upload: async (p: string) => ({ data: { path: p }, error: null }),
  })) } };
  const createClient = vi.fn(() => sdk);
  const Deno = { env: { get: (key: string) => key === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : "isolated-placeholder" },
    serve: (h: Handler) => { handler = h; } };
  const code = `${helper}\n${js(`scripts/authz-cache/v6/edges/${name}.index.ts.review`)}`;
  new Function("Deno", "createClient", "corsHeadersFor", "handlePreflight", "isTrustedOrigin", "fiscalCorsHeaders",
    "isCanonicalSupabaseUrl", "CANONICAL_SUPABASE_URL", "XSD_FILE_COUNT", "XSD_PACKAGE", "XSD_VALIDATOR", code)(
    Deno, createClient, corsHeadersFor, handlePreflight, isTrustedOrigin,
    () => ({ allowed: true, headers: {} }), () => true, "https://swzpzcwiasxmjutrmvkm.supabase.co", 5, "local", "local",
  );
  if (!handler) throw new Error("handler_missing");
  const invoke = (body: unknown) => handler(new Request("https://isolated.invalid", {
    method: "POST", headers: { Authorization: "Bearer isolated-placeholder", Origin: "https://app.cultivofarm.com.br" }, body: JSON.stringify(body),
  }));
  return { invoke, download, sign, createClient, rpc };
}
it("actual fiscal candidate serves caller bytes, retains both canonical guards and never signs", async () => {
  const s = setup("fiscal-xml-engine");
  const response = await s.invoke({ action: "download", run_id: runId, artifact: "signed" });
  expect(response.status).toBe(200); expect(await response.text()).toBe("authenticated-bytes");
  expect(s.rpc).toHaveBeenCalledWith("fn_fiscal_can_operate", { _uid: runId });
  expect(s.rpc).toHaveBeenCalledWith("h15_service_actor_run_access", { p_actor: runId, p_run: runId });
  expect(s.sign).not.toHaveBeenCalled();
});
it("actual fiscal candidate denies cross-scope before Storage", async () => {
  const s = setup("fiscal-xml-engine", true);
  expect((await s.invoke({ action: "download", run_id: runId })).status).toBe(403);
  expect(s.download).not.toHaveBeenCalled(); expect(s.sign).not.toHaveBeenCalled();
});
it("old entrega signed_url request gets 410 without admin or Storage signer", async () => {
  const s = setup("entrega-termo-pdf");
  expect((await s.invoke({ action: "signed_url", termo_id: runId })).status).toBe(410);
  expect(s.createClient).toHaveBeenCalledTimes(1); expect(s.download).not.toHaveBeenCalled(); expect(s.sign).not.toHaveBeenCalled();
});
it("old report payload still generates/registers but returns authenticated binary, no bearer URL", async () => {
  const s = setup("generate-financial-report");
  const response = await s.invoke({ report_type: "monthly", format: "CSV", filters: {} });
  expect(response.status).toBe(200); expect(await response.text()).toBe("authenticated-bytes");
  expect(s.rpc).toHaveBeenCalledWith("register_financial_report_export", expect.objectContaining({ p_status: "SUCCESS" }));
  expect(s.sign).not.toHaveBeenCalled();
});
it("report identity change after generation denies binary result", async () => {
  const s = setup("generate-financial-report", false, true);
  expect((await s.invoke({ report_type: "monthly", format: "CSV", filters: {} })).status).toBe(403);
  expect(s.download).not.toHaveBeenCalled(); expect(s.sign).not.toHaveBeenCalled();
});