import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rpc: vi.fn(), auth: { user: { id: 'local-actor' }, profile: { user_id: 'local-actor', organization_id: 'local-org', ativo: true, senha_provisoria: false }, roles: ['administrador'], loading: false } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => state.rpc(...args) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { useApprovePartnerOrder } from '@/hooks/usePartnerOrderActions';
beforeEach(() => state.rpc.mockReset());
it.each([{success:true,order_id:'foreign'}, {success:false}])('ACK negativo ou estrangeiro recusado %#', async data => {
  const qc=new QueryClient({defaultOptions:{mutations:{retry:false}}});const invalidate=vi.spyOn(qc,'invalidateQueries');
  const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  state.rpc.mockResolvedValue({data,error:null});const hook=renderHook(()=>useApprovePartnerOrder(),{wrapper});
  await act(async()=>{await expect(hook.result.current.mutateAsync({order_id:'local-order'})).rejects.toThrow('approval_ack_unconfirmed');});expect(invalidate).not.toHaveBeenCalled();hook.unmount();qc.clear();
});
it('ACK positivo confirma aprovação sem repetir envio', async()=>{
  const qc=new QueryClient({defaultOptions:{mutations:{retry:false}}});const invalidate=vi.spyOn(qc,'invalidateQueries');
  const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  state.rpc.mockResolvedValue({data:{success:true,order_id:'local-order'},error:null});const hook=renderHook(()=>useApprovePartnerOrder(),{wrapper});
  await act(async()=>{await hook.result.current.mutateAsync({order_id:'local-order'});});expect(state.rpc).toHaveBeenCalledTimes(1);expect(invalidate).toHaveBeenCalledTimes(2);hook.unmount();qc.clear();
});
it('contrato capturado RETURNS void aceita data:null/error:null e relê sem repetir envio',async()=>{
  const qc=new QueryClient({defaultOptions:{mutations:{retry:false}}});const invalidate=vi.spyOn(qc,'invalidateQueries');
  const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  state.rpc.mockResolvedValue({data:null,error:null});const hook=renderHook(()=>useApprovePartnerOrder(),{wrapper});
  await act(async()=>{await hook.result.current.mutateAsync({order_id:'local-order'});});
  expect(state.rpc).toHaveBeenCalledTimes(1);expect(invalidate).toHaveBeenCalledTimes(2);hook.unmount();qc.clear();
});

it('AUD-ACK-001 aprovação não deve adotar success:false sem erro de transporte (lacuna RED)', async () => {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidations = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  state.rpc.mockResolvedValue({ data: { success: false, order_id: 'local-order', reason: 'BUSINESS_CONFLICT' }, error: null });
  const hook = renderHook(() => useApprovePartnerOrder(), { wrapper });
  let result: unknown;
  await act(async () => { result = await hook.result.current.mutateAsync({ order_id: 'local-order' }).then(() => 'ADOPTED', () => 'REJECTED'); });
  expect(result).toBe('REJECTED');
  expect(invalidations).not.toHaveBeenCalled();
  hook.unmount(); qc.clear();
});

it('AUD-ACK-002 erro explícito do servidor continua recusado sem efeitos de cache', async () => {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidations = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  state.rpc.mockResolvedValue({ data: null, error: { code: 'PT409', message: 'CONFLICT' } });
  const hook = renderHook(() => useApprovePartnerOrder(), { wrapper });
  let result: unknown;
  await act(async () => { result = await hook.result.current.mutateAsync({ order_id: 'local-order' }).then(() => 'ADOPTED', () => 'REJECTED'); });
  expect(result).toBe('REJECTED'); expect(invalidations).not.toHaveBeenCalled();
  hook.unmount(); qc.clear();
});