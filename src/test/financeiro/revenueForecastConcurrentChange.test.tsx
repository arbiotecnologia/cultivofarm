import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Leitor real (hook + escopo + painel); só transporte e sessão simulados.
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("@/hooks/useStorageAccessScope", () => ({
  useStorageAccessScope: () => ({ ready: true, scope: "s1", capture: () => () => true }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ profile: { organization_id: "orgARBio" } }) }));

const ok = {
  contract: "B2B_REVENUE_FORECAST_TENANT_V2", partner_id: null, organization_id: "orgARBio",
  forecast_residual: { amount: 747, orders: 1, enforceable: false, due_dates_estimated: true, inconsistent: 0 },
  confirmed_titles: { proof: "b2b_document_allocation_v1", installments: 2, vencido: 0, ate_30: 18, ate_60: 0, ate_90: 0, apos_90: 0, total_aberto: 18 },
  titles_unavailable: { unproven: 0, legacy: 0, inconsistent: 0 }, legacy_unproven_orders: 0,
};

describe("leitor V2: 40001 B2B_REVENUE_FORECAST_CONCURRENT_CHANGE", () => {
  it("após sucesso, recálculo esgotado (40001, sem payload) mostra indisponível e não mantém total anterior", async () => {
    rpc.mockResolvedValueOnce({ data: ok, error: null });
    const { default: P } = await import("@/pages/financeiro/PrevisaoReceitaB2B");
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><P /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByText(/Títulos com NF autorizada em aberto/)).toBeInTheDocument());
    expect(screen.getAllByText(/747/).length).toBeGreaterThan(0);

    rpc.mockResolvedValueOnce({ data: null, error: { code: "40001", message: "B2B_REVENUE_FORECAST_CONCURRENT_CHANGE" } });
    await act(async () => { await qc.refetchQueries(); });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Previsão indisponível para esta sessão"));
    expect(screen.queryByText(/R\$/)).toBeNull();
    expect(screen.queryByText(/747|18,00/)).toBeNull();
    expect(screen.queryByText(/Títulos com NF autorizada/)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(2); // sem retry automático
    expect(rpc).toHaveBeenLastCalledWith("rpc_b2b_revenue_forecast_tenant_v2", { p_partner_id: null });
  });
});
