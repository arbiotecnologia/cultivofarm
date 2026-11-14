import {z} from 'zod';
import {useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useStorageAccessScope} from '@/hooks/useStorageAccessScope';
import {useScopedPortalQuery} from '@/hooks/useScopedPortalQuery';
export const managementProductSchema=z.object({product_id:z.string().uuid(),nome:z.string(),codigo:z.string().nullable(),ativo:z.boolean(),organization_name:z.string(),owner_organization_id:z.string().uuid()});
export type ManagementProduct=z.infer<typeof managementProductSchema>;
const contextSchema=z.object({product_id:z.string().uuid(),microorganisms:z.array(z.object({id:z.string().uuid(),nome:z.string(),codigo:z.string().nullable()})),dossier_microorganism_id:z.string().uuid().nullable()});
const uploadSchema=z.object({id:z.string().uuid(),product_id:z.string().uuid(),dossier_id:z.string().uuid(),storage_path:z.string(),state:z.enum(['RESERVED','VERIFIED','COMMITTED','CANCELLED'])});
type Name=`platform_product_dossier_${'management_list'|'management_context'|'management_create'|'management_save'|'management_checklist'|'management_submit'|'upload_prepare'|'upload_pending'}`;
export async function dossierManagementRpc(name:Name,args:Record<string,unknown>) {
 const client=supabase as unknown as {rpc:(name:Name,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{code?:string}|null}>};
 const {data,error}=await client.rpc(name,args);
 if(error)throw new Error(error.code==='PT409'?'O registro mudou ou existe uma tentativa pendente. Atualize a consulta.':error.code==='42501'?'Acesso de gestão não autorizado.':'A ação não foi confirmada. Seu rascunho foi mantido.');
 return data;
}
export function useManagementProducts(search:string){return useScopedPortalQuery({queryKey:['product-dossier-management','products',search],queryFn:async()=>z.array(managementProductSchema).parse(await dossierManagementRpc('platform_product_dossier_management_list',{p_search:search}))});}
export function useManagementContext(productId:string){return useScopedPortalQuery({queryKey:['product-dossier-management','context',productId],queryFn:async()=>{const c=contextSchema.parse(await dossierManagementRpc('platform_product_dossier_management_context',{p_product_id:productId}));if(c.product_id!==productId)throw new Error('target_mismatch');return c;}});}
export function usePendingDossierUploads(productId:string){return useScopedPortalQuery({queryKey:['product-dossier-management','uploads',productId],queryFn:async()=>z.array(uploadSchema).parse(await dossierManagementRpc('platform_product_dossier_upload_pending',{p_product_id:productId}))});}
export async function regulatoryDocumentTransport(action:'upload'|'resume'|'cancel'|'open',body:unknown,uploadId?:string):Promise<unknown>{
 const result=await supabase.functions.invoke(`product-regulatory-document?action=${action}${uploadId?`&upload_id=${uploadId}`:''}`,{body:body as Blob|Record<string,unknown>});
 if(result.error)throw new Error('Operação não confirmada. Consulte a tentativa pendente antes de reenviar.');
 return result.data;
}
export function useDossierManagementOperation(productId:string){
 const access=useStorageAccessScope(`product-dossier-management:${productId}`);const lock=useRef(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function run(work:()=>Promise<void>){if(lock.current||!access.ready)return;const valid=access.capture();lock.current=true;setBusy(true);setError('');try{await work();if(!valid())throw new Error('O contexto de acesso mudou. Consulte novamente.');}catch(e){if(valid())setError(e instanceof Error?e.message:'Ação não confirmada.');}finally{lock.current=false;if(valid())setBusy(false);}}
 return {run,busy,error,access};
}
export async function prepareDossierFile(file:File){
 if(file.size<1||file.size>20*1024*1024||!['application/pdf','image/png','image/jpeg'].includes(file.type))throw new Error('Selecione PDF, PNG ou JPEG de até 20 MB.');
 const bytes=await file.arrayBuffer();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 const ext=file.type==='application/pdf'?'pdf':file.type==='image/png'?'png':'jpg';
 const base=file.name.replace(/\.[^.]*$/,'').normalize('NFKD').replace(/[^A-Za-z0-9._-]/g,'_').slice(0,110)||'documento';
 return {sha256:hash,size_bytes:file.size,mime:file.type,filename:`${base}.${ext}`};
}