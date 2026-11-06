import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { withPaymentMethod, pickTestPix } from "@/test/helpers/b2bPaymentMethodMock";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Local fixture authority only: never calls hosted services or invokes mutations.
// Layout, guards, NovoPedido, useMyPartner and all catalogue/order hooks stay real.
const state = vi.hoisted(() => ({
  actor: "11111111-1111-4111-8111-111111111111",
  tenant: "22222222-2222-4222-8222-222222222222",
  partner: "33333333-3333-4333-8333-333333333333",
  epoch: 0, entitled: true, loadingPlan: false, orderCreate: true, foreignProjection: false, scoped: null as null | { name: string | null },
  rpc: vi.fn(), table: vi.fn(), writes: vi.fn(), subscriptions: vi.fn(),
  pk: "absent" as "absent" | "pending" | "error" | "invalid" | "solid_unpriced" | "not_solid" | "offer",
  draft: null as unknown, toastWarn: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: (...a: unknown[]) => state.toastWarn(...a) }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true, senha_provisoria: false },
  role: "parceiro_b2b", roles: ["parceiro_b2b"], loading: false, authzReady: true, authzEpoch: state.epoch,
  checkAuthzAccess: () => true, signOut: vi.fn(),
  setSafePartnerOrderDraft: vi.fn(), takeSafePartnerOrderDraft: () => { const d = state.draft; state.draft = null; return d; },
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

const PKG = "66666666-6666-4666-8666-666666666666";
function response(data: unknown) {
  const promise = Promise.resolve({ data, error: null });
  return Object.assign(promise, { abortSignal: () => promise });
}
beforeEach(() => {
  Object.assign(state, { pk: "absent", draft: null, tenant: "22222222-2222-4222-8222-222222222222", partner: "33333333-3333-4333-8333-333333333333", epoch: 0, entitled: true, loadingPlan: false, orderCreate: true, foreignProjection: false, scoped: null });
  vi.clearAllMocks();
  state.table.mockImplementation((table: string) => {
    if (table !== "catalogo_volumes") throw new Error(`Unexpected table read: ${table}`);
    return { select: () => ({ eq: () => response([]) }) };
  });
  state.rpc.mockImplementation(withPaymentMethod((name: string, args?: { p_partner_id?: string }) => {
    if(name==='partner_order_journal_capability_v1') return Promise.resolve({data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}});
    const context = { contract: "C2_MULTIPROFILE_V1", actor_id: state.actor, tenant_id: state.tenant,
      organization_id: state.tenant, commercial_owner_organization_id: state.tenant, mode: "commercial_owner",
      partner_id: state.partner, external_roles: ["parceiro_b2b"], manager: true, technician: false, role: "parceiro_b2b", papel: "gestor" };
    if (name === "get_my_commercial_partner_context") return response(context);
    if (name === "get_my_commercial_partner_projection") return response({ ...context, tenant_id: state.foreignProjection ? "foreign-tenant" : state.tenant, id: state.partner, ativo: true,
      codigo: "LOCAL", razao_social: "Parceiro local", capabilities: { contract: "C2_CAT_V1", catalog_read: true, sheets_read: true },
      order_capabilities: { contract: "C2_OWNER_ORDER_V1", order_create: state.orderCreate } });
    if (name === "rpc_b2b_list_selectable_payment_plans") return response([]);
    if (name === "log_my_access_denied_secure") return response(null);
    // Pré-instalação: leitor escopado ausente (PGRST202) mantém a leitura de volumes anterior.
    if (name === "get_partner_catalog_volumes_secure" && state.scoped) return response({ contract: "B2B_PARTNER_VOLUMES_V1", partner_id: args?.p_partner_id,
      seller: { name: state.scoped.name }, volumes: [{ id: "b86f2fe8-e6b7-43e4-8345-53bd9e2a3b03", item_tipo: "produto", produto_id: args?.p_partner_id, microrganismo_id: null, volume_ml: 1000, rotulo: "1 L", ordem: 0 }] });
    // Pré-instalação: leitor de embalagens ausente (PGRST202) mantém sólidos fechados.
    if (name === "get_partner_packaging_offers_secure" && state.pk !== "absent") {
      if (state.pk === "pending") { const p = new Promise(() => {}); return Object.assign(p, { abortSignal: () => p }); }
      if (state.pk === "error") { const p = Promise.resolve({ data: null, error: { code: "42501", message: "partner_not_found" } }); return Object.assign(p, { abortSignal: () => p }); }
      if (state.pk === "invalid") return response({ contract: "B2B_PARTNER_PACKAGING_ORDER_V1", partner_id: args?.p_partner_id, offers: [] });
      const solid = state.pk === "not_solid" ? [] : [{ product_id: args?.p_partner_id, unidade_conteudo: "kg" }];
      const offers = state.pk === "offer" ? [{ product_id: args?.p_partner_id, unidade_conteudo: "kg", packaging_id: PKG, codigo: "SC25", descricao: "Saco 25 kg",
        rotulo: "Saco 25 kg", peso_liquido_kg: 25, version: 1, preco_tabela_brl: 10 }] : [];
      return response({ contract: "B2B_PARTNER_PACKAGING_ORDER_V1", partner_id: args?.p_partner_id, offers, solid_products: solid });
    }
    if (name === "get_partner_packaging_offers_secure") { const p = Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.get_partner_packaging_offers_secure(p_partner_id) in the schema cache" } }); return Object.assign(p, { abortSignal: () => p }); }
    if (name === "get_partner_catalog_volumes_secure") { const p = Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.get_partner_catalog_volumes_secure(p_partner_id) in the schema cache" } }); return Object.assign(p, { abortSignal: () => p }); }
    if (name === "get_partner_catalog_secure") return response([{
      catalog_contract: "C1B_DUAL_TENANT_V1", item_id: args?.p_partner_id, item_tipo: "produto",
      produto_nome: `Produto ${state.tenant}/${args?.p_partner_id}`, produto_codigo: "LOCAL", familia_catalogo: "biologico",
      valor_litro_brl: 10, preco_parceiro: 10, desconto_percentual: 0, unidade_preco_principal: "litro", ficha_aprovada: false,
    }]);
    state.writes(name); throw new Error(`Unexpected RPC: ${name}`);
  });
, (n: string, a?: Record<string, unknown>) => state.rpc(n, a))));
afterEach(() => { cleanup(); sessionStorage.clear(); });
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

// ---- Simulação cercada: respostas deferred controladas pelo teste (nenhuma escrita) ----
const CASH = "c0000000-0000-4000-8000-000000000001", PA = "a0000000-0000-4000-8000-000000000002", PB = "b0000000-0000-4000-8000-000000000003";
const plan = (id: string, name: string, type: string) => ({ id, name, code: name, description: null, plan_type: type, max_days: type === "cash" ? 0 : 30,
  months_count: 0, installment_count: 1, discount_percent: 0, monthly_interest_percent: 0, interest_type: "none", requires_credit_approval: false,
  requires_guarantee: false, requires_financial_approval: false, minimum_order_amount: null, pricing_mode: "discount_from_base", sort_order: 0 });
type Pending = { plan: string; items: unknown; resolve: (v: unknown) => void };
let sims: Pending[] = [];
const reply = (planId: string, final: number) => ({ data: { partner_id: state.partner, pricing_mode: "discount_from_base", quote_required: false,
  cart_hash: `hash-${planId}-${final}`, items: [], payment_plan: { id: planId, name: planId, code: "x", discount_percent: 0, monthly_interest_percent: 0,
  months_count: 0, installment_count: 1, requires_financial_approval: false, requires_credit_approval: false, requires_guarantee: false },
  amounts: { table_amount: final, discount_amount: 0, net_amount_after_discount: final, financial_interest_amount: 0, final_amount: final },
  schedule: [{ installment_number: 1, due_date: "2026-12-06", amount: final, principal_amount: final, interest_amount: 0 }], warnings: [] }, error: null });
const last = (planId: string) => [...sims].reverse().find((s) => s.plan === planId)!;
const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n).replace(/\u00a0/g, " ");
const has = (t: string) => screen.queryAllByText((_c, el) => !!el && el.children.length === 0 && (el.textContent ?? "").replace(/\u00a0/g, " ").includes(t)).length > 0;
const sendBtn = () => screen.getByRole("button", { name: /Enviar pedido para análise/ });

beforeEach(() => {
  sims = [];
  const orig = state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation(withPaymentMethod((name: string, args?: Record<string, unknown>) => {
    if (name === "rpc_b2b_list_selectable_payment_plans") return response([plan(CASH, "A vista", "cash"), plan(PA, "Plano A", "short_term"), plan(PB, "Plano B", "short_term")]);
    if (name === "simulate_b2b_payment_plan_secure") return new Promise((resolve) => sims.push({ plan: String(args?.p_payment_plan_id), items: args?.p_items, resolve }));
    if (name === "create_partner_order_secure") { state.writes(name); return Promise.resolve({ data: null, error: { message: "blocked in test" } }); }
    return orig(name, args);
  });
, (n: string, a?: Record<string, unknown>) => state.rpc(n, a))));
async function openWithCart(qty = 2) {
  state.pk = "offer";
  state.draft = { partnerId: state.partner, addItemId: null, requestedDeliveryDate: null, items: [{ itemId: state.partner, packagingId: PKG, quantity: qty }] };
  const m = mount();
  expect((await screen.findAllByText(/Saco 25 kg/)).length).toBeGreaterThan(0);
  fireEvent.click((await screen.findAllByRole("button", { name: /Continuar para condição de pagamento/ }))[0]);
  await screen.findByText("Plano A");
  return m;
}
const pick = (name: string) => fireEvent.click(screen.getByText(name).closest('[role="button"]')!);
// Troca de época pode fechar/remontar o diálogo; se fechou, reabre — nunca reaproveita o resultado antigo.
async function reopenIfClosed(planName: string) {
  await new Promise((r) => setTimeout(r, 20));
  if (!screen.queryByText(planName)) {
    fireEvent.click((await screen.findAllByRole("button", { name: /Continuar para condição de pagamento/ }))[0]);
    await screen.findByText(planName);
    pick(planName);
  }
}
const settle = async (p: Pending, v: unknown) => { await act(async () => { p.resolve(v); await Promise.resolve(); }); };

it("A→B→A: resposta atrasada do primeiro A não é adotada; só a do A atual", async () => {
  await openWithCart();
  pick("Plano A"); await waitFor(() => expect(sims.some((s) => s.plan === PA)).toBe(true));
  const a1 = last(PA);
  pick("Plano B"); await waitFor(() => expect(sims.some((s) => s.plan === PB)).toBe(true));
  pick("Plano A"); await waitFor(() => expect(sims.filter((s) => s.plan === PA).length).toBe(2));
  await settle(a1, reply(PA, 111.11));
  expect(has(brl(111.11))).toBe(false);
  expect(sendBtn()).toBeDisabled();
  await settle(last(PA), reply(PA, 222.22));
  await waitFor(() => expect(has(brl(222.22))).toBe(true));
  await settle(sims.find((s) => s.plan === PB)!, reply(PB, 333.33));
  expect(has(brl(333.33))).toBe(false);
  expect(sendBtn()).not.toBeDisabled();
});

it("erro fica visível com código; nova tentativa é manual e só ela dispara nova leitura", async () => {
  await openWithCart();
  pick("Plano A"); await waitFor(() => expect(sims.some((s) => s.plan === PA)).toBe(true));
  await settle(last(PA), { data: null, error: { code: "42501", message: "tenant_catalog_fence_denied" } });
  const alert = await screen.findByTestId("b2b-simulation-error");
  expect(alert).toHaveTextContent("42501");
  expect(sendBtn()).toBeDisabled();
  const n = sims.filter((s) => s.plan === PA).length;
  await new Promise((r) => setTimeout(r, 30));
  expect(sims.filter((s) => s.plan === PA).length).toBe(n);           // sem retry automático
  fireEvent.click(screen.getByRole("button", { name: "Tentar calcular novamente" }));
  await waitFor(() => expect(sims.filter((s) => s.plan === PA).length).toBe(n + 1));
  expect(screen.queryByTestId("b2b-simulation-error")).toBeNull();
  await settle(last(PA), reply(PA, 50));
  await waitFor(() => expect(sendBtn()).not.toBeDisabled());
  expect(state.writes).not.toHaveBeenCalled();
});

it("revogação/troca de época na mesma identidade descarta resultado e resposta em voo", async () => {
  const m = await openWithCart();
  pick("Plano A"); await waitFor(() => expect(sims.some((s) => s.plan === PA)).toBe(true));
  await settle(last(PA), reply(PA, 77.77));
  await waitFor(() => expect(has(brl(77.77))).toBe(true));
  const before = sims.length;
  state.epoch += 1; m.update();
  expect(has(brl(77.77))).toBe(false);                               // nenhum render com valor da época anterior
  await reopenIfClosed("Plano A");
  expect(has(brl(77.77))).toBe(false);
  expect(sendBtn()).toBeDisabled();
  await waitFor(() => expect(sims.length).toBeGreaterThan(before));
  const inflightOld = sims[before - 1];
  await settle(inflightOld, reply(PA, 88.88));
  expect(has(brl(88.88))).toBe(false);
});

it("referência à vista atrasada de contexto anterior não aparece como diferença", async () => {
  const m = await openWithCart();
  pick("Plano A"); await waitFor(() => expect(sims.some((s) => s.plan === CASH) && sims.some((s) => s.plan === PA)).toBe(true));
  const oldCash = last(CASH);
  state.epoch += 1; m.update();
  await reopenIfClosed("Plano A");
  await waitFor(() => expect(sims.filter((s) => s.plan === CASH).length).toBeGreaterThanOrEqual(2));
  await settle(oldCash, reply(CASH, 10));                           // diferença velha seria +R$ 90,00
  await settle(last(PA), reply(PA, 100));
  await waitFor(() => expect(has(brl(100))).toBe(true));
  expect(has("+" + brl(90))).toBe(false);
  await settle(last(CASH), reply(CASH, 60));
  await waitFor(() => expect(has("+" + brl(40))).toBe(true));
});

it("fechar e reabrir aposenta resposta em voo e exige simulação nova antes do envio", async () => {
  await openWithCart();
  pick("Plano A"); await waitFor(() => expect(sims.some((s) => s.plan === PA)).toBe(true));
  const a1 = last(PA);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByText("Plano A")).toBeNull());
  await settle(a1, reply(PA, 12.34));
  fireEvent.click(screen.getAllByRole("button", { name: /Continuar para condição de pagamento/ })[0]);
  await screen.findByText("Plano A");
  expect(has(brl(12.34))).toBe(false);
  expect(sendBtn()).toBeDisabled();
  pick("Plano A"); await waitFor(() => expect(sims.filter((s) => s.plan === PA).length).toBeGreaterThanOrEqual(2));
  await settle(last(PA), reply(PA, 56.78));
  await waitFor(() => expect(has(brl(56.78))).toBe(true));
});

