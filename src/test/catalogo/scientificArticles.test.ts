import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob } from 'node:buffer';
import { beforeEach,expect,it,vi } from 'vitest';
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:vi.fn(),functions:{invoke:vi.fn()}}}));
import { parseArticle,verifyArticle,uploadArticle,type ArticleAttempt } from '@/lib/catalogo/scientificArticles';
import { supabase } from '@/integrations/supabase/client';
const id='00000000-0000-4000-8000-000000000001',parent='00000000-0000-4000-8000-000000000002',org='00000000-0000-4000-8000-000000000003';
const row={id,parent_id:parent,organization_id:org,entity:'microrganismo',title:'Estudo',file_name:'artigo.pdf',sha256:'a'.repeat(64),size_bytes:20,status:'pending',created_at:'2026-11-19T00:00:00Z',received_at:null};
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('Blob',NodeBlob);});
it('recusa artigo retornado para outra empresa ou ficha',()=>{
 expect(()=>parseArticle({...row,organization_id:parent},'microrganismo',parent,org)).toThrow();
 expect(()=>parseArticle({...row,parent_id:id},'microrganismo',parent,org)).toThrow();
 expect(()=>parseArticle({...row,entity:'produto'},'microrganismo',parent,org)).toThrow();
});
it('recusa extensão MIME falsa, arquivo vazio ou acima do limite',async()=>{
 await expect(verifyArticle(new Blob(['not a PDF file at all'],{type:'application/pdf'}))).rejects.toThrow();
 await expect(verifyArticle(new Blob([]))).rejects.toThrow();
 await expect(verifyArticle(new Blob([new Uint8Array(10485761)]))).rejects.toThrow();
});
it('confere hash e tamanho antes da leitura',async()=>{
 const blob=new Blob(['%PDF-1.4 fixture %%EOF'],{type:'application/pdf'});
 const result=await verifyArticle(blob);expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
 await expect(verifyArticle(blob,{...row,status:'ready'} as never)).rejects.toThrow('Integridade');
});
const attempt=():ArticleAttempt=>({id,parent,org,entity:'microrganismo',title:'Estudo',file_name:'artigo.pdf',sha256:row.sha256,size_bytes:20,blob:new Blob(['%PDF-1.4 fixture %%EOF'])});
it('não envia bytes depois da revogação de contexto durante a reserva',async()=>{
 let valid=true;vi.mocked(supabase.rpc).mockReturnValue({abortSignal:async()=>{valid=false;return {data:row,error:null};}} as never);
 await expect(uploadArticle(attempt(),new AbortController().signal,()=>valid)).rejects.toThrow('Contexto');expect(supabase.functions.invoke).not.toHaveBeenCalled();
});
it('reconcilia reserva já recebida sem reenviar PDF',async()=>{
 vi.mocked(supabase.rpc).mockReturnValue({abortSignal:async()=>({data:{...row,status:'ready'},error:null})} as never);
 const result=await uploadArticle(attempt(),new AbortController().signal,()=>true);expect(result.status).toBe('ready');expect(supabase.functions.invoke).not.toHaveBeenCalled();expect(supabase.rpc).toHaveBeenCalledTimes(2);
});
it('recusa reserva com identificador divergente sem enviar bytes',async()=>{
 vi.mocked(supabase.rpc).mockReturnValue({abortSignal:async()=>({data:{...row,id:org},error:null})} as never);
 await expect(uploadArticle(attempt(),new AbortController().signal,()=>true)).rejects.toThrow('Reserva');expect(supabase.functions.invoke).not.toHaveBeenCalled();
});
