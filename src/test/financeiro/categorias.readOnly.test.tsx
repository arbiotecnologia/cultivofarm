import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Categorias from "@/pages/financeiro/Categorias";
import type { Database } from "@/integrations/supabase/types";

type Category = Pick<Database["public"]["Tables"]["financial_categories"]["Row"], "id" | "name" | "type" | "dre_group" | "active">;
const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), order: vi.fn(), rpc: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
const rows: Category[] = [
  { id: "category-a", name: "Categoria fictícia receita", type: "RECEITA", dre_group: "RECEITA_BRUTA", active: true },
  { id: "category-b", name: "Categoria fictícia despesa", type: "DESPESA", dre_group: null, active: false },
];
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Categorias /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ select: mocks.select, insert: mocks.insert, update: mocks.update, delete: mocks.delete });
  mocks.select.mockReturnValue({ order: mocks.order });
  mocks.order.mockResolvedValue({ data: rows, error: null });
});
afterEach(cleanup);
describe("Categorias — catálogo operacional somente consulta (Supabase mockado)", () => {
  it("preserva categorias, tipo, DRE e status sem oferecer qualquer escrita", async () => {
    mount();
    expect(await screen.findByText(rows[0].name)).toBeInTheDocument();
    expect(screen.getByText(rows[1].name)).toBeInTheDocument();
    for (const value of ["RECEITA", "DESPESA", "RECEITA BRUTA", "Não definido", "Ativa", "Inativa"]) expect(screen.getByText(value)).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
    for (const mutation of [mocks.insert, mocks.update, mocks.delete]) expect(mutation).not.toHaveBeenCalled();
  });
  it("consulta somente as cinco colunas necessárias, ordenadas por nome", async () => {
    mount(); await screen.findByText(rows[0].name);
    expect(mocks.from).toHaveBeenCalledWith("financial_categories");
    expect(mocks.select).toHaveBeenCalledWith("id, name, type, dre_group, active");
    expect(mocks.order).toHaveBeenCalledWith("name");
  });
  it("preserva estado vazio sem oferecer criação", async () => {
    mocks.order.mockResolvedValue({ data: [], error: null }); mount();
    expect(await screen.findByText("Nenhuma categoria cadastrada")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it("não confunde erro de consulta com lista vazia nem exibe detalhes privados", async () => {
    mocks.order.mockResolvedValue({ data: null, error: { message: "DETALHE_PRIVADO" } }); mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as categorias.");
    expect(screen.queryByText("Nenhuma categoria cadastrada")).toBeNull();
    expect(screen.queryByText(/DETALHE_PRIVADO/)).toBeNull();
  });
});
