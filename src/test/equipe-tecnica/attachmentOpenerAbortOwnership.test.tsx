import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "actor" },
  profile: { user_id: "actor", organization_id: "org", ativo: true, senha_provisoria: false }, roles: ["financeiro"],
  loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: () => true }) }));
import { useAuthenticatedAttachmentOpener } from "@/hooks/useAuthenticatedAttachmentOpener";

let n = 0;
beforeEach(() => { n = 0; vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => `blob:${++n}`), revokeObjectURL: vi.fn() })); });
afterEach(() => vi.restoreAllMocks());

describe("opener releases ownership at parent abort even if the transport ignores abort", () => {
  it("loadingPaths empties immediately, retry runs before old settles, old completion cannot touch new bytes", async () => {
    const resolvers: Array<(b: Blob) => void> = [];
    // Transport with NO abort listener: settles only when the test resolves it.
    const load = vi.fn(() => new Promise<Blob>(r => { resolvers.push(r); }));
    const h = renderHook(() => useAuthenticatedAttachmentOpener("r", "financial-receipts", load));
    const parent = new AbortController();
    let old!: Promise<boolean>;
    act(() => { old = h.result.current.open("a.pdf", vi.fn(), parent.signal); });
    expect(h.result.current.loadingPaths).toEqual(["a.pdf"]);
    act(() => parent.abort());
    expect(h.result.current.loadingPaths).toEqual([]);
    let fresh!: Promise<boolean>;
    act(() => { fresh = h.result.current.open("a.pdf", vi.fn(), new AbortController().signal); });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => { resolvers[1](new Blob(["new"])); expect(await fresh).toBe(true); });
    expect(h.result.current.urls["a.pdf"]).toBe("blob:1");
    await act(async () => { resolvers[0](new Blob(["old"])); expect(await old).toBe(false); });
    expect(h.result.current.urls["a.pdf"]).toBe("blob:1");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1); expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(h.result.current.loadingPaths).toEqual([]);
  });
  it("old completion after a still-pending retry does not drop the retry's ownership", async () => {
    const resolvers: Array<(b: Blob) => void> = [];
    const load = vi.fn(() => new Promise<Blob>(r => { resolvers.push(r); }));
    const h = renderHook(() => useAuthenticatedAttachmentOpener("r", "b", load));
    const parent = new AbortController();
    let old!: Promise<boolean>;
    act(() => { old = h.result.current.open("a.pdf", vi.fn(), parent.signal); });
    act(() => parent.abort());
    act(() => { void h.result.current.open("a.pdf", vi.fn()); });
    await act(async () => { resolvers[0](new Blob(["old"])); await old; });
    expect(h.result.current.loadingPaths).toEqual(["a.pdf"]);
  });
});
