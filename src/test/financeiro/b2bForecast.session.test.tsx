import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ ready: true, scope: 'A', fail: false, late: false, calls: [] as string[], resolve: undefined as undefined | ((v: unknown) => void) }));
vi.mock('@/hooks/useStorageAccessScope', () => ({ useStorageAccessScope: () => ({ ready: state.ready, scope: state.scope, capture: () => { const s = state.scope; return () => state.ready && s === state.scope; } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (name: string) => {
  state.calls.push(name);
  if (state.late) return new Promise(resolve => { state.resolve = resolve; });
  return Promise.resolve(state.fail ? { data: null, error: { code: 'PGRST202' } } : { data: null, error: null });
} } }));
import { useB2BOrderForecast } from '@/hooks/useB2BFinanceiro';

beforeEach(() => { Object.assign(state, { ready: true, scope: 'A', fail: false, late: false, calls: [], resolve: undefined }); });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useB2BOrderForecast('order'), { wrapper }), client };
}
describe('leitura da previsão sem autoridade inferida', () => {
  it('ausência de RPC não vira previsão nem valor zero', async () => {
    state.fail = true; const h = setup();
    await waitFor(() => expect(h.result.current.isError).toBe(true));
    expect(h.result.current.data).toBeUndefined();
    expect(state.calls).toEqual(['get_b2b_financial_forecast_secure']);
    h.unmount(); h.client.clear();
  });
  it('somente ausência confirmada retorna null', async () => {
    const h = setup(); await waitFor(() => expect(h.result.current.isSuccess).toBe(true));
    expect(h.result.current.data).toBeNull(); h.unmount(); h.client.clear();
  });
  it('logout não lê ou reutiliza previsão', () => {
    state.ready = false; const h = setup(); expect(state.calls).toEqual([]);
    expect(h.result.current.data).toBeUndefined(); h.unmount(); h.client.clear();
  });
  it('troca de tenant descarta resposta atrasada', async () => {
    state.late = true; const h = setup(); await waitFor(() => expect(state.resolve).toBeDefined());
    const old = state.resolve; state.scope = 'B'; state.ready = false; h.rerender();
    await act(async () => old?.({ data: { order_id: 'order', total_amount: 18, residual_amount: 18, state: 'aguardando_fiscal', due_dates_estimated: true, schedule: [{ amount: 18 }] }, error: null }));
    expect(h.result.current.data).toBeUndefined();
    expect(h.client.getQueryCache().getAll().every(q => q.queryKey.at(-1) === 'B')).toBe(true);
    h.unmount(); h.client.clear();
  });
});