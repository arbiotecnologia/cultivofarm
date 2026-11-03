import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import projection from './fixtures/money-origin-projection.json';

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

import ContasReceber from "@/pages/financeiro/ContasReceber";

type Resultado = { data?: any; error?: any; count?: number | null };
const PENDENTE = Symbol("pendente");
let resultados: Record<string, Resultado | typeof PENDENTE> = {};

function chain(tabela: string) {
  const obj: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === "then") {
        const r = resultados[tabela] ?? { data: [], error: null, count: 0 };
        const p = r === PENDENTE ? new Promise<never>(() => {}) : Promise.resolve(r);
        return (res: any, rej: any) => p.then(res as any, rej);
      }
      return () => obj;
    },
  });
  return obj;
}

function abrir() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ContasReceber />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const CONTA_PAGA = {
  id: "ar-1",
  description: "Venda 1",
  status: "PAID",
  total_amount: 100,
  first_due_date: "2026-09-01",
  origin_type: "MANUAL",
  clientes: { nome: "Cliente A", codigo_cliente: "C1" },
  installments: [{ id: "inst-1", installment_number: 1, status: "PAID", due_date: "2026-09-01" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  resultados = {};
  fromMock.mockImplementation((t: string) => chain(t));
});

describe("Contas a Receber — estados de carregamento", () => {
  it("KPI carregando mostra reticências, nunca zero", async () => {
    resultados = {
      accounts_receivable: { data: [], error: null, count: 0 },
      accounts_receivable_installments: PENDENTE,
      receivable_payments: PENDENTE,
    };
    abrir();
    await waitFor(() => expect(screen.getAllByText("…").length).toBeGreaterThan(0));
    expect(screen.queryByText("R$ 0,00")).toBeNull();
  });

  it("filtro Sem comprovante não afirma ausência enquanto os documentos carregam", async () => {
    resultados = {
      accounts_receivable: { data: [CONTA_PAGA], error: null, count: 1 },
      accounts_receivable_installments: { data: [{ id: "inst-1", receivable_id: "ar-1", original_amount: 100, received_amount: 100, discount_amount: 0, due_date: "2026-09-01", status: "PAID" }], error: null },
      receivable_payments: { data: [], error: null },
      financial_documents: PENDENTE,
    };
    abrir();
    await screen.findByText("Cliente A");
    fireEvent.click(screen.getByText("Sem comprovante"));
    await screen.findByText("Verificando os comprovantes…");
    expect(screen.queryByText("Nenhuma conta encontrada")).toBeNull();
  });

  it("erro na lista mostra tentar novamente e não lista vazia", async () => {
    resultados = { accounts_receivable: { data: null, error: { message: "falha" } } };
    abrir();
    await screen.findByText("Não foi possível carregar as contas a receber.");
    expect(screen.queryByText("Nenhuma conta encontrada")).toBeNull();
    expect(screen.getAllByText("Tentar novamente").length).toBeGreaterThan(0);
  });
  it('parcela B2B crua sem prova não abre baixa nem envia mutação', async()=>{
    const {toast}=await import('sonner');const error=vi.spyOn(toast,'error');
    resultados={accounts_receivable:{data:[{...CONTA_PAGA,status:'OPEN',installments:[{id:'raw-b2b',receivable_id:'ar-1',status:'OPEN',installment_number:1,due_date:'2026-11-03'}]}],count:1,error:null}};
    rpcMock.mockResolvedValue({data:null,error:{code:'PGRST202'}});
    abrir();await screen.findByText('Cliente A');fireEvent.click(screen.getByTitle('Registrar recebimento'));
    expect(error).toHaveBeenCalledWith('Origem monetária não comprovada. Recebimento bloqueado.');
    expect(screen.queryByRole('button',{name:'Confirmar'})).toBeNull();
    expect(rpcMock.mock.calls.some(([name])=>name==='rpc_receivable_pay')).toBe(false);error.mockRestore();
  });
  it('refetch KPI com erro não autoriza baixa pelo cache positivo anterior', async () => {
    const { toast } = await import('sonner'); const error = vi.spyOn(toast, 'error');
    const row = projection.audit_fixture_projection[0];
    resultados = { accounts_receivable: { data: [{ ...CONTA_PAGA, id: row.receivable_id, status: 'OPEN', installments: [row] }], error: null, count: 1 } };
    rpcMock.mockResolvedValue({ data: [row], error: null });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const ui = render(<MemoryRouter><QueryClientProvider client={qc}><ContasReceber /></QueryClientProvider></MemoryRouter>);
    await screen.findByText('Cliente A');
    await waitFor(() => expect(qc.getQueryState(['ar-kpi-installments'])?.status).toBe('success'));
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PT403' } });
    await qc.refetchQueries({ queryKey: ['ar-kpi-installments'] });
    await waitFor(() => expect(qc.getQueryState(['ar-kpi-installments'])?.status).toBe('error'));
    fireEvent.click(screen.getByTitle('Registrar recebimento'));
    expect(error).toHaveBeenCalledWith('Origem monetária não comprovada. Recebimento bloqueado.');
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    expect(rpcMock.mock.calls.some(([name]) => name === 'rpc_receivable_pay')).toBe(false);
    ui.unmount(); qc.clear(); error.mockRestore();
  });
  it('KPI nega duplicata de ID entre páginas sem somar saldo duplicado', async () => {
    const row = projection.audit_fixture_projection[0];
    const first = Array.from({ length: 1000 }, (_, index) => ({ ...row, id: `unique-${index}`, monetary_origin: { ...row.monetary_origin, installment_id: `unique-${index}` } }));
    rpcMock.mockImplementation(async (_: string, args: { p_offset: number }) => ({ data: args.p_offset === 0 ? first : [first[0]], error: null }));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const ui = render(<MemoryRouter><QueryClientProvider client={qc}><ContasReceber /></QueryClientProvider></MemoryRouter>);
    await waitFor(() => expect(qc.getQueryState(['ar-kpi-installments'])?.status).toBe('error'));
    expect(qc.getQueryData(['ar-kpi-installments'])).toBeUndefined();
    expect(rpcMock).toHaveBeenCalledTimes(2);
    ui.unmount(); qc.clear();
  });
});
