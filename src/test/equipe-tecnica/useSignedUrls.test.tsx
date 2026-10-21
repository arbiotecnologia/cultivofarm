import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Contrato pós-2026-10-21: o hook não emite URL assinada. Só download autenticado → blob:.
const createSignedUrls = vi.fn();
const createSignedUrl = vi.fn();
const download = vi.fn();
const auth = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["administrador"], loading: false, authzReady: true, authzEpoch: 0 }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ createSignedUrls, createSignedUrl }) } } }));
vi.mock("@/lib/authz/authenticatedAttachment", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/authz/authenticatedAttachment")>(),
  downloadAuthenticatedAttachment: (...args: unknown[]) => download(...args),
}));

import { useSignedUrls } from "@/hooks/useSignedUrls";

let n = 0;
beforeEach(() => {
  createSignedUrls.mockReset(); createSignedUrl.mockReset(); download.mockReset(); n = 0;
  download.mockImplementation(async () => new Blob(["x"]));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:${++n}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  auth.user = { id: "A" };
  auth.profile = { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false };
  auth.roles = ["administrador"]; auth.loading = false; auth.authzReady = true; auth.authzEpoch = 0;
});
const noSigning = () => { expect(createSignedUrls).not.toHaveBeenCalled(); expect(createSignedUrl).not.toHaveBeenCalled(); };

