import { afterEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth },
  SUPABASE_URL: "https://swzpzcwiasxmjutrmvkm.supabase.co", SUPABASE_PUBLISHABLE_KEY: "publishable-test" }));
import { loadClientDocument } from "../../../scripts/attachment-http-revocation-20261021/frontend/loadClientDocument";
const path = "tenant/clientes/client/outro/a.pdf";
const setup = () => {
  auth.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: "synthetic-test-only" } }, error: null });
  return vi.spyOn(globalThis, "fetch");
};
const response = (headers = { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" }) => new Response(new Uint8Array([1, 2, 3]), { headers });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("candidate client-document loader — canonical bearer, no fallback", () => {
  it("POSTs to canonical Edge, returns bounded bytes with original MIME", async () => {
    const fetcher = setup().mockResolvedValue(response());
    const blob = await loadClientDocument(path, new AbortController().signal);
    expect(blob.size).toBe(3); expect(blob.type).toBe("application/pdf");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://swzpzcwiasxmjutrmvkm.supabase.co/functions/v1/download-client-document");
    expect(fetcher.mock.calls[0][1]?.cache).toBe("no-store");
    expect(fetcher.mock.calls[0][1]?.body).toBe(JSON.stringify({ bucket: "clientes-docs", path }));
  });
  for (const kind of ["json-url", "html", "no-store-missing", "denied"] as const) {
    it(`rejects ${kind} without any Storage fallback`, async () => {
      const fetcher = setup();
      if (kind === "json-url") fetcher.mockResolvedValue(new Response('{"url":"https://legacy.invalid"}', { headers: { "Content-Type": "application/json" } }));
      if (kind === "html") fetcher.mockResolvedValue(new Response("html", { headers: { "Content-Type": "text/html" } }));
      if (kind === "no-store-missing") fetcher.mockResolvedValue(response({ "Content-Type": "application/octet-stream", "Cache-Control": "public" }));
      if (kind === "denied") fetcher.mockResolvedValue(new Response("denied", { status: 403 }));
      await expect(loadClientDocument(path, new AbortController().signal)).rejects.toThrow("Documento indisponível");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  }
  it("signed-out and pre-aborted do not fetch", async () => {
    const fetcher = setup(); auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(loadClientDocument(path, new AbortController().signal)).rejects.toThrow();
    const c = new AbortController(); c.abort(); await expect(loadClientDocument(path, c.signal)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  });
  for (const stage of ["session", "fetch", "stream"] as const) {
    it(`hung ${stage} respects timeout and permits manual retry`, async () => {
      vi.useFakeTimers(); const fetcher = setup(); const cancel = vi.fn();
      if (stage === "session") auth.getSession.mockImplementationOnce(() => new Promise(() => {}));
      if (stage === "fetch") fetcher.mockImplementationOnce(() => new Promise(() => {}));
      if (stage === "stream") fetcher.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" } }));
      const pending = loadClientDocument(path, new AbortController().signal); const outcome = expect(pending).rejects.toThrow("Documento indisponível");
      await vi.advanceTimersByTimeAsync(15_001); await outcome;
      if (stage === "stream") expect(cancel).toHaveBeenCalled();
      fetcher.mockResolvedValue(response()); expect((await loadClientDocument(path, new AbortController().signal)).size).toBe(3);
    });
  }
  it("parent abort during bytes cancels reader and rejects", async () => {
    const fetcher = setup(); const cancel = vi.fn();
    fetcher.mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" } }));
    const c = new AbortController(); const pending = loadClientDocument(path, c.signal); const outcome = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled()); await new Promise(r => setTimeout(r, 0)); c.abort();
    await outcome; expect(cancel).toHaveBeenCalled();
  });
  it("excessive chunk cancels immediately, not based on Content-Length", async () => {
    const fetcher = setup(); const cancel = vi.fn();
      fetcher.mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(20 * 1024 * 1024 + 1)); }, cancel }), {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store", "Content-Length": "1" },
    }));
    await expect(loadClientDocument(path, new AbortController().signal)).rejects.toThrow(); expect(cancel).toHaveBeenCalledTimes(1);
  });
});