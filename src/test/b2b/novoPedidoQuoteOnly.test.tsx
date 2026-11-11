import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { withPaymentMethod, pickTestPix, TEST_PIX, TEST_PIX_OPTION, TEST_CONTRACT, condEnvelope } from "@/test/helpers/b2bPaymentMethodMock";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { minDeliveryDateISO } from "@/lib/b2bDeliveryDate";
import { formatDateDisplay } from "@/lib/date-utils";

// Fixture local apenas: transporte sintético, nunca serviços hospedados.
// Layout, guards, NovoPedido e hooks de catálogo/pedido permanecem reais.
const state = vi.hoisted(() => ({
  actor: "11111111-1111-4111-8111-111111111111",
  tenant: "22222222-2222-4222-8222-222222222222",
  partner: "33333333-3333-4333-8333-333333333333",
  epoch: 0,
  draft: null as null | { partnerId: string; addItemId: string | null; requestedDeliveryDate: string | null; items: Array<{ itemId: string; volumeId: string; quantity: number }> },
  rpc: vi.fn(), table: vi.fn(), writes: vi.fn(),
  options: null as null | ((args: Record<string, unknown>) => unknown), ack: null as null | Record<string, unknown>,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: state.actor }, profile: { user_id: state.actor, organization_id: state.tenant, ativo: true, senha_provisoria: false },
  role: "parceiro_b2b", roles: ["parceiro_b2b"], loading: false, authzReady: true, authzEpoch: state.epoch,
  checkAuthzAccess: () => true, signOut: vi.fn(),
  setSafePartnerOrderDraft: vi.fn(), takeSafePartnerOrderDraft: () => state.draft,
}) }));
vi.mock("@/hooks/useEntitlements", () => ({ useEntitlements: () => ({
  status: "ready", features: new Set(["catalogo_precos", "pedidos_b2b"]),
}) }));
vi.mock("@/hooks/useAvailableContexts", () => ({ useAvailableContexts: () => ({
  ready: true, isLoading: false, isError: false, data: { has_b2b_access: true, available_contexts: ["b2b"] },
}) }));
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
    const channel = { on: () => channel, subscribe: () => channel };
    return channel;
  }, removeChannel: vi.fn(),
} }));

import Layout from "@/pages/portal-parceiro/PortalParceiroLayout";
import NovoPedido from "@/pages/portal-parceiro/NovoPedido";
import { EntitlementOutlet } from "@/components/guards/EntitlementOutlet";
import { B2BRouteGuard } from "@/components/guards/B2BRouteGuard";

const VOLUME = { id: "vol-1", item_tipo: "produto", produto_id: state.partner, microrganismo_id: null,
  volume_ml: 1000, rotulo: "1 L", preco_brl: 10, moeda: "BRL", ativo: true, ordem: 1 };
const PLAN = { id: "plan-1", name: "À vista", code: "CASH", description: null, plan_type: "cash",
  max_days: 0, months_count: 1, installment_count: 1, discount_percent: 0, monthly_interest_percent: 0,
  interest_type: "none", requires_credit_approval: false, requires_guarantee: false,
  requires_financial_approval: false, minimum_order_amount: null, sort_order: 1 };

