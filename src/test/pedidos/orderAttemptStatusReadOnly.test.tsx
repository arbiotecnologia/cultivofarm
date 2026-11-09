import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

// Opção A (C2_ORDER_ATTEMPT_STATUS_V1). Servidor simulado em memória; nunca prova JWT/RLS real.
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', O='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', P='33333333-3333-4333-8333-333333333333';
const ID='77777777-7777-4777-8777-777777777777', contract='C2_ORDER_JOURNAL_V1';
const s=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({user:{id:A},profile:{user_id:A,organization_id:O,ativo:true},roles:['parceiro_b2b'],loading:false,authzReady:true,authzEpoch:0,checkAuthzAccess:()=>true})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...a:unknown[])=>s.rpc(...a)}}));
import { useOrderJournal } from '@/hooks/useOrderJournal';
import { prepareDurableOrder, readAttemptStatus } from '@/lib/authz/orderJournal';
import { orderAttemptSlot } from '@/lib/authz/pendingOrderAttempt';

type Row={key:string;gen:number;order?:string;closed?:boolean};
let rows:Row[]=[];let calls:string[]=[];let statusError:{code:string;message:string}|null=null;
const ok=(data:unknown)=>Promise.resolve({data,error:null});
const latest=()=>rows[rows.length-1];
const view=(r:Row)=>({contract,key:r.key,generation:r.gen,state:r.order?'committed':r.closed?'closed':'uncertain',
 ...(r.order?{order_id:r.order,numero:'PB-T'}:{}),predecessors:rows.filter(x=>x.gen<r.gen).map(x=>({key:x.key,generation:x.gen,state:x.order?'committed':'closed',...(x.order?{order_id:x.order,numero:'PB-T'}:{})}))});
const reserve=()=>{const r={key:webcrypto.randomUUID(),gen:rows.length+1};rows.push(r);return {...view(r),state:'reserved'};};
beforeEach(()=>{
 rows=[];calls=[];statusError=null;
 vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('crypto',webcrypto);
 s.rpc.mockReset();s.rpc.mockImplementation((n:string,a:Record<string,unknown>)=>{
  calls.push(n);
  if(n==='partner_order_journal_capability_v1')return ok({contract,enabled:true,actor_id:A,organization_id:O,partner_id:P});
  if(n==='partner_order_attempt_status_v1'){
   if(statusError)return Promise.resolve({data:null,error:statusError});
   return ok(rows.length?view(latest()):{contract:'C2_ORDER_ATTEMPT_STATUS_V1',state:'none',actor_id:A,organization_id:O,partner_id:P});
  }
  if(n==='recover_partner_order_attempt_v1'){
   const l=latest();
   if(a.p_advance){
    if(!l||a.p_expected_key!==l.key||a.p_expected_generation!==l.gen)return Promise.resolve({data:null,error:{code:'PT409',message:'C2DJ_CAS_CONFLICT'}});
    if(l.order&&a.p_ack_order!==l.order)return ok(view(l));
    if(!l.order)l.closed=true;
    return ok(reserve());
   }
   return ok(l?view(l):reserve());
  }
  throw Error('unexpected '+n);
 });
});
const slot=orderAttemptSlot({userId:A,organizationId:O,roles:['parceiro_b2b']},P)!;
const yes=()=>true;
const mount=()=>renderHook(()=>useOrderJournal(P));

