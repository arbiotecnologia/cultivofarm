import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Transporte stub local: nenhuma chamada hospedada. Hook e componente reais.
const s = vi.hoisted(() => ({ rpc: vi.fn(), table: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: "fin" }, profile: { user_id: "fin", organization_id: "arbio", ativo: true, senha_provisoria: false },
  roles: ["financeiro"], role: "financeiro", loading: false, authzReady: true, authzEpoch: 0, checkAuthzAccess: () => true,
}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...a: unknown[]) => { const p = s.rpc(...a); return Object.assign(p, { abortSignal: () => p }); },
  from: (...a: unknown[]) => s.table(...a),
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { SellerFinanceOrderReview } from "@/components/pedidos-b2b/SellerFinanceOrderReview";
import { parseSellerFinanceReview } from "@/hooks/useSellerFinanceOrderReview";

const ORDER = "11111111-2222-4333-8444-555555555555";
const review = (o: Record<string, unknown> = {}) => ({
  contract: "B2B_SELLER_FINANCE_ORDER_REVIEW_V1", order_id: ORDER, numero: "PB-TESTE", status: "solicitado", origin: "external_partner",
  created_at: "2026-11-10T10:00:00Z", accounting_pending: false,
  header_financial: { financial_approval_status: "pending", requires_financial_approval: true },
  items: [{ id: "i1", produto_nome: "Fertilizante X", produto_codigo: "FX", embalagem: "SACO-25KG", quantidade: 2, unidade: "un", preco_unitario: 100, subtotal: 200 }],
  terms: { id: "t1", plan_name_snapshot: "Plano 30d", plan_code_snapshot: "P30", installment_count: 1, table_amount: 200, final_amount: 200,
    approval_status: "pending", approved_at: null, approval_notes: null },
  reject_eligible: true, reject_block_reason: null, terms_review_path: null, ...o });
const ok = (data: unknown) => Promise.resolve({ data, error: null });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SellerFinanceOrderReview orderId={ORDER} open onOpenChange={() => {}} /></QueryClientProvider>);
}
const writes = () => s.rpc.mock.calls.filter((c) => c[0] === "reject_b2b_payment_terms_secure");
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("pedido externo elegível: itens e condição reais, origem do parceiro, reprovação exige motivo e chama só o writer instalado uma vez", async () => {
  let current = review();
  s.rpc.mockImplementation((name: string) => name === "reject_b2b_payment_terms_secure"
    ? (current = review({ terms: { ...review().terms, approval_status: "rejected", approval_notes: "Prazo" }, reject_eligible: false, reject_block_reason: "terms_decided" }), ok({ success: true, status: "rejected" }))
    : ok(current));
  mount();
  expect(await screen.findByText(/Fertilizante X/)).toBeInTheDocument();
  expect(screen.getByText("Itens (1)")).toBeInTheDocument();
  expect(screen.getByText("Pedido do parceiro")).toBeInTheDocument();
  expect(screen.queryByText("Manual")).toBeNull();
  expect(screen.getByTestId("terms-status")).toHaveTextContent("Termos aguardando decisão financeira");
  expect(s.table).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reprovar termos" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar reprovação" }));
  expect(writes()).toHaveLength(0);
  fireEvent.change(screen.getByPlaceholderText("Motivo da reprovação"), { target: { value: "  Prazo  " } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar reprovação" }));
  await waitFor(() => expect(screen.getByTestId("terms-status")).toHaveTextContent("Termos reprovados"));
  expect(writes()).toEqual([["reject_b2b_payment_terms_secure", { p_partner_order_id: ORDER, p_reason: "Prazo" }]]);
  expect(screen.queryByRole("button", { name: "Reprovar termos" })).toBeNull();
  expect(screen.getByTestId("reject-block-reason")).toHaveTextContent(/não pode ser revertida/);
});

