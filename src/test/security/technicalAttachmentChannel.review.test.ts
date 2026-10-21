import { afterEach, describe, expect, it, vi } from "vitest";
import { serveTechnicalAttachment, LIMITS } from "../../../scripts/technical-attachment-http-20261021/edge/core";
import { createTransport, fetchStorageBytes } from "../../../scripts/technical-attachment-http-20261021/edge/transport";

vi.mock("@/integrations/supabase/client", () => ({
  SUPABASE_URL: "https://swzpzcwiasxmjutrmvkm.supabase.co", SUPABASE_PUBLISHABLE_KEY: "anon",
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } }, error: null }) } },
}));
import { loadTechnicalAttachment } from "../../../scripts/technical-attachment-http-20261021/frontend/loadTechnicalAttachment";

const tenant = "007bb519-cba0-4704-be2c-cb93ad010048", owner = "b2bd6b53-4198-40ba-b2da-603cea5eda2b";
const doc = "2c112df5-fc20-4117-a746-705d440d2b28";
const path = `${tenant}/${owner}/documento/comprovante.pdf`;
const proof = (x: Record<string, unknown> = {}) => ({ actor: owner, tenant, document: doc, visit: owner, client: owner,
  path, roles: ["consultor_tecnico"], size: 3, mime: "application/pdf", ...x });
