import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useScopedPortalQuery } from './useScopedPortalQuery';
import { useTenantCatalogEditor } from './useTenantCatalogEditor';
const schema=z.object({actor_id:z.string().uuid(),organization_id:z.string().uuid(),targets:z.boolean(),ai:z.boolean()}).strict();
export function useCatalogAuthoring(){
 const editor=useTenantCatalogEditor();
 const query=useScopedPortalQuery({queryKey:['catalog-authoring-v2'],enabled:editor.canEdit,staleTime:0,queryFn:async()=>{
  const {data,error}=await (supabase.rpc.bind(supabase) as any)('tenant_catalog_authoring_capability_v2',{});
  if(error)throw new Error('Edição assistida indisponível neste ambiente.');return schema.parse(data);
 }});
 const ready=editor.canEdit&&query.isSuccess&&!query.isFetching&&!query.isError;
 return {editor,query,targets:ready&&query.data?.targets===true,ai:ready&&query.data?.ai===true};
}