it.each([
  ["terms_not_required", { terms: { ...review().terms, approval_status: "not_required" }, terms_review_path: "new_order_with_financial_approval_plan" }, /novo pedido com um plano que exija aprovação financeira/, "Termos sem exigência"],
  ["commercial_approved", {}, /aprovação comercial/, "Termos aguardando"],
  ["reserved", {}, /reserva de estoque/, "Termos aguardando"],
  ["terms_decided", { terms: { ...review().terms, approval_status: "approved" } }, /não pode ser revertida/, "Termos aprovados"],
] as const)("%s: sem ação de reprovação e motivo explícito", async (reason, extra, text, label) => {
  s.rpc.mockImplementation(() => ok(review({ reject_eligible: false, reject_block_reason: reason, ...extra })));
  mount();
  expect(await screen.findByTestId("reject-block-reason")).toHaveTextContent(text);
  expect(screen.getByTestId("terms-status")).toHaveTextContent(label);
  expect(screen.queryByRole("button", { name: "Reprovar termos" })).toBeNull();
  expect(writes()).toHaveLength(0);
});

it("pendência contábil legítima: lê itens, informa bloqueios e permite reprovar termos pendentes", async () => {
  s.rpc.mockImplementation(() => ok(review({ accounting_pending: true })));
  mount();
  expect(await screen.findByTestId("accounting-pending-notice")).toHaveTextContent(/Liberação operacional, cobrança, nota fiscal/);
  expect(screen.getByText("Itens (1)")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reprovar termos" })).toBeInTheDocument();
});

it("cabeçalho financeiro pendente com termos not_required nunca aparece como termos pendentes", async () => {
  s.rpc.mockImplementation(() => ok(review({ terms: { ...review().terms, approval_status: "not_required" }, reject_eligible: false,
    reject_block_reason: "terms_not_required", terms_review_path: "new_order_with_financial_approval_plan" })));
  mount();
  expect(await screen.findByTestId("terms-status")).toHaveTextContent("Termos sem exigência de aprovação financeira");
  expect(screen.queryByText(/Termos aguardando/)).toBeNull();
  expect(screen.getByText(/Ela não indica se os termos estão pendentes/)).toBeInTheDocument();
});

it.each([
  ["negado 42501 (outra empresa / sem vínculo)", () => Promise.resolve({ data: null, error: { code: "42501", message: "B2B_SELLER_FINANCE_REVIEW_DENIED" } })],
  ["contrato inválido", () => ok({ ...review(), contract: "X" })],
  ["outro pedido", () => ok({ ...review(), order_id: "outro" })],
  ["elegível incoerente com termos aprovados", () => ok(review({ terms: { ...review().terms, approval_status: "approved" } }))],
  ["motivo removido origin_invalid", () => ok(review({ reject_eligible: false, reject_block_reason: "origin_invalid" }))],
] as const)("%s => indisponível, sem itens vazios nem ação", async (_n, impl) => {
  s.rpc.mockImplementation(impl);
  mount();
  expect(await screen.findByText(/indisponível para revisão financeira/)).toBeInTheDocument();
  expect(screen.queryByText("Itens (0)")).toBeNull();
  expect(screen.queryByRole("button", { name: "Reprovar termos" })).toBeNull();
  expect(writes()).toHaveLength(0);
});

it("leitor ausente (PGRST202 exato) não vira pedido vazio", async () => {
  s.rpc.mockImplementation(() => Promise.resolve({ data: null, error: { code: "PGRST202", message: "Could not find the function public.get_b2b_seller_finance_order_review_v1(p_order_id)" } }));
  mount();
  expect(await screen.findByText(/não significa que o pedido esteja vazio/)).toBeInTheDocument();
});

it("falha do writer mantém ação disponível sem retry automático", async () => {
  s.rpc.mockImplementation((name: string) => name === "reject_b2b_payment_terms_secure"
    ? Promise.resolve({ data: null, error: { code: "PT409", message: "B2B_REJECT_STATE_CONFLICT" } }) : ok(review()));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Reprovar termos" }));
  fireEvent.change(screen.getByPlaceholderText("Motivo da reprovação"), { target: { value: "x" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar reprovação" }));
  await waitFor(() => expect(writes()).toHaveLength(1));
  await new Promise((r) => setTimeout(r, 50));
  expect(writes()).toHaveLength(1);
});

it("parser exige motivo de bloqueio conhecido", () => {
  expect(() => parseSellerFinanceReview(review({ reject_eligible: false, reject_block_reason: "inventado" }), ORDER)).toThrow();
});
