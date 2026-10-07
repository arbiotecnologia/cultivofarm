import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), role: "parceiro_b2b_tecnico", userId: "tech-a",
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: mocks.userId }, role: mocks.role }) }));
import { useSimulacaoFormalHeader } from "@/hooks/useSimulacaoFormalHeader";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("Cabeçalho B2B — projeção canônica", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role = "parceiro_b2b_tecnico";
    mocks.from.mockImplementation((table: string) => {
      if (table === "partner_simulation_items") throw new Error("raw_items_forbidden");
      const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: null, error: null }) };
      return builder;
    });
    mocks.rpc.mockImplementation(async (_name: string, args: { p_items?: boolean }) => ({
      data: args.p_items
        ? [{ quantidade: 3, volume_ml: 1000 }]
        : [{ id: "sim-a", partner_id: "partner-a", created_at: "2026-10-07", status: "rascunho" }],
      error: null,
    }));
  });

  it("técnico calcula volume sem consultar itens brutos ou receber preço", async () => {
    const { result } = renderHook(() => useSimulacaoFormalHeader("sim-a"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.volume_total_litros).toBe(3);
    expect(result.current.data?.total_cheio).toBe(0);
    expect(mocks.rpc).toHaveBeenCalledWith("b2b_read_simulations", { p_simulation_id: "sim-a", p_items: true });
    expect(mocks.from).not.toHaveBeenCalledWith("partner_simulation_items");
  });

  it("falha dos itens fica visível como erro, não volume vazio", async () => {
    mocks.rpc.mockImplementation(async (_name: string, args: { p_items?: boolean }) => args.p_items
      ? { data: null, error: { message: "scope_denied" } }
      : { data: [{ id: "sim-a", partner_id: "partner-a", created_at: "2026-10-07" }], error: null });
    const { result } = renderHook(() => useSimulacaoFormalHeader("sim-a"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({ message: "scope_denied" });
  });

  it.each(["administrador", "gestor_comercial", "parceiro_b2b"])("preserva total comercial para %s", async (role) => {
    mocks.role = role;
    mocks.rpc.mockImplementation(async (_name: string, args: { p_items?: boolean }) => ({
      data: args.p_items ? [{ quantidade: 2, volume_ml: 500, subtotal: 200 }]
        : [{ id: "sim-a", partner_id: "partner-a", created_at: "2026-10-07", total_cheio: 200 }], error: null,
    }));
    const { result } = renderHook(() => useSimulacaoFormalHeader("sim-a"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total_cheio).toBe(200);
    expect(result.current.data?.volume_total_litros).toBe(1);
  });
});