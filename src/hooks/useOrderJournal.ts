import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from './useAuth';
import { useStorageAccessScope } from './useStorageAccessScope';
import { orderAttemptSlot } from '@/lib/authz/pendingOrderAttempt';
import { journalCapability, readObservedJournal, recoverOrderJournal, subscribeJournal, type Journal } from '@/lib/authz/orderJournal';

export function useOrderJournal(partnerId: string | undefined) {
 const {user,profile,roles=[]}=useAuth();
 const scope=useStorageAccessScope('partner-order-journal');
 const slot=partnerId ? orderAttemptSlot({userId:user?.id,organizationId:profile?.organization_id,roles},partnerId):null;
 const journal=useSyncExternalStore(subscribeJournal,()=>readObservedJournal(scope.ready?slot:null));
 const [status,setStatus]=useState<{scope:string;mode:'checking'|'legacy'|'durable'|'blocked'}>({scope:scope.scope,mode:'checking'});
 const setMode=(mode:typeof status.mode)=>setStatus({scope:scope.scope,mode});
 const mode=status.scope===scope.scope?status.mode:'checking';
 const [pending,setPending]=useState(false);
 const lock=useRef(false);
 useEffect(()=>{
  if(!partnerId || !slot || !scope.ready) {setMode('checking');return;}
  const current=scope.capture();
  setMode('checking');
  void journalCapability(slot,partnerId,current).then(async enabled=>{
   if(!current())return;
   if(!enabled){setMode('legacy');return;}
   await recoverOrderJournal(slot,partnerId,current);
   if(current())setMode('durable');
  }).catch(()=>{if(current())setMode('blocked');});
 },[partnerId,slot,scope.scope]);
 const recover=async(advance?:Journal)=>{
  if(lock.current || !partnerId || !slot || !scope.ready)return;
  const current=scope.capture();lock.current=true;setPending(true);
  try {
   if(!await journalCapability(slot,partnerId,current)) {if(current())setMode('legacy');return;}
   await recoverOrderJournal(slot,partnerId,current,advance);
   if(current())setMode('durable');
  }catch{if(current())setMode('blocked');}
  finally{lock.current=false;if(current())setPending(false);}
 };
 return {mode,journal:mode==='durable'?journal:null,pending,recover};
}