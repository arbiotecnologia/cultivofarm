import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useScopedPortalQuery } from '@/hooks/useScopedPortalQuery';
import { downloadAuthenticatedAttachment } from '@/lib/authz/authenticatedAttachment';

const status = z.enum(['NONE','DRAFT','PENDING_REVIEW','VALIDATED','BLOCKED']);
export const regulatoryProductSchema = z.object({ product_id:z.string().uuid(), nome:z.string(), codigo:z.string().nullable(), ativo:z.boolean(), dossier_status:status });
export type RegulatoryProduct = z.infer<typeof regulatoryProductSchema>;
const documentSchema = z.object({ id:z.string().uuid(), dossier_id:z.string().uuid(), title:z.string(), doc_type:z.string(), issuer:z.string().nullable(), valid_until:z.string().nullable(), storage_bucket:z.literal('fiscal-regulatorio'), storage_path:z.string(), content_sha256:z.string() });
const pendencySchema = z.object({code:z.string(),field:z.string(),layer:z.string(),message:z.string(),items:z.array(z.string()).optional()});
export const productDossierSchema = z.object({ product_id:z.string().uuid(), dossier:z.object({ id:z.string().uuid(), microorganism_id:z.string().uuid(), version:z.number().int().positive(), status:status.exclude(['NONE']), regulatory_category:z.string().nullable(), mapa_registration_number:z.string().nullable(), mapa_status:z.string().nullable(), blocked_reason:z.string().nullable(), updated_at:z.string().optional(), strain_code:z.string().nullable().optional(), strain_name:z.string().nullable().optional(), formulation:z.string().nullable().optional(), label_guarantee:z.string().nullable().optional(), guarantee_unit:z.string().nullable().optional(), mapa_holder:z.string().nullable().optional(), mapa_manufacturer:z.string().nullable().optional(), mapa_valid_until:z.string().nullable().optional(), mapa_not_applicable_reason:z.string().nullable().optional(), notes:z.string().nullable().optional() }), documents:z.array(documentSchema), checklist:z.array(z.object({ item_key:z.string(),state:z.enum(['PENDING','CONFIRMED','NOT_APPLICABLE']),justification:z.string().nullable() })), gate:z.object({pendencies:z.array(pendencySchema)}) });
export type ProductDossier = z.infer<typeof productDossierSchema>;
type RpcName = 'rpc_regulatory_microorganism_products'|'rpc_regulatory_product_dossier_detail'|'rpc_regulatory_product_document_access';
type RpcClient = {rpc:(name:RpcName,args:Record<string,string>)=>PromiseLike<{data:unknown;error:{code?:string;message?:string}|null}>};
async function rpc(name:RpcName,args:Record<string,string>) {
 const {data,error}=await (supabase as unknown as RpcClient).rpc(name,args);
 if(error) throw new Error(error.code==='42501'?'permission_denied':'regulatory_read_failed');
 return data;
}
export function useRegulatoryProducts(microId:string) {
 const q=useScopedPortalQuery<RegulatoryProduct[]>({queryKey:['fiscal','regulatory-products',microId], queryFn:async()=>z.array(regulatoryProductSchema).parse(await rpc('rpc_regulatory_microorganism_products',{p_microorganism_id:microId}))});
 return {...q,data:q.ready&&!q.isError?q.data:undefined};
}
export function parseProductDossier(value:unknown,productId:string):ProductDossier|null {
 if(value===null) return null;
 const d=productDossierSchema.parse(value);
 if(d.product_id!==productId || d.documents.some(x=>x.dossier_id!==d.dossier.id)) throw new Error('regulatory_target_mismatch');
 return d;
}
export function useProductRegulatoryDossier(microId:string,productId:string) {
 const q=useScopedPortalQuery<ProductDossier|null>({queryKey:['fiscal','product-regulatory-dossier',microId,productId],queryFn:async()=>parseProductDossier(await rpc('rpc_regulatory_product_dossier_detail',{p_microorganism_id:microId,p_product_id:productId}),productId)});
 return {...q,data:q.ready&&!q.isError?q.data:undefined};
}
const locatorSchema=z.object({document_id:z.string().uuid(),dossier_id:z.string().uuid(),product_id:z.string().uuid(),bucket:z.literal('fiscal-regulatorio'),path:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/i)});
/** Fresh server authority on both sides of bytes; no signed URL or legacy fallback. */
export async function loadProductRegulatoryDocument(microId:string,productId:string,documentId:string,signal:AbortSignal):Promise<Blob> {
 const args={p_microorganism_id:microId,p_product_id:productId,p_document_id:documentId};
 const read=async()=>{
  if(signal.aborted) throw new Error('regulatory_context_changed');
  const l=locatorSchema.parse(await rpc('rpc_regulatory_product_document_access',args));
  if(signal.aborted||l.product_id!==productId||l.document_id!==documentId||!new RegExp(`^dossiers/${l.dossier_id}/${documentId}/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$`).test(l.path)) throw new Error('regulatory_target_mismatch');
  return l;
 };
 const before=await read();
 const blob=await downloadAuthenticatedAttachment(before.bucket,before.path,signal);
 const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const after=await read();
 if(signal.aborted||hash!==before.sha256.toLowerCase()||after.path!==before.path||after.sha256!==before.sha256||after.dossier_id!==before.dossier_id) throw new Error('regulatory_document_changed');
 return blob;
}