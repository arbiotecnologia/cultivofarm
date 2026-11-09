import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Transporte stub local: nenhuma chamada hospedada. Hook e componente reais.
const s = vi.hoisted(() => ({ actor: "u-a", tenant: "t-a", epoch: 0, ready: true, rpc: vi.fn(), condition: vi.fn(), table: vi.fn(), writes: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: s.actor }, profile: { user_id: s.actor, organization_id: s.tenant, ativo: true, senha_provisoria: false },
  roles: ["administrador"], role: "administrador", loading: false, authzReady: true, authzEpoch: s.epoch, checkAuthzAccess: () => s.ready,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...a: unknown[]) => { const p = a[0] === "get_partner_order_payment_condition_secure" ? s.condition(...a) : s.rpc(...a); return Object.assign(p, { abortSignal: () => p }); },
  from: (...a: unknown[]) => s.table(...a),
} }));
import { PaymentTermsSection } from "@/components/comercial/PaymentTermsSection";
import { parseOrderPaymentCondition } from "@/hooks/usePaymentTermsApproval";
import { isAccountingPending, ACCOUNTING_PENDING_CONTRACT } from "@/lib/orderAccountingState";

const ORDER = "a16fb134-6ae6-4952-8b13-d6098eda52fd";
const terms = (final = 18.9) => ({ id: "t1", partner_order_id: ORDER, payment_plan_id: "p", plan_name_snapshot: "TESTE 10%", plan_code_snapshot: "T10",
  discount_percent_snapshot: 10, monthly_interest_percent_snapshot: 0, months_count_snapshot: 0, installment_count: 1, first_due_date: "2026-12-06",
  interest_type_snapshot: "none", table_amount: 21, discount_amount: 2.1, net_amount_after_discount: final, financial_interest_amount: 0, final_amount: final,
  approval_status: "pending", approved_at: null, approval_notes: null });
const ok = (data: unknown) => Promise.resolve({ data, error: null });
const reply = (t: unknown) => ok({ contract: "B2B_ORDER_PAYMENT_TERMS_READ_V1", order_id: ORDER, present: t != null, terms: t });
const fail = (code: string, message: string) => Promise.resolve({ data: null, error: { code, message } });
const absentRpc = () => fail("PGRST202", "Could not find the function public.get_partner_order_payment_terms_secure(p_order_id) in the schema cache");
function legacy(row: unknown) {
  const q: any = { select: () => q, eq: () => q, abortSignal: () => q, maybeSingle: () => Promise.resolve({ data: row, error: null }) };
  s.table.mockReturnValue(q);
}
function mount(canApprove = false, initialPending = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let pending = initialPending;
  let orderId = ORDER;
  let allowed = canApprove;
  const tree = () => <QueryClientProvider client={client}><PaymentTermsSection partnerOrderId={orderId} canApprove={allowed} accountingPending={pending} /></QueryClientProvider>;
  const v = render(tree()); return { update: () => v.rerender(tree()), setPending: (value: boolean) => { pending = value; v.rerender(tree()); },
    setOrder: (value: string) => { orderId = value; v.rerender(tree()); }, setAllowed: (value: boolean) => { allowed = value; v.rerender(tree()); } };
}
const NO_TERMS = /Sem condição de pagamento registrada/;
beforeEach(() => { Object.assign(s, { actor: "u-a", tenant: "t-a", epoch: 0, ready: true }); vi.clearAllMocks();
  s.condition.mockImplementation(() => ok({ contract: "B2B_PAYMENT_CONDITION_V1", order_id: ORDER, present: false, payment_condition: null }));
});
afterEach(cleanup);

