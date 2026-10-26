import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const j=await import(process.env.JOURNAL_TEST_MODULE ? pathToFileURL(process.env.JOURNAL_TEST_MODULE).href : './journal-prototype.mjs');
const key='10000000-0000-4000-8000-000000000001';
const uncertain={schema:1,key,generation:1,state:'uncertain'};
const canonical=state=>({contract:'C2_ORDER_JOURNAL_V1',key,generation:1,state,...(state==='committed'?{order_id:'20000000-0000-4000-8000-000000000001',numero:'PB-TEST'}:{})});
let failures=0,passes=0;
async function test(name,run){try{await run();passes++;console.log('PASS',name)}catch(e){failures++;console.log('FAIL',name,e.message)}}
for(const state of ['committed','closed']){
 await test(`${state} never regresses to uncertain`,async()=>{
  const s='terminal-'+state;await j.adopt(s,{...uncertain,state},()=>true);
  try{await j.adopt(s,uncertain,()=>true)}catch{}
  assert.equal((await j.read(s)).state,state);
 });
 await test(`${state} never switches to another terminal`,async()=>{
  const s='conflict-'+state;await j.adopt(s,{...uncertain,state},()=>true);
  try{await j.adopt(s,{...uncertain,state:state==='closed'?'committed':'closed'},()=>true)}catch{}
  assert.equal((await j.read(s)).state,state);
 });
}
for(const state of ['closed','committed','unknown','in_progress'])await test(`canonical ${state} never dispatches`,async()=>{
 const s='dispatch-'+state;await j.adopt(s,uncertain,()=>true);
 await assert.rejects(j.beforeDispatch(s,uncertain,()=>true,async()=>canonical(state)));
});
await test('36 hyphens rejected UUID',()=>assert.rejects(j.adopt('bad',{...uncertain,key:'-'.repeat(36)},()=>true)));
await test('canonical missing contract rejected',async()=>{
 await j.adopt('schema',uncertain,()=>true);await assert.rejects(j.beforeDispatch('schema',uncertain,()=>true,async()=>uncertain));
});
await test('committed incomplete metadata rejected',async()=>{
 await j.adopt('incomplete',uncertain,()=>true);await assert.rejects(j.beforeDispatch('incomplete',uncertain,()=>true,async()=>({...canonical('committed'),order_id:undefined})));
});
await test('authorized full uncertain schema allows same key',async()=>{
 await j.adopt('positive',uncertain,()=>true);assert.equal(await j.beforeDispatch('positive',uncertain,()=>true,async()=>canonical('uncertain')),key);
});
await test('revoked after RPC blocks dispatch',async()=>{
 await j.adopt('revoked',uncertain,()=>true);let ready=true;
 await assert.rejects(j.beforeDispatch('revoked',uncertain,()=>ready,async()=>{ready=false;return canonical('uncertain)}));
});
console.log('TOTAL',passes,'PASS',failures,'FAIL');process.exitCode=failures?1:0;