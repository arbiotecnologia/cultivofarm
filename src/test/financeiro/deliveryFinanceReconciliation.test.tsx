import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({
  org: "11111111-1111-4111-8111-111111111111", id: "22222222-2222-4222-8222-222222222222",
  customer: "33333333-3333-4333-8333-333333333333", receiptId: "44444444-4444-4444-8444-444444444444",
  auth: {} as any, receipt: null as any, error: null as any, hold: false, pending: [] as Array<() => void>,
  calls: [] as Array<{ table: string; filters: Record<string, unknown> }>, rpc: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => s.auth }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: s.rpc,
  from(table: string) {
    const filters: Record<string, unknown> = {};
    const c: any = {};
    for (const m of ["select", "neq", "order", "limit", "maybeSingle", "abortSignal"]) c[m] = () => c;
    c.eq = (k: string, v: unknown) => { filters[k] = v; return c; };
    c.then = (resolve: (v: unknown) => void) => {
      s.calls.push({ table, filters });
      const error = s.error;
      const data = table === "entregas" ? { id: s.id, organization_id: s.org, cliente_id: s.customer, receivable_id: s.receipt?.id ?? null }
        : table === "accounts_receivable" ? s.receipt ? [{ ...s.receipt }] : []
        : table === "financial_categories" ? [{ id: "cat", name: "Receita", active: true, type: "RECEITA" }, { id: "both", name: "Ambos", active: true, type: "AMBOS" }]
        : table === "payment_methods" ? [{ id: "method", name: "Método ativo", active: true }, { id: "inactive", name: "Inativo", active: false }]
        : [];
      const finish = () => resolve({ data, error });
      if (s.hold && table === "entregas") s.pending.push(finish); else finish();
    };
    return c;
  },
} }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => <select value={value} onChange={e => onValueChange(e.target.value)}><option value="" />{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
}));
import { ConfirmarEntregaFinanceiroDialog } from "@/components/financeiro/ConfirmarEntregaFinanceiroDialog";
import { isFinanceUuid } from "@/hooks/useDeliveryFinanceReconciliation";
const receipt = () => ({ id: s.receiptId, organization_id: s.org, origin_type: "DELIVERY", origin_id: s.id, customer_id: s.customer,
  total_amount: 123, status: "OPEN", fiscal_invoice_required: false, fiscal_invoice_status: "PENDING" });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 3, staleTime: 300000, refetchOnMount: false }, mutations: { retry: 3 } } });
  const entrega = { id: s.id, organization_id: s.org, quantidade_entregue: 2, produtos: { valor_litro_brl: 10, nome: "Produto" } };
  const tree = () => <QueryClientProvider client={client}><MemoryRouter><ConfirmarEntregaFinanceiroDialog open entrega={entrega} onClose={vi.fn()} /></MemoryRouter></QueryClientProvider>;
  const view = render(tree()); return { client, view, tree };
}
beforeEach(() => {
  s.auth = { user: { id: "55555555-5555-4555-8555-555555555555" }, profile: { user_id: "55555555-5555-4555-8555-555555555555", organization_id: s.org, ativo: true, senha_provisoria: false }, roles: ["financeiro"], loading: false, authzReady: true, authzEpoch: 0 };
  Object.assign(s, { receipt: null, error: null, hold: false, pending: [], calls: [] }); s.rpc.mockReset();
});
async function draft() {
  await waitFor(() => expect(screen.getByRole("option", { name: "Método ativo" })).toBeInTheDocument());
  const selects = screen.getAllByRole("combobox");
  fireEvent.change(selects[0], { target: { value: "cat" } });
  fireEvent.change(selects[2], { target: { value: "method" } });
}
describe("Etapa6 — QueryClient real, Auth/transportes simulados, operação contida", () => {
  it("valida UUID, nunca aceita string arbitrária ou objeto como ID", () => {
    expect(isFinanceUuid(s.receiptId)).toBe(true); expect(isFinanceUuid("{}" )).toBe(false);
    expect(isFinanceUuid({ id: s.receiptId })).toBe(false);
  });
  it("método obrigatório/ativo e RECEITA apenas; duplo clique não envia nenhuma cobrança", async () => {
    setup(); await draft();
    expect(screen.queryByRole("option", { name: "Ambos" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Inativo" })).toBeNull();
    const b = screen.getByRole("button", { name: "Revisar cobrança indisponível" });
    fireEvent.click(b); fireEvent.click(b);
    await screen.findAllByText(/Seu rascunho foi preservado/);
    expect(s.rpc).not.toHaveBeenCalled(); expect(screen.getAllByRole("combobox")[2]).toHaveValue("method");
  });
  it("ACK perdido: reconsulta encontra título pelo vínculo sem segunda geração", async () => {
    const { client } = setup(); await draft(); s.receipt = receipt();
    fireEvent.click(screen.getByRole("button", { name: "Reconsultar lançamento" }));
    await screen.findByText(/Recebível confirmado por consulta/);
    expect(s.rpc).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll().some(q => (q.state.data as any)?.id === s.receiptId)).toBe(true);
    expect(s.calls.filter(c => c.table === "accounts_receivable").every(c => c.filters.organization_id === s.org && c.filters.origin_id === s.id)).toBe(true);
  });
  it("falha fiscal já persistida não finge rollback nem chama fiscal/geração", async () => {
    s.receipt = { ...receipt(), fiscal_invoice_required: true, fiscal_invoice_status: "ERROR" }; setup();
    await screen.findByText(/Fiscal pendente; nenhuma segunda cobrança/);
    expect(screen.getByRole("button", { name: /Abrir lançamento financeiro/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Revisar cobrança indisponível" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reconsultar lançamento" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reconsultar lançamento" })).toBeEnabled());
    expect(s.rpc).not.toHaveBeenCalled();
  });
  for (const code of ["PT409", "42501"]) it(`${code} de releitura preserva draft, oculta cache e não repete escrita`, async () => {
    setup(); await draft(); s.error = { code, message: "negado" };
    fireEvent.click(screen.getByRole("button", { name: "Reconsultar lançamento" }));
    await screen.findAllByText(/Não foi possível confirmar o recebível/);
    expect(screen.getAllByRole("combobox")[2]).toHaveValue("method"); expect(s.rpc).not.toHaveBeenCalled();
  });
  for (const change of ["tenant", "epoch", "actor"]) it(`resposta tardia após ${change} não publica título nem cache antigo`, async () => {
    const { client, view, tree } = setup(); await draft();
    s.hold = true; s.receipt = receipt();
    fireEvent.click(screen.getByRole("button", { name: "Reconsultar lançamento" }));
    await waitFor(() => expect(s.pending.length).toBe(1)); const late = s.pending.shift();
    if (change === "tenant") s.auth.profile.organization_id = "66666666-6666-4666-8666-666666666666";
    if (change === "epoch") s.auth.authzEpoch++;
    if (change === "actor") { s.auth.user.id = "77777777-7777-4777-8777-777777777777"; s.auth.profile.user_id = s.auth.user.id; }
    view.rerender(tree()); await act(async () => late?.());
    expect(screen.queryByRole("button", { name: /Abrir lançamento financeiro/ })).toBeNull();
    expect(client.getQueryCache().getAll().some(q => (q.state.data as any)?.id === s.receiptId)).toBe(false);
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("cache de título seguido de erro 403 esconde ação financeira", async () => {
    s.receipt = receipt(); setup(); await screen.findByRole("button", { name: /Abrir lançamento financeiro/ });
    s.error = { code: "42501", message: "negado" };
    fireEvent.click(screen.getByRole("button", { name: "Reconsultar lançamento" }));
    await screen.findAllByText(/Não foi possível confirmar o recebível/);
    expect(screen.queryByRole("button", { name: /Abrir lançamento financeiro/ })).toBeNull();
  });
  it("vínculo alheio é rejeitado, sem sucesso ou RPC", async () => {
    s.receipt = { ...receipt(), origin_id: "88888888-8888-4888-8888-888888888888" }; setup();
    await screen.findAllByText(/Não foi possível confirmar o recebível/); expect(s.rpc).not.toHaveBeenCalled();
  });
  it("dupla reconsulta pendente usa um único ticket e invalidação exata", async () => {
    const { client } = setup(); await draft(); s.hold = true;
    const invalidation = vi.spyOn(client, "invalidateQueries");
    const b = screen.getByRole("button", { name: "Reconsultar lançamento" });
    fireEvent.click(b); fireEvent.click(b);
    await waitFor(() => expect(s.pending.length).toBe(1));
    expect(invalidation).toHaveBeenCalledTimes(1);
    expect(invalidation.mock.calls[0][0]).toMatchObject({ exact: true, refetchType: "none" });
    await act(async () => { s.hold = false; s.pending.shift()?.(); });
    await waitFor(() => expect(b).toBeEnabled()); expect(s.rpc).not.toHaveBeenCalled();
  });
  it("troca de tenant durante await de invalidação não dispara a próxima leitura", async () => {
    const { client, view, tree } = setup(); await draft();
    let finish: (() => void) | undefined;
    vi.spyOn(client, "invalidateQueries").mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Reconsultar lançamento" }));
    const count = s.calls.length;
    s.auth.profile.organization_id = "66666666-6666-4666-8666-666666666666"; s.hold = true;
    view.rerender(tree());
    await act(async () => finish?.());
    expect(s.calls.slice(count).filter(c => c.table === "accounts_receivable")).toHaveLength(0);
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("método ausente bloqueia revisão e não envia fallback NULL", async () => {
    setup(); await draft(); fireEvent.change(screen.getAllByRole("combobox")[2], { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Revisar cobrança indisponível" })).toBeDisabled();
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it("chave exata da reconciliação corresponde ao cache real e desmontagem remove o título", async () => {
    s.receipt = receipt(); const { client, view } = setup();
    await screen.findByRole("button", { name: /Abrir lançamento financeiro/ });
    const actual = client.getQueryCache().findAll({ queryKey: ["delivery-finance-reconciliation", s.id] });
    expect(actual).toHaveLength(1);
    expect(actual[0].queryKey).toHaveLength(4);
    const invalidation = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByRole("button", { name: "Reconsultar lançamento" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reconsultar lançamento" })).toBeEnabled());
    expect(invalidation.mock.calls[0][0]?.queryKey).toEqual(actual[0].queryKey);
    view.unmount();
    await waitFor(() => expect(client.getQueryCache().findAll({ queryKey: ["delivery-finance-reconciliation", s.id] })).toHaveLength(0));
    expect(s.rpc).not.toHaveBeenCalled();
  });
});