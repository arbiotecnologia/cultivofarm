import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { withPaymentMethod, pickTestPix, TEST_PIX, TEST_CONTRACT, condEnvelope } from "@/test/helpers/b2bPaymentMethodMock";
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
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/portal-parceiro/catalogo"]}><Routes>
    <Route path="/portal-parceiro" element={<B2BRouteGuard><Layout /></B2BRouteGuard>}>
      <Route element={<EntitlementOutlet />}><Route path="catalogo" element={<NovoPedido />} /></Route>
      <Route path="pedidos" element={<p>MeusPedidos legado não deve montar</p>} />
    </Route><Route path="/sem-permissao" element={<p>Negado</p>} />
  </Routes></MemoryRouter></QueryClientProvider>);
}


const wrapped = () => state.rpc.getMockImplementation()!;
function overrideOptions(fn: (args: Record<string, unknown>) => unknown) {
  const base = wrapped();
  state.rpc.mockImplementation((n: string, a?: Record<string, unknown>) => n === "b2b_list_payment_condition_options_secure" ? fn(a ?? {}) : base(n, a));
}
const abortable = (p: Promise<unknown>) => Object.assign(p, { abortSignal: () => p });
async function toPayment() {
  mount();
  await screen.findByText("Produto local");
  fireEvent.click(screen.getByRole("button", { name: "Adicionar ao pedido" }));
  fireEvent.click(await screen.findByRole("button", { name: "Adicionar ao carrinho" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Continuar para condição de pagamento" })[0]);
  fireEvent.click(await screen.findByRole("button", { name: /À vista/ }));
}
const calls = (n: string) => state.rpc.mock.calls.filter(([x]) => x === n).map(([, a]) => a as Record<string, unknown>);
const submitBtn = () => screen.findByRole("button", { name: "Enviar pedido para análise" });

it("sem escolha explícita do meio: envio bloqueado e nenhuma simulação/criação com meio", async () => {
  await toPayment();
  await screen.findByRole("radio", { name: /Pix/ });
  expect(await submitBtn()).toBeDisabled();
  await new Promise((r) => setTimeout(r, 30));
  expect(calls("simulate_b2b_payment_condition_secure")).toHaveLength(0);
  expect(calls("create_partner_order_condition_secure")).toHaveLength(0);
  expect(calls("create_partner_order_secure")).toHaveLength(0);
});

it("meio escolhido: simulação e criação levam meio/versão/prazo; cliente não envia parcelas nem vencimento; datas rotuladas como estimadas", async () => {
  await toPayment();
  await pickTestPix();
  await waitFor(() => expect(calls("simulate_b2b_payment_condition_secure")).toHaveLength(1));
  expect(calls("simulate_b2b_payment_condition_secure")[0]).toMatchObject({ p_payment_choice: TEST_PIX });
  fireEvent.click(screen.getByText(/Parcelas estimadas/));
  expect(await screen.findByTestId("b2b-estimated-dates-note")).toHaveTextContent("emissão da nota fiscal");
  const submit = await submitBtn();
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  await waitFor(() => expect(calls("create_partner_order_condition_secure")).toHaveLength(1));
  const a = calls("create_partner_order_condition_secure")[0];
  expect(a).toMatchObject({ p_payment_choice: TEST_PIX });
  expect(a).not.toHaveProperty("p_first_due_date");
  expect(a).not.toHaveProperty("p_installment_count");
  await screen.findByText("PB-001029");
});

it("falha ao ler meios: erro persistente, envio bloqueado e nova leitura só por clique", async () => {
  overrideOptions(() => abortable(Promise.resolve({ data: null, error: { code: "XX000", message: "internal" } })));
  await toPayment();
  expect(await screen.findByTestId("b2b-payment-method-error")).toBeInTheDocument();
  expect(await submitBtn()).toBeDisabled();
  const n = calls("b2b_list_payment_condition_options_secure").length;
  await new Promise((r) => setTimeout(r, 50));
  expect(calls("b2b_list_payment_condition_options_secure")).toHaveLength(n);
  fireEvent.click(screen.getByRole("button", { name: "Tentar carregar novamente" }));
  await waitFor(() => expect(calls("b2b_list_payment_condition_options_secure").length).toBe(n + 1));
});

it("leitor ausente (pré-instalação exata): servidor ainda sem exigência, segue o contrato atual sem seletor de meio", async () => {
  overrideOptions(() => abortable(Promise.resolve({ data: null, error: { code: "PGRST202",
    message: "Could not find the function public.b2b_list_payment_condition_options_secure(p_partner_id, p_payment_plan_id) in the schema cache" } })));
  await toPayment();
  const submit = await submitBtn();
  await waitFor(() => expect(submit).toBeEnabled());
  expect(screen.queryByTestId("b2b-payment-method")).toBeNull();
  fireEvent.click(submit);
  await waitFor(() => expect(calls("create_partner_order_secure")).toHaveLength(1));
  expect(calls("simulate_b2b_payment_condition_secure")).toHaveLength(0);
  expect(calls("create_partner_order_condition_secure")).toHaveLength(0);
});

it("outro erro com código de ausência mas endpoint diferente (42883/PGRST202 sem o nome exato) falha fechado", async () => {
  overrideOptions(() => abortable(Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.other(p_x)" } })));
  await toPayment();
  expect(await screen.findByTestId("b2b-payment-method-error")).toBeInTheDocument();
  expect(await submitBtn()).toBeDisabled();
  await new Promise((r) => setTimeout(r, 30));
  expect(calls("simulate_b2b_payment_plan_secure")).toHaveLength(0);
});

it("empresa não ativada (mode legacy no leitor instalado): contrato atual, sem bloqueio global", async () => {
  const base = wrapped();
  state.rpc.mockImplementation(withPaymentMethod((n, a) => base(n, a), undefined, { mode: "legacy" }));
  await toPayment();
  const submit = await submitBtn();
  await waitFor(() => expect(submit).toBeEnabled());
  expect(screen.queryByRole("radio", { name: /Pix/ })).toBeNull();
  fireEvent.click(submit);
  await waitFor(() => expect(calls("create_partner_order_secure")).toHaveLength(1));
  expect(calls("create_partner_order_condition_secure")).toHaveLength(0);
});

it("resposta sem modo explícito é contrato indisponível (nunca lista vazia silenciosa)", async () => {
  overrideOptions((a) => abortable(Promise.resolve({ data: { contract: TEST_CONTRACT, partner_id: a.p_partner_id, payment_plan_id: a.p_payment_plan_id,
    due_basis: "nf_issue", options: [] }, error: null })));
  await toPayment();
  expect(await screen.findByTestId("b2b-payment-method-error")).toBeInTheDocument();
  expect(await submitBtn()).toBeDisabled();
});

it("promissória configurada pelo vendedor é selecionável (todos os meios personalizáveis)", async () => {
  overrideOptions((a) => abortable(Promise.resolve({ data: { contract: TEST_CONTRACT, partner_id: a.p_partner_id, payment_plan_id: a.p_payment_plan_id,
    mode: "required", due_basis: "nf_issue", options: [{ payment_method: "promissoria", payment_condition_version: 1, payment_deadline_days: 5, available: true, payment_method_name: "Promissória", installment_count: 1, monthly_rate: 0 }] }, error: null })));
  await toPayment();
  expect(await screen.findByRole("radio", { name: /Promissória/ })).toBeInTheDocument();
});

const BOLETO = { payment_method: "boleto", payment_condition_version: 1, payment_deadline_days: 30 };
function priceReply(rows: number[], final: number) {
  return (a: Record<string, unknown>) => Promise.resolve({ data: {
    partner_id: a.p_partner_id, pricing_mode: "discount_from_base", quote_required: false, cart_hash: "hash-price",
    payment_plan: { id: PLAN.id, name: PLAN.name, code: PLAN.code, pricing_mode: "discount_from_base", discount_percent: 0, monthly_interest_percent: 0,
      months_count: 1, installment_count: 3, requires_financial_approval: false, requires_credit_approval: false, requires_guarantee: false },
    amounts: { table_amount: 1000, discount_amount: 0, net_amount_after_discount: 1000, financial_interest_amount: final - 1000, final_amount: final },
    final_amount: final, installment_count: 3, schedule_estimated: true, due_basis: "nf_issue",
    payment_condition_contract: TEST_CONTRACT, payment_choice: BOLETO,
    payment_condition: { payment_method_name: "Boleto", installment_count: 3, monthly_rate: 1.8, deadline_days: 30, due_basis: "nf_issue", estimated: true },
    schedule: rows.map((amount, i) => ({ installment_number: i + 1, due_date: `2027-0${i + 1}-05`, amount, principal_amount: amount, interest_amount: 0 })),
    warnings: [], credit: { credit_limit: 1000000, exposicao_projetada: final, credit_checked: true } }, error: null });
}
function boletoOptions(a: Record<string, unknown>) {
  return abortable(Promise.resolve({ data: { contract: TEST_CONTRACT, partner_id: a.p_partner_id, payment_plan_id: a.p_payment_plan_id,
    mode: "required", due_basis: "nf_issue", options: [{ ...BOLETO, available: true, payment_method_name: "Boleto", installment_count: 3, monthly_rate: 1.8 }] }, error: null }));
}

it("Price: tela mostra o MESMO total do servidor (1.036,22) e as três parcelas devolvidas", async () => {
  const base = wrapped();
  state.rpc.mockImplementation((n: string, a?: Record<string, unknown>) => n === "b2b_list_payment_condition_options_secure" ? boletoOptions(a ?? {})
    : n === "simulate_b2b_payment_condition_secure" ? priceReply([345.4, 345.4, 345.42], 1036.22)(a ?? {}) : base(n, a));
  await toPayment();
  fireEvent.click(await screen.findByRole("radio", { name: /Boleto/ }));
  expect((await screen.findAllByText(/1\.036,22/)).length).toBeGreaterThan(0);
  const card = screen.getByRole("button", { name: /À vista/ });
  expect(card).toHaveTextContent("3 parcelas");
  expect(card).toHaveTextContent("1,8% a.m.");
  expect(card).not.toHaveTextContent("Pagamento único");
  fireEvent.click(screen.getByText(/Parcelas estimadas/));
  expect(await screen.findByText("R$ 345,42")).toBeInTheDocument();
  expect(await submitBtn()).toBeEnabled();
});

it("Price em parcela única: tela aceita taxa explícita e mostra 1018, principal 1000 e juros 18", async () => {
  const base = wrapped();
  state.rpc.mockImplementation((n: string, a?: Record<string, unknown>) => {
    if (n === "b2b_list_payment_condition_options_secure") return abortable(Promise.resolve({ data: {
      contract: TEST_CONTRACT, partner_id: a?.p_partner_id, payment_plan_id: a?.p_payment_plan_id,
      mode: "required", due_basis: "nf_issue", options: [{ ...BOLETO, available: true, payment_method_name: "Boleto", installment_count: 1, monthly_rate: 1.8 }],
    }, error: null }));
    if (n === "simulate_b2b_payment_condition_secure") return priceReply([1018], 1018)(a ?? {}).then((r) => ({ ...r, data: { ...r.data,
      installment_count: 1,
      payment_plan: { ...r.data.payment_plan, installment_count: 1 },
      payment_condition: { ...r.data.payment_condition, installment_count: 1 },
      schedule: [{ ...r.data.schedule[0], principal_amount: 1000, interest_amount: 18 }],
    } }));
    return base(n, a);
  });
  await toPayment();
  fireEvent.click(await screen.findByRole("radio", { name: /Boleto · 1x · 1,8% a\.m\./ }));
  expect((await screen.findAllByText(/1\.018,00/)).length).toBeGreaterThan(0);
  expect((await screen.findAllByText(/R\$ 18,00/)).length).toBeGreaterThan(0);
  expect((await screen.findAllByText(/1\.000,00/)).length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: /À vista/ })).toHaveTextContent("Pagamento único de R$ 1.018,00");
  expect(screen.getByRole("button", { name: /À vista/ })).toHaveTextContent("1,8% a.m.");
  fireEvent.click(screen.getByText(/Parcelas estimadas/));
  expect((await screen.findAllByText("R$ 1.018,00")).length).toBeGreaterThan(0);
  expect(await submitBtn()).toBeEnabled();
});

it("plano legado 1x: cartão, cronograma e total seguem V1 3x/1,8%; troca de versão/meio aposenta economia anterior", async () => {
  const base = wrapped();
  let finish: ((value: unknown) => void) | undefined;
  const choices = [
    { ...BOLETO, payment_deadline_days: 1, installment_count: 3, monthly_rate: 1.8 },
    { ...BOLETO, payment_condition_version: 2, payment_deadline_days: 1, installment_count: 1, monthly_rate: 1.8 },
    { ...TEST_PIX, installment_count: 1, monthly_rate: 0 },
  ];
  const reply = async (a: Record<string, unknown>) => {
    const choice = a.p_payment_choice as typeof BOLETO;
    const option = choices.find((o) => o.payment_method === choice.payment_method && o.payment_condition_version === choice.payment_condition_version);
    if (!option) throw new Error("Unexpected choice");
    const rows = option.installment_count === 3 ? [6.22, 6.22, 6.21] : [choice.payment_method === "pix" ? 18 : 18.32];
    const final = rows.reduce((sum, n) => sum + Math.round(n * 100), 0) / 100;
    const r = await priceReply(rows, final)(a);
    return { ...r, data: { ...r.data, payment_choice: choice, installment_count: option.installment_count,
      // Keep the legacy plan 1x even in the ACK: the condition owns the new economics.
      payment_plan: { ...r.data.payment_plan, installment_count: 1 },
      payment_condition: { ...r.data.payment_condition, installment_count: option.installment_count,
        monthly_rate: option.monthly_rate, deadline_days: choice.payment_deadline_days,
        payment_method_name: choice.payment_method === "pix" ? "Pix" : "Boleto" },
      amounts: { table_amount: 20, discount_amount: 2, net_amount_after_discount: 18,
        financial_interest_amount: Math.round((final - 18) * 100) / 100, final_amount: final },
    } };
  };
  state.rpc.mockImplementation((n: string, a?: Record<string, unknown>) => {
    if (n === "b2b_list_payment_condition_options_secure") return response({ contract: TEST_CONTRACT,
      partner_id: a?.p_partner_id, payment_plan_id: a?.p_payment_plan_id, mode: "required", due_basis: "nf_issue",
      options: choices.map((o) => ({ ...o, available: true, payment_method_name: o.payment_method === "pix" ? "Pix" : "Boleto" })) });
    if (n === "simulate_b2b_payment_condition_secure") {
      const choice = a?.p_payment_choice as typeof BOLETO;
      if (choice.payment_method === "pix" || choice.payment_condition_version === 2)
        return new Promise((resolve) => { finish = resolve; });
      return reply(a ?? {});
    }
    return base(n, a);
  });
  await toPayment();
  await screen.findByRole("radio", { name: /Boleto · 3x/ });
  const card = screen.getByRole("button", { name: /À vista/ });
  expect(card).not.toHaveTextContent("Pagamento único");
  expect(card).not.toHaveTextContent("3 parcelas");
  fireEvent.click(screen.getByRole("radio", { name: /Boleto · 3x/ }));
  await waitFor(() => expect(card).toHaveTextContent("3 parcelas: R$ 6,22 / R$ 6,22 / R$ 6,21"));
  expect(card).toHaveTextContent("1,8% a.m.");
  expect(card).not.toHaveTextContent("Pagamento único");
  expect((await screen.findAllByText(/18,65/)).length).toBeGreaterThan(0);
  expect(screen.getByText(/\+ R\$ 0,65/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Parcelas estimadas/));
  expect(screen.getAllByText("R$ 6,22")).toHaveLength(2);
  expect(screen.getByText("R$ 6,21")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: /Boleto · 1x/ }));
  await waitFor(() => expect(card).toHaveTextContent("Calculando condição"));
  expect(card).not.toHaveTextContent("3 parcelas");
  expect(screen.queryByText(/Parcelas estimadas/)).toBeNull();
  expect(screen.queryByText(/18,65/)).toBeNull();
  expect(await submitBtn()).toBeDisabled();
  const versionFinish = finish;
  if (!versionFinish) throw new Error("Missing version response");
  const versionArgs = calls("simulate_b2b_payment_condition_secure").slice(-1)[0];
  if (!versionArgs) throw new Error("Missing version request");
  await act(async () => versionFinish(await reply(versionArgs)));
  await waitFor(() => expect(card).toHaveTextContent("Pagamento único de R$ 18,32"));
  expect(card).toHaveTextContent("1,8% a.m.");
  expect(screen.getByText(/Parcelas estimadas · Boleto \(1\)/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("radio", { name: /Pix/ }));
  await waitFor(() => expect(card).toHaveTextContent("Calculando condição"));
  expect(card).not.toHaveTextContent("18,32");
  expect(within(card).queryByText(/Juros:/)).toBeNull();
  expect(screen.queryByText(/Parcelas estimadas/)).toBeNull();
  expect(await submitBtn()).toBeDisabled();
  const methodFinish = finish;
  const methodArgs = calls("simulate_b2b_payment_condition_secure").slice(-1)[0];
  if (!methodFinish || !methodArgs) throw new Error("Missing method request/response");
  await act(async () => methodFinish(await reply(methodArgs)));
  await waitFor(() => expect(card).toHaveTextContent("Pagamento único de R$ 18,00"));
  expect(screen.getByText(/Parcelas estimadas · Pix \(1\)/)).toBeInTheDocument();
  expect(calls("create_partner_order_condition_secure")).toHaveLength(0);
  expect(calls("create_partner_order_secure")).toHaveLength(0);
});

it("crédito incompleto: tela informa condição financeira indisponível e envio permanece bloqueado", async () => {
  const base = wrapped();
  state.rpc.mockImplementation((n: string, a?: Record<string, unknown>) => n === "simulate_b2b_payment_condition_secure"
    ? Promise.resolve({ data: null, error: { code: "PT409", message: "CREDIT_SETTINGS_INCOMPLETE" } }) : base(n, a));
  await toPayment();
  await pickTestPix();
  expect(await screen.findByText("Condição financeira indisponível.")).toBeInTheDocument();
  expect(await submitBtn()).toBeDisabled();
  expect(calls("create_partner_order_condition_secure")).toHaveLength(0);
});

it("resposta com credit null não é aceita como apta: erro visível e envio bloqueado", async () => {
  const base = wrapped();
  state.rpc.mockImplementation((n: string, a?: Record<string, unknown>) => n === "b2b_list_payment_condition_options_secure" ? boletoOptions(a ?? {})
    : n === "simulate_b2b_payment_condition_secure" ? priceReply([10, 0, 0], 10)(a ?? {}).then((r) => ({ ...r, data: { ...r.data, credit: null } })) : base(n, a));
  await toPayment();
  fireEvent.click(await screen.findByRole("radio", { name: /Boleto/ }));
  expect(await screen.findByTestId("b2b-simulation-error")).toBeInTheDocument();
  expect(await submitBtn()).toBeDisabled();
});

it("Price incoerente (soma das parcelas ≠ total) é resposta inválida: erro e envio bloqueado", async () => {
  const base = wrapped();
  state.rpc.mockImplementation((n: string, a?: Record<string, unknown>) => n === "b2b_list_payment_condition_options_secure" ? boletoOptions(a ?? {})
    : n === "simulate_b2b_payment_condition_secure" ? priceReply([345.4, 345.4, 345.42], 1000)(a ?? {}) : base(n, a));
  await toPayment();
  fireEvent.click(await screen.findByRole("radio", { name: /Boleto/ }));
  expect(await screen.findByTestId("b2b-simulation-error")).toBeInTheDocument();
  expect(await submitBtn()).toBeDisabled();
});

it("ACK com total diferente da simulação não é sucesso (sem navegação)", async () => {
  const base = wrapped();
  state.rpc.mockImplementation((n: string, a?: Record<string, unknown>) => n === "create_partner_order_condition_secure"
    ? Promise.resolve({ data: { id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", total: 10, final_amount: 10, cart_hash: a?.p_expected_cart_hash,
        schedule: [{ installment_number: 1, amount: 9.99 }], ...condEnvelope() }, error: null })
    : base(n, a));
  await toPayment();
  await pickTestPix();
  const submit = await submitBtn();
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  await waitFor(() => expect(calls("create_partner_order_condition_secure")).toHaveLength(1));
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByText("PB-001029")).toBeNull();
});

it("ACK com outro meio/versão não é tratado como sucesso (sem navegação)", async () => {
  const base = wrapped();
  state.rpc.mockImplementation((n: string, a?: Record<string, unknown>) => n === "create_partner_order_condition_secure"
    ? Promise.resolve({ data: { id: "d4539dd9-b090-4433-9ed3-6f8f5d3e767b", numero: "PB-001029", total: 10,
        ...condEnvelope({ ...TEST_PIX, payment_condition_version: 2 }) }, error: null })
    : base(n, a));
  await toPayment();
  await pickTestPix();
  const submit = await submitBtn();
  await waitFor(() => expect(submit).toBeEnabled());
  fireEvent.click(submit);
  await waitFor(() => expect(calls("create_partner_order_condition_secure")).toHaveLength(1));
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByRole("region", { name: "Acompanhamento de pedidos" })).toBeNull();
});
