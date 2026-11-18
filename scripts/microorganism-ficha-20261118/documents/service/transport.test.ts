import {handle} from './index.ts';
const micro='00000000-0000-4000-8000-000000000001';
const actor='00000000-0000-4000-8000-000000000002';
const org='00000000-0000-4000-8000-000000000011';
const id='00000000-0000-4000-8000-000000000031';
const hash='86edbaa24831badfa0a8b04bb410141e2ee4182b6d0014493fe262a7a331c20b';
const snapshot={id,actor_id:actor,organization_id:org,micro_id:micro,storage_path:`${org}/${micro}/${id}`,sha256:hash,size_bytes:8,mime:'application/pdf',attested:false};
function request(action='open',body?:string){return new Request('http://localhost/documents',{method:'POST',headers:{Authorization:'Bearer synthetic-test-only','x-micro-id':micro,'x-document-id':id,'x-document-action':action},body:body??'{}'});}
async function run(test:(calls:string[])=>Promise<void>,options:{denyAt?:number;bytes?:string;authDenied?:boolean}={}) {
 const original=globalThis.fetch;
 const calls:string[]=[];let snapshots=0;
 Deno.env.set('MICRO_DOCUMENTS_PROJECT_REF','vrlcdwmlytukrjezrrnf');Deno.env.set('SUPABASE_URL','https://vrlcdwmlytukrjezrrnf.supabase.co');Deno.env.set('SUPABASE_ANON_KEY','synthetic-anon');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','synthetic-service');
 globalThis.fetch=(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  calls.push(new URL(url).pathname);
  if(url.includes('/auth/v1/user')) return Promise.resolve(new Response(JSON.stringify(options.authDenied?{message:'denied'}:{id:actor}),{status:options.authDenied?401:200,headers:{'Content-Type':'application/json'}}));
  if(url.includes('_snapshot_v1')){snapshots++;return Promise.resolve(new Response(JSON.stringify(options.denyAt===snapshots?{message:'revoked',code:'42501'}:snapshot),{status:options.denyAt===snapshots?403:200,headers:{'Content-Type':'application/json'}}));}
  if(url.includes('/storage/v1/object/')) return Promise.resolve(init?.method==='POST'?new Response(JSON.stringify({Key:snapshot.storage_path}),{headers:{'Content-Type':'application/json'}}):new Response(options.bytes??'%PDF-1.7'));
  if(url.includes('micro_document_attest_bytes_v1')) return Promise.resolve(new Response('true',{headers:{'Content-Type':'application/json'}}));
  throw new Error('unexpected endpoint');
 };
 try {await test(calls);} finally {globalThis.fetch=original;for(const key of ['MICRO_DOCUMENTS_PROJECT_REF','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'])Deno.env.delete(key);}
}
const equal=(a:unknown,b:unknown)=>{if(a!==b)throw new Error(`expected ${b}, received ${a}`);};
Deno.test('open: fresh actor pre/post bytes and no-store',()=>run(async(calls)=>{const r=await handle(request());equal(r.status,200);equal(await r.text(),'%PDF-1.7');equal(r.headers.get('Cache-Control'),'private, no-store');equal(calls.filter(x=>x.includes('snapshot')).length,2);}));
Deno.test('revoked after bytes: never returns file',()=>run(async()=>{const r=await handle(request());equal(r.status,403);equal((await r.json()).error,'document_denied');},{denyAt:2}));
Deno.test('revoked before bytes: no Storage read',()=>run(async(calls)=>{equal((await handle(request())).status,403);equal(calls.some(x=>x.includes('/storage/')),false);},{denyAt:1}));
Deno.test('bad hash refuses bytes',()=>run(async()=>{equal((await handle(request())).status,422);},{bytes:'%PDF-bad'}));
Deno.test('invalid Auth: no business call',()=>run(async(calls)=>{equal((await handle(request())).status,401);equal(calls.length,1);},{authDenied:true}));
Deno.test('upload: actor proof then bytes-only service attestation',()=>run(async(calls)=>{const r=await handle(request('upload','%PDF-1.7'));equal(r.status,200);equal((await r.json()).verified,true);equal(calls.some(x=>x.includes('commit_v1')),false);equal(calls.filter(x=>x.includes('snapshot')).length,3);}));
Deno.test('production URL denied by immutable HML binding',()=>run(async(calls)=>{Deno.env.set('SUPABASE_URL','https://swzpzcwiasxmjutrmvkm.supabase.co');equal((await handle(request())).status,503);equal(calls.length,0);}));
