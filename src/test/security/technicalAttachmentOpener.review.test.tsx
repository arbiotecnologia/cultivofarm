import { act, renderHook } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: { id: "actor" },
  profile: { user_id: "actor", organization_id: "tenant", ativo: true, senha_provisoria: false },
  roles: ["consultor_tecnico"], loading: false, authzReady: true, authzEpoch: 0,
  checkAuthzAccess: () => true }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/integrations/supabase/client", () => ({
  SUPABASE_URL: "https://swzpzcwiasxmjutrmvkm.supabase.co", SUPABASE_PUBLISHABLE_KEY: "anon",
  supabase: { auth: { getSession: async () => ({ error: null, data: { session: { access_token: "test" } } }) } },
}));
import { useAuthenticatedAttachmentOpener } from "@/hooks/useAuthenticatedAttachmentOpener";
import { loadTechnicalAttachment } from "../../../scripts/technical-attachment-http-20261021/frontend/loadTechnicalAttachment";
beforeEach(() => {
  auth.profile.organization_id = "tenant"; auth.roles = ["consultor_tecnico"]; auth.authzReady = true; auth.authzEpoch = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:fresh"), revokeObjectURL: vi.fn() }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("existing opener + candidate POST loader", () => {
  it.each(["tenant", "roles", "epoch", "lease"])("%s change aborts pending bytes without publishing, then explicit authorized retry works", async change => {
    let enqueue: (b: Uint8Array) => void = () => undefined;
    let close: () => void = () => undefined;
    const response = new Response(new ReadableStream<Uint8Array>({ start(c) {
      enqueue = b => c.enqueue(b); close = () => c.close();
    } }), { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" } });
    const f = vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(new Response("fresh", {
      headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } }));
    const load = (p: string, s: AbortSignal) => loadTechnicalAttachment(p, s, f);
    const h = renderHook(() => useAuthenticatedAttachmentOpener("visit", "consultor-arquivos", load));
    let old: Promise<boolean> = Promise.resolve(false);
    await act(async () => { old = h.result.current.open("file.pdf", vi.fn()); await Promise.resolve(); });
    expect(f).toHaveBeenCalledTimes(1);
    act(() => {
      if (change === "tenant") auth.profile.organization_id = "other";
      if (change === "roles") auth.roles = [];
      if (change === "epoch") auth.authzEpoch++;
      if (change === "lease") auth.authzReady = false;
      h.rerender();
    });
    await act(async () => { expect(await old).toBe(false); });
    expect(h.result.current.urls).toEqual({}); expect(URL.createObjectURL).not.toHaveBeenCalled();
    // Canceled reader cannot deliver a stale Blob; restoration does not automatically fetch.
    expect(() => { enqueue(new Uint8Array([1])); close(); }).toThrow();
    act(() => { auth.profile.organization_id = "tenant"; auth.roles = ["consultor_tecnico"]; auth.authzReady = true; h.rerender(); });
    expect(f).toHaveBeenCalledTimes(1);
    await act(async () => { expect(await h.result.current.open("file.pdf", vi.fn())).toBe(true); });
    expect(h.result.current.urls["file.pdf"]).toBe("blob:fresh"); expect(f).toHaveBeenCalledTimes(2);
    h.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fresh");
  });
});