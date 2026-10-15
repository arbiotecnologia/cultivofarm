import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CATALOGO_FONTES, consultarCatalogo } from "@/lib/catalogoQueries";
import { CatalogoTecnicoTab } from "@/components/protocolos/CatalogoTecnicoTab";
const state = vi.hoisted(() => ({ failed: -1, calls: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const tables = ["produtos", "microrganismos", "product_technical_profiles", "microorganism_technical_profiles", "formulacoes", "catalog_technical_sources", "microorganism_targets", "product_target_recommendations"];
  const result = { data: table === "produtos" ? [{ id: "p", nome: "Produto", ativo: true }] : [], error: tables.indexOf(table) === state.failed ? { message: "sensitive" } : null };
  state.calls++;
  const q: any = { select: () => q, order: () => q, eq: () => q, then: (resolve: any) => Promise.resolve(result).then(resolve) }; return q;
} } }));
vi.mock("@/hooks/useTenantCatalogVisibility", () => ({ useTenantHiddenIds: () => ({ status: "global" }) }));
vi.mock("@/components/catalogo/CatalogoCardsGrid", () => ({ CatalogoCardsGrid: () => <p>Itens carregados</p> }));
vi.mock("@/components/protocolos/RevisaoTecnicaPanel", () => ({ RevisaoTecnicaPanel: () => null }));
afterEach(cleanup);
describe("consultas atômicas", () => {
  it.each(CATALOGO_FONTES)("rejeita falha de %s", async (fonte) => {
    const responses = CATALOGO_FONTES.map(f => Promise.resolve({ data: [], error: f === fonte ? {} : null }));
    await expect(consultarCatalogo(responses)).rejects.toThrow(fonte);
  });
  it("rejeita falha total e rejeição de transporte", async () => {
    await expect(consultarCatalogo(CATALOGO_FONTES.map(() => Promise.reject(new Error("secret"))))).rejects.toThrow("Produtos, Microrganismos");
  });
  it("preserva sucesso com dados", async () => {
    await expect(consultarCatalogo([Promise.resolve({ data: [{ id: "1" }], error: null })])).resolves.toEqual([{ data: [{ id: "1" }], error: null }]);
  });
  it("oculta KPIs na falha parcial e refaz todas as consultas no retry", async () => {
    state.failed = 4; state.calls = 0;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><CatalogoTecnicoTab /></MemoryRouter></QueryClientProvider>);
    expect((await screen.findByRole("alert")).textContent).toContain("Composição");
    expect(screen.queryByText("Microrganismos ativos")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText("sensitive")).toBeNull();
    state.failed = -1;
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByText("Itens carregados");
    expect(state.calls).toBe(16);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    client.clear();
  });
});
