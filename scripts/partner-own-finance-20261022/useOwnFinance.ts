import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { parseOwnFinance } from "./financeContract";
export function useOwnFinance(partnerId:string, cursor?:{at:string;id:string}) {
  const {roles}=useAuth();
  const query=useScopedPortalQuery({
    queryKey:["portal-own-obligations","C2_OWN_OBLIGATIONS_V1",partnerId,cursor ?? null],
    enabled:roles.length===1 && roles[0]==="parceiro_b2b" && !!partnerId,
    queryFn:async signal=>{
      const {data,error}=await supabase.rpc("rpc_portal_partner_financial" as never,{
        p_partner_id:partnerId,p_own_finance_v1:true,p_before:cursor?.at ?? null,p_before_id:cursor?.id ?? null,
      } as never).abortSignal(signal);
      if(error) throw new Error("own_finance_unavailable");
      return parseOwnFinance(data,partnerId);
    },
  });
  return {...query,data:query.ready && !query.isError ? query.data : undefined};
}