import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Local fixture authority only: never calls hosted services or invokes mutations.
// Layout, guards, NovoPedido, useMyPartner and all catalogue/order hooks stay real.
const state = vi.hoisted(() => ({
  actor: "11111111-1111-4111-8111-111111111111",
  tenant: "22222222-2222-4222-8222-222222222222",
  partner: "33333333-3333-4333-8333-333333333333",
  epoch: 0, profileStamp: "v1", linkVersion: 1, revoked: false, authCb: undefined as undefined | ((event: string, session: unknown) => void), entitled: true, loadingPlan: false, orderCreate: true,
  rpc: vi.fn(), table: vi.fn(), writes: vi.fn(), subscriptions: vi.fn(),
}));
vi.mock("@/lib/portalBroadcast", () => ({ subscribePortalEvents: () => () => {}, broadcastPortalEvent: () => {} }));
// Unrelated shell infrastructure is excluded, not the route or domain readers.
vi.mock("@/hooks/useBranding", () => ({ usePortalBranding: () => ({}) }));
vi.mock("@/hooks/useNavCollapseState", () => ({ useSidebarOpenState: () => ({ open: false, setOpen: vi.fn() }) }));
vi.mock("@/components/nav/PortalSidebar", () => ({ PortalSidebar: () => null }));
vi.mock("@/components/portal/PortalTopBar", () => ({ PortalTopBar: () => null }));
vi.mock("@/components/ui/sidebar", () => ({ SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, SidebarTrigger: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: state.actor } } }, error: null }),
    onAuthStateChange: (cb: typeof state.authCb) => { state.authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: vi.fn(),
  },
  rpc: (...args: unknown[]) => state.rpc(...args),
  from: (...args: unknown[]) => state.table(...args),
  channel: () => {
    const channel = { on: () => channel, subscribe: () => { state.subscriptions(); return channel; } };
    return channel;
  }, removeChannel: vi.fn(),
} }));

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Layout from "@/pages/portal-parceiro/PortalParceiroLayout";
import NovoPedido from "@/pages/portal-parceiro/NovoPedido";
import { EntitlementOutlet } from "@/components/guards/EntitlementOutlet";
import { B2BRouteGuard } from "@/components/guards/B2BRouteGuard";

