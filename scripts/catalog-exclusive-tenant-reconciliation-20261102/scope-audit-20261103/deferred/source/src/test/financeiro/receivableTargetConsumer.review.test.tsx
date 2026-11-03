import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import projection from './fixtures/money-origin-projection.json';
import { MONEY_ORIGIN_MESSAGE } from '@/lib/financeiro/receivableOrigin';

const state = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: state }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ role: 'financeiro' }) }));
vi.mock('@/components/financeiro/BaixaDialog', () => ({ BaixaDialog: () => null }));
vi.mock('@/components/financeiro/DocumentosPanel', () => ({ DocumentosPanel: () => null }));
vi.mock('@/components/financeiro/DocumentosReceberTab', () => ({ DocumentosReceberTab: () => null }));
vi.mock('@/components/financeiro/PagamentosTab', () => ({ PagamentosTab: () => null }));
vi.mock('@/components/financeiro/FiscalTab', () => ({ FiscalTab: () => null }));
vi.mock('@/components/financeiro/HistoricoTab', () => ({ HistoricoTab: () => null }));
import { ContaDrawer } from '@/components/financeiro/ContaDrawer';

const row = projection.audit_fixture_projection[0];
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  state.from.mockImplementation(() => {
    let id = '';
    const q = { select: () => q, eq: (_: string, value: string) => { id = value; return q; },
      maybeSingle: async () => ({ data: { id, description: id, total_amount: 10300, status: 'OPEN', installment_count: 1 }, error: null }) };
    return q;
  });
  const view = (id: string) => <QueryClientProvider client={qc}><ContaDrawer open kind="receivable" contaId={id} onClose={() => {}} /></QueryClientProvider>;
  return { qc, view };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('drawer rejeita título estrangeiro sem adotar saldo zero/pago nem controle de baixa', async () => {
  state.rpc.mockResolvedValue({ data: [row], error: null });
  const { qc, view } = setup(); render(view('another-requested-title'));
  expect(await screen.findByText(MONEY_ORIGIN_MESSAGE)).toBeInTheDocument();
  expect(qc.getQueryState(['fin-inst', 'receivable', 'another-requested-title'])?.status).toBe('error');
  expect(screen.queryByText(/R\$\s*0,00/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Baixar' })).toBeNull(); qc.clear();
});

it('resposta atrasada do título anterior não substitui o título atual no consumidor real', async () => {
  let finish: (value: unknown) => void = () => {};
  state.rpc.mockImplementation(async (_: string, args: { p_receivable_id: string }) => {
    if (args.p_receivable_id === row.receivable_id) return new Promise(resolve => { finish = resolve; });
    return { data: projection.generator_projection, error: null };
  });
  const { qc, view } = setup(); const current = projection.generator_projection[0].receivable_id;
  const ui = render(view(row.receivable_id));
  await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(1));
  ui.rerender(view(current));
  await waitFor(() => expect(qc.getQueryState(['fin-inst', 'receivable', current])?.status).toBe('success'));
  await act(async () => { finish({ data: [row], error: null }); });
  expect(qc.getQueryData(['fin-inst', 'receivable', current])).toEqual(projection.generator_projection);
  expect(screen.queryByText(row.receivable_id)).toBeNull();
  expect(await screen.findByText(current)).toBeInTheDocument(); qc.clear();
});

it('erro de refetch após positivo não exibe resumo antigo ou saldo zero', async () => {
  state.rpc.mockResolvedValue({ data: [row], error: null });
  const { qc, view } = setup(); render(view(row.receivable_id));
  await waitFor(() => expect(qc.getQueryState(['fin-inst', 'receivable', row.receivable_id])?.status).toBe('success'));
  state.rpc.mockResolvedValue({ data: projection.generator_projection, error: null });
  await act(async () => { await qc.refetchQueries({ queryKey: ['fin-inst', 'receivable', row.receivable_id] }); });
  expect(await screen.findByText(MONEY_ORIGIN_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText(/R\$\s*0,00/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Baixar' })).toBeNull(); qc.clear();
});