it("mudar itens com o mesmo plano invalida o resultado e a resposta antiga", async () => {
  await openWithCart(2);
  pick("Plano A"); await waitFor(() => expect(sims.some((s) => s.plan === PA)).toBe(true));
  const a1 = last(PA);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.queryByText("Plano A")).toBeNull());
  const qty = screen.getAllByRole("spinbutton")[0];
  fireEvent.change(qty, { target: { value: "3" } });
  fireEvent.click(screen.getAllByRole("button", { name: /Continuar para condição de pagamento/ })[0]);
  await screen.findByText("Plano A");
  await waitFor(() => expect(sims.filter((s) => s.plan === PA).length).toBe(2));
  const a2 = last(PA);
  expect(JSON.stringify(a2.items)).not.toBe(JSON.stringify(a1.items));
  await settle(a1, reply(PA, 20));
  expect(has(brl(20))).toBe(false);
  expect(sendBtn()).toBeDisabled();
  await settle(a2, reply(PA, 30));
  await waitFor(() => expect(has(brl(30))).toBe(true));
});

it("clique de envio com resultado de época antiga não chama o criador de pedido", async () => {
  const m = await openWithCart();
  pick("Plano A"); await waitFor(() => expect(sims.some((s) => s.plan === PA)).toBe(true));
  await settle(last(PA), reply(PA, 40));
  await waitFor(() => expect(sendBtn()).not.toBeDisabled());
  const btn = sendBtn();
  state.epoch += 1; m.update();
  fireEvent.click(btn);
  await new Promise((r) => setTimeout(r, 20));
  expect(state.writes).not.toHaveBeenCalledWith("create_partner_order_secure");
});
