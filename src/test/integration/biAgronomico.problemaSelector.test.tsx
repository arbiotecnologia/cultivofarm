import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders, makeQueryClient } from "../helpers/renderWithProviders";
import {
  supabaseMock,
  resetSupabaseMock,
  setTableData,
  getCallCount,
} from "../helpers/supabaseMock";

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", email: "t@t.com" }, loading: false }),
  AuthProvider: ({ children }: any) => children,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

import { DashboardAgronomico } from "@/components/bi/DashboardAgronomico";

describe("BI Agronômico — integração com catálogo de problemas", () => {
  beforeEach(() => {
    resetSupabaseMock();
    setTableData("fazendas", [{ id: "f1" }, { id: "f2" }]);
    setTableData("talhoes", [
      { id: "t1", area_hectares: 50, tipo_manejo_agua: "sequeiro" },
      { id: "t2", area_hectares: 30, tipo_manejo_agua: "irrigado" },
    ]);
    setTableData("registros_consultor_recomendacoes", [{ id: "r1" }, { id: "r2" }, { id: "r3" }]);
    setTableData("aplicacoes", [
      { id: "a1", dose_aplicada: 2.5 },
      { id: "a2", dose_aplicada: 3 },
    ]);
    setTableData("catalogo_problemas", [
      { id: "p1", nome: "Lagarta", categoria: "insetos_praga", nome_cientifico: null },
    ]);
  });

  it("carrega KPIs do dashboard agronômico sem erro", async () => {
    renderWithProviders(<DashboardAgronomico />);

    await waitFor(() => {
      expect(getCallCount("fazendas")).toBeGreaterThan(0);
      expect(getCallCount("talhoes")).toBeGreaterThan(0);
      expect(getCallCount("aplicacoes")).toBeGreaterThan(0);
    });

    // Sem mensagem de erro renderizada
    expect(screen.queryByText(/erro ao carregar/i)).not.toBeInTheDocument();
  });

  it("invalidar cache do catálogo (simulando uso do seletor) não quebra o BI", async () => {
    const client = makeQueryClient();
    renderWithProviders(<DashboardAgronomico />, { client });

    await waitFor(() => expect(getCallCount("fazendas")).toBeGreaterThan(0));

    const baseFazendas = getCallCount("fazendas");
    const baseApps = getCallCount("aplicacoes");

    // Simula efeito colateral pós-uso do ProblemaSelector: invalidação ampla
    await client.invalidateQueries();

    await waitFor(() => {
      expect(getCallCount("fazendas")).toBeGreaterThan(baseFazendas);
      expect(getCallCount("aplicacoes")).toBeGreaterThan(baseApps);
    });

    expect(screen.queryByText(/erro ao carregar/i)).not.toBeInTheDocument();
  });
});
