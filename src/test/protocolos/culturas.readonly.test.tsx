import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (...a: unknown[]) => from(...a) } }));

import { useSaveCultura, useToggleCulturaAtivo, CULTURAS_WRITE_BLOCKED_MESSAGE } from "@/hooks/useCulturas";

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) }, children);

describe("Culturas — contenção de escrita global", () => {
  it("salvar falha explicitamente sem chamar o banco", async () => {
    const { result } = renderHook(() => useSaveCultura(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ nome: "X", descricao: null })).rejects.toThrow(CULTURAS_WRITE_BLOCKED_MESSAGE);
    });
    expect(from).not.toHaveBeenCalled();
  });
  it("desativar falha explicitamente sem chamar o banco", async () => {
    const { result } = renderHook(() => useToggleCulturaAtivo(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ id: "1", ativo: false })).rejects.toThrow(CULTURAS_WRITE_BLOCKED_MESSAGE);
    });
    expect(from).not.toHaveBeenCalled();
  });
  it("aba Culturas não oferece Criar/Editar/Desativar/Excluir", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/pages/Protocolos.tsx", "utf8");
    const tab = src.slice(src.indexOf("function CulturasTab"), src.indexOf("// --- ", src.indexOf("function CulturasTab") + 10));
    expect(tab).not.toMatch(/Nova Cultura|Editar Cultura|Desativar|table="culturas"|useSaveCultura|useToggleCulturaAtivo/);
  });
});