describe("useSignedUrls (somente download autenticado)", () => {
  it("isola respostas antigas sob StrictMode com QueryClient real e unmount", async () => {
    const pending: Array<(b: Blob) => void> = [];
    download.mockImplementation(() => new Promise<Blob>(r => pending.push(r)));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}><StrictMode>{children}</StrictMode></QueryClientProvider>;
    const h = renderHook(() => useSignedUrls(["a.png"]), { wrapper });
    await act(async () => { pending.forEach(r => r(new Blob(["1"]))); });
    await waitFor(() => expect(h.result.current.urls["a.png"]).toMatch(/^blob:/));
    act(() => h.result.current.refresh());
    h.unmount();
    await act(async () => { pending.forEach(r => r(new Blob(["late"]))); });
    const next = renderHook(() => useSignedUrls(["a.png"]), { wrapper });
    expect(next.result.current.urls).toEqual({});
    next.unmount(); qc.clear(); noSigning();
  });
  for (const change of ["identity", "tenant", "roles", "logout", "inactive", "mismatch", "loading", "provisional", "pending", "epoch"] as const) {
    it(`limpa apresentação e revoga blob imediatamente em ${change}`, async () => {
      const h = renderHook(() => useSignedUrls(["a.png"]));
      await waitFor(() => expect(h.result.current.urls["a.png"]).toBe("blob:1"));
      download.mockImplementation(() => new Promise(() => {}));
      if (change === "identity") { auth.user = { id: "B" }; auth.profile.user_id = "B"; }
      if (change === "tenant") auth.profile.organization_id = "OB";
      if (change === "roles") auth.roles = ["gestor"];
      if (change === "logout") auth.user = null;
      if (change === "inactive") auth.profile.ativo = false;
      if (change === "mismatch") auth.profile.user_id = "B";
      if (change === "loading") auth.loading = true;
      if (change === "provisional") auth.profile.senha_provisoria = true;
      if (change === "pending") auth.authzReady = false;
      if (change === "epoch") auth.authzEpoch = 1;
      h.rerender();
      expect(h.result.current.urls).toEqual({});
      expect(h.result.current.error).toBeNull();
      await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1"));
      if (["logout", "inactive", "mismatch", "loading", "provisional", "pending"].includes(change)) expect(download).toHaveBeenCalledTimes(1);
      h.unmount(); noSigning();
    });
  }
  it("cerca resposta antiga após A→B e volta A, com os mesmos paths", async () => {
    let resolveOld: (b: Blob) => void = () => {};
    download.mockImplementationOnce(() => new Promise<Blob>(r => { resolveOld = r; }));
    const h = renderHook(() => useSignedUrls(["a.png"]));
    auth.user = { id: "B" }; auth.profile.user_id = "B"; h.rerender();
    await waitFor(() => expect(h.result.current.urls["a.png"]).toBe("blob:1"));
    auth.user = { id: "A" }; auth.profile.user_id = "A"; h.rerender();
    await waitFor(() => expect(h.result.current.urls["a.png"]).toBe("blob:2"));
    await act(async () => resolveOld(new Blob(["old"])));
    expect(h.result.current.urls["a.png"]).toBe("blob:2");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    h.unmount(); noSigning();
  });
  it("revogação parcial de papel (roles muda, mesmo tenant) refaz download autenticado, nunca reaproveita blob", async () => {
    auth.roles = ["gestor", "consultor"];
    const h = renderHook(() => useSignedUrls(["a.png"]));
    await waitFor(() => expect(h.result.current.urls["a.png"]).toBe("blob:1"));
    auth.roles = ["consultor"]; h.rerender();
    expect(h.result.current.urls).toEqual({});
    await waitFor(() => expect(h.result.current.urls["a.png"]).toBe("blob:2"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1"); expect(download).toHaveBeenCalledTimes(2);
    h.unmount(); noSigning();
  });
  it("nega download sem papéis e sem organização", () => {
    auth.roles = [];
    const h = renderHook(() => useSignedUrls(["a.png"]));
    expect(download).not.toHaveBeenCalled();
    auth.roles = ["administrador"]; auth.profile.organization_id = ""; h.rerender();
    expect(download).not.toHaveBeenCalled(); expect(h.result.current.urls).toEqual({}); noSigning();
  });
  it("limpa URLs ao trocar bucket ou paths", async () => {
    const h = renderHook(({ bucket, path }) => useSignedUrls([path], bucket), { initialProps: { bucket: "one", path: "a.png" } });
    await waitFor(() => expect(h.result.current.urls["a.png"]).toBeDefined());
    download.mockImplementation(() => new Promise(() => {}));
    h.rerender({ bucket: "two", path: "a.png" }); expect(h.result.current.urls).toEqual({});
    h.rerender({ bucket: "two", path: "b.png" }); expect(h.result.current.urls).toEqual({});
    expect(download).toHaveBeenLastCalledWith("two", "b.png", expect.any(AbortSignal));
    h.unmount(); noSigning();
  });
  it("erro de transporte é neutro, sem token, e Retry recupera sem assinatura", async () => {
    download.mockRejectedValueOnce(new Error("https://example.invalid/?token=SEGREDO"));
    const { result } = renderHook(() => useSignedUrls(["a.png"]));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).not.toMatch(/token|https:/);
    expect(result.current.failed).toEqual(["a.png"]); expect(result.current.urls).toEqual({});
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.urls["a.png"]).toMatch(/^blob:/));
    expect(result.current.error).toBeNull(); noSigning();
  });
  it("timeout/abort de um anexo falha só ele e preserva os demais", async () => {
    download.mockImplementation(async (_b: string, p: string) => { if (p === "b.png") throw new Error("Anexo indisponível"); return new Blob(["a"]); });
    const { result } = renderHook(() => useSignedUrls(["a.png", "b.png"]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current.urls)).toEqual(["a.png"]); expect(result.current.failed).toEqual(["b.png"]); noSigning();
  });
  it("deduplica caminhos válidos e não chama Storage sem caminho", async () => {
    const { result } = renderHook(() => useSignedUrls(["a.png", "a.png", null, "", undefined]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(download).toHaveBeenCalledTimes(1);
    const empty = renderHook(() => useSignedUrls([null, undefined, ""]));
    expect(empty.result.current.urls).toEqual({}); expect(download).toHaveBeenCalledTimes(1); noSigning();
  });
  it("unmount aborta pendentes e revoga blobs entregues", async () => {
    let signal: AbortSignal | undefined;
    download.mockImplementation(async (_b: string, p: string, s: AbortSignal) => { if (p === "b.png") { signal = s; return new Promise(() => {}); } return new Blob(["a"]); });
    const h = renderHook(() => useSignedUrls(["a.png", "b.png"]));
    await waitFor(() => expect(h.result.current.urls["a.png"]).toBe("blob:1"));
    h.unmount();
    expect(signal?.aborted).toBe(true); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1"); noSigning();
  });
});
