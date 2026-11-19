import { createClient } from 'npm:@supabase/supabase-js@2.110.8';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';
const URL_PRODUCTION='https://swzpzcwiasxmjutrmvkm.supabase.co';
const BUCKET='catalog-scientific-articles';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-article-entity, x-article-parent, x-article-id, x-article-action','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const fail=(error:string,status:number)=>new Response(JSON.stringify({error}),{status,headers:{...headers,'Content-Type':'application/json'}});
async function bounded(r:Request|Response,signal:AbortSignal){
 const reader=r.body?.getReader(); if(!reader)throw Error('article_type');
 const chunks:Uint8Array[]=[]; let size=0;
 const cancel=()=>{void reader.cancel();};signal.addEventListener('abort',cancel,{once:true});
 try {while(true){if(signal.aborted)throw Error('article_timeout');const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>10485760)throw Error('article_size');chunks.push(part.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return bytes;
 }finally{signal.removeEventListener('abort',cancel);void reader.cancel();}
}
async function measure(bytes:Uint8Array){
 if(bytes.length<16||bytes.length>10485760)throw Error('article_size');
 if(![37,80,68,70,45].every((n,i)=>bytes[i]===n))throw Error('article_type');
 try{const doc=await PDFDocument.load(bytes,{ignoreEncryption:false,throwOnInvalidObject:true});if(doc.isEncrypted||doc.getPageCount()<1)throw Error('pdf');}catch{throw Error('article_type');}
 return {sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join(''),size_bytes:bytes.length};
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return fail('method',405);
 if(Deno.env.get('SUPABASE_URL')!==URL_PRODUCTION)return fail('production_binding',503);
 const key=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),bearer=req.headers.get('Authorization');
 if(!key||!service)return fail('configuration',503);if(!bearer?.startsWith('Bearer '))return fail('unauthorized',401);
 const entity=req.headers.get('x-article-entity'),parent=req.headers.get('x-article-parent')??'',id=req.headers.get('x-article-id')??'',action=req.headers.get('x-article-action');
 if(!['microrganismo','produto'].includes(entity??'')||!UUID.test(parent)||!UUID.test(id)||!['upload','open'].includes(action??''))return fail('request',400);
 const signal=AbortSignal.any([req.signal,AbortSignal.timeout(45000)]);
 const scopedFetch:typeof fetch=(input,init)=>fetch(input,{...init,signal,redirect:'error'});
 const actor=createClient(URL_PRODUCTION,key,{global:{headers:{Authorization:bearer},fetch:scopedFetch},auth:{persistSession:false,autoRefreshToken:false}});
 const transport=createClient(URL_PRODUCTION,service,{global:{fetch:scopedFetch},auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const user=await actor.auth.getUser();if(user.error||!user.data.user)return fail('unauthorized',401);
  const args={p_entity:entity,p_parent:parent,p_id:id,p_upload:action==='upload'};
  const snapshot=await actor.rpc('tenant_catalog_article_snapshot_v1',args); const s=snapshot.data;
  if(snapshot.error||s?.actor_id!==user.data.user.id||s.id!==id||s.parent_id!==parent||s.entity!==entity||!UUID.test(s.organization_id??'')||s.storage_path!==`${s.organization_id}/${entity}/${parent}/${id}.pdf`)return fail('denied',403);
  const readStored=async()=>{const r=await scopedFetch(`${URL_PRODUCTION}/storage/v1/object/${BUCKET}/${s.storage_path}`,{headers:{Authorization:`Bearer ${service}`,apikey:service}});if(!r.ok)throw Error('storage');return bounded(r,signal);};
  const bytes=action==='upload'?await bounded(req,signal):await readStored();const m=await measure(bytes);
  if(m.sha256!==s.sha256||m.size_bytes!==s.size_bytes)return fail('integrity',422);
  const recheck=async()=>{const r=await actor.rpc('tenant_catalog_article_snapshot_v1',args);if(r.error||JSON.stringify(r.data)!==JSON.stringify(s))throw Error('denied');};
  await recheck();
  if(action==='upload'){
   if(!s.attested){const put=await transport.storage.from(BUCKET).upload(s.storage_path,bytes,{contentType:'application/pdf',upsert:false});if(put.error){const stored=await measure(await readStored());if(stored.sha256!==m.sha256||stored.size_bytes!==m.size_bytes)return fail('integrity',422);}}
   await recheck();
   const attest=await transport.rpc('catalog_article_attest_v1',{p_id:id,p_sha256:m.sha256,p_size:m.size_bytes});if(attest.error||attest.data!==true)return fail('integrity',422);
   return new Response(JSON.stringify({verified:true,id,entity,parent_id:parent}),{headers:{...headers,'Content-Type':'application/json'}});
  }
  if(signal.aborted)return fail('timeout',504);
  return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'inline','Content-Length':String(bytes.length)}});
 }catch(e){const msg=e instanceof Error?e.message:'';return fail(msg==='denied'?'denied':'article_unavailable',signal.aborted?504:msg==='denied'?403:msg==='article_size'?413:msg==='article_type'?415:502);}
});
