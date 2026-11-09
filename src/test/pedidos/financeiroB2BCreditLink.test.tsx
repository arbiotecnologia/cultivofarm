import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import FinanceiroB2B from "@/pages/financeiro/FinanceiroB2B";
import { clearAllPauseStates } from "@/lib/authz/pauseRetainedState";
import { PEDIDOS_B2B_DEFAULT_STATUS, usePedidosB2BStatusFilter } from "@/hooks/usePedidosB2BStatusFilter";

let auth: any;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/useStorageAccessScope", () => ({
  useStorageAccessScope: () => ({ ready: false, scope: "uA:orgA", capture: () => () => true }),
}));
vi.mock("@/hooks/useB2BFinanceiro", () => ({
  useB2BReceivables: () => ({ data: [], isLoading: false }),
  useGenerateB2BReceivable: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelB2BReceivable: () => ({ mutate: vi.fn(), isPending: false }),
  usePartnerFinancialSettings: () => ({ data: undefined, isSuccess: false, isFetching: false, isError: false }),
  useUpdatePartnerFinancialSettings: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFinancialSettingsPartners: () => ({ data: [], isFetching: false, isError: false }),
  useFinancialSettingsMethods: () => ({ data: [], isSuccess: false, isFetching: false, isError: false }),
}));

const OPTS = ["all", "aguardando_aprovacao_credito", "aprovado"];
function OrdersProbe() {
  const [status] = usePedidosB2BStatusFilter(OPTS, PEDIDOS_B2B_DEFAULT_STATUS);
  const location = useLocation();
  return <><output data-testid="orders-status">{status}</output><output data-testid="orders-search">{location.search}</output></>;
}

describe("Financeiro B2B → Aprovações de crédito", () => {
  beforeEach(() => {
    clearAllPauseStates();
    auth = {
      user: { id: "uA" },
      profile: { user_id: "uA", organization_id: "orgA", ativo: true },
      role: "administrador", roles: ["administrador"], authzReady: true, loading: false,
    };
  });

  it("o clique real aplica crédito uma vez e não deixa a escolha persistida na URL", () => {
    render(
      <MemoryRouter initialEntries={["/financeiro/b2b"]}>
        <Routes>
          <Route path="/financeiro/b2b" element={<FinanceiroB2B />} />
          <Route path="/comercial/pedidos-b2b" element={<OrdersProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: /Aprovações de crédito/i }));
    expect(screen.getByTestId("orders-status")).toHaveTextContent("aguardando_aprovacao_credito");
    expect(screen.getByTestId("orders-search")).toHaveTextContent("");
  });
});
