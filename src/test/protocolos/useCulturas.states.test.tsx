import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

const state: { rows: any[]; error: any } = { rows: [], error: null };

vi.mock("@/integrations/supabase/client", () => {
  const builder: any = {
    select: () => builder,
    order: () => Promise.resolve({ data: state.rows, error: state.error }),
    update: () => builder,
    insert: () => Promise.resolve({ error: state.error }),
    eq: () => Promise.resolve({ error: state.error }),
  };
  return { supabase: { from: () => builder } };
});

import { useCulturas } from "@/hooks/useCulturas";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useCulturas — estados distintos", () => {
  beforeEach(() => {
    state.rows = [];
    state.error = null;
  });

  it("expõe estado de carregamento antes da resposta", () => {
    const { result } = renderHook(() => useCulturas(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });

  it("expõe estado vazio quando não há culturas", async () => {
    const { result } = renderHook(() => useCulturas(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("expõe estado de sucesso com dados", async () => {
    state.rows = [{ id: "1", nome: "Soja", descricao: null, ativo: true, desativada_em: null }];
    const { result } = renderHook(() => useCulturas(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].nome).toBe("Soja");
  });

  it("expõe estado de erro distinto de vazio", async () => {
    state.error = { message: "falha de rede" };
    const { result } = renderHook(() => useCulturas(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
