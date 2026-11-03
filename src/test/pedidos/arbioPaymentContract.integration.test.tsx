import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rpc: vi.fn(), auth: { user: { id: 'local-actor' }, profile: { user_id: 'local-actor', organization_id: 'local-org', ativo: true }, roles: ['administrador'], loading: false } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => state.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => state.rpc(...args) } }));
import { useSimulateB2BPaymentPlan } from '@/hooks/useSimulateB2BPaymentPlan';
import { useCreatePartnerOrder } from '@/hooks/useCreatePartnerOrder';
import { requirePaymentCapability } from '@/lib/comercial/paymentContract';
import { clearAllOrderAttempts, prepareOrderAttempt, markOrderAttemptSending, readOrderAttempt } from '@/lib/authz/pendingOrderAttempt';
import capturedPreview from '../../../docs/correcoes-origem-parcial-servidor-20261101-evidencias/revisao-1333/pg-green/simulation-ack.json';
const choice = { payment_method: 'pix' as const, payment_condition_version: 2, payment_deadline_days: 7 };
const capability = { contract: 'B2B_PAYMENT_CONDITION_V1', actor_id: 'local-actor', organization_id: 'local-org', partner_id: 'local-partner', create: true, simulate: true };
const queryClient = () => new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
beforeEach(() => { state.rpc.mockReset(); clearAllOrderAttempts(); });
it('consumidor preserva preview PG: taxa versionada, calendário e âncora provisória', async () => {
 const ack={...capturedPreview,partner_id:'local-partner',organization_id:'local-org',actor_id:'local-actor'};
 state.rpc.mockResolvedValueOnce({data:capability,error:null}).mockResolvedValueOnce({data:ack,error:null});
 const qc=queryClient();const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
 const hook=renderHook(()=>useSimulateB2BPaymentPlan(),{wrapper});
 await act(async()=>{
  const preview=await hook.result.current.mutateAsync({partner_id:'local-partner',payment_plan_id:ack.payment_plan.id,items:[],payment_choice:{payment_method:'boleto',payment_condition_version:1,payment_deadline_days:30}});
  expect(preview.first_due_date).toBe(preview.schedule[0].due_date);
  expect(preview.payment_plan.monthly_interest_percent).toBe(1.8);
  expect(preview.payment_plan.months_count).toBe(3);
  expect(preview.schedule_anchor).toEqual({kind:'PROVISIONAL_ISSUE_DATE',date:capturedPreview.schedule_anchor.date,calendar_version:'synthetic-paracatu-2026-2027',fiscal_due_dates_final:false});
 });
 expect(state.rpc.mock.calls.filter(c=>c[0]==='simulate_b2b_payment_plan_secure')).toHaveLength(1);hook.unmount();qc.clear();
});
it('backend antigo bloqueia simulação nova antes do dispatch', async () => {
  state.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
  const qc = queryClient(); const wrapper = ({children}: {children: ReactNode}) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useSimulateB2BPaymentPlan(), {wrapper});
  await act(async () => { await expect(hook.result.current.mutateAsync({partner_id:'local-partner',payment_plan_id:'plan',items:[],payment_choice:choice})).rejects.toThrow('payment_contract_unavailable'); });
  expect(state.rpc.mock.calls.map(c=>c[0])).toEqual(['partner_payment_condition_capability_v1']); hook.unmount(); qc.clear();
});
it('simulador encaminha escolha sem taxa e adota ACK exato da condição', async () => {
  state.rpc.mockResolvedValueOnce({data:capability,error:null}).mockResolvedValueOnce({data:{partner_id:'local-partner',payment_plan:{id:'plan'},payment_choice:choice},error:null});
  const qc=queryClient(); const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook=renderHook(()=>useSimulateB2BPaymentPlan(),{wrapper});
  await act(async()=>{await hook.result.current.mutateAsync({partner_id:'local-partner',payment_plan_id:'plan',items:[],payment_choice:choice});});
  expect(state.rpc.mock.calls[1][1].p_payment_choice).toEqual(choice); expect(state.rpc.mock.calls[1][1].rate).toBeUndefined(); hook.unmount();qc.clear();
});
it('snapshot divergente do simulador é recusado', async () => {
  state.rpc.mockResolvedValueOnce({data:capability,error:null}).mockResolvedValueOnce({data:{partner_id:'local-partner',payment_plan:{id:'plan'},payment_choice:{...choice,payment_deadline_days:0}},error:null});
  const qc=queryClient(); const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook=renderHook(()=>useSimulateB2BPaymentPlan(),{wrapper});
  await act(async()=>{await expect(hook.result.current.mutateAsync({partner_id:'local-partner',payment_plan_id:'plan',items:[],payment_choice:choice})).rejects.toThrow('payment_simulation_ack_unconfirmed');});hook.unmount();qc.clear();
});
it.each(['actor_id','organization_id','partner_id'])('capability estrangeira %s não abre consumidor', field => expect(()=>requirePaymentCapability({...capability,[field]:'foreign'},'local-actor','local-org','local-partner')).toThrow());
it('criação sem escolha explícita não reserva journal nem chama writer antigo', async () => {
  const qc=queryClient();const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook=renderHook(()=>useCreatePartnerOrder(),{wrapper});
  await act(async()=>{await expect(hook.result.current.mutateAsync({partner_id:'local-partner',items:[{item_id:'item',item_tipo:'produto',product_id:'item',nome:'Local',quantidade:1,preco_unitario:1,desconto_percentual:0,subtotal:1,unidade_pedido:'litro'}],expected_cart_hash:'hash',idempotency_key:'key'})).rejects.toThrow('payment_choice_required');});
  expect(state.rpc).not.toHaveBeenCalled();hook.unmount();qc.clear();
});
const reordered = { payment_method:'pix', payment_deadline_days:7, payment_condition_version:2 };
const ackCases = [
  {name:'reordenado', payment_choice:reordered, organization_id:'local-org', valid:true},
  {name:'campo faltante', payment_choice:{payment_method:'pix',payment_deadline_days:7},organization_id:'local-org',valid:false},
  {name:'valor divergente', payment_choice:{...reordered,payment_deadline_days:8},organization_id:'local-org',valid:false},
  {name:'tipo divergente', payment_choice:{...reordered,payment_condition_version:'2'},organization_id:'local-org',valid:false},
  {name:'tenant estrangeiro', payment_choice:reordered,organization_id:'foreign',valid:false},
];
it.each(ackCases)('simulador ACK $name usa campos canônicos sem reenviar', async ack=>{
 state.rpc.mockResolvedValueOnce({data:capability,error:null}).mockResolvedValueOnce({data:{partner_id:'local-partner',payment_plan:{id:'plan'},...ack},error:null});
 const qc=queryClient();const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
 const hook=renderHook(()=>useSimulateB2BPaymentPlan(),{wrapper});
 await act(async()=>{const operation=hook.result.current.mutateAsync({partner_id:'local-partner',payment_plan_id:'plan',items:[],payment_choice:choice});
  if(ack.valid)await expect(operation).resolves.toMatchObject({payment_choice:reordered});else await expect(operation).rejects.toThrow('payment_simulation_ack_unconfirmed');});
 expect(state.rpc.mock.calls.filter(c=>c[0]==='simulate_b2b_payment_plan_secure')).toHaveLength(1);hook.unmount();qc.clear();
});
it.each(ackCases)('pedido ACK $name não altera política de repetição',async ack=>{
 state.rpc.mockImplementation(async(name:string)=>{
  if(name==='partner_payment_condition_capability_v1')return {data:capability,error:null};
  if(name==='partner_order_journal_capability_v1')return {data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}};
  if(name==='create_partner_order_secure')return {data:{id:'committed-local-order',numero:'LOCAL',total:1,partner_id:'local-partner',...ack},error:null};
  throw new Error('unexpected '+name);
 });
 const qc=queryClient();const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={qc}>{children}</QueryClientProvider>;
 const hook=renderHook(()=>useCreatePartnerOrder(),{wrapper});
 const slot=hook.result.current.slotFor('local-partner');if(!slot)throw Error('missing_test_scope');
 const reservation=prepareOrderAttempt(slot,'local-fingerprint',()=> 'key');expect(reservation.ok).toBe(true);markOrderAttemptSending(slot,'key');
 await act(async()=>{const operation=hook.result.current.mutateAsync({...choice,partner_id:'local-partner',items:[{item_id:'item',item_tipo:'produto',product_id:'item',nome:'Local',quantidade:1,preco_unitario:1,desconto_percentual:0,subtotal:1,unidade_pedido:'litro'}],expected_cart_hash:'hash',idempotency_key:'key',attempt_slot:slot});
  if(ack.valid)await expect(operation).resolves.toMatchObject({id:'committed-local-order'});else await expect(operation).rejects.toThrow('payment_order_ack_unconfirmed');});
 expect(state.rpc.mock.calls.filter(c=>c[0]==='create_partner_order_secure')).toHaveLength(1);
 expect(readOrderAttempt(slot)?.uncertain).toBe(!ack.valid);
 expect(readOrderAttempt(slot)?.order).toEqual(ack.valid?{numero:'LOCAL'}:null);
 expect(readOrderAttempt(slot)?.inflight).toBe(false);hook.unmount();qc.clear();
});