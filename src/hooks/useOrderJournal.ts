import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from './useAuth';
import { useStorageAccessScope } from './useStorageAccessScope';
import { orderAttemptSlot } from '@/lib/authz/pendingOrderAttempt';
import { journalCapability, readAttemptStatus, readObservedJournal, recoverOrderJournal, subscribeJournal, type Journal, type NextAttempt } from '@/lib/authz/orderJournal';

/**
 * Option A (C2_ORDER_ATTEMPT_STATUS_V1): on mount the page only READS status; it never reserves.
 * `next` means "the server confirmed no open attempt (or the user explicitly chose to start after a
 * terminal one)"; the reservation is made by prepareDurableOrder right before dispatch.
 * `next` is bound to the scope and to the exact journal it was derived from; any newer journal
 * (e.g. reserved by this or another tab) invalidates it. Absent status RPC (exact PGRST202) keeps
 * the pre-install recover behaviour.
 */
export function useOrderJournal(partnerId: string | undefined) {
 const {user,profile,roles=[]}=useAuth();
 const scope=useStorageAccessScope('partner-order-journal');
 const slot=partnerId ? orderAttemptSlot({userId:user?.id,organizationId:profile?.organization_id,roles},partnerId):null;
 const journal=useSyncExternalStore(subscribeJournal,()=>readObservedJournal(scope.ready?slot:null));
 const [status,setStatus]=useState<{scope:string;slot:string|null;mode:'checking'|'legacy'|'durable'|'blocked'}>({scope:scope.scope,slot,mode:'checking'});
 const setMode=(mode:typeof status.mode)=>setStatus({scope:scope.scope,slot,mode});
 const mode=scope.ready && status.scope===scope.scope && status.slot===slot?status.mode:'checking';
 const [nextState,setNextState]=useState<{scope:string;slot:string;basis:string|null;value:NextAttempt}|null>(null);
 const statusInstalled=useRef<Record<string,boolean>>({});
 const [pending,setPending]=useState(false);
 const lock=useRef(false);
 const basisOf=(j:Journal|null)=>j?`${j.key}:${j.generation}:${j.state}`:null;
 const read=async(current:()=>boolean)=>{
  if(!partnerId || !slot)return;
  const s=await readAttemptStatus(slot,partnerId,current);
  if(!current())return;
  if(s.kind==='not_installed'){statusInstalled.current[slot]=false;await recoverOrderJournal(slot,partnerId,current);setNextState(null);return;}
  statusInstalled.current[slot]=true;
  setNextState(s.kind==='none'?{scope:scope.scope,slot,basis:basisOf(readObservedJournal(slot)),value:{}}:null);
 };
 useEffect(()=>{
  if(!partnerId || !slot || !scope.ready) {setMode('checking');return;}
  const current=scope.capture();
  setMode('checking');setNextState(null);
  void journalCapability(slot,partnerId,current).then(async enabled=>{
   if(!current())return;
   if(!enabled){setMode('legacy');return;}
   await read(current);
   if(current())setMode('durable');
  }).catch(()=>{if(current())setMode('blocked');});
 },[partnerId,slot,scope.scope]);
 const recover=async(advance?:Journal)=>{
  if(lock.current || !partnerId || !slot || !scope.ready)return;
  const current=scope.capture();lock.current=true;setPending(true);
  try {
   if(!await journalCapability(slot,partnerId,current)) {if(current())setMode('legacy');return;}
   if(statusInstalled.current[slot]) {
    // Status installed: re-read only; an explicit "start new" after a terminal journal is kept
    // as an in-memory intent and reserved (CAS advance) only by prepareDurableOrder.
    await read(current);
    const j=readObservedJournal(slot);
    if(advance && current() && j && (j.state==='closed' || j.state==='committed') &&
     j.key===advance.key && j.generation===advance.generation && j.state===advance.state &&
     (j.state!=='committed' || j.order_id===advance.order_id))
     setNextState({scope:scope.scope,slot,basis:basisOf(j),value:{advance:j}});
   } else await recoverOrderJournal(slot,partnerId,current,advance);
   if(current())setMode('durable');
  }catch{if(current())setMode('blocked');}
  finally{lock.current=false;if(current())setPending(false);}
 };
 const next=mode==='durable' && nextState && nextState.scope===scope.scope && nextState.slot===slot &&
  nextState.basis===basisOf(journal) ? nextState.value : null;
 // One eligibility contract for controls AND handlers. Re-read the observed journal on click:
 // another tab may invalidate a rendered intent before React paints the next disabled state.
 const takeDispatch=()=>{
  if(!scope.ready || !scope.capture()() || pending || lock.current || !slot)return null;
  if(mode==='legacy')return {kind:'legacy' as const};
  if(mode!=='durable' || basisOf(readObservedJournal(slot))!==basisOf(journal))return null;
  if(next)return {kind:'durable' as const,next};
  if(journal && ['reserved','uncertain'].includes(journal.state))return {kind:'durable' as const,expected:journal};
  return null;
 };
 const canSubmit=takeDispatch()!==null;
 return {mode,journal:mode==='durable'?journal:null,next,pending,recover,canSubmit,takeDispatch};
}
