import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PagamentosTab } from "@/components/financeiro/PagamentosTab";
import { EstornoDialog, type FinancialPayment } from "@/components/financeiro/EstornoDialog";

const state = vi.hoisted(() => ({
  auth: { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false },
    roles: ["financeiro"], loading: false, error: null },
  instError: false, payError: false, pending: false,
  payments: [] as FinancialPayment[],
  resolvers: [] as Array<(value: unknown) => void>,
  rpc: vi.fn(), success: vi.fn(), from: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => state.auth }));
vi.mock("sonner", () => ({ toast: { success: state.success } }));
vi.mock("@/components/financeiro/EmitirReciboButton", () => ({ EmitirReciboButton: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: state.rpc,
  from: (table: string) => {
    state.from(table);
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "filter", "in", "order", "abortSignal", "returns"]) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => {
      const inst = table.includes("installments");
      const value = { data: inst ? [{ id: "I" }] : state.payments,
        error: (inst ? state.instError : state.payError) ? { message: "denied" } : null };
      if (state.pending) state.resolvers.push(resolve); else resolve(value);
    };
    return chain;
  },
} }));

const payment: FinancialPayment = { id: "P", installment_id: "I", organization_id: "OA", payment_date: "2026-10-09",
  is_reversal: false, reversed_payment_id: null, amount_received: 40, amount_paid: 40 };
