import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const s = vi.hoisted(() => ({ ready: true, finance: true, tenant: "T", rpc: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "A" }, profile: { user_id: "A", organization_id: s.tenant, ativo: true, senha_provisoria: false }, roles: ["parceiro_b2b"], role: "parceiro_b2b", loading: false, authzReady: s.ready, authzEpoch: 1 }) }));
vi.mock("@/hooks/useMyPartner", () => ({ useMyPartner: () => ({ ready: s.ready, isError: false, isLoading: !s.ready, isSuccess: s.ready, data: s.ready ? { id: "11111111-1111-4111-8111-111111111111", mode: "commercial_owner", financeRead: s.finance, capabilities: { catalog_read: true, sheets_read: true } } : undefined }) }));
vi.mock("@/hooks/useAvailableContexts", () => ({ useAvailableContexts: () => ({ data: { available_contexts: ["b2b"] } }) }));
vi.mock("@/hooks/useSwitchPortal", () => ({ useSwitchPortal: () => vi.fn() }));
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => ({ status: "ready", features: new Set(["pedidos_b2b", "contas_receber", "catalogo_precos", "fichas_tecnicas"]) }) }));
vi.mock("@/hooks/useBranding", () => ({ usePortalBranding: () => ({}) }));
vi.mock("@/hooks/useNavCollapseState", () => ({ useSidebarOpenState: () => ({ open: false, setOpen: vi.fn() }) }));
vi.mock("@/components/nav/PortalSidebar", () => ({ PortalSidebar: () => null }));
vi.mock("@/components/portal/PortalTopBar", () => ({ PortalTopBar: () => null }));
vi.mock("@/components/ui/sidebar", () => ({ SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, SidebarTrigger: () => null }));
vi.mock("@/components/catalogo/OwnerCatalog", () => ({ OwnerCatalog: () => null }));
vi.mock("@/components/comercial/CommercialOwnOrders", () => ({ CommercialOwnOrders: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: s.rpc, from: () => { throw Error("unexpected unscoped read"); } } }));
import Layout from "@/pages/portal-parceiro/PortalParceiroLayout";
const payload = { contract: "C2_OWN_OBLIGATIONS_V1", partner_id: "11111111-1111-4111-8111-111111111111", limit: 50, documents_enabled: false, rows: [{ id: "22222222-2222-4222-8222-222222222222", order_id: "33333333-3333-4333-8333-333333333333", numero: "TESTE-OBRIGACAO", created_at: "2026-10-22T00:00:00Z", total: 100, status: "PARTIAL", installments: [] }] };
beforeEach(() => { Object.assign(s, { ready: true, finance: true, tenant: "T" }); s.rpc.mockReset().mockImplementation(() => ({ abortSignal: () => Promise.resolve({ data: payload, error: null }) })); });
afterEach(cleanup);
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={["/portal-parceiro/financeiro"]}><Routes><Route path="/portal-parceiro" element={<Layout />}><Route path="*" element={<p>IRMAO FECHADO</p>} /></Route></Routes></MemoryRouter></QueryClientProvider>;
  const view = render(tree()); return { update: () => view.rerender(tree()) };
}
it("real candidate layout mounts only obligations and removes values on capability denial", async () => {
  const v = mount(); await screen.findByText("TESTE-OBRIGACAO"); expect(screen.queryByText("IRMAO FECHADO")).toBeNull();
  expect(s.rpc).toHaveBeenCalledOnce(); s.finance = false; v.update(); expect(screen.queryByText("TESTE-OBRIGACAO")).toBeNull();
});
it("pause unmounts financial values; failed retry cannot resurrect cached title", async () => {
  const v = mount(); await screen.findByText("TESTE-OBRIGACAO"); s.ready = false; v.update(); expect(screen.queryByText("TESTE-OBRIGACAO")).toBeNull();
  s.rpc.mockImplementation(() => ({ abortSignal: () => Promise.resolve({ data: null, error: Error("denied") }) })); s.ready = true; v.update();
  await screen.findByRole("alert"); fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  await waitFor(() => expect(s.rpc.mock.calls.length).toBeGreaterThanOrEqual(3)); expect(screen.queryByText("TESTE-OBRIGACAO")).toBeNull();
});