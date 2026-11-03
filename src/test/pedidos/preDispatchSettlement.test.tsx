// Hook real useCreatePartnerOrder: erros pré-dispatch liberam EXATAMENTE a reserva local própria.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
const A='11111111-1111-4111-8111-111111111111', O='22222222-2222-4222-8222-222222222222';
const K='44444444-4444-4444-8444-444444444444', ID='55555555-5555-4555-8555-555555555555';
const state=vi.hoisted(()=>({rpc:vi.fn(),pending:[] as Array<(v:unknown)=>void>}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:A},profile:{user_id:A,organization_id:O,ativo:true,senha_provisoria:false},roles:['parceiro_b2b'],loading:false,authzReady:true,authzEpoch:0,checkAuthzAccess:()=>true})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...a:unknown[])=>state.rpc(...a),from:()=>({select:()=>({eq:()=>({maybeSingle:()=>Promise.resolve({data:null,error:null})})})})}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),warning:vi.fn(),info:vi.fn()}}));
import { useCreatePartnerOrder } from '@/hooks/useCreatePartnerOrder';
import { clearAllOrderAttempts, markOrderAttemptSending, prepareOrderAttempt, readOrderAttempt } from '@/lib/authz/pendingOrderAttempt';
const contract='C2_ORDER_JOURNAL_V1';
const ABSENT={data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}};
let n=0; const partner=()=>`3333333${++n}-3333-4333-8333-333333333333`;
const wrapper=()=>{const q=new QueryClient({defaultOptions:{mutations:{retry:false}}});return ({children}:{children:ReactNode})=><QueryClientProvider client={q}>{children}</QueryClientProvider>;};
const creates=()=>state.rpc.mock.calls.filter(([x])=>x==='create_partner_order_secure');
const mk=(p:string,slot:string,extra={})=>({partner_id:p,items:[{item_id:p,item_tipo:'produto' as const,product_id:p,nome:'n',quantidade:1,preco_unitario:1,desconto_percentual:0,subtotal:1,unidade_pedido:'litro' as const}] as never,expected_cart_hash:'h',idempotency_key:'key1',attempt_slot:slot,...extra});
const reserve=(slot:string)=>{const p=prepareOrderAttempt(slot,'fp',()=>'key1');if(!p.ok)throw Error('blocked');markOrderAttemptSending(slot,p.key);};
beforeEach(()=>{clearAllOrderAttempts();state.pending=[];state.rpc.mockReset();vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('crypto',webcrypto);});

it('capability network error: zero creates, reserva própria liberada, sem chave nova',async()=>{
 state.rpc.mockImplementation(()=>Promise.reject(new Error('capability network unavailable')));
 const P=partner(); const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:wrapper()}); const slot=h.result.current.slotFor(P)!;
 reserve(slot);
 await act(async()=>{await expect(h.result.current.mutateAsync(mk(P,slot))).rejects.toThrow();});
 expect(creates()).toHaveLength(0);
 expect(readOrderAttempt(slot)?.inflight ?? false).toBe(false);
});

it('current_payload alterado no preflight libera a reserva própria',async()=>{
 state.rpc.mockResolvedValue(ABSENT);
 const P=partner(); const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:wrapper()}); const slot=h.result.current.slotFor(P)!;
 reserve(slot);
 await act(async()=>{await expect(h.result.current.mutateAsync(mk(P,slot,{current_payload:()=>false}))).rejects.toThrow();});
 expect(creates()).toHaveLength(0);
 expect(readOrderAttempt(slot)?.inflight ?? false).toBe(false);
});

it('storage negado após capability ativa: sem fallback e reserva liberada',async()=>{
 vi.stubGlobal('indexedDB',{open:()=>{throw Error('denied');}});
 const P=partner();
 state.rpc.mockImplementation((x:string)=>x==='partner_order_journal_capability_v1'?Promise.resolve({data:{contract,enabled:true,actor_id:A,organization_id:O,partner_id:P},error:null}):Promise.reject(Error('unexpected '+x)));
 const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:wrapper()}); const slot=h.result.current.slotFor(P)!;
 reserve(slot);
 await act(async()=>{await expect(h.result.current.mutateAsync(mk(P,slot))).rejects.toThrow();});
 expect(creates()).toHaveLength(0);
 expect(readOrderAttempt(slot)?.inflight ?? false).toBe(false);
});