it("presente pelo leitor canônico: mostra plano e valor final, sem chamar tabela direta", async () => {
  s.rpc.mockImplementation(() => reply(terms()));
  mount();
  expect(await screen.findByText(/TESTE 10%/)).toBeInTheDocument();
  expect(screen.getAllByText(/18,90/).length).toBeGreaterThan(0);
  expect(s.table).not.toHaveBeenCalled();
  expect(s.rpc).toHaveBeenCalledWith("get_partner_order_payment_terms_secure", { p_order_id: ORDER });
});
it("ausência confirmada pelo servidor: 'sem condição registrada'", async () => {
  s.rpc.mockImplementation(() => reply(null));
  mount(); expect(await screen.findByText(NO_TERMS)).toBeInTheDocument();
});
it.each([
  ["negado 42501", () => fail("42501", "forbidden")],
  ["erro de rede", () => Promise.reject(new Error("network"))],
  ["contrato inválido", () => ok({ contract: "X", order_id: ORDER, present: true, terms: {} })],
  ["pedido de outro id", () => ok({ contract: "B2B_ORDER_PAYMENT_TERMS_READ_V1", order_id: "outro", present: false, terms: null })],
  ["PGRST202 de outro endpoint", () => fail("PGRST202", "Could not find the function public.outra(x)")],
  ["42883 (instalação quebrada)", () => fail("42883", "function public.get_partner_order_payment_terms_secure(uuid) does not exist")],
] as const)("%s => indisponível, nunca 'sem condição'", async (_n, impl) => {
  s.rpc.mockImplementation(impl);
  mount();
  expect(await screen.findByTestId("payment-terms-unavailable")).toBeInTheDocument();
  expect(screen.queryByText(NO_TERMS)).toBeNull();
  expect(s.table).not.toHaveBeenCalled();
});
it("pré-instalação exata: leitura direta sem linha é 'indisponível' (RLS pode filtrar), com linha mostra condição", async () => {
  s.rpc.mockImplementation(absentRpc); legacy(null);
  mount();
  expect(await screen.findByTestId("payment-terms-unavailable")).toBeInTheDocument();
  expect(screen.queryByText(NO_TERMS)).toBeNull();
  cleanup(); legacy(terms());
  mount(); expect(await screen.findByText(/TESTE 10%/)).toBeInTheDocument();
});
it("nova tentativa manual após erro relê e mostra a condição", async () => {
  s.rpc.mockImplementationOnce(() => fail("500", "boom")).mockImplementation(() => reply(terms()));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findByText(/TESTE 10%/)).toBeInTheDocument();
  expect(s.rpc).toHaveBeenCalledTimes(2);
});
it("troca de usuário: resposta atrasada do usuário anterior não aparece para o novo", async () => {
  let releaseA!: (v: unknown) => void;
  s.rpc.mockImplementationOnce(() => new Promise((r) => { releaseA = r; })).mockImplementation(() => new Promise(() => {}));
  const m = mount();
  await waitFor(() => expect(s.rpc).toHaveBeenCalledTimes(1));
  s.actor = "u-b"; s.tenant = "t-b"; m.update();
  await waitFor(() => expect(s.rpc).toHaveBeenCalledTimes(2));
  await act(async () => { releaseA({ data: { contract: "B2B_ORDER_PAYMENT_TERMS_READ_V1", order_id: ORDER, present: true, terms: terms(99.99) }, error: null }); });
  await new Promise((r) => setTimeout(r, 20));
  expect(screen.queryByText(/99,99/)).toBeNull();
  expect(screen.queryByText(NO_TERMS)).toBeNull();
});
it("revogação/época na mesma identidade descarta o resultado exibido", async () => {
  s.rpc.mockImplementationOnce(() => reply(terms(55.55))).mockImplementation(() => new Promise(() => {}));
  const m = mount();
  expect((await screen.findAllByText(/55,55/)).length).toBeGreaterThan(0);
  s.epoch += 1; m.update();
  await waitFor(() => expect(screen.queryByText(/55,55/)).toBeNull());
  expect(s.writes).not.toHaveBeenCalled();
});

const v1 = () => ({ contract: "B2B_PAYMENT_CONDITION_V1", order_id: ORDER, present: true, payment_condition: {
  due_basis: "nf_issue", estimated: true, payment_method_name: "Boleto", installment_count: 3, monthly_rate: 1.8,
} });
const decisionCases = [
  ["Aprovar", "approve_b2b_payment_terms_secure"],
  ["Reprovar", "reject_b2b_payment_terms_secure"],
  ["Solicitar ajuste", "request_b2b_payment_terms_adjustment_secure"],
] as const;

