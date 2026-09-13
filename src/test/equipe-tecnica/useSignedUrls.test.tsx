import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const createSignedUrls = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ createSignedUrls }) },
  },
}));

import { useSignedUrls } from "@/hooks/useSignedUrls";

beforeEach(() => {
  createSignedUrls.mockReset();
});

describe("useSignedUrls", () => {
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
