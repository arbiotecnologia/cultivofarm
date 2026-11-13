import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const calls: string[] = [];
let profileRow: Record<string, unknown> | null = null;
let role = "administrador";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role, roles: [role] }) }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "order", "limit"]) b[m] = () => b;
    for (const m of ["insert", "update", "upsert", "delete"]) b[m] = () => { calls.push(`${m}:${table}`); return b; };
    b.maybeSingle = async () => ({
      data: table === "customer_fiscal_profiles" ? profileRow
        : table === "clientes" ? { id: "c1", nome: "Cliente Teste", cpf_cnpj: "12345678000190", endereco_logradouro: "Rua A", endereco_numero: "1", endereco_cep: "38600000", endereco_estado: "MG" } : null,
      error: null,
    });
    return b;
  };
  return { supabase: { from: (t: string) => builder(t), rpc: () => { calls.push("rpc"); return Promise.resolve({ data: null, error: null }); } } };
});
vi.mock("@/pages/configuracoes/FiscalProdutos", () => ({
  ProductEditDrawer: (p: { canEdit: boolean }) => <div data-testid="product-drawer">editor produto {String(p.canEdit)}</div>,
  MicroorganismEditDrawer: () => <div data-testid="micro-drawer" />,
}));
vi.mock("@/pages/configuracoes/FiscalClientes", () => ({
  CustomerFiscalEditDrawer: (p: { item: unknown; presetCustomerId: string | null; canEdit: boolean }) =>
    <div data-testid="customer-drawer">{p.item === "new" ? `novo:${p.presetCustomerId}` : "existente"}:{String(p.canEdit)}</div>,
}));

import { CustomerFiscalGuide } from "@/components/fiscal/FiscalGuidePanel";

const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("Guia Fiscal do cliente", () => {
  beforeEach(() => { calls.length = 0; profileRow = null; role = "administrador"; });

  it("sem perfil: visualizar não grava nada; editor abre novo com o cliente pré-selecionado", async () => {
    wrap(<CustomerFiscalGuide customerId="c1" />);
    expect(await screen.findByText("Sem perfil")).toBeTruthy();
    expect(calls).toEqual([]);
    fireEvent.click(screen.getByTestId("fiscal-guide-edit"));
    expect(screen.getByTestId("customer-drawer").textContent).toBe("novo:c1:true");
    expect(calls).toEqual([]);
  });

  it("perfil existente com endereço principal: reabre o mesmo perfil, sem pendências de endereço", async () => {
    profileRow = { id: "p1", customer_id: "c1", taxpayer_indicator: "9", use_main_address: true, fiscal_municipality_ibge_code: "3147006", profile_status: "DRAFT", updated_at: "2026-01-01" };
    wrap(<CustomerFiscalGuide customerId="c1" />);
    await screen.findByText("Venda interna");
    expect(screen.getAllByText("Sem pendências nos campos verificados.").length).toBe(2);
    fireEvent.click(screen.getByTestId("fiscal-guide-edit"));
    expect(screen.getByTestId("customer-drawer").textContent).toBe("existente:true");
  });

  it("gestor (somente leitura) sem perfil não recebe ação de cadastro", async () => {
    role = "gestor";
    wrap(<CustomerFiscalGuide customerId="c1" />);
    await screen.findByText("Sem perfil");
    expect(screen.queryByTestId("fiscal-guide-edit")).toBeNull();
  });

  it("gestor com perfil abre somente leitura", async () => {
    role = "gestor";
    profileRow = { id: "p1", customer_id: "c1", profile_status: "DRAFT" };
    wrap(<CustomerFiscalGuide customerId="c1" />);
    await waitFor(() => expect(screen.getByTestId("fiscal-guide-edit").textContent).toContain("Ver perfil fiscal"));
    fireEvent.click(screen.getByTestId("fiscal-guide-edit"));
    expect(screen.getByTestId("customer-drawer").textContent).toBe("existente:false");
  });
});
