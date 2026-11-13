import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const writes: string[] = [];
let destUf = "MG";
let crt = "3";
const product = { ncm: "48021000", cfop_in_state: "5101", cfop_interstate: "6101", origin_code: "0", icms_cst: "00", pis_cst: "01", cofins_cst: "01", commercial_unit: "UN", profile_status: "DRAFT" };

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ role: "administrador", roles: ["administrador"] }) }));
vi.mock("@/hooks/useFiscalCompanySettings", () => ({ useFiscalCompanySettings: () => ({ data: { state: "MG", crt }, isLoading: false }) }));
vi.mock("@/hooks/useProductFiscalAccess", () => ({ useProductFiscalAccess: () => ({ ready: true, canWriteOwnedProduct: true, canWrite: false }) }));
vi.mock("@/lib/fiscal/ownedProductFiscal", () => ({ OWNED_PRODUCT_FISCAL_ENABLED: true }));
vi.mock("@/hooks/useProductFiscalProfiles", () => ({ useProductFiscalProfile: (id: string | null) => ({ data: id === "p-sem" ? null : product, isError: false }) }));
vi.mock("@/hooks/useMicroorganismFiscalProfiles", () => ({ useMicroorganismFiscalProfile: () => ({ data: null, isError: false }) }));
vi.mock("@/hooks/useServiceFiscalProfiles", () => ({ useServiceFiscalProfile: () => ({ data: null, isLoading: false }) }));
vi.mock("@/pages/configuracoes/FiscalProdutos", () => ({ ProductEditDrawer: (p: { productId: string }) => <div data-testid="product-drawer">{p.productId}</div>, MicroorganismEditDrawer: () => null }));
vi.mock("@/pages/configuracoes/FiscalClientes", () => ({ CustomerFiscalEditDrawer: () => <div data-testid="customer-drawer" /> }));
vi.mock("@/pages/configuracoes/FiscalServicos", () => ({ ServiceFiscalEditDrawer: () => null }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) b[m] = () => b;
    for (const m of ["insert", "update", "upsert", "delete"]) b[m] = () => { writes.push(table); return b; };
    b.maybeSingle = async () => ({ data: table === "customer_fiscal_profiles"
      ? { id: "cp", customer_id: "c1", taxpayer_indicator: "9", use_main_address: false, fiscal_state: destUf, fiscal_municipality_ibge_code: "3147006", fiscal_street: "R", fiscal_number: "1", fiscal_postal_code: "38600000", profile_status: "DRAFT" }
      : { id: "c1", nome: "C", cpf_cnpj: "12345678000190" }, error: null });
    return b;
  };
  return { supabase: { from: builder } };
});

import { PreEmissaoPendenciasSecao } from "@/components/fiscal/documentos/PreEmissaoPendenciasSecao";

const item = (over: Record<string, unknown> = {}) => ({ item_kind: "PRODUCT", description: "Papel", quantity: 1, commercial_unit: "UN", unit_value: 1, gross_value: 1, discount_value: 0, net_value: 1, source_item_type: "produto", source_item_id: "p1", cfop: "5101", ...over }) as never;
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("pré-emissão no rascunho", () => {
  beforeEach(() => { writes.length = 0; destUf = "MG"; crt = "3"; });

  it("interna MG→MG com perfis completos: sem pendências e nenhuma gravação", async () => {
    wrap(<PreEmissaoPendenciasSecao customerId="c1" items={[item()]} />);
    expect(await screen.findByText(/Operação interna \(MG → MG\)/)).toBeTruthy();
    expect(screen.getAllByText("Sem pendências verificadas").length).toBe(3);
    expect(writes).toEqual([]);
  });

  it("interestadual MG→SP aponta CFOP 5101 do item e não altera o rascunho", async () => {
    destUf = "SP";
    wrap(<PreEmissaoPendenciasSecao customerId="c1" items={[item()]} />);
    expect(await screen.findByText(/Operação interestadual \(MG → SP\)/)).toBeTruthy();
    expect(screen.getByText(/CFOP 5101 no item não corresponde à operação interestadual/)).toBeTruthy();
    expect(writes).toEqual([]);
  });

  it("CRT 2 exige CST (regra do motor); produto sem perfil oferece correção no mesmo editor", async () => {
    crt = "2";
    wrap(<PreEmissaoPendenciasSecao customerId="c1" items={[item({ source_item_id: "p-sem", description: "Sem perfil" })]} />);
    expect(await screen.findByText(/Produto sem perfil fiscal/)).toBeTruthy();
    fireEvent.click(screen.getAllByText("Corrigir perfil")[1]);
    expect(screen.getByTestId("product-drawer").textContent).toBe("p-sem");
  });
});