it('mesma chave: um preflight falha, outro create pendente vence; tentativa não é apagada',async()=>{
 let cap=0;
 state.rpc.mockImplementation((x:string)=>{
  if(x==='partner_order_journal_capability_v1') return ++cap===1?Promise.reject(Error('capability network unavailable')):Promise.resolve(ABSENT);
  return new Promise(r=>state.pending.push(r));
 });
 const P=partner(); const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:wrapper()}); const slot=h.result.current.slotFor(P)!;
 const sends:Promise<unknown>[]=[];
 act(()=>{for(let i=0;i<2;i++){reserve(slot);sends.push(h.result.current.mutateAsync(mk(P,slot)).catch(()=>'rejected'));}});
 await vi.waitFor(()=>expect(state.pending).toHaveLength(1));
 expect(readOrderAttempt(slot)?.inflight).toBe(true);           // create concorrente ainda em voo
 await act(async()=>{state.pending[0]({data:{id:ID,numero:'PB-1',total:1},error:null});await Promise.all(sends);});
 const a=readOrderAttempt(slot);
 expect(a?.order?.numero).toBe('PB-1'); expect(a?.inflight).toBe(false); expect(a?.key).toBe('key1');
 expect(creates().map(c=>(c[1] as {p_idempotency_key:string}).p_idempotency_key)).toEqual(['key1']);
});

it('transição legacy→durable no preflight: sucesso não deixa reserva local pendurada',async()=>{
 const P=partner(); let gen=1, term='uncertain';
 state.rpc.mockImplementation((x:string)=>{
  if(x==='partner_order_journal_capability_v1')return Promise.resolve({data:{contract,enabled:true,actor_id:A,organization_id:O,partner_id:P},error:null});
  if(x==='recover_partner_order_attempt_v1')return Promise.resolve({data:{contract,key:K,generation:gen,state:term,...(term==='committed'?{order_id:ID,numero:'PB-2'}:{})},error:null});
  if(x==='create_partner_order_secure'){term='committed';return Promise.resolve({data:{id:ID,numero:'PB-2',total:1},error:null});}
  return Promise.reject(Error('unexpected '+x));
 });
 const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:wrapper()}); const slot=h.result.current.slotFor(P)!;
 reserve(slot);
 await act(async()=>{await h.result.current.mutateAsync(mk(P,slot));});
 expect(creates().map(c=>(c[1] as {p_idempotency_key:string}).p_idempotency_key)).toEqual([K]);
 expect(readOrderAttempt(slot)?.inflight ?? false).toBe(false);
 void gen;
});

it('durable: rejeição de transporte no create não decrementa outra reserva legacy concorrente',async()=>{
 const P=partner();
 state.rpc.mockImplementation((x:string)=>{
  if(x==='partner_order_journal_capability_v1')return Promise.resolve({data:{contract,enabled:true,actor_id:A,organization_id:O,partner_id:P},error:null});
  if(x==='recover_partner_order_attempt_v1')return Promise.resolve({data:{contract,key:K,generation:1,state:'uncertain'},error:null});
  if(x==='create_partner_order_secure')return Promise.reject(new Error('Failed to fetch'));
  return Promise.reject(Error('unexpected '+x));
 });
 const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:wrapper()}); const slot=h.result.current.slotFor(P)!;
 reserve(slot); reserve(slot);                       // outra reserva legacy da mesma key1 em voo
 await act(async()=>{await expect(h.result.current.mutateAsync(mk(P,slot))).rejects.toThrow('Failed to fetch');});
 expect(creates().map(c=>(c[1] as {p_idempotency_key:string}).p_idempotency_key)).toEqual([K]);
 expect(readOrderAttempt(slot)?.inflight).toBe(true);
 expect(readOrderAttempt(slot)?.key).toBe('key1');
});
