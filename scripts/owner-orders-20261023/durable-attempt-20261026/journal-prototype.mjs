// INACTIVE browser test prototype. Not imported by application. No authority stored.
const DB = 'c2-order-journal-review-v1';
export const journalScope = async (actor, org, partner) => {
 if (![actor, org, partner].every(x => typeof x === 'string' && x.length)) throw Error('scope_required');
 const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([actor,org,partner])));
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
};
const valid = r => r && r.schema===1 && /^[0-9a-f-]{36}$/.test(r.key) && Number.isSafeInteger(r.generation) && r.generation>0 && ['uncertain','committed','closed'].includes(r.state);
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
export async function adopt(scope,reservation,current) {
 if(!current() || !valid(reservation)) throw Error('context_or_contract_invalid');
 const db=await open();
 try {return await new Promise((resolve,reject)=>{
  const t=db.transaction('slots','readwrite'), store=t.objectStore('slots'), req=store.get(scope);
  let failure;
  req.onsuccess=()=>{
   const prev=req.result;
   if(!current()) {failure='context_changed';t.abort();return;}
   if(prev!==undefined && !valid(prev)){failure='storage_corrupt';t.abort();return;}
   if(prev && (prev.generation>reservation.generation || (prev.generation===reservation.generation && prev.key!==reservation.key))) {failure='stale_generation';t.abort();return;}
   // Persist only opaque key, schema/version and state. No payload, price, token, actor IDs.
   store.put({schema:1,key:reservation.key,generation:reservation.generation,state:reservation.state},scope);
  };
  t.oncomplete=()=>current()?resolve(reservation):reject(Error('context_changed'));
  t.onabort=t.onerror=()=>reject(Error(failure||'storage_unavailable'));
 });} finally {db.close();}
}
export async function beforeDispatch(scope,reservation,current,authorizeServer) {
 if(!current()) throw Error('context_changed');
 const canonical=await authorizeServer(); // Controlled in tests; requires inactive server contract.
 if(!current() || canonical.key!==reservation.key || canonical.generation!==reservation.generation) throw Error('context_or_generation_changed');
 const local=await read(scope);
 if(!current() || local.key!==reservation.key || local.generation!==reservation.generation || local.state!=='uncertain') throw Error('dispatch_blocked');
 return local.key;
}