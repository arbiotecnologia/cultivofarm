import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useTabParam } from "@/lib/navigation/useTabParam";

const ALLOWED = ["produtos", "culturas", "problemas"] as const;

function wrapperFor(initial: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
  );
}

function useHarness() {
  const [tab, setTab] = useTabParam("tab", ALLOWED, "produtos");
  const location = useLocation();
  return { tab, setTab, search: location.search };
}

describe("useTabParam", () => {
  it("usa o fallback quando não há parâmetro", () => {
    const { result } = renderHook(useHarness, { wrapper: wrapperFor("/base-tecnica") });
    expect(result.current.tab).toBe("produtos");
  });

  it("lê o valor válido da URL", () => {
    const { result } = renderHook(useHarness, { wrapper: wrapperFor("/base-tecnica?tab=culturas") });
    expect(result.current.tab).toBe("culturas");
  });

  it("cai no fallback quando o valor é inválido", () => {
    const { result } = renderHook(useHarness, { wrapper: wrapperFor("/base-tecnica?tab=inexistente") });
    expect(result.current.tab).toBe("produtos");
  });

  it("grava a aba na URL e preserva os demais parâmetros", () => {
    const { result } = renderHook(useHarness, { wrapper: wrapperFor("/base-tecnica?busca=abc") });
    act(() => result.current.setTab("problemas"));
    expect(result.current.tab).toBe("problemas");
    expect(result.current.search).toContain("busca=abc");
    expect(result.current.search).toContain("tab=problemas");
  });

  it("remove o parâmetro ao voltar para o valor padrão", () => {
    const { result } = renderHook(useHarness, { wrapper: wrapperFor("/base-tecnica?tab=culturas&busca=abc") });
    act(() => result.current.setTab("produtos"));
    expect(result.current.tab).toBe("produtos");
    expect(result.current.search).not.toContain("tab=");
    expect(result.current.search).toContain("busca=abc");
  });
});
