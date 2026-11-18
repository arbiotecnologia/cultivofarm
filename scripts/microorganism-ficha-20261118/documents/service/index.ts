// Review-only: explicitly homolog-bound; no production transport in this delta.
import {createClient} from 'npm:@supabase/supabase-js@2';
import {corsHeaders} from 'npm:@supabase/supabase-js@2/cors';
import {boundedBytes, measure} from './integrity.ts';
import { PROJECT_REF } from './binding.ts';
const BUCKET = 'microorganism-documents';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = {...corsHeaders, 'Access-Control-Allow-Headers': corsHeaders['Access-Control-Allow-Headers']+', x-micro-id, x-document-id, x-document-action', 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff'};
const json = (error: string, status: number) => new Response(JSON.stringify({error}), {status,headers:{...headers,'Content-Type':'application/json'}});
export async function handle(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok',{headers});
  if (req.method !== 'POST') return json('method_not_allowed',405);
  const ref = PROJECT_REF;
  const url = ref === 'vrlcdwmlytukrjezrrnf' ? `https://${ref}.supabase.co` : null;
  if (!url || Deno.env.get('SUPABASE_URL') !== url) return json('document_binding_required',503);
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const bearer = req.headers.get('Authorization');
  if (!anon || !serviceKey) return json('document_configuration',503);
  if (!bearer?.startsWith('Bearer ')) return json('unauthorized',401);
  const micro = req.headers.get('x-micro-id') ?? '';
  const id = req.headers.get('x-document-id') ?? '';
  const action = req.headers.get('x-document-action');
  if (!UUID.test(micro) || !UUID.test(id) || !['upload','open'].includes(action ?? '')) return json('document_request',400);
  const signal = AbortSignal.any([req.signal,AbortSignal.timeout(45000)]);
  const scopedFetch: typeof fetch = (input,init) => fetch(input,{...init,signal,redirect:'error'});
  const actor = createClient(url,anon,{global:{headers:{Authorization:bearer},fetch:scopedFetch},auth:{persistSession:false,autoRefreshToken:false}});
  // Service client transports/attests bytes only, never calls a business RPC.
  const transport = createClient(url,serviceKey,{global:{fetch:scopedFetch},auth:{persistSession:false,autoRefreshToken:false}});
  try {
    const auth = await actor.auth.getUser();
    if (auth.error || !auth.data.user) return json('unauthorized',401);
    const rpc = action === 'upload' ? 'tenant_micro_document_upload_snapshot_v1' : 'tenant_micro_document_open_snapshot_v1';
    const args = action === 'upload' ? {p_micro:micro,p_upload:id} : {p_micro:micro,p_version:id};
    const before = await actor.rpc(rpc,args);
    const snapshot = before.data;
    if (before.error || snapshot?.actor_id !== auth.data.user.id || snapshot.micro_id !== micro || snapshot.id !== id || !UUID.test(snapshot.organization_id ?? '') || !new RegExp(`^${snapshot.organization_id}/${micro}/[0-9a-f-]{36}$`).test(snapshot.storage_path ?? '')) return json('document_denied',403);
    let bytes: Uint8Array;
    if (action === 'upload') {
      bytes = await boundedBytes(req,signal);
    } else {
      // Use bounded streaming, not storage.download()'s unbounded blob allocation.
      const path = snapshot.storage_path.split('/').map(encodeURIComponent).join('/');
      const response = await scopedFetch(`${url}/storage/v1/object/${BUCKET}/${path}`,{headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey}});
      if (!response.ok) return json('document_storage',502);
      bytes = await boundedBytes(response,signal);
    }
    const measured = await measure(bytes);
    if (measured.sha256 !== snapshot.sha256 || measured.mime !== snapshot.mime || measured.size_bytes !== snapshot.size_bytes) return json('document_integrity',422);
    const afterBytes = await actor.rpc(rpc,args);
    if (afterBytes.error || JSON.stringify(afterBytes.data) !== JSON.stringify(snapshot)) return json('document_denied',403);
    if (action === 'upload') {
      if (!snapshot.attested) {
        const upload = await transport.storage.from(BUCKET).upload(snapshot.storage_path,bytes,{contentType:measured.mime,upsert:false});
        if (upload.error) {
          // Lost upload ACK is reconciled by exact bytes; never overwrite an object.
          const path = snapshot.storage_path.split('/').map(encodeURIComponent).join('/');
          const stored = await scopedFetch(`${url}/storage/v1/object/${BUCKET}/${path}`,{headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey}});
          if (!stored.ok) return json('document_storage',502);
          const integrity = await measure(await boundedBytes(stored,signal));
          if (JSON.stringify(integrity) !== JSON.stringify(measured)) return json('document_integrity',422);
        }
      }
      const final = await actor.rpc(rpc,args);
      if (final.error || JSON.stringify(final.data) !== JSON.stringify(snapshot)) return json('document_denied',403);
      const attest = await transport.rpc('micro_document_attest_bytes_v1',{p_upload:id,p_sha256:measured.sha256,p_size:measured.size_bytes,p_mime:measured.mime});
      if (attest.error || attest.data !== true) return json('document_integrity',422);
      return new Response(JSON.stringify({upload_id:id,micro_id:micro,verified:true}),{headers:{...headers,'Content-Type':'application/json'}});
    }
    if (signal.aborted) return json('document_timeout',504);
    return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':measured.mime,'Content-Length':String(bytes.length),'Content-Disposition':'inline'}});
  } catch (error) {
    if (signal.aborted) return json('document_timeout',504);
    if (error instanceof Error && error.message === 'document_size') return json('document_size',413);
    if (error instanceof Error && error.message === 'document_type') return json('document_type',415);
    return json('document_unavailable',502);
  }
}
if (import.meta.main) Deno.serve(handle);
