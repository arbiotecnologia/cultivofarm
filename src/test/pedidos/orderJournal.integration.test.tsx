// Pré-instalação do status somente leitura (Opção A): PGRST202 exato mantém o recover na montagem.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
const A='11111111-1111-4111-8111-111111111111', O='22222222-2222-4222-8222-222222222222', P='33333333-3333-4333-8333-333333333333';
const K='44444444-4444-4444-8444-444444444444', ID='55555555-5555-4555-8555-555555555555';
const state=vi.hoisted(()=>({actor:'11111111-1111-4111-8111-111111111111',org:'22222222-2222-4222-8222-222222222222',ready:true,rpc:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:state.actor},profile:{user_id:state.actor,organization_id:state.org,ativo:true,senha_provisoria:false},roles:['parceiro_b2b'],loading:false,authzReady:true,authzEpoch:0,checkAuthzAccess:()=>state.ready})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>args[0]==='partner_order_attempt_status_v1'?Promise.resolve({data:null,error:{code:'PGRST202',message:'Could not find the function public.partner_order_attempt_status_v1'}}):state.rpc(...args),from:()=>({select:()=>({eq:()=>({maybeSingle:()=>Promise.resolve({data:null,error:null})})})})}}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),warning:vi.fn(),info:vi.fn()}}));
import { useCreatePartnerOrder } from '@/hooks/useCreatePartnerOrder';
import { useOrderJournal } from '@/hooks/useOrderJournal';
import { useCloseOrderAttempt } from '@/hooks/useCloseOrderAttempt';
import { journalCapability, parseOrderJournal, persistJournal, prepareDurableOrder, recoverOrderJournal, type Journal } from '@/lib/authz/orderJournal';
const slot=JSON.stringify([A,O,P]), contract='C2_ORDER_JOURNAL_V1';
const j=(s:Journal['state']='uncertain',g=1):Journal=>({contract,key:K,generation:g,state:s,...(s==='committed'?{order_id:ID,numero:'PB-LOCAL'}:{})});
const ok=(data:unknown)=>Promise.resolve({data,error:null});
let generation=1, terminal:Journal['state']='uncertain', creates:string[]=[];
const input={partner_id:P,items:[{item_id:P,item_tipo:'produto' as const,product_id:P,nome:'Local',quantidade:1,preco_unitario:1,desconto_percentual:0,subtotal:1,unidade_pedido:'litro' as const}],expected_cart_hash:'live-hash',idempotency_key:'client-never-dispatched'};
const setup=()=>{const q=new QueryClient({defaultOptions:{mutations:{retry:false},queries:{retry:false}}});return ({children}:{children:ReactNode})=><QueryClientProvider client={q}>{children}</QueryClientProvider>;};
beforeEach(()=>{
 Object.assign(state,{actor:A,org:O,ready:true});generation=1;terminal='uncertain';creates=[];
 vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('crypto',webcrypto);
 state.rpc.mockReset();state.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>{
  if(name==='partner_order_journal_capability_v1')return ok({contract,enabled:true,actor_id:state.actor,organization_id:state.org,partner_id:P});
  if(name==='recover_partner_order_attempt_v1') {
   if(args.p_advance){if(args.p_expected_generation!==generation || args.p_expected_key!==K || (terminal==='committed' && args.p_ack_order!==ID))return Promise.resolve({data:null,error:{code:'PT409',message:'C2DJ_CAS_CONFLICT'}});const predecessor={key:K,generation,state:terminal==='committed'?'committed':'closed',...(terminal==='committed'?{order_id:ID,numero:'PB-LOCAL'}:{})};generation++;terminal='reserved';return ok({...j(terminal,generation),key:'66666666-6666-4666-8666-666666666666',predecessors:[predecessor]});}
   return ok(j(terminal,generation));
  }
  if(name==='create_partner_order_secure'){creates.push(String(args.p_idempotency_key));terminal='committed';return ok({id:ID,numero:'PB-LOCAL',total:1});}
  if(name==='close_partner_order_attempt_v1'){terminal='closed';return ok({contract:'C2_ORDER_ATTEMPT_CLOSURE_V1',state:'closed'});}
  throw Error('unexpected '+name);
 });
});
it.each(['closed','committed','unknown','in_progress'])('canonical %s blocks create independently of local uncertainty',async(s)=>{
 state.rpc.mockImplementation((n:string)=>n==='partner_order_journal_capability_v1'?ok({contract,enabled:true,actor_id:A,organization_id:O,partner_id:P}):ok({...j(),state:s,...(s==='committed'?{order_id:ID,numero:'PB-LOCAL'}:{})}));
 const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:setup()});
 await act(async()=>{await expect(h.result.current.mutateAsync(input)).rejects.toThrow();});
 expect(state.rpc.mock.calls.filter(([n])=>n==='create_partner_order_secure')).toHaveLength(0);
});
it('real hook dispatches only server key after storage, then waits committed acknowledgement',async()=>{
 const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:setup()});
 await act(async()=>{await h.result.current.mutateAsync(input);});
 expect(creates).toEqual([K]);
 expect(state.rpc.mock.calls.filter(([n])=>n==='recover_partner_order_attempt_v1')).toHaveLength(2);
});
it('unknown/failed capability never falls back, even when legacy memory key is present',async()=>{
 state.rpc.mockResolvedValue({data:null,error:{code:'42501'}});
 const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:setup()});
 await act(async()=>{await expect(h.result.current.mutateAsync(input)).rejects.toThrow('journal_capability_unavailable');});expect(creates).toEqual([]);
});
it('exact absent RPC before activation preserves 001b, not network failure',async()=>{
 const legacyPartner='77777777-7777-4777-8777-777777777777';
 const legacySlot=JSON.stringify([A,O,legacyPartner]);
 state.rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}});
 expect(await journalCapability(legacySlot,legacyPartner,()=>true)).toBe(false);
});
it('activated slot can never downgrade on missing RPC',async()=>{
 await journalCapability(slot,P,()=>true);
 state.rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}});
 await expect(journalCapability(slot,P,()=>true)).rejects.toThrow();
});
it.each(['committed','closed'] as const)('terminal %s cannot regress or conflict in IndexedDB',async(s)=>{
 await persistJournal(slot,j(s),()=>true);
 await expect(persistJournal(slot,j(),()=>true)).rejects.toThrow('journal_stale_response');
 await expect(persistJournal(slot,j(s==='closed'?'committed':'closed'),()=>true)).rejects.toThrow('journal_stale_response');
});
it('changed payload in another mounted hook is blocked before create',async()=>{
 await prepareDurableOrder(slot,P,()=>true,'payload1');
 await expect(prepareDurableOrder(slot,P,()=>true,'payload2')).rejects.toThrow('journal_payload_changed');expect(creates).toEqual([]);
});
it('storage denied after reserve never dispatches or falls back',async()=>{
 vi.stubGlobal('indexedDB',{open:()=>{throw Error('denied');}});
 const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:setup()});
 await act(async()=>{await expect(h.result.current.mutateAsync(input)).rejects.toThrow();});expect(creates).toEqual([]);
});
it('revocation during recovery blocks journal writes and create',async()=>{
 const original=state.rpc.getMockImplementation();
 state.rpc.mockImplementation(async(n:string,a:Record<string,unknown>)=>{const r=await original?.(n,a);if(n==='recover_partner_order_attempt_v1')state.ready=false;return r;});
 const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:setup()});
 await act(async()=>{await expect(h.result.current.mutateAsync(input)).rejects.toThrow();});expect(creates).toEqual([]);
});
it('current payload edited during reservation is never sent',async()=>{
 let unchanged=true;const original=state.rpc.getMockImplementation();
 state.rpc.mockImplementation(async(n:string,a:Record<string,unknown>)=>{const r=await original?.(n,a);if(n==='recover_partner_order_attempt_v1')unchanged=false;return r;});
 const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:setup()});
 await act(async()=>{await expect(h.result.current.mutateAsync({...input,current_payload:()=>unchanged})).rejects.toThrow();});expect(creates).toEqual([]);
});
it('fresh server generation must match click expectation',async()=>{
 await expect(prepareDurableOrder(slot,P,()=>true,'x',{...j(),generation:2})).rejects.toThrow('journal_generation_changed');expect(creates).toEqual([]);
});
it('reopened React hook recovers server committed without any local storage',async()=>{
 terminal='committed';const h=renderHook(()=>useOrderJournal(P));
 await vi.waitFor(()=>expect(h.result.current.journal?.order_id).toBe(ID));h.unmount();
 vi.stubGlobal('indexedDB',new IDBFactory());const reopened=renderHook(()=>useOrderJournal(P));
 await vi.waitFor(()=>expect(reopened.result.current.journal?.numero).toBe('PB-LOCAL'));expect(creates).toEqual([]);
});
it('close hook persists closed and never advances automatically',async()=>{
 const h=renderHook(()=>useCloseOrderAttempt());
 await act(async()=>{expect(await h.result.current.close(P)).toEqual({kind:'closed'});});
 expect(generation).toBe(1);expect(creates).toEqual([]);
});
it('explicit committed ACK passes exact UUID/key/generation and next server key',async()=>{
 terminal='committed';const old=await recoverOrderJournal(slot,P,()=>true);
 const next=await recoverOrderJournal(slot,P,()=>true,old);
 expect(next.generation).toBe(2);expect(next.key).not.toBe(K);
 expect(state.rpc.mock.calls.at(-1)?.[1]).toMatchObject({p_ack_order:ID,p_expected_key:K,p_expected_generation:1,p_advance:true});
});
it('forged ACK cannot advance',async()=>{
 terminal='committed';await expect(recoverOrderJournal(slot,P,()=>true,{...j('committed'),order_id:P})).rejects.toThrow();expect(generation).toBe(1);
});
it('two mounted create hooks same tick share key, never client-generated keys',async()=>{
 const one=renderHook(()=>useCreatePartnerOrder(),{wrapper:setup()}),two=renderHook(()=>useCreatePartnerOrder(),{wrapper:setup()});
 await act(async()=>{await Promise.allSettled([one.result.current.mutateAsync(input),two.result.current.mutateAsync(input)]);});
 expect(creates.length).toBeGreaterThan(0);expect(new Set(creates)).toEqual(new Set([K]));expect(generation).toBe(1);
});
it.each(['actor','organization'] as const)('foreign capability %s cannot disclose or create',async(kind)=>{
 state.rpc.mockResolvedValue({data:{contract,enabled:true,actor_id:kind==='actor'?P:A,organization_id:kind==='organization'?P:O,partner_id:P},error:null});
 const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:setup()});
 await act(async()=>{await expect(h.result.current.mutateAsync(input)).rejects.toThrow('journal_capability_invalid');});expect(creates).toEqual([]);
});
it('create commit followed by missing ACK blocks success without resending',async()=>{
 const original=state.rpc.getMockImplementation();let recoveries=0;
 state.rpc.mockImplementation((name:string,args:Record<string,unknown>)=>{
  if(name==='recover_partner_order_attempt_v1' && ++recoveries===2)return ok({contract,state:'unknown'});
  return original?.(name,args);
 });
 const h=renderHook(()=>useCreatePartnerOrder(),{wrapper:setup()});
 await act(async()=>{await expect(h.result.current.mutateAsync(input)).rejects.toThrow();});expect(creates).toEqual([K]);expect(terminal).toBe('committed');
});
it('persisted durable evidence blocks missing capability after memory loss',async()=>{
 await persistJournal(JSON.stringify([P,O,P]),j('closed'),()=>true);
 state.rpc.mockResolvedValue({data:null,error:{code:'PGRST202',message:'Could not find public.partner_order_journal_capability_v1'}});
 await expect(journalCapability(JSON.stringify([P,O,P]),P,()=>true)).rejects.toThrow('journal_downgrade_blocked');
});
it('close double-click is synchronously single-flight before capability await',async()=>{
 const h=renderHook(()=>useCloseOrderAttempt());
 await act(async()=>{await Promise.all([h.result.current.close(P),h.result.current.close(P)]);});
 expect(state.rpc.mock.calls.filter(([n])=>n==='close_partner_order_attempt_v1')).toHaveLength(1);
});
it('A uncertain / B closed+advanced / A hook recovers N+1 with authoritative predecessor',async()=>{
 await persistJournal(slot,j(),()=>true);
 const next={...j('reserved',2),key:'66666666-6666-4666-8666-666666666666',predecessors:[{key:K,generation:1,state:'closed'}]};
 state.rpc.mockImplementation((name:string)=>name==='partner_order_journal_capability_v1'?ok({contract,enabled:true,actor_id:A,organization_id:O,partner_id:P}):ok(next));
 const h=renderHook(()=>useOrderJournal(P));
 await vi.waitFor(()=>expect(h.result.current.journal?.generation).toBe(2));
 await expect(persistJournal(slot,j(),()=>true)).rejects.toThrow('journal_stale_response');
});
it('reopen after advance ACK loss recovers without deleting uncertain local predecessor',async()=>{
 await persistJournal(slot,j(),()=>true);
 const next={...j('uncertain',2),key:'66666666-6666-4666-8666-666666666666',predecessors:[{key:K,generation:1,state:'committed',order_id:ID,numero:'PB-LOCAL'}]};
 state.rpc.mockResolvedValue({data:next,error:null});
 expect((await recoverOrderJournal(slot,P,()=>true)).generation).toBe(2);
 expect((await recoverOrderJournal(slot,P,()=>true)).key).toBe(next.key);
});
it.each([undefined,[{key:P,generation:1,state:'closed'}],[{key:K,generation:1,state:'unknown'}]])('missing/foreign/nonterminal proof cannot bypass uncertain cache %#',async(proof)=>{
 await persistJournal(slot,j(),()=>true);
 state.rpc.mockResolvedValue({data:{...j('reserved',2),key:P,predecessors:proof},error:null});
 await expect(recoverOrderJournal(slot,P,()=>true)).rejects.toThrow();
 await persistJournal(slot,j(),()=>true);
});
it.each([null,{}, {contract,key:'-'.repeat(36),generation:1,state:'uncertain'}, {...j('committed'),order_id:undefined}])('strict schema rejects malformed receipt %#',(d)=>expect(()=>parseOrderJournal(d)).toThrow());