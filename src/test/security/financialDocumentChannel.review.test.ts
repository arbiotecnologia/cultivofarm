import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serveFinancialDocument, LIMITS } from "../../../scripts/financial-docs-http-revocation-20261021/edge/core";
import { createTransport, fetchStorageBytes } from "../../../scripts/financial-docs-http-revocation-20261021/edge/transport";

vi.mock("@/integrations/supabase/client", () => ({
  SUPABASE_URL: "https://swzpzcwiasxmjutrmvkm.supabase.co", SUPABASE_PUBLISHABLE_KEY: "anon",
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "t" } }, error: null }) } },
}));
import { loadFinancialDocument } from "../../../scripts/financial-docs-http-revocation-20261021/frontend/loadFinancialDocument";

const tenant = "007bb519-cba0-4704-be2c-cb93ad010048", owner = "b2bd6b53-4198-40ba-b2da-603cea5eda2b";
const doc = "2c112df5-fc20-4117-a746-705d440d2b28";
const path = `RECEIVABLE/${owner}/comprovante.pdf`;
const proof = (x: Record<string, unknown> = {}) => ({ actor: owner, tenant, document: doc, owner_type: "RECEIVABLE", owner,
  path, roles: ["financeiro"], size: 3, mime: "application/pdf", ...x });
