import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Local fixture authority only: never calls hosted services or invokes mutations.
// Layout, guards, NovoPedido, useMyPartner and all catalogue/order hooks stay real.
const state = vi.hoisted(() => ({
  actor: "11111111-1111-4111-8111-111111111111",
  tenant: "22222222-2222-4222-8222-222222222222",
  partner: "33333333-3333-4333-8333-333333333333",
  epoch: 0, entitled: true, loadingPlan: false, orderCreate: true, foreignProjection: false,
  rpc: vi.fn(), table: vi.fn(), writes: vi.fn(), subscriptions: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true, senha_provisoria: false },
  role: "parceiro_b2b", roles: ["parceiro_b2b"], loading: false, authzReady: true, authzEpoch: state.epoch,
  checkAuthzAccess: () => true, signOut: vi.fn(),
}) }));
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => ({
  status: state.loadingPlan ? "loading" : "ready",
  features: new Set(state.entitled ? ["catalogo_precos", "pedidos_b2b"] : []),
}) }));
vi.mock("@/hooks/useAvailableContexts", () => ({ useAvailableContexts: () => ({
  ready: true, isLoading: false, isError: false, data: { has_b2b_access: true, available_contexts: ["b2b"] },
}) }));
// Unrelated shell infrastructure is excluded, not the route or domain readers.
vi.mock("@/hooks/useBranding", () => ({ usePortalBranding: () => ({}) }));
vi.mock("@/hooks/useNavCollapseState", () => ({ useSidebarOpenState: () => ({ open: false, setOpen: vi.fn() }) }));
vi.mock("@/components/nav/PortalSidebar", () => ({ PortalSidebar: () => null }));
vi.mock("@/components/portal/PortalTopBar", () => ({ PortalTopBar: () => null }));
vi.mock("@/components/ui/sidebar", () => ({ SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, SidebarTrigger: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...args: unknown[]) => state.rpc(...args),
  from: (...args: unknown[]) => state.table(...args),
  channel: () => {
    const channel = { on: () => channel, subscribe: () => { state.subscriptions(); return channel; } };
    return channel;
  }, removeChannel: vi.fn(),
} }));

import Layout from "@/pages/portal-parceiro/PortalParceiroLayout";
import NovoPedido from "@/pages/portal-parceiro/NovoPedido";
import { EntitlementOutlet } from "@/components/guards/EntitlementOutlet";
import { B2BRouteGuard } from "@/components/guards/B2BRouteGuard";

