// INACTIVE browser test prototype. Not imported by application. No authority stored.
const DB = 'c2-order-journal-review-v1';
export const journalScope = async (actor, org, partner) => {
 if (![actor, org, partner].every(x => typeof x === 'string' && x.length)) throw Error('scope_required');
 const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([actor,org,partner])));
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const valid = r => r && typeof r==='object' && !Array.isArray(r) && r.schema===1 &&
 typeof r.key==='string' && UUID.test(r.key) && Number.isSafeInteger(r.generation) &&
 r.generation>0 && ['uncertain','committed','closed'].includes(r.state);
export function parseCanonical(value) {
 if (!value || typeof value!=='object' || Array.isArray(value) || value.contract!=='C2_ORDER_JOURNAL_V1' ||
     typeof value.key!=='string' || !UUID.test(value.key) || !Number.isSafeInteger(value.generation) || value.generation<1 ||
     !['reserved','uncertain','closed','committed'].includes(value.state)) throw Error('contract_invalid');
 if(value.state==='committed' && (typeof value.order_id!=='string' || !UUID.test(value.order_id) ||
     typeof value.numero!=='string' || !value.numero.trim())) throw Error('contract_invalid');
 const predecessors=[];
 if(value.predecessors!==undefined){
  if(!Array.isArray(value.predecessors)||value.predecessors.length!==value.generation-1)throw Error('predecessor_invalid');
  const keys=new Set([value.key]);
  for(const [n,p] of value.predecessors.entries()){
   if(!p||typeof p!=='object'||Array.isArray(p)||typeof p.key!=='string'||!UUID.test(p.key)||keys.has(p.key)||p.generation!==n+1||!['closed','committed'].includes(p.state)||
    (p.state==='committed'&&(typeof p.order_id!=='string'||!UUID.test(p.order_id)||typeof p.numero!=='string'||!p.numero.trim())))throw Error('predecessor_invalid');
   keys.add(p.key);predecessors.push({key:p.key,generation:p.generation,state:p.state,...(p.state==='committed'?{order_id:p.order_id,numero:p.numero.trim()}:{})});
  }
 }
 return {contract:value.contract,key:value.key,generation:value.generation,state:value.state,
  ...(value.predecessors!==undefined?{predecessors}:{}),
  ...(value.state==='committed'?{order_id:value.order_id,numero:value.numero.trim()}: {})};
}
async function open() {
 return new Promise((resolve,reject)=>{
  let req;
  try { req=indexedDB.open(DB,1); } catch { reject(Error('storage_unavailable')); return; }
  req.onupgradeneeded=()=>req.result.createObjectStore('slots');
  req.onerror=()=>reject(Error('storage_unavailable'));
  req.onblocked=()=>reject(Error('storage_blocked'));
  req.onsuccess=()=>resolve(req.result);
 });
}
export async function read(scope) {
 const db=await open();
 try { return await new Promise((resolve,reject)=>{
  const t=db.transaction('slots','readonly'), req=t.objectStore('slots').get(scope);
  let result;
  req.onsuccess=()=>{result=req.result;};
  t.oncomplete=()=>{if(result===undefined) reject(Error('missing_requires_server_recovery')); else if(!valid(result)) reject(Error('storage_corrupt')); else resolve(result);};
  t.onabort=t.onerror=()=>reject(Error('storage_unavailable'));
 }); } finally {db.close();}
}
// Server-issued reservation MUST already exist, even when the local database is empty.
export async function adopt(scope,reservation,current,canonicalProof) {
 if(!current() || !valid(reservation)) throw Error('context_or_contract_invalid');
 const canonical=canonicalProof===undefined?undefined:parseCanonical(canonicalProof);
 if(canonical && (canonical.key!==reservation.key || canonical.generation!==reservation.generation))throw Error('predecessor_invalid');
 const db=await open();
 try {return await new Promise((resolve,reject)=>{
  const t=db.transaction('slots','readwrite'), store=t.objectStore('slots'), req=store.get(scope);
  let failure;
  req.onsuccess=()=>{
   const prev=req.result;
   if(!current()) {failure='context_changed';t.abort();return;}
   if(prev!==undefined && !valid(prev)){failure='storage_corrupt';t.abort();return;}
   if(prev && (prev.generation>reservation.generation || (prev.generation===reservation.generation && prev.key!==reservation.key))) {failure='stale_generation';t.abort();return;}
   // Same generation is monotonic: terminal observations cannot regress or conflict.
   // A new generation requires a different server-issued key and a terminal predecessor.
   if(prev && prev.generation===reservation.generation && prev.state!=='uncertain' && prev.state!==reservation.state) {failure='terminal_state_conflict';t.abort();return;}
   if(prev && reservation.generation>prev.generation &&
      (prev.state==='uncertain' || prev.key===reservation.key)) {
    const proof=canonical?.predecessors?.find(p=>p.key===prev.key && p.generation===prev.generation);
    if(prev.key===reservation.key || !proof){failure='generation_transition_unconfirmed';t.abort();return;}
   }
   if(prev && reservation.generation>prev.generation && canonical){
    const proof=canonical.predecessors?.find(p=>p.key===prev.key && p.generation===prev.generation);
    if(!proof || (prev.state!=='uncertain' && proof.state!==prev.state)){failure='generation_transition_unconfirmed';t.abort();return;}
   }
   // Persist only opaque key, schema/version and state. No payload, price, token, actor IDs.
   store.put({schema:1,key:reservation.key,generation:reservation.generation,state:reservation.state},scope);
  };
  t.oncomplete=()=>current()?resolve(reservation):reject(Error('context_changed'));
  t.onabort=t.onerror=()=>reject(Error(failure||'storage_unavailable'));
 });} finally {db.close();}
}
export async function beforeDispatch(scope,reservation,current,authorizeServer) {
 if(!current()) throw Error('context_changed');
 if(!valid(reservation) || reservation.state!=='uncertain') throw Error('dispatch_blocked');
 const canonical=parseCanonical(await authorizeServer()); // Fresh authenticated RPC, not storage authority.
 if(!current() || canonical.key!==reservation.key || canonical.generation!==reservation.generation) throw Error('context_or_generation_changed');
 if(!['reserved','uncertain'].includes(canonical.state)) throw Error('dispatch_blocked');
 const local=await read(scope);
 if(!current() || local.key!==reservation.key || local.generation!==reservation.generation || local.state!=='uncertain') throw Error('dispatch_blocked');
 return local.key;
}