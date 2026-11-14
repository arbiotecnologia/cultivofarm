import {createClient} from 'npm:@supabase/supabase-js@2.110.8';
import {corsHeaders} from 'npm:@supabase/supabase-js@2.110.8/cors';
import {digest,documentMime,readBounded} from './core.ts';
const base='https://swzpzcwiasxmjutrmvkm.supabase.co';
const origins=new Set(['https://app.cultivofarm.com.br','https://cultivofarm.lovable.app','https://id-preview--a79bb3db-f665-466d-bf41-ee8c6cb91fab.lovable.app','http://localhost:8080']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
Deno.serve(async req=>{
 const origin=req.headers.get('Origin');
 const headers={...corsHeaders,'Access-Control-Allow-Origin':origin&&origins.has(origin)?origin:'null','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Vary':'Origin, Authorization'};
 const json=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json'}});
 if(origin&&!origins.has(origin)) return json(403,{error:'access_denied'});
 if(req.method==='OPTIONS') return origin&&origins.has(origin)?new Response(null,{headers}):json(403,{error:'access_denied'});
 if(req.method!=='POST') return json(405,{error:'method_denied'});
 if(Deno.env.get('SUPABASE_URL')!==base) return json(503,{error:'binding_unavailable'});
 const anon=Deno.env.get('SUPABASE_ANON_KEY'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 const bearer=req.headers.get('Authorization')??'';
 if(!anon||!secret||!/^Bearer \S+$/.test(bearer)) return json(401,{error:'access_denied'});
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),25000);
 try {
 const actor=createClient(base,anon,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const verified=await actor.auth.getUser(bearer.slice(7)); if(verified.error||!verified.data.user) return json(401,{error:'access_denied'});
 const service=createClient(base,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const call=async(name:string,args:Record<string,unknown>)=>{const r=await actor.rpc(name,args).abortSignal(controller.signal);if(r.error)throw new Error('access_denied');return r.data;};
 const url=new URL(req.url); const action=url.searchParams.get('action');
 if(action==='open') {
 const input=await req.json(); if(![input.product_id,input.microorganism_id,input.document_id].every(x=>typeof x==='string'&&uuid.test(x))) return json(400,{error:'invalid_request'});
 const args={p_product_id:input.product_id,p_microorganism_id:input.microorganism_id,p_document_id:input.document_id};
 const before=await call('rpc_regulatory_product_document_access',args);
 if(before.product_id!==input.product_id||before.document_id!==input.document_id||before.bucket!=='fiscal-regulatorio') throw new Error('access_denied');
 const r=await fetch(`${base}/storage/v1/object/authenticated/fiscal-regulatorio/${before.path.split('/').map(encodeURIComponent).join('/')}`,{headers:{Authorization:`Bearer ${secret}`,apikey:secret},signal:controller.signal,redirect:'error',cache:'no-store'});
 if(!r.ok) throw new Error('unavailable'); const bytes=await readBounded(r.body); const sha=await digest(bytes);
 const after=await call('rpc_regulatory_product_document_access',args);
 if(sha!==before.sha256||before.path!==after.path||before.sha256!==after.sha256||before.dossier_id!==after.dossier_id) throw new Error('integrity');
 return new Response(new Uint8Array(bytes).buffer,{headers:{...headers,'Content-Type':documentMime(bytes)??'application/octet-stream','X-Content-Type-Options':'nosniff'}});
 }
 const id=url.searchParams.get('upload_id'); if(!id||!uuid.test(id)) return json(400,{error:'invalid_request'});
 const snap=()=>call('tenant_product_dossier_upload_access',{p_upload_id:id});
 if(action==='cancel') {
 // No deletion of committed documents; uncertain cleanup stays tracked.
 const cancel=await call('tenant_product_dossier_upload_cancel_begin',{p_upload_id:id});
 const removed=await service.storage.from('fiscal-regulatorio').remove([cancel.storage_path]); if(removed.error) return json(409,{error:'cleanup_pending'});
 const r=await service.rpc('tenant_product_dossier_upload_cancel',{p_upload_id:id}); if(r.error)return json(409,{error:'cleanup_pending'});
 return json(200,{state:'CANCELLED'});
 }
 const before=await snap();
 if(before.state==='COMMITTED') return json(200,{product_id:before.product_id,document_id:id,state:'COMMITTED'});
 if(action!=='upload'&&action!=='resume') return json(400,{error:'invalid_request'});
 let bytes:Uint8Array;
 if(action==='upload') {
 bytes=await readBounded(req.body);
 if(bytes.length!==before.size_bytes||documentMime(bytes)!==before.mime||await digest(bytes)!==before.sha256) return json(400,{error:'integrity_mismatch'});
 await snap();
 const result=await service.storage.from('fiscal-regulatorio').upload(before.storage_path,bytes,{contentType:before.mime,upsert:false});
 if(result.error) {
 // A lost ACK may already have created the exact tracked object. Verify it, never overwrite.
 const r=await fetch(`${base}/storage/v1/object/authenticated/fiscal-regulatorio/${before.storage_path.split('/').map(encodeURIComponent).join('/')}`,{headers:{Authorization:`Bearer ${secret}`,apikey:secret},signal:controller.signal,redirect:'error',cache:'no-store'});
 if(!r.ok) return json(409,{error:'upload_pending'}); bytes=await readBounded(r.body);
 }
 } else {
 const r=await fetch(`${base}/storage/v1/object/authenticated/fiscal-regulatorio/${before.storage_path.split('/').map(encodeURIComponent).join('/')}`,{headers:{Authorization:`Bearer ${secret}`,apikey:secret},signal:controller.signal,redirect:'error',cache:'no-store'});
 if(!r.ok)return json(409,{error:'file_required'}); bytes=await readBounded(r.body);
 }
 const sha=await digest(bytes); if(sha!==before.sha256||bytes.length!==before.size_bytes||documentMime(bytes)!==before.mime) return json(409,{error:'integrity_mismatch'});
 await snap();
 const attested=await service.rpc('tenant_product_dossier_upload_attest',{p_upload_id:id,p_sha256:sha,p_size:bytes.length,p_mime:before.mime}); if(attested.error)return json(409,{error:'upload_pending'});
 const ack=await call('tenant_product_dossier_upload_finalize',{p_upload_id:id});
 return json(200,ack);
 }catch{return json(409,{error:'operation_unconfirmed'});}finally{clearTimeout(timer);}
});