function response(data: unknown) {
  const promise = Promise.resolve({ data, error: null });
  return Object.assign(promise, { abortSignal: () => promise });
}
beforeEach(() => {
  Object.assign(state, { tenant: "22222222-2222-4222-8222-222222222222", partner: "33333333-3333-4333-8333-333333333333", epoch: 0, entitled: true, loadingPlan: false, orderCreate: true, foreignProjection: false });
  vi.clearAllMocks();
  state.table.mockImplementation((table: string) => {
    if (table !== "catalogo_volumes") throw new Error(`Unexpected table read: ${table}`);
    return { select: () => ({ eq: () => response([]) }) };
  });
  state.rpc.mockImplementation((name: string, args?: { p_partner_id?: string }) => {
    if(name==='partner_order_journal_capability_v1') return Promise.resolve({data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}});
    const context = { contract: "C2_MULTIPROFILE_V1", actor_id: state.actor, tenant_id: state.tenant,
      organization_id: state.tenant, commercial_owner_organization_id: state.tenant, mode: "commercial_owner",
      partner_id: state.partner, external_roles: ["parceiro_b2b"], manager: true, technician: false, role: "parceiro_b2b", papel: "gestor" };
    if (name === "get_my_commercial_partner_context") return response(context);
    if (name === "get_my_commercial_partner_projection") return response({ ...context, tenant_id: state.foreignProjection ? "foreign-tenant" : state.tenant, id: state.partner, ativo: true,
      codigo: "LOCAL", razao_social: "Parceiro local", capabilities: { contract: "C2_CAT_V1", catalog_read: true, sheets_read: true },
      order_capabilities: { contract: "C2_OWNER_ORDER_V1", order_create: state.orderCreate } });
    if (name === "rpc_b2b_list_selectable_payment_plans") return response([]);
    // Read-only capability probe added by the B2B payment-condition work (usePaymentConditionCapability): the reviewed
    // server function is NOT installed, so the honest local answer is PostgREST "function absent" — never a write.
    if (name === "partner_payment_condition_capability_v1") return Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find public.partner_payment_condition_capability_v1" } });
    if (name === "log_my_access_denied_secure") return response(null);
    if (name === "get_partner_catalog_secure") return response([{
      catalog_contract: "C1B_DUAL_TENANT_V1", item_id: args?.p_partner_id, item_tipo: "produto",
      produto_nome: `Produto ${state.tenant}/${args?.p_partner_id}`, produto_codigo: "LOCAL", familia_catalogo: "biologico",
      valor_litro_brl: 10, preco_parceiro: 10, desconto_percentual: 0, unidade_preco_principal: "litro", ficha_aprovada: false,
    }]);
    state.writes(name); throw new Error(`Unexpected RPC: ${name}`);
  });
});
afterEach(cleanup);
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Routes>
    <Route path="/portal-parceiro" element={<B2BRouteGuard><Layout /></B2BRouteGuard>}>
      <Route element={<EntitlementOutlet />}><Route path="catalogo" element={<NovoPedido />} /></Route>
    </Route><Route path="/sem-permissao" element={<p>Negado</p>} />
  </Routes></MemoryRouter></QueryClientProvider>;
  const view = render(tree()); return { update: () => view.rerender(tree()) };
}
const product = () => `Produto ${state.tenant}/${state.partner}`;
const catalogCalls = () => state.rpc.mock.calls.filter(([name]) => name === "get_partner_catalog_secure");
it("real layout/guard/outlet/NovoPedido reaches its real catalogue hook with the parent's partner", async () => {
  mount(); await screen.findByText(product());
  expect(screen.getByRole("link", { name: "Selecionar produto / Novo pedido" })).toHaveAttribute("href", "/portal-parceiro/catalogo");
  expect(screen.getByRole("button", { name: "Adicionar ao pedido" })).toBeEnabled();
  expect(catalogCalls().map(([, args]) => args.p_partner_id)).toEqual([state.partner]);
  expect(state.writes).not.toHaveBeenCalled(); expect(state.table.mock.calls).toEqual([["catalogo_volumes"]]);
});
it("contained capability keeps only catalogue readers, never cart/plan/subscription writers", async () => {
  state.orderCreate = false;
  mount(); await screen.findByText(product());
  expect(screen.getByRole("link", { name: "Consultar produtos" })).toHaveAttribute("href", "/portal-parceiro/catalogo");
  expect(screen.queryByRole("button", { name: "Adicionar ao pedido" })).toBeNull();
  expect(state.rpc.mock.calls.some(([name]) => name === "rpc_b2b_list_selectable_payment_plans")).toBe(false);
  expect(state.table).not.toHaveBeenCalled(); expect(state.subscriptions).not.toHaveBeenCalled(); expect(state.writes).not.toHaveBeenCalled();
});
it("revoked creation capability removes the real cart subtree without enabling another writer", async () => {
  const view = mount(); await screen.findByRole("button", { name: "Adicionar ao pedido" });
  state.orderCreate = false; state.epoch++; view.update();
  await screen.findByRole("link", { name: "Consultar produtos" });
  expect(screen.queryByRole("button", { name: "Adicionar ao pedido" })).toBeNull();
  expect(state.writes).not.toHaveBeenCalled();
});
it("real route replaces partner then tenant through current canonical projection without old product rows", async () => {
  const view = mount(); const first = product(); await screen.findByText(first);
  state.partner = "44444444-4444-4444-8444-444444444444"; state.epoch++; view.update();
  await screen.findByText(product()); expect(screen.queryByText(first)).toBeNull();
  const second = product(); state.tenant = "55555555-5555-4555-8555-555555555555"; state.epoch++; view.update();
  await screen.findByText(product()); expect(screen.queryByText(second)).toBeNull();
  expect(catalogCalls().map(([, args]) => args.p_partner_id)).toEqual(["33333333-3333-4333-8333-333333333333", state.partner, state.partner]);
  expect(state.writes).not.toHaveBeenCalled();
});
it.each(["denied", "loading"])("%s plan never mounts NovoPedido or its queries under the real layout", async mode => {
  if (mode === "denied") state.entitled = false; else state.loadingPlan = true;
  mount(); await screen.findByRole("region", { name: "Cliente comercial" });
  expect(catalogCalls()).toHaveLength(0);
  expect(state.rpc.mock.calls.some(([name]) => name === "rpc_b2b_list_selectable_payment_plans")).toBe(false);
  expect(state.subscriptions).not.toHaveBeenCalled(); expect(state.writes).not.toHaveBeenCalled();
  expect(state.table).not.toHaveBeenCalled();
});
it("a foreign tenant projection cannot mount catalogue, entry link or cart even when it claims creation", async () => {
  state.foreignProjection = true;
  mount(); await screen.findByText("Negado");
  expect(catalogCalls()).toHaveLength(0);
  expect(screen.queryByRole("link", { name: "Selecionar produto / Novo pedido" })).toBeNull();
  expect(state.table).not.toHaveBeenCalled(); expect(state.writes).not.toHaveBeenCalled();
});