import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { Blob as NodeBlob } from "node:buffer";

// Executa a CANDIDATA revisável (não implantada) com SDK simulado. Não é homologação real.
const CANDIDATE = "scripts/fiscal-xml-download-blob-20261021/edge/index.ts.review";
const src = readFileSync(CANDIDATE, "utf8");
const code = ts.transpileModule(src.replace(/^import[\s\S]*?;\s*/gm, "").replace(/^export /gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

const RUN = "22222222-2222-4222-8222-222222222222";
const XML = "<NFe>assinado</NFe>";
const SHA = createHash("sha256").update(XML).digest("hex");
type Opt = { operate?: boolean[]; visible?: boolean[]; owner?: boolean[]; bucket?: string; sha?: string; size?: number; dlError?: boolean; hang?: boolean; pathChange?: boolean; hangRpcCall?: number };

function setup(o: Opt = {}) {
  let handler: ((r: Request) => Promise<Response>) | undefined;
  const seq = (arr: boolean[] | undefined) => { let i = 0; return () => (arr ? arr[Math.min(i++, arr.length - 1)] : true); };
  const operate = seq(o.operate), visible = seq(o.visible), owner = seq(o.owner);
  let reads = 0;
  const sign = vi.fn(() => { throw new Error("sign_must_not_run"); });
  const download = vi.fn((_p: string, _o: unknown, p: { signal: AbortSignal }) => o.hang
    ? new Promise((_r, rej) => p.signal.addEventListener("abort", () => rej(new Error("aborted"))))
    : Promise.resolve(o.dlError ? { data: null, error: new Error("x") }
      : { data: o.size ? { size: o.size, arrayBuffer: async () => new ArrayBuffer(0) } : new NodeBlob([XML]), error: null }));
  const from = () => { const q: Record<string, unknown> = {}; for (const k of ["select", "eq"]) q[k] = () => q;
    q.maybeSingle = async () => { reads++; return visible() ? { data: { id: RUN, signed_path: o.pathChange && reads > 1 ? "OA/other.xml" : "OA/a.xml",
      unsigned_path: "OA/u.xml", storage_bucket: o.bucket ?? "fiscal-xml", signed_sha256: o.sha ?? SHA, unsigned_sha256: SHA, signed_bytes: XML.length, unsigned_bytes: XML.length }, error: null } : { data: null, error: null }; };
    return q; };
  let rpcCalls = 0;
  const rpc = vi.fn((n: string) => { rpcCalls++;
    if (o.hangRpcCall === rpcCalls) return new Promise(() => {}); // nunca resolve, ignora abort
    return Promise.resolve({ data: n === "fn_fiscal_can_operate" ? operate() : owner(), error: null }); });
  const sdk = { from, rpc, auth: { getClaims: async () => ({ data: { claims: { sub: "A" } } }) },
    storage: { from: vi.fn(() => ({ download, createSignedUrl: sign, createSignedUrls: sign })) } };
  const Deno = { env: { get: (k: string) => k === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : "placeholder" }, serve: (h: typeof handler) => { handler = h; } };
  const stub = () => { throw new Error("not_in_download"); };
  new Function("Deno", "createClient", "fiscalCorsHeaders", "isCanonicalSupabaseUrl", "CANONICAL_SUPABASE_URL", "XSD_FILE_COUNT",
    "inspectOfficialXsdBundle", "validateAgainstOfficialXsd", "isAlreadyExistingObject", "verifyExistingObject", code)(
    Deno, () => sdk, () => ({ allowed: true, headers: {} }), () => true, "https://swzpzcwiasxmjutrmvkm.supabase.co", 5, stub, stub, stub, stub);
  const invoke = (body: unknown, signal?: AbortSignal) => handler!(new Request("https://isolated.invalid", { method: "POST", signal,
    headers: { Authorization: "Bearer placeholder", Origin: "https://app.cultivofarm.com.br" }, body: JSON.stringify(body) }));
  return { invoke, download, sign, rpc };
}
const body = { action: "download", run_id: RUN, artifact: "signed" };

it("ator autorizado recebe bytes conferidos, no-store, sem URL e sem assinar", async () => {
  const s = setup();
  const r = await s.invoke(body);
  expect(r.status).toBe(200);
  expect(r.headers.get("Content-Type")).toBe("application/octet-stream");
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  const text = await r.text();
  expect(text).toBe(XML); expect(text).not.toMatch(/https?:|token=/);
  expect(s.sign).not.toHaveBeenCalled();
  expect(s.rpc.mock.calls.filter(c => c[0] === "h15_service_actor_run_access")).toHaveLength(2);
});
for (const [name, o] of [["sem perfil fiscal", { operate: [false] }], ["RLS invisível (tenant B)", { visible: [false] }], ["sem ownership h15", { owner: [false] }], ["bucket fora do canônico", { bucket: "outro" }]] as const) {
  it(`nega antes do Storage: ${name}`, async () => {
    const s = setup(o as Opt);
    const r = await s.invoke(body);
    expect(r.status).toBe(403); await r.text();
    expect(s.download).not.toHaveBeenCalled(); expect(s.sign).not.toHaveBeenCalled();
  });
}
for (const [name, o] of [["perfil revogado durante leitura", { operate: [true, true, false] }], ["visibilidade revogada", { visible: [true, false] }], ["ownership revogado", { owner: [true, false] }], ["path trocado", { pathChange: true }]] as const) {
  it(`recheck após bytes nega entrega: ${name}`, async () => {
    const s = setup(o as Opt);
    const r = await s.invoke(body);
    expect(r.status).toBe(403); expect(await r.text()).not.toContain("NFe");
    expect(s.download).toHaveBeenCalledTimes(1);
  });
}
it("integridade divergente, tamanho excessivo e falha do Storage não entregam bytes", async () => {
  for (const [o, status] of [[{ sha: "f".repeat(64) }, 409], [{ size: 10 * 1024 * 1024 + 1 }, 413], [{ dlError: true }, 404]] as const) {
    const r = await setup(o as Opt).invoke(body);
    expect(r.status).toBe(status); expect(await r.text()).not.toContain("NFe");
  }
});
it("entradas inválidas são recusadas", async () => {
  const s = setup();
  expect((await s.invoke({ ...body, run_id: "x" })).status).toBe(400);
  expect((await s.invoke({ ...body, artifact: "pdf" })).status).toBe(400);
  expect(s.download).not.toHaveBeenCalled();
});
it("abort do cliente durante leitura encerra sem bytes", async () => {
  const s = setup({ hang: true });
  const a = new AbortController();
  const p = s.invoke(body, a.signal);
  await vi.waitFor(() => expect(s.download).toHaveBeenCalled());
  a.abort();
  const r = await p;
  expect(r.status).toBe(504); expect(await r.text()).not.toContain("NFe");
});
it("candidata preserva generate/assinatura XML e remove apenas a URL assinada", () => {
  const base = readFileSync("supabase/functions/fiscal-xml-engine/index.ts", "utf8");
  expect(src).not.toContain("createSignedUrl");
  expect(base).toContain("createSignedUrl(path, 120)");
  const tail = (s: string) => s.slice(s.indexOf('if (action !== "generate")'));
  expect(tail(src)).toBe(tail(base));
});
it("RPC de autorização pendurada após outer fn_fiscal respeita prazo absoluto 15 s, sem retry", async () => {
  vi.useFakeTimers();
  try {
    const s = setup({ hangRpcCall: 2 }); // 1 = outer fn_fiscal, 2 = primeiro authorize
    let done: Response | undefined;
    const p = s.invoke(body).then((r) => (done = r));
    await vi.advanceTimersByTimeAsync(14_999);
    expect(done).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(done!.status).toBe(504); expect(await done!.text()).not.toContain("NFe");
    expect(s.download).not.toHaveBeenCalled();
    expect(s.rpc).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});
it("RPC pendurada no recheck fresco após bytes também expira em 504 sem entrega", async () => {
  vi.useFakeTimers();
  try {
    const s = setup({ hangRpcCall: 4 }); // outer, authorize(op, owner), fresh op
    const p = s.invoke(body);
    await vi.advanceTimersByTimeAsync(15_001);
    const r = await p;
    expect(r.status).toBe(504); expect(await r.text()).not.toContain("NFe");
    expect(s.download).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
it("pedido já abortado antes do handler não chama Storage e responde 504", async () => {
  const s = setup();
  const a = new AbortController(); a.abort();
  const r = await s.invoke(body, a.signal);
  expect(r.status).toBe(504); expect(await r.text()).not.toContain("NFe");
  expect(s.download).not.toHaveBeenCalled(); expect(s.sign).not.toHaveBeenCalled();
});