it('primeiro acesso e recarga sem envio: só leitura, nenhuma reserva, envio liberado',async()=>{
 const h=mount();await waitFor(()=>expect(h.result.current.next).toEqual({}));
 h.unmount();const again=mount();await waitFor(()=>expect(again.result.current.next).toEqual({}));
 expect(rows).toHaveLength(0);expect(calls).not.toContain('recover_partner_order_attempt_v1');
 expect(again.result.current.journal).toBeNull();
});
it('reserva só no prepare antes do envio; repetir após falha de rede usa a mesma chave',async()=>{
 const j=await prepareDurableOrder(slot,P,yes,'d1',undefined,{});
 expect(j).toMatchObject({state:'reserved',generation:1});expect(rows).toHaveLength(1);
 const again=await prepareDurableOrder(slot,P,yes,'d1',j!);
 expect(again!.key).toBe(j!.key);expect(rows).toHaveLength(1);
});
it('duas abas/dispositivos: a segunda a reservar recebe incerto e é recusada',async()=>{
 const a=await prepareDurableOrder(slot,P,yes,'d1',undefined,{});
 await expect(prepareDurableOrder(slot,P,yes,'d1',undefined,{})).rejects.toThrow('journal_generation_changed');
 expect(rows).toHaveLength(1);expect(rows[0].key).toBe(a!.key);
});
it('resposta perdida após commit: recarga mostra pedido registrado, sem nova reserva',async()=>{
 const j=await prepareDurableOrder(slot,P,yes,'d1',undefined,{});rows[0].order=ID;// commit sem resposta
 const h=mount();await waitFor(()=>expect(h.result.current.journal?.state).toBe('committed'));
 expect(h.result.current.journal?.order_id).toBe(ID);expect(h.result.current.next).toBeNull();
 expect(rows).toHaveLength(1);expect(j!.generation).toBe(1);
});
it('reserva antiga incerta continua protegida e não é liberada nem encerrada ao abrir',async()=>{
 reserve();
 const h=mount();await waitFor(()=>expect(h.result.current.journal?.state).toBe('uncertain'));
 expect(h.result.current.next).toBeNull();expect(rows[0].closed).toBeUndefined();
 await act(async()=>{await h.result.current.recover();});
 expect(h.result.current.journal?.state).toBe('uncertain');expect(rows).toHaveLength(1);
});
it('encerrada: "Iniciar nova tentativa" não reserva no clique; reserva com CAS só no envio',async()=>{
 reserve();rows[0].closed=true;
 const h=mount();await waitFor(()=>expect(h.result.current.journal?.state).toBe('closed'));
 await act(async()=>{await h.result.current.recover(h.result.current.journal!);});
 expect(h.result.current.next).toMatchObject({advance:{state:'closed',generation:1}});expect(rows).toHaveLength(1);
 const j=await prepareDurableOrder(slot,P,yes,'d2',undefined,h.result.current.next!);
 expect(j).toMatchObject({state:'reserved',generation:2});
 await waitFor(()=>expect(h.result.current.next).toBeNull());// intenção invalida-se com a nova geração
 expect(h.result.current.journal?.state).toBe('reserved');
});
it('pedido confirmado: avanço exige ACK do pedido exato; intenção vira reserva só no envio',async()=>{
 reserve();rows[0].order=ID;
 const h=mount();await waitFor(()=>expect(h.result.current.journal?.state).toBe('committed'));
 await act(async()=>{await h.result.current.recover(h.result.current.journal!);});
 expect(rows).toHaveLength(1);
 const j=await prepareDurableOrder(slot,P,yes,'d3',undefined,h.result.current.next!);
 expect(j!.generation).toBe(2);
});
it('erro de status diferente de PGRST202 exato bloqueia; PGRST202 de outra função também',async()=>{
 statusError={code:'42501',message:'forbidden_partner'};
 const h=mount();await waitFor(()=>expect(h.result.current.mode).toBe('blocked'));
 expect(h.result.current.next).toBeNull();expect(rows).toHaveLength(0);
 statusError={code:'PGRST202',message:'Could not find the function public.other_fn'};
 await expect(readAttemptStatus(slot,P,yes)).rejects.toThrow('journal_status_unavailable');
});
it('status que devolve "reserved" ou escopo de outro ator é contrato inválido',async()=>{
 s.rpc.mockImplementationOnce(()=>ok({contract:'C2_ORDER_ATTEMPT_STATUS_V1',state:'none',actor_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',organization_id:O,partner_id:P}));
 await expect(readAttemptStatus(slot,P,yes)).rejects.toThrow('journal_status_invalid');
 s.rpc.mockImplementationOnce(()=>ok({contract,key:webcrypto.randomUUID(),generation:1,state:'reserved',predecessors:[]}));
 await expect(readAttemptStatus(slot,P,yes)).rejects.toThrow('journal_status_invalid');
});
it('handler capturado antes da publicação de outra aba recusa o journal obsoleto',async()=>{
 const h=mount();await waitFor(()=>expect(h.result.current.canSubmit).toBe(true));
 const stale=h.result.current.takeDispatch;
 reserve();rows[0].closed=true;
 await act(async()=>{await readAttemptStatus(slot,P,yes);expect(stale()).toBeNull();});
 expect(h.result.current.canSubmit).toBe(false);
 expect(calls).not.toContain('recover_partner_order_attempt_v1');
});
it('releitura pendente bloqueia handler no mesmo tick e falha aposenta intenção',async()=>{
 reserve();rows[0].closed=true;
 const h=mount();await waitFor(()=>expect(h.result.current.journal?.state).toBe('closed'));
 await act(async()=>{await h.result.current.recover(h.result.current.journal??undefined);});
 expect(h.result.current.canSubmit).toBe(true);
 const captured=h.result.current.takeDispatch;
 statusError={code:'42501',message:'forbidden_partner'};
 await act(async()=>{const pending=h.result.current.recover();expect(captured()).toBeNull();await pending;});
 expect(h.result.current.mode).toBe('blocked');expect(h.result.current.canSubmit).toBe(false);
 expect(h.result.current.takeDispatch()).toBeNull();expect(calls).not.toContain('recover_partner_order_attempt_v1');
});