function response(data: unknown) {
  const promise = Promise.resolve({ data, error: null });
  return Object.assign(promise, { abortSignal: () => promise });
}
beforeEach(() => {
  Object.assign(state, { tenant: "22222222-2222-4222-8222-222222222222", partner: "33333333-3333-4333-8333-333333333333", epoch: 0, draft: null });
  vi.clearAllMocks();
  state.table.mockImplementation((table: string) => {
    if (table === "catalogo_volumes") return { select: () => ({ eq: () => response([{ ...VOLUME, produto_id: state.partner }]) }) };
    if (table === "partner_orders") return { select: () => ({ eq: () => ({ maybeSingle: () => response({
      id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b",
      c2_external_origin_snapshot: { contract: "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1", accounting_validated: false },
    }) }) }) };
    throw new Error(`Unexpected table read: ${table}`);
  });
  Object.assign(state, { options: null, ack: null });
  state.rpc.mockImplementation(withPaymentMethod((name: string, args?: Record<string, unknown>) => {
    if(name==='partner_order_journal_capability_v1') return Promise.resolve({data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}});
    const context = { contract: "C2_MULTIPROFILE_V1", actor_id: state.actor, tenant_id: state.tenant,
      organization_id: state.tenant, commercial_owner_organization_id: state.tenant, mode: "commercial_owner",
      partner_id: state.partner, external_roles: ["parceiro_b2b"], manager: true, technician: false, role: "parceiro_b2b", papel: "gestor" };
    if (name === "get_my_commercial_partner_context") return response(context);
    if (name === "get_my_commercial_partner_projection") return response({ ...context, id: state.partner, ativo: true,
      codigo: "LOCAL", razao_social: "Parceiro local", capabilities: { contract: "C2_CAT_V1", catalog_read: true, sheets_read: true },
      order_capabilities: { contract: "C2_OWNER_ORDER_V1", order_create: true } });
    // Pré-instalação: leitor escopado ausente (PGRST202) mantém a leitura de volumes anterior.
    if (name === "get_partner_catalog_volumes_secure") { const p = Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.get_partner_catalog_volumes_secure(p_partner_id) in the schema cache" } }); return Object.assign(p, { abortSignal: () => p }); }
    if (name === "get_partner_packaging_offers_secure") { const p = Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.get_partner_packaging_offers_secure(p_partner_id) in the schema cache" } }); return Object.assign(p, { abortSignal: () => p }); }
    if (name === "get_partner_catalog_secure") return response([{
      catalog_contract: "C1B_DUAL_TENANT_V1", item_id: args?.p_partner_id, item_tipo: "produto",
      produto_nome: "Produto local", produto_codigo: "LOCAL", familia_catalogo: "biologico",
      valor_litro_brl: 10, preco_parceiro: 10, desconto_percentual: 0, unidade_preco_principal: "litro", ficha_aprovada: false,
    }]);
    if (name === "rpc_b2b_list_selectable_payment_plans") return response([PLAN]);
    if (name === "simulate_b2b_payment_plan_secure") return response({
      partner_id: state.partner, pricing_mode: "discount_from_base", quote_required: false, cart_hash: "hash-1",
      payment_plan: { id: PLAN.id, name: PLAN.name, code: PLAN.code, pricing_mode: "discount_from_base", discount_percent: 0,
        monthly_interest_percent: 0, months_count: 1, installment_count: 1, requires_financial_approval: false,
        requires_credit_approval: false, requires_guarantee: false },
      amounts: { table_amount: 10, discount_amount: 0, net_amount_after_discount: 10, financial_interest_amount: 0, final_amount: 10 },
      schedule: [{ installment_number: 1, due_date: minDeliveryDateISO(), amount: 10, principal_amount: 10, interest_amount: 0 }],
      warnings: [],
    });
    if (name === "create_partner_order_secure") return response({ id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", total: 10 });
    if (name === "get_my_commercial_orders_projection") return response({
      partner_id: state.partner,
      orders: [{ id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", status: "em_analise_comercial", created_at: "2026-10-26T15:00:00+00:00" }],
    });
    if (name === "log_my_access_denied_secure") return response(null);
    state.writes(name); throw new Error(`Unexpected RPC: ${name}`);
  }, (n: string, a?: Record<string, unknown>) => state.rpc(n, a)));
});
afterEach(cleanup);
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Routes>
    <Route path="/portal-parceiro" element={<B2BRouteGuard><Layout /></B2BRouteGuard>}>
      <Route element={<EntitlementOutlet />}><Route path="catalogo" element={<NovoPedido />} /></Route>
      <Route path="pedidos" element={<p>MeusPedidos legado não deve montar</p>} />
    </Route><Route path="/sem-permissao" element={<p>Negado</p>} />
  </Routes></MemoryRouter></QueryClientProvider>);
  return { view, client };
}


const wrapped = () => state.rpc.getMockImplementation()!;
function overrideOptions(fn: (args: Record<string, unknown>) => unknown) {
  const base = wrapped();
  state.rpc.mockImplementation((n: string, a?: Record<string, unknown>) => n === "b2b_list_payment_condition_options_secure" ? fn(a ?? {}) : base(n, a));
}
const abortable = (p: Promise<unknown>) => Object.assign(p, { abortSignal: () => p });
async function toPayment() {
  const mounted = mount();
  await screen.findByText("Produto local");
  fireEvent.click(screen.getByRole("button", { name: "Adicionar ao pedido" }));
  fireEvent.click(await screen.findByRole("button", { name: "Adicionar ao carrinho" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Continuar para condição de pagamento" })[0]);
  fireEvent.click(await screen.findByRole("button", { name: /À vista/ }));
  return mounted;
}
const calls = (n: string) => state.rpc.mock.calls.filter(([x]) => x === n).map(([, a]) => a as Record<string, unknown>);
const submitBtn = () => screen.findByRole("button", { name: "Enviar pedido para análise" });

const quoteBtn = () => screen.findByRole("button", { name: "Enviar solicitação de cotação" });
function quoteSim() {
  const base = wrapped();
  state.rpc.mockImplementation((n: string, a?: Record<string, unknown>) => {
    if (n === "simulate_b2b_payment_plan_secure") return response({
      partner_id: state.partner, pricing_mode: "quote_only", quote_required: true, cart_hash: "hash-quote",
      payment_plan: { id: PLAN.id, name: PLAN.name, code: PLAN.code, pricing_mode: "quote_only", discount_percent: 0,
        monthly_interest_percent: 0, months_count: 1, installment_count: 1, requires_financial_approval: false,
        requires_credit_approval: false, requires_guarantee: false },
      amounts: { table_amount: 0, discount_amount: 0, net_amount_after_discount: 0, financial_interest_amount: 0, final_amount: 0 },
      schedule: [], warnings: ["Condicao sob consulta: preco sera definido em cotacao."],
    });
    return base(n, a);
  });
}
it("REPRO quote_only com meio explícito: botão de cotação habilita", async () => {
  quoteSim();
  await toPayment();
  await pickTestPix();
  await waitFor(() => expect(calls("simulate_b2b_payment_condition_secure")).toHaveLength(1));
  const b = await quoteBtn();
  await new Promise((r) => setTimeout(r, 100));
  screen.debug(undefined, 0);
  expect(b).toBeEnabled();
});
