import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
export type ArticleEntity='microrganismo'|'produto';
const schema=z.object({id:z.string().uuid(),organization_id:z.string().uuid(),entity:z.enum(['microrganismo','produto']),parent_id:z.string().uuid(),title:z.string().min(1).max(200),file_name:z.string().min(1).max(240),sha256:z.string().regex(/^[a-f0-9]{64}$/),size_bytes:z.number().int().min(16).max(10485760),status:z.enum(['pending','ready']),created_at:z.string(),received_at:z.string().nullable()});
export type ScientificArticle=z.infer<typeof schema>;
export function parseArticle(data:unknown,entity:ArticleEntity,parent:string,org:string){const row=schema.parse(data);if(row.entity!==entity||row.parent_id!==parent||row.organization_id!==org)throw Error('Artigo fora do escopo da ficha.');return row;}
export async function verifyArticle(blob:Blob,expected?:ScientificArticle){
 if(blob.size<16||blob.size>10485760)throw Error('Selecione um PDF de até 10 MiB.');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 if((blob.type&&blob.type!=='application/pdf')||![37,80,68,70,45].every((n,i)=>bytes[i]===n))throw Error('O arquivo precisa ser um PDF.');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 if(expected&&(expected.sha256!==sha256||expected.size_bytes!==blob.size))throw Error('Integridade do artigo não confirmada.');
 return {sha256,size_bytes:blob.size,blob:new Blob([bytes],{type:'application/pdf'})};
}
const errorMessage=(e:{code?:string;message?:string})=>e.message==='article_duplicate'?'Este PDF já foi enviado para esta ficha.':e.code==='42501'?'Sem permissão para esta ficha ou biblioteca indisponível.':e.code==='PT409'?'Tentativa conflitante. Atualize a lista antes de enviar novamente.':'Não foi possível concluir. Confira a lista e reconcilie a mesma tentativa.';
async function rpc(name:string,args:Record<string,unknown>,signal:AbortSignal){const r=await supabase.rpc(name as never,args as never).abortSignal(signal);if(r.error)throw Error(errorMessage(r.error));return r.data;}
export async function listArticles(entity:ArticleEntity,parent:string,org:string,signal:AbortSignal){
 const data=await rpc('tenant_catalog_articles_list_v1',{p_entity:entity,p_parent:parent},signal);
 const rows=z.array(z.unknown()).max(100).parse(data).map(x=>parseArticle(x,entity,parent,org));
 if(rows.some(x=>x.status!=='ready')||new Set(rows.map(x=>x.id)).size!==rows.length)throw Error('Lista de artigos inválida.');return rows;
}
export async function articleBytes(action:'open'|'upload',entity:ArticleEntity,parent:string,id:string,signal:AbortSignal,file?:Blob){
 const r=await supabase.functions.invoke('catalog-scientific-articles',{body:file??{},signal,headers:{'x-article-action':action,'x-article-entity':entity,'x-article-parent':parent,'x-article-id':id}});
 if(r.error)throw Error('Artigo indisponível. Confira acesso, formato PDF e integridade; o envio pode ser reconciliado.');
 if(action==='open'){if(!(r.data instanceof Blob))throw Error('Resposta de arquivo inválida.');return r.data;}
 if(r.data?.verified!==true||r.data.id!==id||r.data.entity!==entity||r.data.parent_id!==parent)throw Error('Envio não confirmado.');return null;
}
export type ArticleAttempt={id:string;entity:ArticleEntity;parent:string;org:string;title:string;file_name:string;sha256:string;size_bytes:number;blob:Blob};
export async function uploadArticle(a:ArticleAttempt,signal:AbortSignal,current:()=>boolean){
 const guard=()=>{if(signal.aborted||!current())throw Error('Contexto encerrado. Reabra a ficha.');};guard();
 const args={p_entity:a.entity,p_parent:a.parent,p_id:a.id};
 const prepared=parseArticle(await rpc('tenant_catalog_article_prepare_v1',{...args,p_title:a.title,p_file_name:a.file_name,p_sha256:a.sha256,p_size:a.size_bytes},signal),a.entity,a.parent,a.org);guard();
 if(prepared.id!==a.id)throw Error('Reserva fora da tentativa.');
 if(prepared.status!=='ready'){await articleBytes('upload',a.entity,a.parent,a.id,signal,a.blob);guard();}
 const done=parseArticle(await rpc('tenant_catalog_article_commit_v1',args,signal),a.entity,a.parent,a.org);guard();
 if(done.id!==a.id||done.status!=='ready')throw Error('Artigo não confirmado.');return done;
}
