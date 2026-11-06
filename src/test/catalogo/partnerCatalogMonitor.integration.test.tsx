import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Local fixture authority only: never calls hosted services or invokes mutations.
// Layout, guards, NovoPedido, useMyPartner and all catalogue/order hooks stay real.
const state = vi.hoisted(() => ({
  actor: "11111111-1111-4111-8111-111111111111",
  tenant: "22222222-2222-4222-8222-222222222222",
  partner: "33333333-3333-4333-8333-333333333333",
  epoch: 0, profileStamp: "v1", linkVersion: 1, revoked: false, hasVolume: true,
  holdProbe: undefined as undefined | (() => Promise<{ data: unknown; error: null }>),
  authCb: undefined as undefined | ((event: string, session: unknown) => void), entitled: true, loadingPlan: false, orderCreate: true, catalogRead: true,
  rpc: vi.fn(), table: vi.fn(), writes: vi.fn(), subscriptions: vi.fn(), journalProbes: vi.fn(),
}));
vi.mock("@/lib/portalBroadcast", () => ({ subscribePortalEvents: () => () => {}, broadcastPortalEvent: () => {} }));
// Unrelated shell infrastructure is excluded, not the route or domain readers.
vi.mock("@/hooks/useBranding", () => ({ usePortalBranding: () => ({}) }));
vi.mock("@/hooks/useNavCollapseState", () => ({ useSidebarOpenState: () => ({ open: false, setOpen: vi.fn() }) }));
vi.mock("@/components/nav/PortalSidebar", () => ({ PortalSidebar: () => null }));
vi.mock("@/components/portal/PortalTopBar", async () => {
  const { UserMenu } = await import("@/components/UserMenu");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  return { PortalTopBar: () => <TooltipProvider><UserMenu /></TooltipProvider> };
});
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

