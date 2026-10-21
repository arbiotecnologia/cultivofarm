import { afterEach, describe, expect, it, vi } from "vitest";
import { LIMITS, serveDocument, type Snapshot, type Transport } from "../../../scripts/attachment-http-revocation-20261021/edge/download";
const A = "007bb519-cba0-4704-be2c-cb93ad010048";
const B = "8f57c7dd-0557-4041-b401-7a00f7244626";
const client = "b2bd6b53-4198-40ba-b2da-603cea5eda2b";
const path = `${A}/clientes/${client}/outro/a.pdf`;
const snapshot = (): Snapshot => ({ actor: "a7d45277-6dec-413d-bf6b-86620c1ef39f", tenant: A,
  roles: ["administrador"], document: "25440783-4469-4c8c-a666-3af4c0dbe042", client, path, size: 3, mime: "application/pdf" });
const request = (body: unknown = { bucket: "clientes-docs", path }, signal?: AbortSignal) => new Request("https://local.invalid", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal,
});
const bytes = () => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array([1, 2, 3])); c.close(); } });
const deps = () => ({ authorize: vi.fn<Transport["authorize"]>().mockResolvedValue(snapshot()), download: vi.fn<Transport["download"]>().mockImplementation(async () => bytes()) });
afterEach(() => vi.useRealTimers());
describe("review candidate — independent fresh client-document proof", () => {
  it("returns exact bytes with private/no-store after two independent proofs", async () => {
    const d = deps(); const r = await serveDocument(request(), {}, d);
    expect(r.status).toBe(200); expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(d.authorize).toHaveBeenCalledTimes(2); expect(d.download).toHaveBeenCalledTimes(1);
    expect(r.headers.get("Cache-Control")).toContain("private, no-store"); expect(r.headers.get("CDN-Cache-Control")).toBe("no-store");
  });
  it("a cached successful Storage response cannot authorize a revoked actor", async () => {
    const d = deps(); d.authorize.mockResolvedValue(null);
    expect((await serveDocument(request(), {}, d)).status).toBe(403); expect(d.download).not.toHaveBeenCalled();
  });
  for (const change of ["revoked", "roles", "tenant", "actor", "document", "path", "size", "mime"] as const) {
    it(`post-read ${change} denies all bytes, even when Storage succeeds`, async () => {
      const d = deps(); const next = snapshot();
      if (change === "roles") next.roles = ["administrativo"];
      if (change === "tenant") next.tenant = B;
      if (change === "actor") next.actor = B;
      if (change === "document") next.document = B;
      if (change === "path") next.path += ".old";
      if (change === "size") next.size = 4;
      if (change === "mime") next.mime = "text/plain";
      d.authorize.mockResolvedValueOnce(snapshot()).mockResolvedValueOnce(change === "revoked" ? null : next);
      const r = await serveDocument(request(), {}, d); expect(r.status).toBe(403);
      expect(await r.text()).not.toContain("url"); expect(d.download).toHaveBeenCalledTimes(1);
    });
  }
  it("cross-tenant A/B both deny before object I/O", async () => {
    for (const [own, other] of [[A, B], [B, A]]) {
      const d = deps(); d.authorize.mockResolvedValue({ ...snapshot(), tenant: own });
      expect((await serveDocument(request({ bucket: "clientes-docs", path: `${other}/clientes/${client}/outro/a.pdf` }), {}, d)).status).toBe(403);
      expect(d.download).not.toHaveBeenCalled();
    }
  });
  for (const body of [{ bucket: "financial-docs", path }, { bucket: "clientes-docs", path: "https://old.invalid/file" },
    { bucket: "clientes-docs", path: path + "?cachebuster=1" }, { bucket: "clientes-docs", path, url: "legacy" },
    { bucket: "clientes-docs", path: "a/../b" }]) {
    it(`invalid contract ${JSON.stringify(body)} never reaches authorization`, async () => {
      const d = deps(); expect((await serveDocument(request(body), {}, d)).status).toBe(400); expect(d.authorize).not.toHaveBeenCalled();
    });
  }
  it("pre-aborted request returns 504 without any I/O", async () => {
    const d = deps(); const c = new AbortController(); c.abort();
    expect((await serveDocument(request(undefined, c.signal), {}, d)).status).toBe(504); expect(d.authorize).not.toHaveBeenCalled();
  });
  it("metadata too large denies before downloading", async () => {
    const d = deps(); d.authorize.mockResolvedValue({ ...snapshot(), size: LIMITS.bytes + 1 });
    expect((await serveDocument(request(), {}, d)).status).toBe(413); expect(d.download).not.toHaveBeenCalled();
  });
  it("chunk exceeds 10 MiB with no Length: cancels stream, no partial response", async () => {
    const d = deps(); const cancel = vi.fn(); d.authorize.mockResolvedValue({ ...snapshot(), size: null });
    d.download.mockResolvedValue(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(LIMITS.bytes + 1)); }, cancel }));
    const r = await serveDocument(request(), {}, d); expect(r.status).toBe(413); expect(cancel).toHaveBeenCalledTimes(1);
    expect((await r.arrayBuffer()).byteLength).toBeLessThan(100); expect(d.authorize).toHaveBeenCalledTimes(1);
  });
  it("lying metadata size does not substitute actual byte counting", async () => {
    const d = deps(); d.authorize.mockResolvedValue({ ...snapshot(), size: 1 });
    expect((await serveDocument(request(), {}, d)).status).toBe(409);
  });
  for (const stage of ["authorize", "download", "postread", "stream", "body"] as const) {
    it(`hung ${stage} exits within total deadline and retry is independent`, async () => {
      vi.useFakeTimers(); const d = deps(); const cancel = vi.fn(); let req = request();
      if (stage === "authorize") d.authorize.mockImplementationOnce(() => new Promise(() => {}));
      if (stage === "download") d.download.mockImplementationOnce(() => new Promise(() => {}));
      if (stage === "postread") d.authorize.mockResolvedValueOnce(snapshot()).mockImplementationOnce(() => new Promise(() => {}));
      if (stage === "stream") d.download.mockResolvedValueOnce(new ReadableStream({ cancel }));
      if (stage === "body") req = new Request("https://local.invalid", { method: "POST", headers: { "Content-Type": "application/json" },
        body: new ReadableStream({ cancel }), duplex: "half" } as RequestInit);
      const pending = serveDocument(req, {}, d);
      await vi.advanceTimersByTimeAsync(15_001); expect((await pending).status).toBe(504);
      if (stage === "stream" || stage === "body") expect(cancel).toHaveBeenCalled();
      expect((await serveDocument(request(), {}, deps())).status).toBe(200);
    });
  }
  it("late ignored-abort download stream is canceled and cannot affect retry", async () => {
    vi.useFakeTimers(); const d = deps(); let resolve: (s: ReadableStream<Uint8Array>) => void = () => {};
    d.download.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const old = serveDocument(request(), {}, d); await vi.advanceTimersByTimeAsync(15_001); expect((await old).status).toBe(504);
    expect((await serveDocument(request(), {}, deps())).status).toBe(200);
    const cancel = vi.fn(); resolve(new ReadableStream({ cancel })); await vi.advanceTimersByTimeAsync(0); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("Storage failure is neutral and never yields Prepared bytes", async () => {
    const d = deps(); d.download.mockResolvedValue(null); const r = await serveDocument(request(), {}, d);
    expect(r.status).toBe(404); expect(await r.text()).toBe('{"error":"Documento indisponível"}');
  });
});