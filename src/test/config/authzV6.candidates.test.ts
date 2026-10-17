import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

function reviewModule(path: string): Record<string, (...args: unknown[]) => unknown> {
  const source = readFileSync(path, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const exports: Record<string, (...args: unknown[]) => unknown> = {};
  new Function("exports", js)(exports);
  return exports;
}
const time = reviewModule("scripts/authz-cache/v6/snapshot-time.ts.review");
const binary = reviewModule("scripts/authz-cache/v6/edges/serve-verified-attachment.ts.review");
type Lease = { ready: boolean; expiresMonotonicMs: number };
const observation = { vector: "A:2", eligible: true, transactionMs: 1000, observedMs: 1100, boundariesMs: [30000] };
function lease(before = observation, after = observation, started = 10, response = 110): Lease {
  return time.confirmedAuthorizationLease(before, after, started, response) as Lease;
}
describe("v6 temporal candidate — no Auth integration or hosted claim", () => {
  it("lease maximum 15 seconds measured from request start", () => {
    expect(lease()).toEqual({ ready: true, expiresMonotonicMs: 15010 });
  });
  it("15-second late response cannot establish authorization", () => {
    expect(lease(observation, observation, 0, 15000).ready).toBe(false);
  });
  it("clips lease at next time boundary conservatively subtracting round trip", () => {
    const o = { ...observation, boundariesMs: [2100] };
    expect(lease(o, o, 10, 110)).toEqual({ ready: true, expiresMonotonicMs: 1010 });
  });
  it("rejects elapsed boundary in old transaction even without DML", () => {
    expect(lease({ ...observation, boundariesMs: [1050] }).ready).toBe(false);
  });
  it("rejects concurrent revision and ABA stamped A:2 → A:4", () => {
    expect(lease(observation, { ...observation, vector: "A:4" }).ready).toBe(false);
  });
  it("rejects denied eligibility, nonfinite or backward clocks", () => {
    expect(lease(observation, { ...observation, eligible: false }).ready).toBe(false);
    expect(lease(observation, { ...observation, observedMs: NaN }).ready).toBe(false);
    expect(lease(observation, observation, 110, 10).ready).toBe(false);
  });
});
const request = () => new Request("https://isolated.invalid", { method: "POST" });
async function serve(authorize: () => Promise<boolean>, download: (signal: AbortSignal) => Promise<unknown>, req = request()): Promise<Response> {
  return binary.serveVerifiedAttachment(req, {}, authorize, download, "application/pdf", "doc.pdf") as Promise<Response>;
}
describe("v6 binary handler — actual candidate helper with simulated transport", () => {
  it("denies before I/O, never signs or service-role downloads", async () => {
    const download = vi.fn(); const response = await serve(async () => false, download);
    expect(response.status).toBe(403); expect(download).not.toHaveBeenCalled();
  });
  it("serves authenticated bytes after second resource authorization", async () => {
    const auth = vi.fn().mockResolvedValue(true);
    const response = await serve(auth, async () => ({ data: new Blob(["pdf"]), error: null }));
    expect(auth).toHaveBeenCalledTimes(2); expect(await response.text()).toBe("pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("revocation during download never serves old bytes", async () => {
    const auth = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const response = await serve(auth, async () => ({ data: new Blob(["secret"]), error: null }));
    expect(response.status).toBe(403); expect(await response.text()).not.toContain("secret");
  });
  it.each([401, 403, 404])("storage %i fails closed without URL fallback", async (status) => {
    const response = await serve(async () => true, async () => ({ data: null, error: { status } }));
    expect(response.status).toBe(404); expect(await response.text()).not.toContain("url");
  });
  it("rejects >20MiB without serving bytes", async () => {
    const response = await serve(async () => true, async () => ({ data: new Blob([new Uint8Array(20971521)]), error: null }));
    expect(response.status).toBe(413);
  });
  it("aborts at 15s and late result cannot reopen", async () => {
    vi.useFakeTimers();
    try {
      let resolve: (value: unknown) => void = () => {};
      const download = vi.fn(() => new Promise((done) => { resolve = done; }));
      const pending = serve(async () => true, download);
      await vi.advanceTimersByTimeAsync(15000);
      const response = await pending; expect(response.status).toBe(504);
      const signal = download.mock.calls[0]?.[0] as AbortSignal | undefined;
      expect(signal?.aborted).toBe(true);
      resolve({ data: new Blob(["late"]), error: null });
      await Promise.resolve(); expect(response.status).toBe(504);
    } finally { vi.useRealTimers(); }
  });
  it("request abort before I/O never downloads", async () => {
    const c = new AbortController(); c.abort(); const dl = vi.fn();
    expect((await serve(async () => true, dl, new Request("https://isolated.invalid", { signal: c.signal }))).status).toBe(499);
    expect(dl).not.toHaveBeenCalled();
  });
});