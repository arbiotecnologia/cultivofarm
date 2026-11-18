// Production candidate. Explicit binding; deploy only after release approval.
import { createClient } from 'npm:@supabase/supabase-js@2.110.8';
export function productionClient(bearer:string,signal:AbortSignal){
 const url=Deno.env.get('SUPABASE_URL');
 if(!url||url!=='https://swzpzcwiasxmjutrmvkm.supabase.co')throw new Error('production_binding_required');
 const key=Deno.env.get('SUPABASE_ANON_KEY');if(!key)throw new Error('production_key_required');
 return createClient(url,key,{global:{headers:{Authorization:bearer},fetch:(input,init)=>fetch(input,{...init,signal})},auth:{persistSession:false,autoRefreshToken:false}});
}


