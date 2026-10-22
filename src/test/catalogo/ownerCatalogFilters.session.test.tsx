import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ actor: "A", tenant: "T", role: "parceiro_b2b", ready: true, error: false, epoch: 1, partner: "P" as string | null, catalog: true, calls: 0 }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant }, roles: [state.role], role: state.role, loading: false, authzReady: state.ready, authzEpoch: state.epoch }) }));
vi.mock("@/hooks/useMyPartner", () => ({ useMyPartner: () => ({ ready: state.ready, isError: state.error, isLoading: false, data: state.ready && !state.error && state.partner ? { id: state.partner, codigo: "P1", razao_social: "Parceiro", mode: "commercial_owner", capabilities: { catalog_read: state.catalog, sheets_read: true } } : undefined }) }));
vi.mock("@/hooks/useAvailableContexts", () => ({ useAvailableContexts: () => ({ data: { available_contexts: ["b2b"] } }) }));
vi.mock("@/hooks/useSwitchPortal", () => ({ useSwitchPortal: () => vi.fn() }));
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => ({ status: "ready", features: new Set(["catalogo_precos", "fichas_tecnicas"]) }) }));
vi.mock("@/hooks/useBranding", () => ({ usePortalBranding: () => ({}) }));
vi.mock("@/hooks/useNavCollapseState", () => ({ useSidebarOpenState: () => ({ open: false, setOpen: vi.fn() }) }));
vi.mock("@/components/nav/PortalSidebar", () => ({ PortalSidebar: () => null }));
vi.mock("@/components/portal/PortalTopBar", () => ({ PortalTopBar: () => null }));
vi.mock("@/components/comercial/CommercialOwnOrders", () => ({ CommercialOwnOrders: () => null }));
vi.mock("@/components/ui/sidebar", () => ({ SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, SidebarTrigger: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(() => { throw Error("unexpected probe"); }) } }));
vi.mock("@/hooks/usePartnerCatalog", () => ({ usePartnerCatalog: () => {
  state.calls++;
  return { data: [{ item_id: "I", item_tipo: "produto", nome: `Protegido ${state.actor}`, familia_catalogo: "biologico", ativo: true }], isLoading: false, error: null, isFetching: false, refetch: vi.fn(), scope: JSON.stringify([state.ready, state.actor, state.tenant, state.epoch]) };
} }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/protocolos/MicroorganismTechnicalProfileDialog", () => ({ MicroorganismTechnicalProfileDialog: () => null }));
vi.mock("@/components/protocolos/ProductTechnicalProfileDialog", () => ({ ProductTechnicalProfileDialog: () => null }));
vi.mock("@/components/catalogo/CatalogoItemDrawer", () => ({ CatalogoItemDrawer: () => null }));
vi.mock("@/components/catalogo/FichaProdutorDrawer", () => ({ FichaProdutorDrawer: () => null }));
vi.mock("@/components/catalogo/PartnerFichaDrawer", () => ({ PartnerFichaDrawer: ({ open }: { open: boolean }) => open ? <p>Ficha protegida aberta</p> : null }));
import Layout from "@/pages/portal-parceiro/PortalParceiroLayout";
import { createCatalogFilterMemory, defaultCatalogFilters } from "@/lib/catalogo/catalogFilterPreferences";
beforeEach(() => Object.assign(state, { actor: "A", tenant: "T", role: "parceiro_b2b", ready: true, error: false, epoch: 1, partner: "P", catalog: true, calls: 0 }));
afterEach(cleanup);
function Navigation() { const go = useNavigate(); return <><button onClick={() => go("/portal-parceiro/fichas")}>Outro contexto</button><button onClick={() => go("/portal-parceiro/catalogo")}>Voltar catálogo</button></>; }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Navigation /><Routes><Route path="/portal-parceiro" element={<Layout />}><Route path="*" element={<p>SIBLING</p>} /></Route></Routes></MemoryRouter></QueryClientProvider>;
  const view = render(tree());
  return { ...view, update: () => view.rerender(tree()) };
}
const search = () => screen.getByPlaceholderText("Buscar por nome, código, função, alvo...");
const selectChemical = () => fireEvent.click(screen.getByRole("radio", { name: "Químicos" }));
it("real Layout/Owner/Grid preserves filter during monitor pause/resume without protected rows or drawers", () => {
  const view = mount();
  fireEvent.click(screen.getByRole("button", { name: "Ver ficha" }));
  expect(screen.getByText("Ficha protegida aberta")).toBeTruthy();
  selectChemical(); fireEvent.change(search(), { target: { value: "minha busca" } });
  state.ready = false; const calls = state.calls; view.update();
  expect(screen.getByText("Acesso indisponível.")).toBeTruthy();
  expect(screen.queryByText("Protegido A")).toBeNull(); expect(screen.queryByText("Ficha protegida aberta")).toBeNull();
  expect(screen.queryByPlaceholderText("Buscar por nome, código, função, alvo...")).toBeNull();
  expect(state.calls).toBe(calls);
  state.ready = true; state.epoch++; view.update();
  expect(search()).toHaveValue("minha busca"); expect(screen.getByRole("radio", { name: "Químicos" })).toHaveAttribute("aria-checked", "true");
  expect(screen.queryByText("Ficha protegida aberta")).toBeNull(); expect(screen.queryByText("Protegido A")).toBeNull();
});
it("same identity renewal remounts request scope but keeps filters; reset remains functional", () => {
  const view = mount(); selectChemical(); state.epoch++; view.update();
  expect(screen.getByRole("radio", { name: "Químicos" })).toHaveAttribute("aria-checked", "true");
  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(screen.getByText("Protegido A")).toBeTruthy();
});
it.each(["actor", "tenant", "partner", "role", "missing-link"])("isolates and clears preferences across %s including return", kind => {
  const view = mount(); selectChemical(); fireEvent.change(search(), { target: { value: "private preference" } });
  state.ready = false; view.update();
  if (kind === "actor") state.actor = "B";
  if (kind === "tenant") state.tenant = "B";
  if (kind === "partner") state.partner = "Q";
  if (kind === "role") state.role = "parceiro_b2b_tecnico";
  if (kind === "missing-link") state.partner = null;
  state.ready = true; view.update();
  Object.assign(state, { actor: "A", tenant: "T", partner: "P", role: "parceiro_b2b" }); view.update();
  if (kind === "role") fireEvent.click(screen.getByText("Voltar catálogo"));
  expect(search()).toHaveValue(""); expect(screen.getByRole("radio", { name: "Químicos" })).toHaveAttribute("aria-checked", "false");
});
it("leaving portal route clears preferences rather than resurrecting old context", () => {
  mount(); selectChemical(); fireEvent.click(screen.getByText("Outro contexto")); fireEvent.click(screen.getByText("Voltar catálogo"));
  expect(screen.getByRole("radio", { name: "Químicos" })).toHaveAttribute("aria-checked", "false");
});
it("error/capability denial never shows protected rows and filters cannot grant access", () => {
  const view = mount(); selectChemical(); state.error = true; view.update(); expect(screen.queryByText("Protegido A")).toBeNull();
  state.error = false; state.catalog = false; view.update(); expect(screen.queryByRole("heading", { name: "Catálogo" })).toBeNull();
});
it("preference memory rejects old-owner callbacks and retains only the explicit filter schema", () => {
  const memory = createCatalogFilterMemory(); const a = memory.bind("A/T/b2b", "P");
  a.onChange({ ...defaultCatalogFilters(), family: "quimico", sort: "codigo", tipo: "produto" });
  expect(memory.bind("A/T/b2b", undefined).initial.family).toBe("quimico");
  memory.bind("B/T/b2b", "P"); a.onChange({ ...defaultCatalogFilters(), search: "late A" });
  expect(memory.bind("B/T/b2b", "P").initial).toEqual(defaultCatalogFilters());
  expect(Object.keys(memory.bind("B/T/b2b", "P").initial).sort()).toEqual(["b2b", "family", "search", "sort", "status", "tipo"]);
});