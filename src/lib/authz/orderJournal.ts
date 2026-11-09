import { supabase } from '@/integrations/supabase/client';

export const JOURNAL_REVISION = 'C2_ORDER_JOURNAL_V1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type Predecessor = {key:string;generation:number;state:'closed'|'committed';order_id?:string;numero?:string};
export type Journal = { contract: typeof JOURNAL_REVISION; key: string; generation: number; state: 'reserved' | 'uncertain' | 'closed' | 'committed'; order_id?: string; numero?: string; predecessors?:Predecessor[] };
export function parseOrderJournal(data: unknown): Journal {
 if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('journal_contract_invalid');
 const d = data as Record<string, unknown>;
 if (d.contract !== JOURNAL_REVISION || typeof d.key !== 'string' || !UUID.test(d.key) ||
  typeof d.generation !== 'number' || !Number.isSafeInteger(d.generation) || d.generation < 1 ||
  !['reserved','uncertain','closed','committed'].includes(String(d.state))) throw Error('journal_contract_invalid');
 if (d.state === 'committed' && (typeof d.order_id !== 'string' || !UUID.test(d.order_id) || typeof d.numero !== 'string' || !d.numero.trim())) throw Error('journal_contract_invalid');
 const predecessors:Predecessor[]=[];
 if(d.predecessors!==undefined) {
  if(!Array.isArray(d.predecessors) || d.predecessors.length!==d.generation-1)throw Error('journal_predecessor_invalid');
  const keys=new Set([d.key]);
  for(const [index,p] of d.predecessors.entries()) {
   if(!p || typeof p!=='object' || Array.isArray(p) || typeof p.key!=='string' || !UUID.test(p.key) || keys.has(p.key) ||
    p.generation!==index+1 || !['closed','committed'].includes(p.state) ||
    (p.state==='committed' && (typeof p.order_id!=='string' || !UUID.test(p.order_id) || typeof p.numero!=='string' || !p.numero.trim())))throw Error('journal_predecessor_invalid');
   keys.add(p.key);predecessors.push({key:p.key,generation:p.generation,state:p.state,...(p.state==='committed'?{order_id:p.order_id,numero:p.numero.trim()}:{})});
  }
 }
 return { contract: JOURNAL_REVISION, key: d.key, generation: d.generation, state: d.state as Journal['state'],
  ...(d.predecessors!==undefined?{predecessors}:{}),
  ...(d.state === 'committed' ? { order_id: String(d.order_id), numero: String(d.numero).trim() } : {}) };
}
const activated = new Set<string>();
const observed = new Map<string, Journal>();
const listeners = new Set<() => void>();
export const subscribeJournal = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const readObservedJournal = (slot: string | null) => slot ? observed.get(slot) ?? null : null;
function publish(slot: string, j: Journal) { observed.set(slot,j); listeners.forEach(l=>l()); }
function currentOrThrow(current: () => boolean) { if (!current()) throw Error('journal_context_changed'); }
async function rpc(name: string, args: Record<string, unknown>, current: () => boolean) {
 currentOrThrow(current);
 const response = await (supabase.rpc as any)(name,args);
 currentOrThrow(current);
 return response as { data: unknown; error: { code?: string; message?: string } | null };
}
/** Only the exact not-installed RPC error can preserve legacy mode. Never a network/permission fallback. */
export async function journalCapability(slot: string, partner: string, current: () => boolean): Promise<boolean> {
 const r = await rpc('partner_order_journal_capability_v1',{p_partner:partner},current);
 if (r.error) {
  if (!activated.has(slot) && r.error.code === 'PGRST202' && r.error.message?.includes('partner_order_journal_capability_v1')) {
   // A previous durable installation cannot be ignored on reload/downgrade.
   // Absence is only a compatibility signal from the server, never a key release.
   if(typeof indexedDB!=='undefined') {
    const d=await db();
    try {const count=await new Promise<number>((resolve,reject)=>{const q=d.transaction('slots').objectStore('slots').count();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('journal_storage_unavailable'));});
     currentOrThrow(current);if(count>0)throw Error('journal_downgrade_blocked');
    } finally {d.close();}
   }
   return false;
  }
  throw Error('journal_capability_unavailable');
 }
 const d = r.data as Record<string, unknown> | null;
 const actor = JSON.parse(slot) as string[];
 if (!Array.isArray(actor) || actor.length!==3 || actor[2]!==partner || !d || d.contract !== JOURNAL_REVISION || d.enabled !== true || d.actor_id !== actor[0] || d.organization_id !== actor[1] || d.partner_id !== partner) throw Error('journal_capability_invalid');
 activated.add(slot); return true;
}
async function db(): Promise<IDBDatabase> {
 return new Promise((resolve,reject)=>{
  let q: IDBOpenDBRequest;
  try { q = indexedDB.open('c2-order-journal-v1',1); } catch { reject(Error('journal_storage_unavailable')); return; }
  q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains('slots')) q.result.createObjectStore('slots'); };
  q.onsuccess = () => resolve(q.result);
  q.onerror = q.onblocked = () => reject(Error('journal_storage_unavailable'));
 });
}
/** Store only opaque key/generation/state and SHA256 scope, never server receipts or payload. */
export async function persistJournal(slot: string, j: Journal, current: () => boolean, _predecessor?: Journal, digest?: string) {
 currentOrThrow(current);
 j=parseOrderJournal(j);
 const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(slot));
 currentOrThrow(current);
 const key = Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
 const d = await db();
 currentOrThrow(current);
 try { await new Promise<void>((resolve,reject)=>{
  const tx=d.transaction('slots','readwrite'), store=tx.objectStore('slots'), q=store.get(key);
  let problem='journal_storage_unavailable';
  q.onsuccess=()=>{
   if (!current()) {problem='journal_context_changed';tx.abort();return;}
   const old=q.result as {schema?: number; key?: string; generation?: number; state?: string; digest?: string} | undefined;
   const state=j.state==='reserved'?'uncertain':j.state;
   if (old && (old.schema!==1 || !UUID.test(old.key ?? '') || !Number.isSafeInteger(old.generation) || Number(old.generation)<1 || !['uncertain','closed','committed'].includes(old.state ?? ''))) {problem='journal_storage_corrupt';tx.abort();return;}
   if (old && (Number(old.generation)>j.generation || (old.generation===j.generation &&
    (old.key!==j.key || (old.state!=='uncertain' && old.state!==state))))) {problem='journal_stale_response';tx.abort();return;}
   if(old && Number(old.generation)<j.generation) {
    const proof=j.predecessors?.find(p=>p.key===old.key && p.generation===old.generation);
    if(old.key===j.key || !proof || (old.state!=='uncertain' && old.state!==proof.state)) {problem='journal_predecessor_unconfirmed';tx.abort();return;}
   }
   if(digest && old?.generation===j.generation && old.digest && old.digest!==digest) {problem='journal_payload_changed';tx.abort();return;}
   store.put({schema:1,key:j.key,generation:j.generation,state,
    ...(digest ? {digest} : old?.generation===j.generation && old.digest ? {digest:old.digest}:{})},key);
  };
  tx.oncomplete=()=>current()?resolve():reject(Error('journal_context_changed'));
  tx.onerror=tx.onabort=()=>reject(Error(problem));
 }); } finally {d.close();}
 currentOrThrow(current); publish(slot,j);
}
export async function recoverOrderJournal(slot: string, partner: string, current: () => boolean, advance?: Journal) {
 const r=await rpc('recover_partner_order_attempt_v1',{p_partner:partner,p_expected_key:advance?.key ?? null,
  p_expected_generation:advance?.generation ?? null,p_advance:!!advance,p_ack_order:advance?.state==='committed'?advance.order_id:null},current);
 if (r.error) throw Error('journal_recovery_unavailable');
 const j=parseOrderJournal(r.data);
 if(advance && (j.generation!==advance.generation+1 || j.key===advance.key || j.state!=='reserved')) throw Error('journal_advance_unconfirmed');
 if(advance) {
  const proof=j.predecessors?.find(p=>p.key===advance.key && p.generation===advance.generation);
  if(!proof || (advance.state==='committed' && (proof.state!=='committed' || proof.order_id!==advance.order_id)) ||
   (advance.state==='closed' && proof.state!=='closed'))throw Error('journal_advance_unconfirmed');
 }
 await persistJournal(slot,j,current,advance); return j;
}
export const STATUS_REVISION = 'C2_ORDER_ATTEMPT_STATUS_V1';
export type AttemptStatus = {kind:'not_installed'} | {kind:'none'} | {kind:'journal';journal:Journal};
/**
 * Option A: read-only status on mount. Never reserves, closes or advances.
 * Only the exact PGRST202 naming this RPC means "not installed" (caller keeps pre-install recover);
 * every other error fails closed. "none" is accepted only for the exact server-echoed actor/org/partner.
 */
