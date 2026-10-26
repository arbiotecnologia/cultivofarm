import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { adopt, read } from './journal-prototype.mjs';
import { recoverJournal } from './recovery-controller.mjs';
const k='10000000-0000-4000-8000-000000000001', next='10000000-0000-4000-8000-000000000002';
const old={schema:1,key:k,generation:1,state:'uncertain'};
const reply={contract:'C2_ORDER_JOURNAL_V1',key:next,generation:2,state:'reserved',
 predecessors:[{key:k,generation:1,state:'closed'}]};
let failures=0;
for(const scenario of ['explicit advance','other tab recovers','reopen after lost ACK']) {
 try {
  await adopt(scenario,old,()=>true);
  await recoverJournal({enabled:true,scope:scenario,current:()=>true,
   expected:old,advance:scenario==='explicit advance',rpc:async()=>reply});
  assert.equal((await read(scenario)).key,next);
  await assert.rejects(adopt(scenario,old,()=>true));
  console.log('PASS',scenario);
 }catch(e){failures++;console.log('FAIL',scenario,e.message);}
}
console.log('TOTAL',3-failures,'PASS',failures,'FAIL');process.exitCode=failures?1:0;