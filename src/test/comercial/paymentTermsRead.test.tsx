import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Transporte stub local: nenhuma chamada hospedada. Hook e componente reais.
const s = vi.hoisted(() => ({ actor: "u-a", tenant: "t-a", epoch: 0, rpc: vi.fn(), table: vi.fn(), writes: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: s.actor }, profile: { user_id: s.actor, organization_id: s.tenant, ativo: true, senha_provisoria: false },
  roles: ["administrador"], role: "administrador", loading: false, authzReady: true, authzEpoch: s.epoch, checkAuthzAccess: () => true,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...a: unknown[]) => { const p = s.rpc(...a); return Object.assign(p, { abortSignal: () => p }); },
  from: (...a: unknown[]) => s.table(...a),
} }));
import { PaymentTermsSection } from "@/components/comercial/PaymentTermsSection";

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
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = () => <QueryClientProvider client={client}><PaymentTermsSection partnerOrderId={ORDER} canApprove={false} /></QueryClientProvider>;
  const v = render(tree()); return { update: () => v.rerender(tree()) };
}
const NO_TERMS = /Sem condição de pagamento registrada/;
beforeEach(() => { Object.assign(s, { actor: "u-a", tenant: "t-a", epoch: 0 }); vi.clearAllMocks(); });
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
