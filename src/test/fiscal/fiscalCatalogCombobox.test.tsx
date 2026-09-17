/**
 * Fase H11-A — Combobox de catálogo fiscal oficial.
 * Garante: leitura exclusiva do catálogo publicado, código sugerido no topo,
 * preservação de valor legado e estados de carregamento/erro/vazio.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FiscalCatalogCombobox from "@/components/fiscal/FiscalCatalogCombobox";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const CFOP_ROWS = [
  { code: "6101", description: "Venda interestadual", parent_code: null, metadata: {}, is_preferred: true, catalog_version: "2026.1" },
  { code: "5101", description: "Venda de produção do estabelecimento", parent_code: null, metadata: {}, is_preferred: false, catalog_version: "2026.1" },
];

beforeEach(() => {
  rpc.mockReset();
});

describe("FiscalCatalogCombobox", () => {
  it("lista códigos do catálogo publicado com o sugerido primeiro", async () => {
    rpc.mockImplementation((fn: string) =>
      fn === "rpc_fiscal_catalog_search_v1"
        ? Promise.resolve({ data: CFOP_ROWS, error: null })
        : Promise.resolve({ data: [], error: null }),
    );

    render(
      <FiscalCatalogCombobox catalogType="CFOP" value={null} onChange={() => {}} preferredCodes={["6101"]} />,
      { wrapper },
    );

    await userEvent.click(screen.getByRole("combobox"));
    await waitFor(() => expect(screen.getByText("Venda interestadual")).toBeInTheDocument());
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("6101");
    expect(screen.getByText("sugerido")).toBeInTheDocument();
  });

  it("não consulta o catálogo enquanto fechado", () => {
    rpc.mockResolvedValue({ data: [], error: null });
    render(<FiscalCatalogCombobox catalogType="NCM" value={null} onChange={() => {}} />, { wrapper });
    const calls = rpc.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain("rpc_fiscal_catalog_search_v1");
  });

  it("devolve o código selecionado sem alterar outros campos", async () => {
    const onChange = vi.fn();
    const onSelectEntry = vi.fn();
    rpc.mockImplementation((fn: string) =>
      fn === "rpc_fiscal_catalog_search_v1"
        ? Promise.resolve({ data: CFOP_ROWS, error: null })
        : Promise.resolve({ data: [], error: null }),
    );

    render(
      <FiscalCatalogCombobox catalogType="CFOP" value={null} onChange={onChange} onSelectEntry={onSelectEntry} />,
      { wrapper },
    );
    await userEvent.click(screen.getByRole("combobox"));
    await waitFor(() => expect(screen.getByText("Venda de produção do estabelecimento")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Venda de produção do estabelecimento"));
    expect(onChange).toHaveBeenCalledWith("5101");
    expect(onSelectEntry).toHaveBeenCalledWith(expect.objectContaining({ code: "5101" }));
  });

  it("preserva e sinaliza valor legado fora do catálogo vigente", async () => {
    rpc.mockImplementation((fn: string) =>
      fn === "rpc_fiscal_catalog_resolve_v1"
        ? Promise.resolve({ data: [], error: null })
        : Promise.resolve({ data: [], error: null }),
    );

    render(<FiscalCatalogCombobox catalogType="CFOP" value="5999" onChange={() => {}} />, { wrapper });
    await waitFor(() => expect(screen.getByTestId("fiscal-catalog-legacy")).toBeInTheDocument());
    expect(screen.getByRole("combobox")).toHaveTextContent("5999");
  });

  it("mostra mensagem segura quando o servidor nega a consulta", async () => {
    rpc.mockImplementation((fn: string) =>
      fn === "rpc_fiscal_catalog_search_v1"
        ? Promise.resolve({ data: null, error: { message: "permission denied for table fiscal_reference_entries" } })
        : Promise.resolve({ data: [], error: null }),
    );

    render(<FiscalCatalogCombobox catalogType="CFOP" value={null} onChange={() => {}} />, { wrapper });
    await userEvent.click(screen.getByRole("combobox"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("não tem permissão");
    expect(alert.textContent).not.toMatch(/fiscal_reference_entries/);
  });

  it("informa catálogo vazio sem sugerir código algum", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    render(<FiscalCatalogCombobox catalogType="CNAE" value={null} onChange={() => {}} />, { wrapper });
    await userEvent.click(screen.getByRole("combobox"));
    await waitFor(() => expect(screen.getByText(/Nenhum código encontrado/i)).toBeInTheDocument());
  });
});