const clients: QueryClient[] = [];
function setup(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const wrap = (node: React.ReactNode) => <QueryClientProvider client={client}>{node}</QueryClientProvider>;
  const view = render(wrap(element));
  return { ...view, client, update: (node: React.ReactNode) => view.rerender(wrap(node)) };
}
beforeEach(() => {
  Object.assign(state.auth, { user: { id: "A" }, profile: { user_id: "A", organization_id: "OA", ativo: true, senha_provisoria: false },
    roles: ["financeiro"], loading: false, error: null });
  state.instError = false; state.payError = false; state.pending = false; state.resolvers = [];
  state.payments = [payment]; state.rpc.mockReset(); state.success.mockClear(); state.from.mockClear();
  state.rpc.mockResolvedValue({ data: "REV", error: null });
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe("PagamentosTab — interação e sessão, servidor mockado", () => {
  for (const kind of ["receivable", "payable"] as const) {
    for (const role of ["financeiro", "administrador", "gestor"]) {
      it(`${kind}: ${role} pode abrir estorno original`, async () => {
        state.auth.roles = [role];
        setup(<PagamentosTab kind={kind} contaId="C" />);
        fireEvent.click(await screen.findByRole("button", { name: "Estornar" }));
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(state.rpc).not.toHaveBeenCalled();
      });
    }
  }
  for (const role of ["consultor_tecnico", "tecnico_agronomo", "cliente_produtor", "parceiro_b2b", "producao", "administrativo", "superadmin"]) {
    it(`não oferece estorno a ${role}`, async () => {
      state.auth.roles = [role]; setup(<PagamentosTab kind="receivable" contaId="C" />);
      await screen.findByText("Baixa"); expect(screen.queryByRole("button", { name: "Estornar" })).toBeNull();
    });
  }
  it("não oferece ação para original estornado nem lançamento negativo", async () => {
    state.payments = [payment, { ...payment, id: "REV", is_reversal: true, reversed_payment_id: "P", amount_received: -40 }];
    setup(<PagamentosTab kind="receivable" contaId="C" />);
    await screen.findByText("Estornado"); expect(screen.queryByRole("button", { name: "Estornar" })).toBeNull();
  });
  it("carregamento não representa histórico vazio", () => {
    state.pending = true; setup(<PagamentosTab kind="payable" contaId="C" />);
    expect(screen.getByRole("status")).toBeTruthy(); expect(screen.queryByText("Nenhum lançamento")).toBeNull();
  });
  for (const source of ["inst", "pay"] as const) {
    it(`erro de ${source} não representa vazio e permite reconsulta`, async () => {
      state.instError = source === "inst"; state.payError = source === "pay";
      setup(<PagamentosTab kind="receivable" contaId="C" />);
      await screen.findByRole("alert"); expect(screen.queryByText("Nenhum lançamento")).toBeNull();
      if (source === "inst") expect(state.from).not.toHaveBeenCalledWith("receivable_payments");
      state.instError = false; state.payError = false;
      fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
      await screen.findByRole("button", { name: "Estornar" });
    });
  }
  for (const change of ["identity", "tenant", "loading"] as const) {
    it(`oculta dados e seleção na troca ${change}`, async () => {
      const view = setup(<PagamentosTab kind="receivable" contaId="C" />);
      fireEvent.click(await screen.findByRole("button", { name: "Estornar" }));
      state.pending = true;
      if (change === "identity") { state.auth.user.id = "B"; state.auth.profile.user_id = "B"; }
      if (change === "tenant") state.auth.profile.organization_id = "OB";
      if (change === "loading") state.auth.loading = true;
      view.update(<PagamentosTab kind="receivable" contaId="C" />);
      expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText("Baixa")).toBeNull();
    });
  }
  it("rejeita resultado atrasado A→B→A sem iniciar segunda consulta do contexto antigo", async () => {
    state.pending = true; const view = setup(<PagamentosTab kind="receivable" contaId="C" />);
    await waitFor(() => expect(state.resolvers.length).toBe(1)); const old = state.resolvers[0];
    state.auth.profile.organization_id = "OB"; view.update(<PagamentosTab kind="receivable" contaId="C" />);
    state.auth.profile.organization_id = "OA"; view.update(<PagamentosTab kind="receivable" contaId="C" />);
    await act(async () => old({ data: [{ id: "I" }], error: null }));
    expect(state.from).not.toHaveBeenCalledWith("receivable_payments");
  });
});

describe("EstornoDialog — decisões locais, sem escrita real", () => {
  for (const role of ["financeiro", "administrador", "gestor"]) {
    for (const kind of ["receivable", "payable"] as const) {
      it(`${role}/${kind}: motivo, confirmação, lock e invalidação focal`, async () => {
        state.auth.roles = [role]; let resolve: (value: unknown) => void = () => {};
        state.rpc.mockImplementation(() => new Promise((done) => { resolve = done; }));
        const close = vi.fn(); const view = setup(<EstornoDialog open onClose={close} kind={kind} payment={payment} />);
        const invalidation = vi.spyOn(view.client, "invalidateQueries");
        expect(screen.getByRole("button", { name: "Confirmar estorno" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Motivo do estorno *"), { target: { value: "abcd" } });
        expect(screen.getByRole("button", { name: "Confirmar estorno" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("Motivo do estorno *"), { target: { value: "  teste auditoria  " } });
        const button = screen.getByRole("button", { name: "Confirmar estorno" });
        act(() => { fireEvent.click(button); fireEvent.click(button); });
        expect(state.rpc).toHaveBeenCalledTimes(1);
        expect(state.rpc).toHaveBeenCalledWith("fn_reverse_payment", { _payment_id: "P", _kind: kind, _reason: "teste auditoria" });
        expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
        await act(async () => resolve({ data: "REV", error: null }));
        expect(close).toHaveBeenCalledTimes(1);
        expect(invalidation).toHaveBeenCalledWith({ queryKey: ["fin-payments"] });
        expect(invalidation).toHaveBeenCalledWith({ queryKey: ["fin-inst"] });
        expect(invalidation).toHaveBeenCalledWith({ queryKey: ["fin-history"] });
        expect(invalidation.mock.calls.every(([options]) => !!options?.queryKey)).toBe(true);
      });
    }
  }
  for (const negative of ["role", "reversal", "reversed", "cross"] as const) {
    it(`nega mutação ${negative}`, () => {
      if (negative === "role") state.auth.roles = ["consultor_tecnico"];
      const target = { ...payment, is_reversal: negative === "reversal", organization_id: negative === "cross" ? "OB" : "OA" };
      setup(<EstornoDialog open onClose={vi.fn()} kind="receivable" payment={target} wasReversed={negative === "reversed"} />);
      expect(screen.getByRole("button", { name: "Confirmar estorno" })).toBeDisabled(); expect(state.rpc).not.toHaveBeenCalled();
    });
  }
  it("cancelar não envia RPC", () => {
    const close = vi.fn(); setup(<EstornoDialog open onClose={close} kind="payable" payment={payment} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" })); expect(close).toHaveBeenCalledOnce(); expect(state.rpc).not.toHaveBeenCalled();
  });
  for (const failure of ["error", "null", "reject"] as const) {
    it(`falha ${failure} mantém motivo e não invalida/sinaliza sucesso`, async () => {
      if (failure === "reject") state.rpc.mockRejectedValue(new Error("network"));
      else state.rpc.mockResolvedValue({ data: null, error: failure === "error" ? { message: "denied" } : null });
      const close = vi.fn(); const view = setup(<EstornoDialog open onClose={close} kind="receivable" payment={payment} />);
      const invalidation = vi.spyOn(view.client, "invalidateQueries");
      fireEvent.change(screen.getByLabelText("Motivo do estorno *"), { target: { value: "teste auditoria" } });
      fireEvent.click(screen.getByRole("button", { name: "Confirmar estorno" })); await screen.findByRole("alert");
      expect(screen.getByLabelText("Motivo do estorno *")).toHaveValue("teste auditoria");
      expect(close).not.toHaveBeenCalled(); expect(invalidation).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
    });
  }
  for (const change of ["identity", "tenant"] as const) it(`troca ${change} durante RPC suprime efeitos tardios e apaga motivo antigo`, async () => {
    let resolve: (value: unknown) => void = () => {};
    state.rpc.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const close = vi.fn(); const element = <EstornoDialog open onClose={close} kind="receivable" payment={payment} />;
    const view = setup(element); const invalidation = vi.spyOn(view.client, "invalidateQueries");
    fireEvent.change(screen.getByLabelText("Motivo do estorno *"), { target: { value: "teste auditoria" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar estorno" }));
    if (change === "identity") { state.auth.user.id = "B"; state.auth.profile.user_id = "B"; }
    else state.auth.profile.organization_id = "OB";
    view.update(<EstornoDialog open onClose={close} kind="receivable" payment={payment} />);
    expect(screen.getByLabelText("Motivo do estorno *")).toHaveValue("");
    await act(async () => resolve({ data: "REV", error: null }));
    expect(invalidation).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
  });
});