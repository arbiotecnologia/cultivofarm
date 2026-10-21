import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { TextDecoder } from "node:util";
import { ReadableStream } from "node:stream/web";

// Executa a CANDIDATA revisável (não implantada) com SDK simulado. Não é homologação real.
const CANDIDATE = "scripts/fiscal-xml-download-blob-20261021/edge/index.ts.review";
const src = readFileSync(CANDIDATE, "utf8");
const code = ts.transpileModule(src.replace(/^import[\s\S]*?;\s*/gm, "").replace(/^export /gm, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

const RUN = "22222222-2222-4222-8222-222222222222";
const XML = "<NFe>assinado</NFe>";
const SHA = createHash("sha256").update(XML).digest("hex");
type Opt = { operate?: boolean[]; visible?: boolean[]; owner?: boolean[]; bucket?: string; sha?: string; size?: number; dlError?: boolean; hang?: boolean; pathChange?: boolean; hangRpcCall?: number; hangClaims?: boolean; actor?: string; freshSize?: number; querySignals?: boolean; claimsDelay?: number; metadata?: number | null; chunks?: Uint8Array[]; length?: string; streamHang?: boolean };

function setup(o: Opt = {}, executable = code) {
  let handler: ((r: Request) => Promise<Response>) | undefined;
  const seq = (arr: boolean[] | undefined) => { let i = 0; return () => (arr ? arr[Math.min(i++, arr.length - 1)] : true); };
  const operate = seq(o.operate), visible = seq(o.visible), owner = seq(o.owner);
  let reads = 0;
  const sign = vi.fn(() => { throw new Error("sign_must_not_run"); });
  const cancel = vi.fn();
  const download = vi.fn((_p: string, _o: unknown, p: { signal: AbortSignal }) => {
    const streamResult = () => o.hang
      ? new Promise((_r, rej) => p.signal.addEventListener("abort", () => rej(new Error("aborted"))))
      : Promise.resolve(o.dlError ? { data: null, error: new Error("x") } : {
        data: new ReadableStream<Uint8Array>({
          start(c) {
            const chunks = o.chunks ?? (o.size ? [new Uint8Array(o.size)] : [new TextEncoder().encode(XML)]);
            for (const chunk of chunks) c.enqueue(chunk);
            if (!o.streamHang) c.close();
          }, cancel,
        }), error: null,
      });
    // Only stream mode is accepted by this harness; Blob mode fails explicitly.
    return { asStream: streamResult };
  });
  const signals: AbortSignal[] = [];
  const from = () => { const q: Record<string, unknown> = {}; for (const k of ["select", "eq"]) q[k] = () => q;
    q.maybeSingle = async () => { reads++; return visible() ? { data: { id: RUN, signed_path: o.pathChange && reads > 1 ? "OA/other.xml" : "OA/a.xml",
      unsigned_path: "OA/u.xml", storage_bucket: o.bucket ?? "fiscal-xml", signed_sha256: o.sha ?? SHA, unsigned_sha256: SHA, signed_bytes: reads > 1 && o.freshSize !== undefined ? o.freshSize : o.metadata !== undefined ? o.metadata : XML.length, unsigned_bytes: XML.length }, error: null } : { data: null, error: null }; };
    q.abortSignal = (signal: AbortSignal) => { signals.push(signal); return q; };
    return q; };
  let rpcCalls = 0;
  const rpc = vi.fn((n: string) => { rpcCalls++;
    const promise = o.hangRpcCall === rpcCalls ? new Promise(() => {}) : Promise.resolve({ data: n === "fn_fiscal_can_operate" ? operate() : owner(), error: null });
    return Object.assign(promise, { abortSignal: (signal: AbortSignal) => { signals.push(signal); return promise; } }); });
  const sdk = { from, rpc, auth: { getClaims: () => o.hangClaims ? new Promise(() => {}) : new Promise(r => { const value = { data: { claims: { sub: o.actor ?? "A" } } }; if (o.claimsDelay) setTimeout(() => r(value), o.claimsDelay); else r(value); }) },
    storage: { from: vi.fn(() => ({ download, createSignedUrl: sign, createSignedUrls: sign })) } };
  const Deno = { env: { get: (k: string) => k === "SUPABASE_URL" ? "https://swzpzcwiasxmjutrmvkm.supabase.co" : "placeholder" }, serve: (h: typeof handler) => { handler = h; } };
  const stub = () => { throw new Error("not_in_download"); };
  new Function("Deno", "createClient", "fiscalCorsHeaders", "isCanonicalSupabaseUrl", "CANONICAL_SUPABASE_URL", "XSD_FILE_COUNT",
    "inspectOfficialXsdBundle", "validateAgainstOfficialXsd", "isAlreadyExistingObject", "verifyExistingObject", "ReadableStream", "TextDecoder", executable)(
    Deno, () => sdk, () => ({ allowed: true, headers: {} }), () => true, "https://swzpzcwiasxmjutrmvkm.supabase.co", 5, stub, stub, stub, stub, ReadableStream, TextDecoder);
  const invokeRequest = (request: Request) => { if (!handler) throw new Error("handler_missing"); return handler(request); };
  const invoke = (body: unknown, signal?: AbortSignal) => invokeRequest(new Request("https://isolated.invalid", { method: "POST", signal,
    headers: { Authorization: "Bearer placeholder", Origin: "https://app.cultivofarm.com.br" }, body: JSON.stringify(body) }));
  return { invoke, invokeRequest, download, cancel, sign, rpc, signals };
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
    expect(done?.status).toBe(504); expect(await done?.text()).not.toContain("NFe");
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

for (const [name, o] of [["claims iniciais", { hangClaims: true }], ["primeira RPC fiscal", { hangRpcCall: 1 }]] as const) {
  it(`${name} travada expira desde entrada sem Storage nem retry`, async () => {
    vi.useFakeTimers();
    try {
      const s = setup(o);
      let done: Response | undefined;
      const p = s.invoke(body).then(r => { done = r; });
      await vi.advanceTimersByTimeAsync(15_001);
      expect(done?.status).toBe(504);
      expect(s.download).not.toHaveBeenCalled();
      expect(s.rpc.mock.calls.length).toBeLessThanOrEqual(1);
      if (done) expect(await done.text()).not.toContain("NFe");
      // Do not await an unresolved baseline promise: failed expectation is reproduction.
      if (done) await p;
    } finally { vi.useRealTimers(); }
  });
}

it("claims lentas consomem o prazo de entrada, não iniciam novo prazo para RPC", async () => {
  vi.useFakeTimers();
  try {
    const s = setup({ claimsDelay: 8000, hangRpcCall: 1 });
    let result: Response | undefined;
    const p = s.invoke(body).then(r => { result = r; });
    await vi.advanceTimersByTimeAsync(14_999); expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2); expect(result?.status).toBe(504); await p;
    expect(s.signals.length).toBe(1); expect(s.signals[0].aborted).toBe(true);
    expect(s.download).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
it("recheck com tamanho registrado alterado nega bytes antigos", async () => {
  const s = setup({ freshSize: XML.length + 1 });
  expect((await s.invoke(body)).status).toBe(403);
  expect(s.download).toHaveBeenCalledTimes(1);
});
for (const actor of ["A", "B"]) {
  it(`ator sintético ${actor} recebe somente artefato autorizado e propaga sinais SDK`, async () => {
    const s = setup({ actor });
    expect((await s.invoke(body)).status).toBe(200);
    expect(s.rpc).toHaveBeenCalledWith("h15_service_actor_run_access", { p_actor: actor, p_run: RUN });
    expect(s.signals.length).toBe(7); expect(s.sign).not.toHaveBeenCalled();
  });
}

it("rollback deny executável retorna 410 no-store sem consulta ou Storage", async () => {
  const rollback = readFileSync("scripts/fiscal-xml-download-blob-20261021/edge/rollback-deny.index.ts.review", "utf8");
  const executable = ts.transpileModule(rollback.replace(/^import[\s\S]*?;\s*/gm, "").replace(/^export /gm, ""),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const s = setup({}, executable);
  const r = await s.invoke(body);
  expect(r.status).toBe(410); expect(r.headers.get("Cache-Control")).toBe("private, no-store");
  expect(s.rpc).not.toHaveBeenCalled(); expect(s.download).not.toHaveBeenCalled();
  expect(s.sign).not.toHaveBeenCalled(); expect(await r.text()).not.toContain("url");
});

const MAX = 10 * 1024 * 1024;
for (const length of [undefined, "1", String(MAX * 3)]) {
  it(`stream sem/com Length não confiável (${length ?? "ausente"}) é contado por bytes`, async () => {
    // asStream deliberately omits response headers (same as actual SDK). Never
    // rely on Length; first metadata null still permits verified normal bytes.
    const s = setup({ metadata: null, length });
    const r = await s.invoke(body);
    expect(r.status).toBe(200); expect(await r.text()).toBe(XML);
  });
}
it("metadata excessiva recusa ANTES I/O", async () => {
  const s = setup({ metadata: MAX + 1 });
  expect((await s.invoke(body)).status).toBe(413);
  expect(s.download).not.toHaveBeenCalled();
});
for (const chunks of [[new Uint8Array(MAX), new Uint8Array(1)], [new Uint8Array(MAX + 1)]]) {
  it(`chunk excedendo 10 MiB cancela imediatamente sem entrega parcial (${chunks.length})`, async () => {
    const s = setup({ metadata: null, chunks, streamHang: true });
    const r = await s.invoke(body);
    expect(r.status).toBe(413); expect(s.cancel).toHaveBeenCalledTimes(1);
    expect(await r.text()).not.toContain("NFe");
    expect(s.rpc.mock.calls.filter(c => c[0] === "h15_service_actor_run_access")).toHaveLength(1);
  });
}
for (const mode of ["abort", "timeout"] as const) {
  it(`${mode} durante stream cancela reader sem bytes parciais nem retry`, async () => {
    vi.useFakeTimers();
    try {
      const a = new AbortController();
      const s = setup({ chunks: [new TextEncoder().encode(XML)], streamHang: true });
      const p = s.invoke(body, a.signal);
      await vi.advanceTimersByTimeAsync(10);
      expect(s.download).toHaveBeenCalledTimes(1);
      if (mode === "abort") a.abort(); else await vi.advanceTimersByTimeAsync(15_000);
      const r = await p;
      expect(r.status).toBe(504); expect(s.cancel).toHaveBeenCalledTimes(1);
      expect(await r.text()).not.toContain("NFe");
      expect(s.download).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
}
function bodyRequest(stream: ReadableStream<Uint8Array>, signal?: AbortSignal, length?: string) {
  return new Request("https://isolated.invalid", { method: "POST", signal,
    headers: { Authorization: "Bearer placeholder", ...(length ? { "Content-Length": length } : {}) },
    body: stream as unknown as BodyInit, duplex: "half",
  } as RequestInit);
}
for (const mode of ["timeout", "abort", "overflow", "length"] as const) {
  it(`corpo ${mode}: leitura limitada, cancela sem claims/RPC/Storage`, async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn(); const a = new AbortController();
      const stream = new ReadableStream<Uint8Array>({ start(c) {
        c.enqueue(new Uint8Array(mode === "overflow" ? 16 * 1024 + 1 : 1));
      }, cancel });
      const s = setup();
      const p = s.invokeRequest(bodyRequest(stream, a.signal, mode === "length" ? "16385" : undefined));
      await vi.advanceTimersByTimeAsync(1);
      if (mode === "abort") a.abort();
      if (mode === "timeout") await vi.advanceTimersByTimeAsync(5_000);
      const r = await p;
      expect(r.status).toBe(mode === "length" || mode === "overflow" ? 413 : 504);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(s.rpc).not.toHaveBeenCalled(); expect(s.download).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
}
it("corpo fragmentado com Length enganoso preserva download autorizado", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.slice(0, 8)); c.enqueue(bytes.slice(8)); c.close(); } });
  const s = setup(); const r = await s.invokeRequest(bodyRequest(stream, undefined, "1"));
  expect(r.status).toBe(200); expect(await r.text()).toBe(XML);
});
for (const invalid of ["null", "[]", "{", "1"]) {
  it(`corpo JSON inválido ${invalid} mantém 400 sem I/O`, async () => {
    const s = setup(); const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(invalid)); c.close(); } });
    expect((await s.invokeRequest(bodyRequest(stream))).status).toBe(400);
    expect(s.rpc).not.toHaveBeenCalled(); expect(s.download).not.toHaveBeenCalled();
  });
}
