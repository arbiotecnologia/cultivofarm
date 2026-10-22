import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { parseOwnFinance } from "@/lib/comercial/financeContract";
import { ownFinanceActorAllowed } from "@/lib/comercial/financeAccess";
export function useOwnFinance(partnerId:string, cursor?:{at:string;id:string}, capability = false) {
  const {roles}=useAuth();
  const allowed = ownFinanceActorAllowed(roles, capability);
  const query=useScopedPortalQuery({
    queryKey:["portal-own-obligations","C2_OWN_OBLIGATIONS_V1",partnerId,cursor ?? null],
    enabled:allowed && !!partnerId,
    queryFn:async signal=>{
      const rpc: (name:string,args:Record<string,unknown>)=>{abortSignal(signal:AbortSignal):PromiseLike<{data:unknown;error:unknown}>}=supabase.rpc.bind(supabase);
      const {data,error}=await rpc("rpc_portal_partner_financial",{
        p_partner_id:partnerId,p_own_finance_v1:true,p_before:cursor?.at ?? null,p_before_id:cursor?.id ?? null,
      }).abortSignal(signal);
      if(error) throw new Error("own_finance_unavailable");
      return parseOwnFinance(data,partnerId);
    },
  });
  return {...query,data:allowed && query.ready && !query.isError ? query.data : undefined};
}