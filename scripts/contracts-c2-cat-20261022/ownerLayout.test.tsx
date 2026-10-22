import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: "parceiro_b2b", ready: true, error: false, catalog: true, sheets: true, partner: true, features: ["catalogo_precos", "fichas_tecnicas"] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "A" }, role: state.role, loading: false }) }));
vi.mock("@/hooks/useMyPartner", () => ({ useMyPartner: () => ({ ready: state.ready, isError: state.error, isLoading: false, data: state.partner ? { id: "P", codigo: "P1", razao_social: "Parceiro A", mode: "commercial_owner", capabilities: { catalog_read: state.catalog, sheets_read: state.sheets } } : null }) }));
vi.mock("@/hooks/useAvailableContexts", () => ({ useAvailableContexts: () => ({ data: { available_contexts: ["b2b"] } }) }));
vi.mock("@/hooks/useSwitchPortal", () => ({ useSwitchPortal: () => vi.fn() }));
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => ({ status: "ready", features: new Set(state.features) }) }));
vi.mock("@/hooks/useBranding", () => ({ usePortalBranding: () => ({}) }));
vi.mock("@/hooks/useNavCollapseState", () => ({ useSidebarOpenState: () => ({ open: false, setOpen: vi.fn() }) }));
vi.mock("@/components/nav/PortalSidebar", () => ({ PortalSidebar: () => null }));
vi.mock("@/components/portal/PortalTopBar", () => ({ PortalTopBar: () => null }));
vi.mock("@/components/comercial/CommercialOwnOrders", () => ({ CommercialOwnOrders: () => <p>Pedidos próprios</p> }));
vi.mock("@/components/ui/sidebar", () => ({ SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, SidebarTrigger: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(() => { throw Error("unexpected probe"); }) } }));
vi.mock("@/hooks/usePartnerCatalog", () => ({ usePartnerCatalog: (id: string) => ({ data: [{ item_id: "I", item_tipo: "produto", nome: `Item ${id}`, familia_catalogo: "biologico" }], isLoading: false, error: null, isFetching: false, refetch: vi.fn(), scope: "A" }) }));
vi.mock("@/components/catalogo/CatalogoCardsGrid", () => ({ CatalogoCardsGrid: ({ source, actionSlot }: { source: { data: { nome: string }[] }; actionSlot?: unknown }) => <div>{source.data.map(r => <p key={r.nome}>{r.nome}</p>)}{actionSlot ? "WRITABLE" : null}</div> }));
import Layout from "./PortalParceiroLayout";
beforeEach(() => Object.assign(state, { role: "parceiro_b2b", ready: true, error: false, partner: true, catalog: true, sheets: true, features: ["catalogo_precos", "fichas_tecnicas"] }));
afterEach(cleanup);
function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="/portal-parceiro" element={<Layout />}><Route path="*" element={<p>SIBLING MOUNTED</p>} /><Route path="fichas" element={<p>Fichas autorizadas</p>} /></Route></Routes></MemoryRouter></QueryClientProvider>);
}
it("realistic owner mounts read-only catalog, not original NovoPedido outlet", () => {
  mount("/portal-parceiro/catalogo"); expect(screen.getByText("Item P")).toBeTruthy();
  expect(screen.queryByText("SIBLING MOUNTED")).toBeNull(); expect(screen.queryByText("WRITABLE")).toBeNull(); expect(screen.queryByText("Pedidos próprios")).toBeNull();
});
it.each(["simulador", "financeiro", "arquivos", "pedidos", "novo"])("owner does not mount sibling %s even with catalog capability", path => {
  mount(`/portal-parceiro/${path}`); expect(screen.queryByText("SIBLING MOUNTED")).toBeNull();
});
it("sheets capability is independent and does not fabricate approved content", () => { mount("/portal-parceiro/fichas"); expect(screen.getByText("Fichas autorizadas")).toBeTruthy(); });
it("missing entitlement blocks owner catalog", () => { state.features = []; mount("/portal-parceiro/catalogo"); expect(screen.queryByText("Item P")).toBeNull(); });
it("commercial client without validated capability cannot mount catalog", () => { state.catalog = false; mount("/portal-parceiro/catalogo"); expect(screen.queryByText("Item P")).toBeNull(); });
it("no partner denies owner outlet", () => { state.partner = false; mount("/portal-parceiro/catalogo"); expect(screen.queryByText("SIBLING MOUNTED")).toBeNull(); });
it("lease pause and failed refresh remove catalog without unmounting layout", () => {
  const view = mount("/portal-parceiro/catalogo"); expect(screen.getByText("Item P")).toBeTruthy();
  state.ready = false; view.rerender(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Routes><Route path="*" element={<Layout />} /></Routes></MemoryRouter></QueryClientProvider>);
  expect(screen.queryByText("Item P")).toBeNull();
});