const req = (body: unknown = { bucket: "financial-docs", path }, method = "POST") => new Request("https://t.invalid",
  { method, headers: { "content-type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined });
const stream = (...chunks: Uint8Array[]) => new ReadableStream<Uint8Array>({ start(c) { chunks.forEach(x => c.enqueue(x)); c.close(); } });
const bytes3 = () => vi.fn().mockResolvedValue(stream(new Uint8Array([1, 2, 3])));
afterEach(() => vi.useRealTimers());

describe("financial-docs POST channel (server)", () => {
  it("own document: 200, exactly two proofs, one byte read, private no-store", async () => {
    const rpc = vi.fn().mockResolvedValue(proof()); const b = bytes3();
    const r = await serveFinancialDocument(req(), {}, createTransport({ rpc }, b));
    expect(r.status).toBe(200); expect(rpc).toHaveBeenCalledTimes(2); expect(b).toHaveBeenCalledTimes(1);
    expect(r.headers.get("Cache-Control")).toContain("no-store"); expect(r.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
  it.each([
    ["no proof (other tenant / no financial role)", null],
    ["path owner differs", proof({ owner: tenant })],
    ["owner_type differs", proof({ owner_type: "PAYABLE" })],
    ["proof for other path", proof({ path: `RECEIVABLE/${owner}/x.pdf` })],
    ["no roles", proof({ roles: [] })],
  ])("%s → 403 without privileged bytes", async (_n, value) => {
    const b = vi.fn();
    const r = await serveFinancialDocument(req(), {}, createTransport({ rpc: vi.fn().mockResolvedValue(value) }, b));
    expect(r.status).toBe(403); expect(b).not.toHaveBeenCalled();
  });
  it.each([["revoked during read", null], ["roles changed during read", proof({ roles: ["gestor"] })],
    ["tenant changed during read", proof({ tenant: doc })]])("%s → 403 and bytes discarded", async (_n, after) => {
    const rpc = vi.fn().mockResolvedValueOnce(proof()).mockResolvedValueOnce(after);
    const r = await serveFinancialDocument(req(), {}, createTransport({ rpc }, bytes3()));
    expect(r.status).toBe(403); expect(await r.text()).not.toContain("\u0001");
  });
  it.each([[{ bucket: "clientes-docs", path }], [{ bucket: "financial-receipts", path }], [{ bucket: "financial-docs", path: "https://old/x" }],
    [{ bucket: "financial-docs", path: `RECEIVABLE/${owner}/../x` }], [{ bucket: "financial-docs", path, extra: 1 }]])("rejects body %j with 400", async body => {
    const rpc = vi.fn(); expect((await serveFinancialDocument(req(body), {}, createTransport({ rpc }, vi.fn()))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("GET is 405 (no legacy GET path)", async () => {
    expect((await serveFinancialDocument(req(undefined, "GET"), {}, createTransport({ rpc: vi.fn() }, vi.fn()))).status).toBe(405);
  });
  it("declared oversize → 413 before I/O; streamed oversize → 413 and cancel", async () => {
    const b = vi.fn();
    expect((await serveFinancialDocument(req(), {}, createTransport({ rpc: vi.fn().mockResolvedValue(proof({ size: LIMITS.bytes + 1 })) }, b))).status).toBe(413);
    expect(b).not.toHaveBeenCalled();
    const cancel = vi.fn();
    const big = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(4 * 1024 * 1024)); }, cancel });
    const r = await serveFinancialDocument(req(), {}, createTransport({ rpc: vi.fn().mockResolvedValue(proof({ size: null })) }, vi.fn().mockResolvedValue(big)));
    expect(r.status).toBe(413); expect(cancel).toHaveBeenCalled();
  });
  it("size mismatch with record → 409", async () => {
    const r = await serveFinancialDocument(req(), {}, createTransport({ rpc: vi.fn().mockResolvedValue(proof({ size: 9 })) }, bytes3()));
    expect(r.status).toBe(409);
  });
  it("hung proof hits absolute 15s deadline → 504, no bytes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const b = vi.fn();
    const p = serveFinancialDocument(req(), {}, createTransport({ rpc: () => new Promise(() => undefined) }, b));
    await vi.advanceTimersByTimeAsync(LIMITS.timeoutMs + 1);
    expect((await p).status).toBe(504); expect(b).not.toHaveBeenCalled();
  });
  it("pre-aborted request → 504 without proof", async () => {
    const c = new AbortController(); c.abort(); const rpc = vi.fn();
    const r = new Request("https://t.invalid", { method: "POST", signal: c.signal, headers: { "content-type": "application/json" }, body: "{}" });
    expect((await serveFinancialDocument(r, {}, createTransport({ rpc }, vi.fn()))).status).toBe(504); expect(rpc).not.toHaveBeenCalled();
  });
});

describe("server-only byte fetch", () => {
  const s = new AbortController().signal;
  it("redirect rejected (redirect:error throws, or 3xx/redirected) → null", async () => {
    expect(await fetchStorageBytes(vi.fn().mockRejectedValue(new TypeError("redirect")), "https://x", "k", path, s)).toBeNull();
    expect(await fetchStorageBytes(vi.fn().mockResolvedValue(new Response(null, { status: 302 })), "https://x", "k", path, s)).toBeNull();
    const red = new Response("x"); Object.defineProperty(red, "redirected", { value: true });
    expect(await fetchStorageBytes(vi.fn().mockResolvedValue(red), "https://x", "k", path, s)).toBeNull();
  });
  it("uses only financial-docs bucket, no-store, redirect:error", async () => {
    const f = vi.fn().mockResolvedValue(new Response("abc"));
    expect(await fetchStorageBytes(f, "https://x", "sb_secret_k", path, s)).not.toBeNull();
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`https://x/storage/v1/object/authenticated/financial-docs/RECEIVABLE/${owner}/comprovante.pdf`);
    expect(init).toMatchObject({ cache: "no-store", redirect: "error" }); expect(init.headers.Authorization).toBeUndefined();
  });
  it("transport never downloads without approved proof for exact path", async () => {
    const b = vi.fn(); const t = createTransport({ rpc: vi.fn().mockResolvedValue(proof()) }, b);
    expect(await t.download(path, s)).toBeNull();
    await t.authorize(path, s); expect(await t.download(`RECEIVABLE/${owner}/other.pdf`, s)).toBeNull();
    expect(b).not.toHaveBeenCalled();
  });
});

describe("frontend loader (POST only, no retry/fallback)", () => {
  const ok = () => new Response(new Uint8Array([1]), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" } });
  it("POSTs financial-docs body once with no-store/redirect:error", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    expect((await loadFinancialDocument(path, new AbortController().signal, f)).size).toBe(1);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://swzpzcwiasxmjutrmvkm.supabase.co/functions/v1/download-financial-document");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", redirect: "error" });
    expect(JSON.parse(init.body)).toEqual({ bucket: "financial-docs", path });
  });
  it.each([[new Response("{}", { status: 403 })], [new Response("x", { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })],
    [new Response("x", { headers: { "Content-Type": "application/octet-stream" } })]])("rejects unsafe response without retry", async res => {
    const f = vi.fn().mockResolvedValue(res);
    await expect(loadFinancialDocument(path, new AbortController().signal, f)).rejects.toThrow("Documento indisponível");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("pre-aborted never fetches", async () => {
    const c = new AbortController(); c.abort(); const f = vi.fn();
    await expect(loadFinancialDocument(path, c.signal, f)).rejects.toThrow(); expect(f).not.toHaveBeenCalled();
  });
});

describe("config and SQL candidates", () => {
  it("download-financial-document has explicit verify_jwt = true", () => {
    expect(readFileSync("supabase/config.toml", "utf8")).toMatch(/\[functions\.download-financial-document\]\s*\nverify_jwt = true/);
  });
  it("snapshot reuses canonical helper, INVOKER, no anon; deny policy keeps write ops; rollback deny-only", () => {
    const base = "scripts/financial-docs-http-revocation-20261021/";
    const snap = readFileSync(base + "sql/snapshot.sql.review", "utf8");
    expect(snap).toContain("financial_storage_object_permitted('financial-docs', _name)");
    expect(snap).toContain("SECURITY INVOKER"); expect(snap).toContain("FROM PUBLIC, anon"); expect(snap).not.toMatch(/SECURITY DEFINER/);
    const deny = readFileSync(base + "sql/origin-deny.sql.review", "utf8");
    expect(deny).toContain("bucket_id <> 'financial-docs'");
    for (const op of ["object.list", "object.upload", "object.upload_update", "object.delete"]) expect(deny).toContain(`'${op}'`);
    expect(deny).not.toContain("get_authenticated'");
    const rb = readFileSync(base + "rollback/deny-only.sql.review", "utf8");
    expect(rb).not.toMatch(/DROP POLICY|createSignedUrl/);
  });
});
