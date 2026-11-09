import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

// Atores sintéticos: OLD = sessão antiga (teste4), NEW = novo comprador. Nunca prova JWT/RLS real.
const OLD='11111111-1111-4111-8111-111111111111', NEW='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const O1='22222222-2222-4222-8222-222222222222', O2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const P='33333333-3333-4333-8333-333333333333', K='44444444-4444-4444-8444-444444444444';
const K2='66666666-6666-4666-8666-666666666666', contract='C2_ORDER_JOURNAL_V1';
const s=vi.hoisted(()=>({actor:'',org:'',rpc:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:s.actor},profile:{user_id:s.actor,organization_id:s.org,ativo:true},roles:['parceiro_b2b'],loading:false,authzReady:true,authzEpoch:0,checkAuthzAccess:()=>true})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...a:unknown[])=>s.rpc(...a)}}));
import { useOrderJournal } from '@/hooks/useOrderJournal';
import { useCloseOrderAttempt } from '@/hooks/useCloseOrderAttempt';
import { closeAttemptFeedback } from '@/lib/authz/closeAttemptFeedback';

type Srv={state:'uncertain'|'closed'|'reserved';gen:number;key:string;closeError?:{code:string};closes:number;creates:number};
const servers=new Map<string,Srv>();
const srv=()=>{const id=s.actor+'|'+s.org;if(!servers.has(id))servers.set(id,{state:'uncertain',gen:1,key:K,closes:0,creates:0});return servers.get(id)!;};
const ok=(data:unknown)=>Promise.resolve({data,error:null});
beforeEach(()=>{
 servers.clear();Object.assign(s,{actor:NEW,org:O2});
 vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('crypto',webcrypto);
 s.rpc.mockReset();s.rpc.mockImplementation((n:string,a:Record<string,unknown>)=>{
  const x=srv();
  if(n==='partner_order_journal_capability_v1')return ok({contract,enabled:true,actor_id:s.actor,organization_id:s.org,partner_id:P});
  if(n==='recover_partner_order_attempt_v1'){
   if(a.p_advance){
    if(a.p_expected_key!==x.key||a.p_expected_generation!==x.gen||x.state!=='closed')return Promise.resolve({data:null,error:{code:'PT409'}});
    const pred={key:x.key,generation:x.gen,state:'closed'};x.gen++;x.key=K2;x.state='reserved';
    return ok({contract,key:x.key,generation:x.gen,state:'reserved',predecessors:[pred]});
   }
   return ok({contract,key:x.key,generation:x.gen,state:x.state,...(x.gen>1?{predecessors:[{key:K,generation:1,state:'closed'}]}:{})});
  }
  if(n==='close_partner_order_attempt_v1'){
   if(x.closeError)return Promise.resolve({data:null,error:x.closeError});
   x.closes++;x.state='closed';return ok({contract:'C2_ORDER_ATTEMPT_CLOSURE_V1',state:'closed'});
  }
  if(n==='create_partner_order_secure'){x.creates++;return ok(null);}
  throw Error('unexpected '+n);
 });
});
const mount=()=>renderHook(()=>({j:useOrderJournal(P),c:useCloseOrderAttempt()}));

it('novo comprador: "Consultar novamente" mantém incerto e nunca encerra nem cria',async()=>{
 const h=mount();await waitFor(()=>expect(h.result.current.j.journal?.state).toBe('uncertain'));
 await act(async()=>{await h.result.current.j.recover();});
 expect(h.result.current.j.journal?.state).toBe('uncertain');
 expect(srv().closes).toBe(0);expect(srv().creates).toBe(0);
});
it('novo comprador: encerrar explícito → closed → nova tentativa reservada, persistindo após recarga',async()=>{
 const h=mount();await waitFor(()=>expect(h.result.current.j.journal?.state).toBe('uncertain'));
 let r:any;await act(async()=>{r=await h.result.current.c.close(P);});
 expect(r).toEqual({kind:'closed'});expect(closeAttemptFeedback(r).tone).toBe('success');
 await waitFor(()=>expect(h.result.current.j.journal?.state).toBe('closed'));
 await act(async()=>{await h.result.current.j.recover(h.result.current.j.journal!);});
 expect(h.result.current.j.journal).toMatchObject({state:'reserved',generation:2,key:K2});
 h.unmount();
 const again=mount();// recarga: servidor + IndexedDB, sem regressão para geração 1
 await waitFor(()=>expect(again.result.current.j.journal?.generation).toBe(2));
 expect(srv().creates).toBe(0);expect(srv().closes).toBe(1);
});
it.each([['forbidden',{code:'42501'}],['receipt missing',{code:'PGRST116'}]])('fechamento %s fica incerto, informa erro e não libera',async(_n,err)=>{
 srv().closeError=err;
 const h=mount();await waitFor(()=>expect(h.result.current.j.journal?.state).toBe('uncertain'));
 let r:any;await act(async()=>{r=await h.result.current.c.close(P);});
 expect(r).toEqual({kind:'unknown'});expect(closeAttemptFeedback(r).tone).toBe('error');
 expect(h.result.current.j.journal?.state).toBe('uncertain');expect(srv().creates).toBe(0);
});
it('sessão antiga (teste4) e nova ficam isoladas por ator/empresa',async()=>{
 Object.assign(s,{actor:OLD,org:O1});
 const old=mount();await waitFor(()=>expect(old.result.current.j.journal?.state).toBe('uncertain'));
 await act(async()=>{await old.result.current.c.close(P);});
 await waitFor(()=>expect(old.result.current.j.journal?.state).toBe('closed'));
 old.unmount();
 Object.assign(s,{actor:NEW,org:O2});
 const fresh=mount();await waitFor(()=>expect(fresh.result.current.j.journal?.state).toBe('uncertain'));
 expect(servers.get(NEW+'|'+O2)!.closes).toBe(0);expect(servers.get(OLD+'|'+O1)!.closes).toBe(1);
});
