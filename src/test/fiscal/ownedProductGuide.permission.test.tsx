import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

// Regressão: produto PRÓPRIO do tenant (ex.: SOLO criado pelo administrador) deve ser editável na guia Fiscal
// por administrador/gestor da MESMA empresa; negado a financeiro, a produto de outra empresa e à plataforma.
let roles: string[] = ["administrador"];
let org = "org-a";
let platformReady = false;
let owners: Record<string, string | null> = {};

const auth = () => ({
  loading: false, error: null, authzReady: true, authzEpoch: 1, checkAuthzAccess: () => true,
  user: { id: "u1" }, session: { user: { id: "u1" } },
  profile: { user_id: "u1", ativo: true, senha_provisoria: false, organization_id: org },
  role: roles[0], roles,
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth() }));
vi.mock("@/lib/catalogo/platformCatalogRead", () => ({ platformCatalogAccess: () => ({ ready: platformReady, scope: "s" }) }));
vi.mock("@/lib/permissions", () => ({ getAccessLevel: () => "r" }));
vi.mock("@/hooks/useScopedPortalQuery", () => ({ useScopedPortalQuery: (o: any) => useQuery(o) }));
vi.mock("@/integrations/supabase/client", () => {
  const b = (table: string) => {
    let ids: string[] = [];
    const q: any = {};
    for (const m of ["select", "eq", "is", "order", "limit"]) q[m] = () => q;
    q.in = (_c: string, v: string[]) => { ids = v; return q; };
    q.maybeSingle = async () => ({ data: null, error: null });
    q.then = (res: any) => res({ data: table === "produtos" ? ids.filter((i) => i in owners).map((id) => ({ id, owner_organization_id: owners[id] })) : [], error: null });
    for (const m of ["insert", "update", "upsert", "delete"]) q[m] = () => { throw new Error(`escrita proibida: ${m}`); };
    return q;
  };
  return { supabase: { from: b, rpc: () => { throw new Error("rpc proibida ao visualizar"); } } };
});
vi.mock("@/pages/configuracoes/FiscalProdutos", () => ({
  ProductEditDrawer: (p: { canEdit: boolean }) => <div data-testid="product-drawer">{String(p.canEdit)}</div>,
  MicroorganismEditDrawer: () => null,
}));
vi.mock("@/pages/configuracoes/FiscalClientes", () => ({ CustomerFiscalEditDrawer: () => null }));
vi.mock("@/hooks/useProductFiscalProfiles", async (orig) => ({
  ...(await orig<any>()),
  useProductFiscalProfile: () => ({ data: null, isError: false }),
}));

import { ProductFiscalGuide } from "@/components/fiscal/FiscalGuidePanel";
import { useOwnedProductIds } from "@/hooks/useProductFiscalProfiles";
import { useProductFiscalAccess } from "@/hooks/useProductFiscalAccess";

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={qc()}>{ui}</QueryClientProvider>);

describe("Guia Fiscal de produto próprio — escrita por papel + propriedade", () => {
  beforeEach(() => { roles = ["administrador"]; org = "org-a"; platformReady = false; owners = { p1: "org-a", p2: "org-b", g1: null }; });

  it("administrador do dono: botão Cadastrar perfil fiscal", async () => {
    wrap(<ProductFiscalGuide productId="p1" displayName="SOLO" />);
    await waitFor(() => expect(screen.getByTestId("fiscal-guide-edit").textContent).toContain("Cadastrar perfil fiscal"));
  });

  it("gestor do dono: também pode cadastrar", async () => {
    roles = ["gestor"];
    wrap(<ProductFiscalGuide productId="p1" displayName="SOLO" />);
    await waitFor(() => expect(screen.getByTestId("fiscal-guide-edit").textContent).toContain("Cadastrar perfil fiscal"));
  });

  it("produto de outra empresa: sem ação de escrita", async () => {
    wrap(<ProductFiscalGuide productId="p2" displayName="Alheio" />);
    await screen.findByText("Sem perfil");
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Cadastrar perfil fiscal|Editar perfil fiscal/)).toBeNull();
  });

  it("produto global (sem dono): sem ação de escrita", async () => {
    wrap(<ProductFiscalGuide productId="g1" displayName="Global" />);
    await screen.findByText("Sem perfil");
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Cadastrar perfil fiscal|Editar perfil fiscal/)).toBeNull();
  });

  it("financeiro não recebe escrita de produto próprio", () => {
    roles = ["financeiro"];
    const { result } = renderHook(() => useProductFiscalAccess("t"));
    expect(result.current.canWriteOwnedProduct).toBe(false);
  });

  it("plataforma (superadmin) não tem escrita de produto próprio", () => {
    platformReady = true;
    const { result } = renderHook(() => useProductFiscalAccess("t"));
    expect(result.current.canWriteOwnedProduct).toBe(false);
  });

  it("propriedade só confirma itens da empresa do ator", async () => {
    const { result } = renderHook(() => useOwnedProductIds(["p1", "p2", "g1"]), {
      wrapper: ({ children }) => <QueryClientProvider client={qc()}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.confirmed).toBe(true));
    expect([...result.current.owned]).toEqual(["p1"]);
  });
});