import { AuthProvider } from "@/hooks/useAuth";
import { clearAuthzDiagnostics, readAuthzDiagnostics } from "@/lib/authz/localDiagnostics";
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
  Object.assign(state, { tenant: "22222222-2222-4222-8222-222222222222", partner: "33333333-3333-4333-8333-333333333333", epoch: 0, profileStamp: "v1", linkVersion: 1, revoked: false, authCb: undefined as undefined | ((event: string, session: unknown) => void), entitled: true, loadingPlan: false, orderCreate: true, catalogRead: true });
  vi.clearAllMocks();
  state.hasVolume = true; state.holdProbe = undefined;
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  onlineManager.setOnline(true);
  state.table.mockImplementation((table: string) => {
    if (table === "profiles" || table === "user_roles") {
      const q: Record<string, unknown> = {};
      for (const method of ["select", "eq", "abortSignal"]) q[method] = () => q;
      const run = () => response(table === "profiles" ? { user_id: state.actor, organization_id: state.tenant, ativo: true, senha_provisoria: false, nome: "Local" } : [{ role: "parceiro_b2b" }]);
      q.maybeSingle = run; q.then = (f: (v: unknown) => unknown) => run().then(f); return q;
    }
    if (table !== "catalogo_volumes") throw new Error(`Unexpected table read: ${table}`);
    return { select: () => ({ eq: () => response(state.hasVolume ? [{ id: "volume-local", produto_id: state.partner, item_tipo: "produto", volume_ml: 1000, rotulo: "1 L", preco_brl: 10, ativo: true, ordem: 0 }] : []) }) };
  });
  state.rpc.mockImplementation((name: string, args?: { p_partner_id?: string; p_partner?: string }) => {
    if (name === "get_my_available_portal_contexts" && state.holdProbe) {
      const promise = state.holdProbe(); return Object.assign(promise, { abortSignal: () => promise });
    }
    const context = { contract: "C2_MULTIPROFILE_V1", actor_id: state.actor, tenant_id: state.tenant,
      organization_id: state.tenant, commercial_owner_organization_id: state.tenant, mode: "commercial_owner",
      partner_id: state.partner, external_roles: ["parceiro_b2b"], manager: true, technician: false, role: "parceiro_b2b", papel: "gestor" };
    if (name === "get_my_available_portal_contexts") return response({ contract: "C2_MULTIPROFILE_V1", actor_id: state.actor, tenant_id: state.tenant, ready: true,
      available_contexts: state.revoked ? [] : ["b2b"], has_b2b_access: !state.revoked, has_technical_access: false,
      partner_id: state.partner, profile_stamp: state.profileStamp, link_version: state.linkVersion, producer_links_valid: false });
    if (name === "get_my_entitlement_context") return response("active");
    if (name === "get_my_entitlements") return response(state.entitled ? [{ feature_key: "catalogo_precos" }, { feature_key: "pedidos_b2b" }] : []);
    if (name === "get_my_commercial_partner_context") return response(context);
    if (name === "get_my_commercial_partner_projection") return response({ ...context, id: state.partner, ativo: true,
      codigo: "LOCAL", razao_social: "Parceiro local", capabilities: { contract: "C2_CAT_V1", catalog_read: state.catalogRead, sheets_read: true },
      order_capabilities: { contract: "C2_OWNER_ORDER_V1", order_create: state.orderCreate } });
    if (name === "rpc_b2b_list_selectable_payment_plans") return response([]);
    // Read-only journal capability probe (orderJournal.journalCapability). This suite certifies catalogue
    // authority, so the journal is fixed in its exact pre-install signal (PGRST202 naming the RPC) => legacy mode.
    // Durable mode (mount recovery via recover_partner_order_attempt_v1, a server key reservation) is covered by
    // src/test/pedidos/orderJournal.integration.test.tsx; here recovery stays a forbidden write via state.writes.
    if (name === "partner_order_journal_capability_v1") {
      state.journalProbes(args);
      const promise = Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.partner_order_journal_capability_v1" } });
      return Object.assign(promise, { abortSignal: () => promise });
    }
    // Pré-instalação: leitor escopado ausente (PGRST202) mantém a leitura de volumes anterior.
    if (name === "get_partner_catalog_volumes_secure") { const p = Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.get_partner_catalog_volumes_secure(p_partner_id) in the schema cache" } }); return Object.assign(p, { abortSignal: () => p }); }
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
  const client = new QueryClient({ defaultOptions: { queries: {
    staleTime: 5 * 60_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false,
    refetchOnMount: false, refetchOnReconnect: true, retry: 1,
  }, mutations: { retry: false } } });
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
async function openModal() { fireEvent.click(screen.getByRole("button", { name: "Adicionar ao pedido" })); await tick(); return screen.getByRole("dialog"); }
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
  expect(state.rpc.mock.calls.filter(([name]) => name === "get_my_available_portal_contexts").length).toBeLessThanOrEqual(6);
});
it("healthy B2B probes can have an empty diagnostics ring; emptiness is not absence of probing", async () => {
  clearAuthzDiagnostics(); mount(); await tick(1000);
  const reads = state.rpc.mock.calls.filter(([name]) => name === "get_my_available_portal_contexts").length;
  await tick(21_000);
  expect(state.rpc.mock.calls.filter(([name]) => name === "get_my_available_portal_contexts").length).toBeGreaterThan(reads);
  expect(readAuthzDiagnostics()).toEqual([]);
});
it("same-vector context/partner/entitlement refetches preserve the actual modal and cart without cache clearing", async () => {
  const { client } = mount(); await tick(1000); await addItem(); const modal = await openModal();
  const before = state.rpc.mock.calls.length;
  const reread = client.refetchQueries({ predicate: q => ["my-partner", "available-portal-contexts", "saas"].includes(String(q.queryKey[0])) });
  await tick(1000); await reread;
  expect(state.rpc.mock.calls.length).toBeGreaterThan(before);
  expect(screen.getByRole("dialog")).toBe(modal); expect(screen.getByText("Carrinho (1)")).toBeTruthy();
  expect(state.writes).not.toHaveBeenCalled();
});
it.each(["feature", "capability"])("a confirmed missing %s switches to Cliente comercial without a transport error", async kind => {
  const { client } = mount(); await tick(1000); await addItem(); await openModal();
  if (kind === "feature") state.entitled = false; else state.catalogRead = false;
  const reread = client.refetchQueries({ predicate: q => kind === "feature" ? q.queryKey[0] === "saas" : q.queryKey[0] === "my-partner" });
  await tick(1000); await reread;
  expect(screen.getByRole("region", { name: "Cliente comercial" })).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText("Carrinho (1)")).toBeNull();
  expect(client.getQueryCache().getAll().every(q => q.state.status !== "error")).toBe(true);
  expect(state.writes).not.toHaveBeenCalled();
});
it("focus/visibility revalidation still hides uncertain authority, even when the eventual vector is unchanged", async () => {
  mount(); await tick(1000); await addItem(); await openModal();
  let resolve: ((value: { data: unknown; error: null }) => void) | undefined;
  state.holdProbe = () => new Promise(r => { resolve = r; });
  act(() => window.dispatchEvent(new Event("focus"))); await tick(100);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByText("Carrinho (1)")).toBeNull();
  state.holdProbe = undefined;
  act(() => resolve?.({ data: { contract: "C2_MULTIPROFILE_V1", actor_id: state.actor, tenant_id: state.tenant, ready: true,
    available_contexts: ["b2b"], has_b2b_access: true, has_technical_access: false, partner_id: state.partner, profile_stamp: "v1", link_version: 1 }, error: null }));
  await tick(1000);
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByText("Carrinho (0)")).toBeTruthy();
  expect(state.writes).not.toHaveBeenCalled();
});
it("BAC2-like missing volume stays blocked while a 1 L item uses the canonical dialog", async () => {
  state.hasVolume = false; mount(); await tick(1000); const dialog = await openModal();
  expect(within(dialog).getByRole("button", { name: "Adicionar ao carrinho" })).toBeDisabled();
  expect(state.writes).not.toHaveBeenCalled();
});
it.each(["deadline", "offline"])("%s retires authority and a late healthy response cannot resurrect the modal", async reason => {
  mount(); await tick(1000); await addItem(); await openModal();
  let resolve: ((value: { data: unknown; error: null }) => void) | undefined;
  state.holdProbe = () => new Promise(r => { resolve = r; });
  await tick(10_000);
  if (reason === "offline") act(() => window.dispatchEvent(new Event("offline")));
  else await tick(5_000);
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText("Carrinho (1)")).toBeNull();
  act(() => resolve?.({ data: { contract: "C2_MULTIPROFILE_V1", actor_id: state.actor, tenant_id: state.tenant, ready: true,
    available_contexts: ["b2b"], partner_id: state.partner, profile_stamp: "v1", link_version: 1 }, error: null }));
  await tick(); expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText("Carrinho (1)")).toBeNull();
});
it("same-identity token refresh hides old authority then restores cart choices and modal from fresh reads", async () => {
  mount(); await tick(1000); await addItem(); await openModal();
  act(() => state.authCb?.("TOKEN_REFRESHED", { user: { id: state.actor } }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await tick(1000);
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByText("Carrinho (1)")).toBeTruthy();
  expect(catalogCalls().length).toBeGreaterThanOrEqual(2); expect(state.writes).not.toHaveBeenCalled();
});
it("effective revocation retires modal/cart; observed restoration never revives draft", async () => {
  mount(); await tick(1000); await addItem(); await openModal(); state.revoked = true;
  await tick(10_100); expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText("Carrinho (1)")).toBeNull();
  state.revoked = false; state.linkVersion++;
  act(() => state.authCb?.("TOKEN_REFRESHED", { user: { id: state.actor } })); await tick(1000);
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByText("Carrinho (0)")).toBeTruthy();
});
it.each(["partner", "tenant"])("real %s change retires modal and cart", async kind => {
  mount(); await tick(1000); await addItem(); await openModal();
  if (kind === "partner") { state.partner = "44444444-4444-4444-8444-444444444444"; state.linkVersion++; await tick(10_100); }
  else { state.tenant = "55555555-5555-4555-8555-555555555555"; act(() => state.authCb?.("TOKEN_REFRESHED", { user: { id: state.actor } })); await tick(1000); }
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByText("Carrinho (0)")).toBeTruthy(); expect(state.writes).not.toHaveBeenCalled();
  // Journal probes are only ever scoped to a partner the server context reported, never a stale or invented one.
  expect(state.journalProbes).toHaveBeenCalled();
  expect(state.journalProbes.mock.calls.every(([a]) => ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"].includes(a?.p_partner))).toBe(true);
});
it("observed A-B-A partner transitions never resurrect the A cart or modal", async () => {
  mount(); await tick(1000); await addItem(); await openModal();
  const a = state.partner;
  state.partner = "44444444-4444-4444-8444-444444444444"; state.linkVersion++;
  await tick(10_100);
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByText("Carrinho (0)")).toBeTruthy();
  state.partner = a; state.linkVersion++; await tick(10_100);
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByText("Carrinho (0)")).toBeTruthy();
  expect(screen.getByText(product())).toBeTruthy(); expect(state.writes).not.toHaveBeenCalled();
});