export async function readAttemptStatus(slot: string, partner: string, current: () => boolean): Promise<AttemptStatus> {
 const r=await rpc('partner_order_attempt_status_v1',{p_partner:partner},current);
 if (r.error) {
  if (r.error.code==='PGRST202' && r.error.message?.includes('partner_order_attempt_status_v1')) return {kind:'not_installed'};
  throw Error('journal_status_unavailable');
 }
 const d=r.data as Record<string, unknown> | null;
 if (d && d.contract===STATUS_REVISION) {
  const actor=JSON.parse(slot) as string[];
  if (d.state!=='none' || !Array.isArray(actor) || actor.length!==3 || d.actor_id!==actor[0] || d.organization_id!==actor[1] || d.partner_id!==partner || actor[2]!==partner) throw Error('journal_status_invalid');
  return {kind:'none'};
 }
 const j=parseOrderJournal(d);
 // Status never reserves: a "reserved" reply here is a contract violation.
 if (j.state==='reserved') throw Error('journal_status_invalid');
 await persistJournal(slot,j,current);
 return {kind:'journal',journal:j};
}
/** Next attempt after status: reservation happens ONLY here, right before dispatch. */
export type NextAttempt = { advance?: Journal };
export async function prepareDurableOrder(slot: string, partner: string, current: () => boolean, digest: string, expected?: Journal, next?: NextAttempt) {
 if (!await journalCapability(slot,partner,current)) return null;
 if (expected && next) throw Error('journal_expectation_invalid');
 const j=await recoverOrderJournal(slot,partner,current,next?.advance);
 if(expected && (j.key!==expected.key || j.generation!==expected.generation)) throw Error('journal_generation_changed');
 // Fresh expectation: this call must be the one that reserved. Another tab/device reserving first
 // yields "uncertain" for the same key and is refused (re-read status, explicit closure path).
 if(next && j.state!=='reserved') throw Error('journal_generation_changed');
 if (!['reserved','uncertain'].includes(j.state)) throw Error('journal_previous_order_requires_confirmation');
 await persistJournal(slot,j,current,undefined,digest);
 return j;
}
export async function closeDurableOrder(slot: string, partner: string, current: () => boolean,
 close: (key: string) => Promise<{error: unknown}>) {
 const j=await recoverOrderJournal(slot,partner,current);
 if (j.state==='committed' || j.state==='closed') return j;
 currentOrThrow(current);
 const r=await close(j.key);
 currentOrThrow(current);
 if (r.error) throw Error('journal_closure_unavailable');
 // Canonical recovery validates full state/UUID and persists terminal state; close never advances.
 return recoverOrderJournal(slot,partner,current);
}