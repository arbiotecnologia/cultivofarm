import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { INTERNAL_ORDER_ENTRY_RPC, readInternalOrderEntryCapability, type InternalOrderEntryState } from "@/lib/comercial/internalOrderEntry";

/** Leitura única do contrato; não chama catálogo, simulação ou pedido. */
export function useInternalOrderEntry() {
  const { profile } = useAuth();
  const orgId = profile?.organization_id ?? null;
  return useScopedPortalQuery<InternalOrderEntryState>({
    queryKey: ["comercial-internal-order-entry", orgId],
    enabled: !!orgId,
    queryFn: async (signal) => {
      const rpc = supabase.rpc as unknown as (n: string) => { abortSignal: (s: AbortSignal) => Promise<{ data: unknown; error: { code?: string } | null }> };
      const { data, error } = await rpc.call(supabase, INTERNAL_ORDER_ENTRY_RPC).abortSignal(signal);
      if (error) return { state: "blocked", reason: error.code === "PGRST202" || error.code === "42883" ? "contract_not_installed" : "unavailable" };
      return readInternalOrderEntryCapability(data, orgId);
    },
  });
}
