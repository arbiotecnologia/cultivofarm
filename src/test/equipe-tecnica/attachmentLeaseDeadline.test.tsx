import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthzEpochMonitor } from "@/lib/authz/authzEpochMonitor";

const state = vi.hoisted(() => ({ check: () => true, sign: vi.fn(), download: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: "actor" }, profile: { user_id: "actor", organization_id: "tenant", ativo: true, senha_provisoria: false },
  roles: ["parceiro_b2b"], loading: false, authzReady: true, authzEpoch: 0,
  checkAuthzAccess: () => state.check(),
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ createSignedUrls: state.sign }) } } }));
vi.mock("@/lib/authz/authenticatedAttachment", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/authz/authenticatedAttachment")>(),
  downloadAuthenticatedAttachment: (...args: unknown[]) => state.download(...args),
}));
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { useAuthenticatedBlobUrls } from "@/hooks/useAuthenticatedBlobUrls";
import { useAuthenticatedAttachmentOpener } from "@/hooks/useAuthenticatedAttachmentOpener";

beforeEach(() => { state.check = () => true; state.sign.mockReset(); state.download.mockReset(); });

async function lease() {
  let clock = 0;
  // Real monitor; intentionally no timer callbacks: suspended/delayed browser task.
  const monitor = createAuthzEpochMonitor({ fetcher: async () => ({ eligible: true, fingerprint: "same" }),
    now: () => clock, setTimeoutFn: () => 1, clearTimeoutFn: () => {}, isVisible: () => true, isOnline: () => true,
    onEpochChange: () => {}, onExpire: () => {},
  });
  monitor.start(); await act(async () => { await Promise.resolve(); });
  state.check = monitor.checkAccess;
  return { monitor, expire: () => { clock = 15_000; } };
}

describe("attachment authorization at completion, without Auth rerender", () => {
  it("rejects a captured fence exactly at the 15s deadline", async () => {
    const l = await lease(); const h = renderHook(() => useStorageAccessScope("file"));
    const current = h.result.current.capture(); expect(current()).toBe(true);
    l.expire(); expect(l.monitor.state()).toBe("valid"); expect(current()).toBe(false);
    h.unmount(); l.monitor.stop();
  });
  it("does not expose a signed URL completed after deadline", async () => {
    const l = await lease(); let resolve: (v: unknown) => void = () => {};
    state.sign.mockImplementation(() => new Promise(r => { resolve = r; }));
    const h = renderHook(() => useSignedUrls(["file.pdf"]));
    expect(state.sign).toHaveBeenCalledTimes(1); l.expire();
    await act(async () => resolve({ data: [{ path: "file.pdf", signedUrl: "https://example.invalid/late" }], error: null }));
    expect(h.result.current.urls).toEqual({}); h.unmount(); l.monitor.stop();
  });
  it("does not mint a new request after expiry even before rerender", async () => {
    const l = await lease(); const h = renderHook(() => useAuthenticatedAttachmentOpener("file", "bucket"));
    l.expire(); await act(async () => h.result.current.open("file.pdf", vi.fn()));
    expect(state.download).not.toHaveBeenCalled(); h.unmount(); l.monitor.stop();
  });
  it("does not create a thumbnail Blob URL from a late response", async () => {
    const l = await lease(); let resolve: (b: Blob) => void = () => {};
    state.download.mockImplementation(() => new Promise<Blob>(r => { resolve = r; }));
    const create = vi.spyOn(URL, "createObjectURL");
    const h = renderHook(() => useAuthenticatedBlobUrls(["file.png"])); l.expire();
    await act(async () => resolve(new Blob(["private"])));
    expect(create).not.toHaveBeenCalled(); expect(h.result.current.urls).toEqual({});
    h.unmount(); create.mockRestore(); l.monitor.stop();
  });
});