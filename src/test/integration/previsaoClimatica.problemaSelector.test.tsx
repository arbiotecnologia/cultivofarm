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

// Open-Meteo / fetch externo
const fetchMock = vi.fn(async () =>
  new Response(
    JSON.stringify({
      hourly: { time: [], temperature_2m: [], relative_humidity_2m: [], precipitation: [] },
      daily: { time: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_sum: [] },
      current: { temperature_2m: 25, relative_humidity_2m: 60 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ),
);

import { DashboardClimatico } from "@/components/previsao/DashboardClimatico";

describe("Previsão Climática — integração com catálogo de problemas", () => {
  beforeEach(() => {
    resetSupabaseMock();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);

    setTableData("fazendas", [
      { id: "f1", nome: "Fazenda Sol", latitude: -23.5, longitude: -46.6 },
      { id: "f2", nome: "Fazenda Lua", latitude: -22.9, longitude: -47.1 },
    ]);
    setTableData("clima_dados", []);
    setTableData("alertas_clima", []);
    setTableData("catalogo_problemas", [
      { id: "p1", nome: "Ferrugem", categoria: "doencas_fungicas", nome_cientifico: null },
    ]);
  });

  it("carrega lista de fazendas do dashboard climático sem erro", async () => {
    renderWithProviders(<DashboardClimatico />);

    await waitFor(() => {
      expect(getCallCount("fazendas")).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/erro ao carregar/i)).not.toBeInTheDocument();
  });

  it("após invalidar cache (uso do seletor), as queries climáticas refazem o fetch", async () => {
    const client = makeQueryClient();
    renderWithProviders(<DashboardClimatico />, { client });

    await waitFor(() => expect(getCallCount("fazendas")).toBeGreaterThan(0));
    const base = getCallCount("fazendas");

    await client.invalidateQueries();

    await waitFor(() => expect(getCallCount("fazendas")).toBeGreaterThan(base));
    expect(screen.queryByText(/erro ao carregar/i)).not.toBeInTheDocument();
  });
});