it("snapshot V1 conserva base NF, estimativa e taxa/parcelas explícitas sem usar plano legado", () => {
  expect(parseOrderPaymentCondition(v1(), ORDER)).toMatchObject({ due_basis: "nf_issue", estimated: true, installment_count: 3, monthly_rate: 1.8 });
  expect(parseOrderPaymentCondition({ ...v1(), payment_condition: { ...v1().payment_condition, installment_count: 1 } }, ORDER)?.monthly_rate).toBe(1.8);
});
it.each(["estimated", "due_basis", "installment_count", "monthly_rate"])("snapshot V1 inválido em %s é recusado", (key) => {
  expect(() => parseOrderPaymentCondition({ ...v1(), payment_condition: { ...v1().payment_condition, [key]: null } }, ORDER)).toThrow();
});
it.each(decisionCases)("pendência fiscal V1 bloqueia %s antes do dispatch", async (label) => {
  s.rpc.mockImplementation(() => reply(terms())); s.condition.mockImplementation(() => ok(v1()));
  const pending = isAccountingPending({ c2_external_origin_snapshot: { contract: ACCOUNTING_PENDING_CONTRACT, accounting_validated: false } });
  expect(pending).toBe(true);
  mount(true, pending);
  const button = await screen.findByRole("button", { name: label });
  await waitFor(() => expect(button).toBeDisabled()); fireEvent.click(button);
  expect(s.rpc.mock.calls.map(c => c[0])).toEqual(["get_partner_order_payment_terms_secure"]);
});
it.each(decisionCases)("sem pendência e autorizado: %s preserva chamada canônica", async (label, endpoint) => {
  s.rpc.mockImplementation((name) => name === "get_partner_order_payment_terms_secure" ? reply(terms()) : ok(null));
  s.condition.mockImplementation(() => ok(v1())); mount(true);
  const button = await screen.findByRole("button", { name: label });
  await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
  if (label !== "Aprovar") {
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Revisão autorizada" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
  }
  await waitFor(() => expect(s.rpc).toHaveBeenCalledWith(endpoint, expect.objectContaining({ p_partner_order_id: ORDER })));
  expect(s.rpc.mock.calls.filter(c => c[0] === endpoint)).toHaveLength(1);
});
it("legado sem NF: 1º vencimento do snapshot aparece só como estimativa com base NF", async () => {
  s.rpc.mockImplementation(() => reply(terms()));
  mount();
  expect(await screen.findByText("1º vencimento estimado")).toBeInTheDocument();
  expect(screen.getByText(/06\/12\/2026 \(estimativa\)/)).toBeInTheDocument();
  expect(screen.queryByText(/^1º vencimento$/)).toBeNull();
  expect(screen.getByTestId("due-date-estimate-note")).toHaveTextContent(/emissão da NF/);
});
it("legado autorizado preserva aprovação sem inventar snapshot V1", async () => {
  s.rpc.mockImplementation((name) => name === "get_partner_order_payment_terms_secure" ? reply(terms()) : ok(null));
  mount(true); const button = await screen.findByRole("button", { name: "Aprovar" });
  await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
  await waitFor(() => expect(s.rpc).toHaveBeenCalledWith("approve_b2b_payment_terms_secure", { p_partner_order_id: ORDER, p_notes: null }));
});
it("pendência bloqueia confirmação de ajuste aberto antes da atualização do pedido", async () => {
  s.rpc.mockImplementation(() => reply(terms())); s.condition.mockImplementation(() => ok(v1())); const m = mount(true);
  const button = await screen.findByRole("button", { name: "Solicitar ajuste" });
  await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Revisão" } }); m.setPending(true);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(s.rpc.mock.calls.map(c => c[0])).toEqual(["get_partner_order_payment_terms_secure"]);
});
it("erro do leitor de snapshot não permite decisão com termos carregados", async () => {
  s.rpc.mockImplementation(() => reply(terms())); s.condition.mockImplementation(() => fail("42501", "forbidden")); mount(true);
  const button = await screen.findByRole("button", { name: "Aprovar" }); await waitFor(() => expect(button).toBeDisabled());
  fireEvent.click(button); expect(s.rpc.mock.calls.map(c => c[0])).toEqual(["get_partner_order_payment_terms_secure"]);
});

// Capture o callback real para reproduzir confirmação/click enfileirado da renderização antiga.
function clickHandler(element: HTMLElement): () => void {
  const key = Object.keys(element).find(k => k.startsWith("__reactProps$"));
  if (!key) throw new Error("React event props missing");
  const props = (element as unknown as Record<string, { onClick: () => void }>)[key];
  return props.onClick;
}
it.each(["pending", "actor", "tenant", "epoch", "order", "permission"] as const)("diálogo aberto: %s fecha e callback antigo não despacha", async change => {
  s.rpc.mockImplementation(() => reply(terms())); s.condition.mockImplementation(() => ok(v1())); const m = mount(true);
  const button = await screen.findByRole("button", { name: "Solicitar ajuste" });
  await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Revisão antiga" } });
  const confirmOld = clickHandler(screen.getByRole("button", { name: "Confirmar" }));
  if (change === "pending") m.setPending(true);
  else if (change === "order") m.setOrder("pedido-b");
  else if (change === "permission") m.setAllowed(false);
  else { if (change === "actor") s.actor = "u-b"; if (change === "tenant") s.tenant = "t-b"; if (change === "epoch") s.epoch++; m.update(); }
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  act(() => confirmOld());
  expect(s.rpc.mock.calls.filter(c => c[0] !== "get_partner_order_payment_terms_secure")).toHaveLength(0);
});
it.each(["pending", "epoch", "lease", "permission"] as const)("aprovação capturada revalida %s antes do dispatch", async change => {
  s.rpc.mockImplementation(() => reply(terms())); const m = mount(true);
  const button = await screen.findByRole("button", { name: "Aprovar" });
  await waitFor(() => expect(button).toBeEnabled()); const approveOld = clickHandler(button);
  if (change === "pending") m.setPending(true);
  else if (change === "permission") m.setAllowed(false);
  else if (change === "epoch") { s.epoch++; m.update(); }
  else s.ready = false; // O monitor vence antes da próxima renderização.
  act(() => approveOld());
  expect(s.rpc.mock.calls.filter(c => c[0] !== "get_partner_order_payment_terms_secure")).toHaveLength(0);
});
