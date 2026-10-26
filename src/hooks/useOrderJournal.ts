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
 const [mode,setMode]=useState<'checking'|'legacy'|'durable'|'blocked'>('checking');
 const [pending,setPending]=useState(false);
 const lock=useRef(false);
 useEffect(()=>{
  if(!partnerId || !slot || !scope.ready) {setMode('checking');return;}
  const current=scope.capture();
  setMode('checking');
  void journalCapability(slot,partnerId,current).then(async enabled=>{
   if(!current())return;
   if(!enabled){setMode('legacy');return;}
   setMode('durable');
   await recoverOrderJournal(slot,partnerId,current);
  }).catch(()=>{if(current())setMode('blocked');});
 },[partnerId,slot,scope.scope]);
 const recover=async(advance?:Journal)=>{
  if(lock.current || !partnerId || !slot || !scope.ready)return;
  const current=scope.capture();lock.current=true;setPending(true);
  try {
   if(!await journalCapability(slot,partnerId,current)) {if(current())setMode('legacy');return;}
   if(current())setMode('durable');
   await recoverOrderJournal(slot,partnerId,current,advance);
  }catch{if(current())setMode('blocked');}
  finally{lock.current=false;if(current())setPending(false);}
 };
 return {mode,journal,pending,recover};
}