function response(data: unknown) {
  const promise = Promise.resolve({ data, error: null });
  return Object.assign(promise, { abortSignal: () => promise });
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "performance"] });
  Object.assign(state, { tenant: "22222222-2222-4222-8222-222222222222", partner: "33333333-3333-4333-8333-333333333333", epoch: 0, profileStamp: "v1", linkVersion: 1, revoked: false, authCb: undefined as undefined | ((event: string, session: unknown) => void), entitled: true, loadingPlan: false, orderCreate: true });
  vi.clearAllMocks();
  state.table.mockImplementation((table: string) => {
    if (table === "profiles" || table === "user_roles") {
      const q: Record<string, unknown> = {};
      for (const method of ["select", "eq", "abortSignal"]) q[method] = () => q;
      const run = () => response(table === "profiles" ? { user_id: state.actor, organization_id: state.tenant, ativo: true, senha_provisoria: false, nome: "Local" } : [{ role: "parceiro_b2b" }]);
      q.maybeSingle = run; q.then = (f: (v: unknown) => unknown) => run().then(f); return q;
    }
    if (table !== "catalogo_volumes") throw new Error(`Unexpected table read: ${table}`);
    return { select: () => ({ eq: () => response([{ id: "volume-local", produto_id: state.partner, item_tipo: "produto", volume_ml: 1000, rotulo: "1 L", preco_brl: 10, ativo: true, ordem: 0 }]) }) };
  });
  state.rpc.mockImplementation((name: string, args?: { p_partner_id?: string }) => {
    const context = { contract: "C2_MULTIPROFILE_V1", actor_id: state.actor, tenant_id: state.tenant,
      organization_id: state.tenant, commercial_owner_organization_id: state.tenant, mode: "commercial_owner",
      partner_id: state.partner, external_roles: ["parceiro_b2b"], manager: true, technician: false, role: "parceiro_b2b", papel: "gestor" };
    if (name === "get_my_available_portal_contexts") return response({ contract: "C2_MULTIPROFILE_V1", actor_id: state.actor, tenant_id: state.tenant, ready: true,
      available_contexts: state.revoked ? [] : ["b2b"], has_b2b_access: !state.revoked, has_technical_access: false,
      partner_id: state.partner, profile_stamp: state.profileStamp, link_version: state.linkVersion, producer_links_valid: false });
    if (name === "get_my_entitlement_context") return response("active");
    if (name === "get_my_entitlements") return response([{ feature_key: "catalogo_precos" }, { feature_key: "pedidos_b2b" }]);
    if (name === "get_my_commercial_partner_context") return response(context);
    if (name === "get_my_commercial_partner_projection") return response({ ...context, id: state.partner, ativo: true,
      codigo: "LOCAL", razao_social: "Parceiro local", capabilities: { contract: "C2_CAT_V1", catalog_read: true, sheets_read: true },
      order_capabilities: { contract: "C2_OWNER_ORDER_V1", order_create: state.orderCreate } });
    if (name === "rpc_b2b_list_selectable_payment_plans") return response([]);
    if (name === "get_partner_catalog_secure") return response([{
      catalog_contract: "C1B_DUAL_TENANT_V1", item_id: args?.p_partner_id, item_tipo: "produto",
      produto_nome: `Produto ${state.tenant}/${args?.p_partner_id}`, produto_codigo: "LOCAL", familia_catalogo: "biologico",
      valor_litro_brl: 10, preco_parceiro: 10, desconto_percentual: 0, unidade_preco_principal: "litro", ficha_aprovada: false,
    }]);
    state.writes(name); throw new Error(`Unexpected RPC: ${name}`);
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Routes>
    <Route path="/portal-parceiro" element={<B2BRouteGuard><Layout /></B2BRouteGuard>}>
      <Route element={<EntitlementOutlet />}><Route path="catalogo" element={<NovoPedido />} /></Route>
    </Route><Route path="/sem-permissao" element={<p>Negado</p>} />
  </Routes></MemoryRouter></AuthProvider></QueryClientProvider>;
  const view = render(tree()); return { client, update: () => view.rerender(tree()) };
}
const product = () => `Produto ${state.tenant}/${state.partner}`;
const catalogCalls = () => state.rpc.mock.calls.filter(([name]) => name === "get_partner_catalog_secure");

async function tick(ms = 100) { for (let elapsed = 0; elapsed < ms; elapsed += 50) await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(50, ms - elapsed)); }); }
async function openModal() { fireEvent.click(screen.getByRole("button", { name: "Adicionar", exact: true })); await tick(); return screen.getByRole("dialog"); }
async function addItem() { const modal = await openModal(); fireEvent.click(within(modal).getByRole("button", { name: "Adicionar ao carrinho" })); await tick(); }
it("same confirmed probes retain the real modal DOM and cart without profile reload/cache reset", async () => {
  mount(); await tick(1000); await addItem(); const modal = await openModal();
  const profileReads = state.table.mock.calls.filter(([name]) => name === "profiles").length;
  const reads = catalogCalls().length;
  await tick(21_000);
  expect(screen.getByRole("dialog")).toBe(modal);
  expect(screen.getByText("Carrinho (1)")).toBeTruthy();
  expect(state.table.mock.calls.filter(([name]) => name === "profiles")).toHaveLength(profileReads);
  expect(catalogCalls()).toHaveLength(reads); expect(state.writes).not.toHaveBeenCalled();
});
it("same-identity token refresh hides old authority then restores cart choices and modal from fresh reads", async () => {
  mount(); await tick(1000); await addItem(); await openModal();
  act(() => state.authCb?.("TOKEN_REFRESHED", { user: { id: state.actor } }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await tick();
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByText("Carrinho (1)")).toBeTruthy();
  expect(catalogCalls().length).toBeGreaterThanOrEqual(2); expect(state.writes).not.toHaveBeenCalled();
});
it("effective revocation retires modal/cart; observed restoration never revives draft", async () => {
  mount(); await tick(1000); await addItem(); await openModal(); state.revoked = true;
  await tick(10_100); expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText("Carrinho (1)")).toBeNull();
  state.revoked = false; state.linkVersion++;
  act(() => state.authCb?.("TOKEN_REFRESHED", { user: { id: state.actor } })); await tick();
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByText("Carrinho (0)")).toBeTruthy();
});
it.each(["partner", "tenant"])("real %s change retires modal and cart", async kind => {
  mount(); await tick(1000); await addItem(); await openModal();
  if (kind === "partner") { state.partner = "44444444-4444-4444-8444-444444444444"; state.linkVersion++; await tick(10_100); }
  else { state.tenant = "55555555-5555-4555-8555-555555555555"; act(() => state.authCb?.("TOKEN_REFRESHED", { user: { id: state.actor } })); await tick(); }
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByText("Carrinho (0)")).toBeTruthy(); expect(state.writes).not.toHaveBeenCalled();
});
