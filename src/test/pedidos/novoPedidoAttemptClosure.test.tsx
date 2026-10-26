import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  epoch: 0, roles: ["parceiro_b2b"] as string[],
  draft: null as null | { partnerId: string; addItemId: string | null; requestedDeliveryDate: string | null; items: Array<{ itemId: string; volumeId: string; quantity: number }> },
  rpc: vi.fn(), table: vi.fn(), writes: vi.fn(),
  lastDraft: null as any, createImpl: null as null | ((args: Record<string, unknown>) => unknown), actorOverride: null as string | null, revoked: false, closeImpl: null as null | ((args: Record<string, unknown>) => unknown),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: state.actorOverride ?? state.actor }, profile: { user_id: state.actorOverride ?? state.actor, organization_id: state.tenant, ativo: true, senha_provisoria: false },
  role: "parceiro_b2b", roles: state.roles, loading: false, authzReady: true, authzEpoch: state.epoch,
  checkAuthzAccess: () => !state.revoked, signOut: vi.fn(),
  setSafePartnerOrderDraft: (d: unknown) => { if (d) state.lastDraft = d as typeof state.draft; }, takeSafePartnerOrderDraft: () => state.draft,
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
  Object.assign(state, { lastDraft: null, createImpl: null, actorOverride: null, revoked: false, closeImpl: null, roles: ["parceiro_b2b"], tenant: "22222222-2222-4222-8222-222222222222", partner: "33333333-3333-4333-8333-333333333333", epoch: 0, draft: null });
  vi.clearAllMocks();
  state.table.mockImplementation((table: string) => {
    if (table === "catalogo_volumes") return { select: () => ({ eq: () => response([{ ...VOLUME, produto_id: state.partner }]) }) };
    if (table === "partner_orders") return { select: () => ({ eq: () => ({ maybeSingle: () => response({
      id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b",
      c2_external_origin_snapshot: { contract: "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1", accounting_validated: false },
    }) }) }) };
    throw new Error(`Unexpected table read: ${table}`);
  });
  state.rpc.mockImplementation((name: string, args?: Record<string, unknown>) => {
    const context = { contract: "C2_MULTIPROFILE_V1", actor_id: state.actorOverride ?? state.actor, tenant_id: state.tenant,
      organization_id: state.tenant, commercial_owner_organization_id: state.tenant, mode: "commercial_owner",
      partner_id: state.partner, external_roles: ["parceiro_b2b"], manager: true, technician: false, role: "parceiro_b2b", papel: "gestor" };
    if (name === "get_my_commercial_partner_context") return response(context);
    if (name === "get_my_commercial_partner_projection") return response({ ...context, id: state.partner, ativo: true,
      codigo: "LOCAL", razao_social: "Parceiro local", capabilities: { contract: "C2_CAT_V1", catalog_read: true, sheets_read: true },
      order_capabilities: { contract: "C2_OWNER_ORDER_V1", order_create: true } });
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
    if (name === "close_partner_order_attempt_v1" && state.closeImpl) return state.closeImpl(args ?? {}) as never;
    if (name === "create_partner_order_secure" && state.createImpl) return state.createImpl(args ?? {}) as never;
    if (name === "create_partner_order_secure") return response({ id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", total: 10 });
    if (name === "get_my_commercial_orders_projection") return response({
      partner_id: state.partner,
      orders: [{ id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", status: "em_analise_comercial", created_at: "2026-10-26T15:00:00+00:00" }],
    });
    if (name === "log_my_access_denied_secure") return response(null);
    state.writes(name); throw new Error(`Unexpected RPC: ${name}`);
  });
});
afterEach(cleanup);
function mount() {
  void 0;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Routes>
    <Route path="/portal-parceiro" element={<B2BRouteGuard><Layout /></B2BRouteGuard>}>
      <Route element={<EntitlementOutlet />}><Route path="catalogo" element={<NovoPedido />} /></Route>
      <Route path="pedidos" element={<p>Lista de pedidos</p>} />
    </Route><Route path="/sem-permissao" element={<p>Negado</p>} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

// Reenvio após resultado incerto: componentes/hook reais, transporte sintético.
type Args = Record<string, unknown>;
const creates = () => state.rpc.mock.calls.filter(([n]) => n === "create_partner_order_secure").map(([, a]) => a as Args);

async function fillAndSubmit(add = true) {
  await screen.findAllByText("Produto local");
  if (add) {
    fireEvent.click(screen.getByRole("button", { name: "Adicionar ao pedido" }));
    fireEvent.click(await screen.findByRole("button", { name: "Adicionar ao carrinho" }));
  }
  fireEvent.click((await screen.findAllByRole("button", { name: "Continuar para condição de pagamento" }))[0]);
  fireEvent.click(await screen.findByRole("button", { name: /À vista/ }));
  const submit = await screen.findByRole("button", { name: "Enviar pedido para análise" });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
}
async function waitCart() {
  await screen.findAllByText("Produto local");
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Continuar para condição de pagamento" })[0]).toBeEnabled());
}
function lostResponse() {
  // Servidor pode ter commitado; resposta perdida (falha de rede sem SQLSTATE).
  let fail!: () => void;
  const p = new Promise(resolve => { fail = () => resolve({ data: null, error: { message: "TypeError: Failed to fetch", code: "" } }); });
  return { promise: Object.assign(p, { abortSignal: () => p }), fail };
}


import { clearAllOrderAttempts, readOrderAttempt } from "@/lib/authz/pendingOrderAttempt";
import { clearAllPauseStates } from "@/lib/authz/pauseRetainedState";
beforeEach(() => clearAllOrderAttempts());
const closes = () => state.rpc.mock.calls.filter(([n]) => n === "close_partner_order_attempt_v1").map(([, a]) => a as Args);
const C = "C2_ORDER_ATTEMPT_CLOSURE_V1";
function deferred() {
  let settle!: (v: unknown) => void, fail!: (e: unknown) => void;
  const p = new Promise((r, j) => { settle = r; fail = j; });
  return { promise: Object.assign(p, { abortSignal: () => p }), settle, fail };
}
async function lostThenRemount(draftQty = 3) {
  const lost = lostResponse();
  state.createImpl = () => lost.promise;
  const first = mount();
  await fillAndSubmit();
  await waitFor(() => expect(creates()).toHaveLength(1));
  first.unmount(); cleanup();
  await act(async () => { lost.fail(); });
  state.draft = { ...state.lastDraft, items: state.lastDraft.items.map((i: any) => ({ ...i, quantity: draftQty })) };
  state.createImpl = null;
  mount();
  await waitCart();
  await fillAndSubmit(false);
  await screen.findByText(/Não foi possível confirmar o envio anterior/);
  expect(creates()).toHaveLength(1);
}
const verify = () => fireEvent.click(screen.getByRole("button", { name: "Verificar e encerrar envio anterior" }));
async function submitAgain() {
  const submit = screen.getByRole("button", { name: "Enviar pedido para análise" });
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
}

it("nunca encerra automaticamente após falha/timeout: só por clique", async () => {
  await lostThenRemount();
  await new Promise(r => setTimeout(r, 80));
  expect(closes()).toHaveLength(0);
});

it("closed validado: mesma chave/parceiro na RPC, libera nova chave e envia o carrinho editado mantido", async () => {
  await lostThenRemount();
  state.closeImpl = () => response({ contract: C, state: "closed" });
  verify();
  await screen.findByText(/encerrado sem pedido/);
  expect(closes()).toEqual([{ p_partner_id: state.partner, p_idempotency_key: creates()[0].p_idempotency_key }]);
  await submitAgain();
  await waitFor(() => expect(creates()).toHaveLength(2));
  expect(creates()[1].p_idempotency_key).not.toBe(creates()[0].p_idempotency_key);
  expect((creates()[1].p_items as any[])[0].quantidade).toBe(3);
});

it("committed com schema válido: mostra número e navega pelo caminho canônico; não cria outro", async () => {
  await lostThenRemount();
  state.closeImpl = () => response({ contract: C, state: "committed", order_id: "405ff73f-1667-43a3-a41c-56d9500dfd8b", numero: "PB-001031" });
  verify();
  await screen.findByText(/PB-001031 já foi registrado/);
  fireEvent.click(screen.getByRole("button", { name: "Ver meus pedidos" }));
  await screen.findByText("Pedidos exibidos");
  expect(creates()).toHaveLength(1);
});

it.each([
  ["committed sem número", { contract: C, state: "committed", order_id: "405ff73f-1667-43a3-a41c-56d9500dfd8b" }],
  ["committed com id inválido", { contract: C, state: "committed", order_id: "x", numero: "PB-1" }],
  ["in_progress", { contract: C, state: "in_progress" }],
  ["contrato desconhecido", { contract: "OTHER", state: "closed" }],
  ["vazio", null],
])("%s não é conclusivo: bloqueio preservado", async (_l, data) => {
  await lostThenRemount();
  state.closeImpl = () => response(data);
  verify();
  await screen.findByText(/Nada foi liberado|ainda está sendo processado/);
  await submitAgain();
  await new Promise(r => setTimeout(r, 50));
  expect(creates()).toHaveLength(1);
  expect(readOrderAttempt(JSON.stringify([state.actor, state.tenant, state.partner]))?.ambiguous).toBe(true);
});

it.each([
  ["erro PostgREST", () => response(null).then(() => ({ data: null, error: { code: "42501", message: "forbidden_partner" } }))],
  ["exceção de rede", () => Promise.reject(new TypeError("Failed to fetch"))],
])("%s mantém bloqueio", async (_l, impl) => {
  await lostThenRemount();
  state.closeImpl = impl as never;
  verify();
  await screen.findByText(/Nada foi liberado/);
  await submitAgain();
  await new Promise(r => setTimeout(r, 50));
  expect(creates()).toHaveLength(1);
});

it("duplo clique em verificar: uma única RPC", async () => {
  await lostThenRemount();
  const d = deferred();
  state.closeImpl = () => d.promise;
  verify();
  await screen.findByRole("button", { name: "Verificando…" });
  fireEvent.click(screen.getByRole("button", { name: "Verificando…" }));
  expect(closes()).toHaveLength(1);
  await act(async () => { d.settle({ data: { contract: C, state: "closed" }, error: null }); });
});

it("revogação durante a verificação: closed tardio NÃO libera e carrinho editado permanece", async () => {
  await lostThenRemount();
  const d = deferred();
  state.closeImpl = () => d.promise;
  verify();
  await waitFor(() => expect(closes()).toHaveLength(1));
  state.revoked = true;
  await act(async () => { d.settle({ data: { contract: C, state: "closed" }, error: null }); });
  state.revoked = false;
  expect(screen.queryByText(/encerrado sem pedido/)).toBeNull();
  expect(readOrderAttempt(JSON.stringify([state.actor, state.tenant, state.partner]))?.ambiguous).toBe(true);
  // Carrinho editado preservado; reabrir e enviar continua bloqueado.
  await waitCart();
  await fillAndSubmit(false);
  await screen.findByText(/Não foi possível confirmar o envio anterior/);
  expect(creates()).toHaveLength(1);
});

it("desmontagem durante a verificação: resposta antiga não libera; remontado continua bloqueado", async () => {
  await lostThenRemount();
  const d = deferred();
  state.closeImpl = () => d.promise;
  verify();
  await waitFor(() => expect(closes()).toHaveLength(1));
  cleanup();
  await act(async () => { d.settle({ data: { contract: C, state: "closed" }, error: null }); });
  expect(readOrderAttempt(JSON.stringify([state.actor, state.tenant, state.partner]))?.ambiguous).toBe(true);
  state.closeImpl = null;
  mount(); await waitCart(); await fillAndSubmit(false);
  await screen.findByText(/Não foi possível confirmar o envio anterior/);
  expect(creates()).toHaveLength(1);
});

it("troca de empresa durante a verificação: nada liberado para nenhum dos dois contextos", async () => {
  await lostThenRemount();
  const d = deferred();
  state.closeImpl = () => d.promise;
  verify();
  await waitFor(() => expect(closes()).toHaveLength(1));
  const A = state.tenant;
  state.tenant = "55555555-5555-4555-8555-555555555555";
  // Mudança de contexto chega à árvore (re-render) antes da resposta tardia.
  fireEvent.change(screen.getByPlaceholderText("Observações internas do pedido (opcional)"), { target: { value: "re-render" } });
  await act(async () => { d.settle({ data: { contract: C, state: "closed" }, error: null }); });
  expect(readOrderAttempt(JSON.stringify([state.actor, A, state.partner]))?.ambiguous).toBe(true);
});

it("logout e espera não descartam a tentativa; outro ator não a vê", async () => {
  await lostThenRemount();
  cleanup();
  clearAllPauseStates();
  await new Promise(r => setTimeout(r, 50));
  mount(); await waitCart(); await fillAndSubmit(false);
  await screen.findByText(/Não foi possível confirmar o envio anterior/);
  expect(creates()).toHaveLength(1);
  cleanup();
  state.actorOverride = "44444444-4444-4444-8444-444444444444";
  mount(); await waitCart(); await fillAndSubmit(false);
  await waitFor(() => expect(creates()).toHaveLength(2));
  expect(creates()[1].p_idempotency_key).not.toBe(creates()[0].p_idempotency_key);
});

import { orderAttemptSlot } from "@/lib/authz/pendingOrderAttempt";
it("troca de papéis não muda o slot (não escapa do bloqueio); sem papel não há slot", () => {
  const a = { userId: "u", organizationId: "o" };
  expect(orderAttemptSlot({ ...a, roles: ["parceiro_b2b"] }, "p")).toBe(orderAttemptSlot({ ...a, roles: ["parceiro_b2b", "parceiro_b2b_tecnico"] }, "p"));
  expect(orderAttemptSlot({ ...a, roles: [] }, "p")).toBeNull();
  expect(orderAttemptSlot({ ...a, organizationId: "o2", roles: ["parceiro_b2b"] }, "p")).not.toBe(orderAttemptSlot({ ...a, roles: ["parceiro_b2b"] }, "p"));
});
