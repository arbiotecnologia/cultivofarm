import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadableStream } from "node:stream/web";
import { StrictMode, type ReactNode } from "react";
const mocks = vi.hoisted(() => ({ stream: vi.fn(), sign: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["cliente_produtor"], loading: false, authzReady: true, authzEpoch: 0 }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ download: (...args: unknown[]) => ({ asStream: () => mocks.stream(...args) }), createSignedUrls: mocks.sign }) } } }));
import { useAuthenticatedBlobUrls } from "@/hooks/useAuthenticatedBlobUrls";
import { ATTACHMENT_LIMITS, downloadAuthenticatedAttachment } from "@/lib/authz/authenticatedAttachment";
function body(size = 3) { return { data: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(size)); c.close(); } }), error: null }; }
beforeEach(() => {
  mocks.stream.mockReset().mockImplementation(async () => body()); mocks.sign.mockReset();
  auth.user = { id: "A" }; auth.profile = { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false };
  auth.roles = ["cliente_produtor"]; auth.loading = false; auth.authzReady = true; auth.authzEpoch = 0;
  let number = 0;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:owned-${++number}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
describe("authenticated Blob candidate", () => {
  it("lazy downloads only requested allowed paths, deduplicates and never signs", async () => {
    const h = renderHook(() => useAuthenticatedBlobUrls(["a.jpg", "b.pdf", "a.jpg"], "private", { lazy: true }));
    expect(mocks.stream).not.toHaveBeenCalled();
    act(() => { h.result.current.request("not-listed"); h.result.current.request("a.jpg"); h.result.current.request("a.jpg"); });
    await waitFor(() => expect(h.result.current.urls["a.jpg"]).toBe("blob:owned-1"));
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(mocks.stream.mock.calls[0][2]).toMatchObject({ cache: "no-store", signal: expect.any(AbortSignal) });
    expect(mocks.sign).not.toHaveBeenCalled(); h.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:owned-1");
  });
  for (const change of ["logout", "pending", "epoch", "tenant", "identity", "roles", "unmount"] as const) {
    it(`hides and revokes owned URLs on ${change}`, async () => {
      const h = renderHook(() => useAuthenticatedBlobUrls(["a.jpg"]));
      await waitFor(() => expect(h.result.current.urls["a.jpg"]).toBe("blob:owned-1"));
      mocks.stream.mockImplementation((_path: string, _options: unknown, parameters: { signal: AbortSignal }) => new Promise((_resolve, reject) => parameters.signal.addEventListener("abort", () => reject(new Error("abort")), { once: true })));
      if (change === "logout") auth.user = null;
      if (change === "pending") auth.authzReady = false;
      if (change === "epoch") auth.authzEpoch++;
      if (change === "tenant") auth.profile.organization_id = "OB";
      if (change === "identity") { auth.user = { id: "B" }; auth.profile.user_id = "B"; }
      if (change === "roles") auth.roles = [];
      if (change === "unmount") h.unmount(); else { h.rerender(); expect(h.result.current.urls).toEqual({}); }
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:owned-1"); h.unmount();
    });
  }
  it("discards a response crossing pending and A→B→A before Blob publication", async () => {
    let resolve: (v: ReturnType<typeof body>) => void = () => {};
    mocks.stream.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const h = renderHook(() => useAuthenticatedBlobUrls(["a.jpg"]));
    await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(1));
    auth.authzReady = false; h.rerender(); auth.user = { id: "B" }; auth.profile.user_id = "B"; h.rerender();
    auth.user = { id: "A" }; auth.profile.user_id = "A"; auth.authzReady = true; h.rerender();
    await waitFor(() => expect(h.result.current.urls["a.jpg"]).toBe("blob:owned-1"));
    await act(async () => resolve(body()));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1); h.unmount();
  });
  it("caps global concurrency at three, including different hook instances", async () => {
    const pending: Array<(v: ReturnType<typeof body>) => void> = [];
    mocks.stream.mockImplementation(() => new Promise(r => pending.push(r)));
    const a = renderHook(() => useAuthenticatedBlobUrls(["a.jpg", "b.jpg"]));
    const b = renderHook(() => useAuthenticatedBlobUrls(["c.jpg", "d.jpg"]));
    await waitFor(() => expect(pending.length).toBe(ATTACHMENT_LIMITS.concurrent));
    await act(async () => pending[0](body()));
    await waitFor(() => expect(pending.length).toBe(4));
    await act(async () => pending.slice(1).forEach(resolve => resolve(body()))); a.unmount(); b.unmount();
  });
  it("cancels stream exceeding 20 MiB before retaining a Blob", async () => {
    const cancel = vi.fn();
    mocks.stream.mockResolvedValue({ data: new ReadableStream({ start(c) { c.enqueue(new Uint8Array(ATTACHMENT_LIMITS.fileBytes + 1)); }, cancel }), error: null });
    await expect(downloadAuthenticatedAttachment("private", "a.pdf", new AbortController().signal)).rejects.toThrow("Anexo indisponível");
    expect(cancel).toHaveBeenCalled(); expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it("rejects over 24 files explicitly without issuing requests", async () => {
    const h = renderHook(() => useAuthenticatedBlobUrls(Array.from({ length: 25 }, (_, n) => `${n}.jpg`)));
    await waitFor(() => expect(h.result.current.error).toBeInstanceOf(Error));
    expect(mocks.stream).not.toHaveBeenCalled(); h.unmount();
  });
  it("caps retained content at 60 MiB per scoped hook", async () => {
    mocks.stream.mockImplementation(async () => body(ATTACHMENT_LIMITS.fileBytes));
    const h = renderHook(() => useAuthenticatedBlobUrls(["a.pdf", "b.pdf", "c.pdf", "d.pdf"]));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    expect(Object.keys(h.result.current.urls)).toHaveLength(3);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
    expect(h.result.current.error).toBeInstanceOf(Error); h.unmount();
  });
  it("abort cancels stalled reader without waiting for old bytes", async () => {
    const cancel = vi.fn();
    mocks.stream.mockResolvedValue({ data: new ReadableStream({ cancel }), error: null });
    const controller = new AbortController();
    const pending = downloadAuthenticatedAttachment("private", "a.pdf", controller.signal);
    await waitFor(() => expect(mocks.stream).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(pending).rejects.toThrow("Anexo indisponível");
    expect(cancel).toHaveBeenCalled();
  });
  it("timeout at 15 seconds cancels a stalled download", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      mocks.stream.mockResolvedValue({ data: new ReadableStream({ cancel }), error: null });
      const pending = downloadAuthenticatedAttachment("private", "a.pdf", new AbortController().signal);
      const assertion = expect(pending).rejects.toThrow("Anexo indisponível");
      await vi.advanceTimersByTimeAsync(ATTACHMENT_LIMITS.timeoutMs);
      await assertion; expect(cancel).toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("preserves partial success and manual refresh revokes previous owned URLs", async () => {
    mocks.stream.mockImplementation(async (path: string) => path === "b.pdf" ? { data: null, error: new Error("token=secret") } : body());
    const h = renderHook(() => useAuthenticatedBlobUrls(["a.jpg", "b.pdf"]));
    await waitFor(() => expect(h.result.current.loading).toBe(false));
    expect(h.result.current.urls["a.jpg"]).toBe("blob:owned-1"); expect(h.result.current.error?.message).toBe("Anexo indisponível");
    act(() => h.result.current.refresh());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:owned-1");
    await waitFor(() => expect(h.result.current.urls["a.jpg"]).toBe("blob:owned-2")); h.unmount();
  });
  it("StrictMode never publishes cancelled initial responses", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const h = renderHook(() => useAuthenticatedBlobUrls(["a.jpg"]), { wrapper });
    await waitFor(() => expect(h.result.current.urls["a.jpg"]).toBe("blob:owned-1"));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1); h.unmount();
  });
});