const req = (body: unknown = { bucket: "consultor-arquivos", path }, method = "POST") => new Request("https://t.invalid",
  { method, headers: { "content-type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined });
const stream = (...chunks: Uint8Array[]) => new ReadableStream<Uint8Array>({ start(c) { chunks.forEach(x => c.enqueue(x)); c.close(); } });
const bytes3 = () => vi.fn().mockResolvedValue(stream(new Uint8Array([1, 2, 3])));
afterEach(() => vi.useRealTimers());

describe("consultor-arquivos POST channel (server)", () => {
  it("own document: 200, exactly two proofs, one byte read, private no-store", async () => {
    const rpc = vi.fn().mockResolvedValue(proof()); const b = bytes3();
    const r = await serveTechnicalAttachment(req(), {}, createTransport({ rpc }, b));
    expect(r.status).toBe(200); expect(rpc).toHaveBeenCalledTimes(2); expect(b).toHaveBeenCalledTimes(1);
    expect(r.headers.get("Cache-Control")).toContain("no-store"); expect(r.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
  it.each([
    ["no proof (other tenant / no technical role)", null],
    ["path owner differs", proof({ visit: tenant })],
    ["path tenant differs", proof({ tenant: owner })],
    ["proof for other path", proof({ path: `${tenant}/${owner}/documento/x.pdf` })],
    ["no roles", proof({ roles: [] })],
  ])("%s → 403 without privileged bytes", async (_n, value) => {
    const b = vi.fn();
    const r = await serveTechnicalAttachment(req(), {}, createTransport({ rpc: vi.fn().mockResolvedValue(value) }, b));
    expect(r.status).toBe(403); expect(b).not.toHaveBeenCalled();
  });
  it.each([["revoked during read", null], ["roles changed during read", proof({ roles: ["gestor"] })],
    ["tenant changed during read", proof({ tenant: doc })],
    ["client link changed during read", proof({ client: doc })],
    ["record replaced during read", proof({ document: owner })],
    ["actor changed during read", proof({ actor: doc })]])("%s → 403 and bytes discarded", async (_n, after) => {
    const rpc = vi.fn().mockResolvedValueOnce(proof()).mockResolvedValueOnce(after);
    const r = await serveTechnicalAttachment(req(), {}, createTransport({ rpc }, bytes3()));
    expect(r.status).toBe(403); expect(await r.text()).not.toContain("\u0001");
  });
  it.each([[{ bucket: "clientes-docs", path }], [{ bucket: "financial-receipts", path }], [{ bucket: "consultor-arquivos", path: "https://old/x" }],
    [{ bucket: "consultor-arquivos", path: `${tenant}/${owner}/../x` }], [{ bucket: "consultor-arquivos", path, extra: 1 }]])("rejects body %j with 400", async body => {
    const rpc = vi.fn(); expect((await serveTechnicalAttachment(req(body), {}, createTransport({ rpc }, vi.fn()))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("GET is 405 (no legacy GET path)", async () => {
    expect((await serveTechnicalAttachment(req(undefined, "GET"), {}, createTransport({ rpc: vi.fn() }, vi.fn()))).status).toBe(405);
  });
  it("declared oversize → 413 before I/O; streamed oversize → 413 and cancel", async () => {
    const b = vi.fn();
    expect((await serveTechnicalAttachment(req(), {}, createTransport({ rpc: vi.fn().mockResolvedValue(proof({ size: LIMITS.bytes + 1 })) }, b))).status).toBe(413);
    expect(b).not.toHaveBeenCalled();
    const cancel = vi.fn();
    const big = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(4 * 1024 * 1024)); }, cancel });
    const r = await serveTechnicalAttachment(req(), {}, createTransport({ rpc: vi.fn().mockResolvedValue(proof({ size: null })) }, vi.fn().mockResolvedValue(big)));
    expect(r.status).toBe(413); expect(cancel).toHaveBeenCalled();
  });
  it("size mismatch with record → 409", async () => {
    const r = await serveTechnicalAttachment(req(), {}, createTransport({ rpc: vi.fn().mockResolvedValue(proof({ size: 9 })) }, bytes3()));
    expect(r.status).toBe(409);
  });
  it("hung proof hits absolute 15s deadline → 504, no bytes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const b = vi.fn();
    const p = serveTechnicalAttachment(req(), {}, createTransport({ rpc: () => new Promise(() => undefined) }, b));
    await vi.advanceTimersByTimeAsync(LIMITS.timeoutMs + 1);
    expect((await p).status).toBe(504); expect(b).not.toHaveBeenCalled();
  });
  it("pre-aborted request → 504 without proof", async () => {
    const c = new AbortController(); c.abort(); const rpc = vi.fn();
    const r = new Request("https://t.invalid", { method: "POST", signal: c.signal, headers: { "content-type": "application/json" }, body: "{}" });
    expect((await serveTechnicalAttachment(r, {}, createTransport({ rpc }, vi.fn()))).status).toBe(504); expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["checkins", "solicitacoes"])("unproven %s path is denied without privileged bytes", async prefix => {
    const p = `${tenant}/${prefix}/${owner}/foto.jpg`; const b = vi.fn();
    const r = await serveTechnicalAttachment(req({ bucket: "consultor-arquivos", path: p }), {},
      createTransport({ rpc: vi.fn().mockResolvedValue(proof({ path: p })) }, b));
    expect(r.status).toBe(403); expect(b).not.toHaveBeenCalled();
  });
  it("hung body ends at total deadline without proofs", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const rpc = vi.fn(); const cancel = vi.fn();
    const body = new ReadableStream({ pull() {}, cancel });
    const request = new Request("https://t.invalid", { method: "POST", headers: { "Content-Type": "application/json" },
      body, duplex: "half" } as RequestInit);
    const pending = serveTechnicalAttachment(request, {}, createTransport({ rpc }, vi.fn()));
    await vi.advanceTimersByTimeAsync(15_001);
    expect((await pending).status).toBe(504); expect(rpc).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalled();
  });
  it("hung post-proof cancels stream and emits no partial bytes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const rpc = vi.fn().mockResolvedValueOnce(proof()).mockImplementationOnce(() => new Promise(() => undefined));
    const pending = serveTechnicalAttachment(req(), {}, createTransport({ rpc }, bytes3()));
    await vi.advanceTimersByTimeAsync(15_001);
    const r = await pending; expect(r.status).toBe(504); expect(await r.text()).toBe('{"error":"Documento indisponível"}');
  });
  it("suspended timers cannot extend the monotonic deadline", async () => {
    let resolve: (x: unknown) => void = () => undefined;
    const pendingProof = new Promise(r => { resolve = r; });
    const now = vi.spyOn(performance, "now").mockReturnValue(0); const b = vi.fn();
    const p = serveTechnicalAttachment(req(), {}, createTransport({ rpc: () => pendingProof }, b));
    await new Promise(r => setTimeout(r, 5)); now.mockReturnValue(15_001); resolve(proof());
    expect((await p).status).toBe(504); expect(b).not.toHaveBeenCalled(); now.mockRestore();
  });
});

describe("server-only byte fetch", () => {
  const s = new AbortController().signal;
  it("pre-abort does not fetch Storage", async () => {
    const c = new AbortController(); c.abort(); const f = vi.fn();
    expect(await fetchStorageBytes(f, "https://x", "k", path, c.signal)).toBeNull(); expect(f).not.toHaveBeenCalled();
  });
  it("redirect rejected (redirect:error throws, or 3xx/redirected) → null", async () => {
    expect(await fetchStorageBytes(vi.fn().mockRejectedValue(new TypeError("redirect")), "https://x", "k", path, s)).toBeNull();
    expect(await fetchStorageBytes(vi.fn().mockResolvedValue(new Response(null, { status: 302 })), "https://x", "k", path, s)).toBeNull();
    const red = new Response("x"); Object.defineProperty(red, "redirected", { value: true });
    expect(await fetchStorageBytes(vi.fn().mockResolvedValue(red), "https://x", "k", path, s)).toBeNull();
  });
  it("uses only consultor-arquivos bucket, no-store, redirect:error", async () => {
    const f = vi.fn().mockResolvedValue(new Response("abc"));
    expect(await fetchStorageBytes(f, "https://x", "sb_secret_k", path, s)).not.toBeNull();
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`https://x/storage/v1/object/authenticated/consultor-arquivos/${tenant}/${owner}/documento/comprovante.pdf`);
    expect(init).toMatchObject({ cache: "no-store", redirect: "error" }); expect(init.headers.Authorization).toBeUndefined();
  });
  it("transport never downloads without approved proof for exact path", async () => {
    const b = vi.fn(); const t = createTransport({ rpc: vi.fn().mockResolvedValue(proof()) }, b);
    expect(await t.download(path, s)).toBeNull();
    await t.authorize(path, s); expect(await t.download(`${tenant}/${owner}/documento/other.pdf`, s)).toBeNull();
    expect(b).not.toHaveBeenCalled();
  });
});

describe("frontend loader (POST only, no retry/fallback)", () => {
  const ok = () => new Response(new Uint8Array([1]), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" } });
  it("POSTs consultor-arquivos body once with no-store/redirect:error", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    expect((await loadTechnicalAttachment(path, new AbortController().signal, f)).size).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://swzpzcwiasxmjutrmvkm.supabase.co/functions/v1/download-technical-attachment");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
    expect(JSON.parse(init.body)).toEqual({ bucket: "consultor-arquivos", path });
  });
  it.each([[new Response("{}", { status: 403 })], [new Response("x", { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })],
    [new Response("x", { headers: { "Content-Type": "application/octet-stream" } })]])("rejects unsafe response without retry", async res => {
    const f = vi.fn().mockResolvedValue(res);
    await expect(loadTechnicalAttachment(path, new AbortController().signal, f)).rejects.toThrow("Documento indisponível");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("pre-aborted never fetches", async () => {
    const c = new AbortController(); c.abort(); const f = vi.fn();
    await expect(loadTechnicalAttachment(path, c.signal, f)).rejects.toThrow(); expect(f).not.toHaveBeenCalled();
  });
  it("failed user action allows a fresh explicit attempt, without automatic retry", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("denied", { status: 403 })).mockResolvedValueOnce(ok());
    await expect(loadTechnicalAttachment(path, new AbortController().signal, f)).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
    expect((await loadTechnicalAttachment(path, new AbortController().signal, f)).size).toBe(1);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

