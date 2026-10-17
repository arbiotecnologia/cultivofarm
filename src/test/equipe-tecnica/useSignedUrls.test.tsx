import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const createSignedUrls = vi.fn();
const auth = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false }, roles: ["administrador"], loading: false, authzReady: true, authzEpoch: 0 }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrls }) },
  },
}));

import { useSignedUrls } from "@/hooks/useSignedUrls";

beforeEach(() => {
  createSignedUrls.mockReset();
  auth.user = { id: "A" };
  auth.profile = { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false };
  auth.roles = ["administrador"];
  auth.loading = false;
  auth.authzReady = true; auth.authzEpoch = 0;
});

describe("useSignedUrls", () => {
  it("isola respostas antigas sob StrictMode com QueryClient real e unmount", async () => {
    const pending: Array<(value: unknown) => void> = [];
    createSignedUrls.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}><StrictMode>{children}</StrictMode></QueryClientProvider>;
    const h = renderHook(() => useSignedUrls(["a.png"]), { wrapper });
    expect(pending.length).toBe(2);
    await act(async () => pending[0]({ data: [{ path: "a.png", signedUrl: "https://s/stale" }], error: null }));
    expect(h.result.current.urls).toEqual({});
    await act(async () => pending[1]({ data: [{ path: "a.png", signedUrl: "https://s/current" }], error: null }));
    expect(h.result.current.urls["a.png"]).toBe("https://s/current");
    act(() => h.result.current.refresh());
    h.unmount();
    await act(async () => pending[2]({ data: [{ path: "a.png", signedUrl: "https://s/late" }], error: null }));
    const next = renderHook(() => useSignedUrls(["a.png"]), { wrapper });
    expect(next.result.current.urls).toEqual({});
    next.unmount(); queryClient.clear();
  });
  for (const change of ["identity", "tenant", "roles", "logout", "inactive", "mismatch", "loading", "provisional", "pending", "epoch"] as const) {
    it(`limpa apresentação imediatamente em ${change}`, async () => {
      createSignedUrls.mockResolvedValue({ data: [{ path: "a.png", signedUrl: "https://s/old" }], error: null });
      const h = renderHook(() => useSignedUrls(["a.png"]));
      await waitFor(() => expect(h.result.current.urls["a.png"]).toBe("https://s/old"));
      createSignedUrls.mockImplementation(() => new Promise(() => {}));
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
      if (["logout", "inactive", "mismatch", "loading", "provisional"].includes(change)) expect(createSignedUrls).toHaveBeenCalledTimes(1);
      h.unmount();
    });
  }
  it("cerca resposta antiga após A→B e volta A, com os mesmos paths", async () => {
    let resolveOld: (value: unknown) => void = () => {};
    createSignedUrls.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const h = renderHook(() => useSignedUrls(["a.png"]));
    auth.user = { id: "B" }; auth.profile.user_id = "B";
    createSignedUrls.mockResolvedValue({ data: [{ path: "a.png", signedUrl: "https://s/new" }], error: null });
    h.rerender();
    await waitFor(() => expect(h.result.current.urls["a.png"]).toBe("https://s/new"));
    auth.user = { id: "A" }; auth.profile.user_id = "A";
    h.rerender();
    await waitFor(() => expect(h.result.current.urls["a.png"]).toBe("https://s/new"));
    await act(async () => resolveOld({ data: [{ path: "a.png", signedUrl: "https://s/old" }], error: null }));
    expect(h.result.current.urls["a.png"]).toBe("https://s/new");
    h.unmount();
  });
  it("nega assinatura sem papéis e sem organização", () => {
    auth.roles = [];
    const h = renderHook(() => useSignedUrls(["a.png"]));
    expect(createSignedUrls).not.toHaveBeenCalled();
    auth.roles = ["administrador"]; auth.profile.organization_id = ""; h.rerender();
    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(h.result.current.urls).toEqual({});
  });
  it("limpa URLs ao trocar bucket ou paths", async () => {
    createSignedUrls.mockResolvedValue({ data: [{ path: "a.png", signedUrl: "https://s/a" }], error: null });
    const h = renderHook(({ bucket, path }) => useSignedUrls([path], bucket), { initialProps: { bucket: "one", path: "a.png" } });
    await waitFor(() => expect(h.result.current.urls["a.png"]).toBeDefined());
    createSignedUrls.mockImplementation(() => new Promise(() => {}));
    h.rerender({ bucket: "two", path: "a.png" }); expect(h.result.current.urls).toEqual({});
    h.rerender({ bucket: "two", path: "b.png" }); expect(h.result.current.urls).toEqual({});
    h.unmount();
  });
  it("não expõe token no erro global do transporte", async () => {
    createSignedUrls.mockRejectedValue(new Error("https://example.invalid/?token=SEGREDO"));
    const h = renderHook(() => useSignedUrls(["a.png"]));
    await waitFor(() => expect(h.result.current.error).toBeInstanceOf(Error));
    expect(h.result.current.error?.message).toBe("Falha ao gerar URLs seguras");
  });
  it("deduplica caminhos válidos antes de pedir assinatura", async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: "a.png", signedUrl: "https://s/a" }],
      error: null,
    });

    const { result } = renderHook(() => useSignedUrls(["a.png", "a.png", null, "", undefined]));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(["a.png"], 3600);
    expect(result.current.urls).toEqual({ "a.png": "https://s/a" });
    expect(result.current.error).toBeNull();
  });

  it("não chama o storage quando não há caminho válido", async () => {
    const { result } = renderHook(() => useSignedUrls([null, undefined, ""]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(result.current.urls).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it("resposta parcial expõe erro e preserva apenas as URLs válidas", async () => {
    createSignedUrls.mockResolvedValue({
      data: [
        { path: "a.png", signedUrl: "https://s/a" },
        { path: "b.png", signedUrl: null, error: "Object not found" },
      ],
      error: null,
    });

    const { result } = renderHook(() => useSignedUrls(["a.png", "b.png"]));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.urls).toEqual({ "a.png": "https://s/a" });
    expect(result.current.error).toBeInstanceOf(Error);
    // Sem fallback inseguro: o caminho que falhou não recebe URL alguma.
    expect(result.current.urls["b.png"]).toBeUndefined();
  });

  it("caminho ausente na resposta também é falha parcial", async () => {
    createSignedUrls.mockResolvedValue({
      data: [{ path: "a.png", signedUrl: "https://s/a" }],
      error: null,
    });

    const { result } = renderHook(() => useSignedUrls(["a.png", "c.png"]));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(Object.keys(result.current.urls)).toEqual(["a.png"]);
  });

  it("erro global limpa as URLs e permite tentar novamente", async () => {
    createSignedUrls.mockResolvedValueOnce({ data: null, error: new Error("falhou") });

    const { result } = renderHook(() => useSignedUrls(["a.png"]));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.urls).toEqual({});

    createSignedUrls.mockResolvedValueOnce({
      data: [{ path: "a.png", signedUrl: "https://s/a" }],
      error: null,
    });
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.urls).toEqual({ "a.png": "https://s/a" });
  });

  it("mensagem de erro nunca contém a URL assinada", async () => {
    createSignedUrls.mockResolvedValue({
      data: [
        { path: "a.png", signedUrl: "https://s/a?token=SEGREDO" },
        { path: "b.png", signedUrl: null },
      ],
      error: null,
    });

    const { result } = renderHook(() => useSignedUrls(["a.png", "b.png"]));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.error?.message).not.toContain("token");
    expect(result.current.error?.message).not.toContain("https://");
  });
});
