import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import {
  COMMERCIAL_OWNER_ORDERS_RPC,
  readCommercialOwnerOrders,
  type CommercialOwnerOrdersState,
} from "@/lib/comercial/commercialOwnerOrders";

export interface CommercialOwnerOrdersFilters {
  status?: string | null;
  partnerId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Leitura canônica somente leitura da carteira do commercial owner.
 * Nunca cai em leitura direta de tabela nem deriva escopo de URL; quando o
 * contrato não está instalado ou o ator não é admin/gestor_comercial interno,
 * devolve bloqueio estruturado (a UI fica quieta, sem promessa).
 */
export function useCommercialOwnerOrders(filters: CommercialOwnerOrdersFilters = {}) {
  const { profile, roles = [] } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const canAttempt = roles.some((r) => r === "administrador" || r === "gestor_comercial");
  const normalized = {
    status: filters.status ?? null,
    partnerId: filters.partnerId ?? null,
    startDate: filters.startDate ?? null,
    endDate: filters.endDate ?? null,
  };
  return useScopedPortalQuery<CommercialOwnerOrdersState>({
    queryKey: ["commercial-owner-orders", normalized],
    enabled: !!orgId && canAttempt,
    queryFn: async (signal) => {
      const rpc = supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => { abortSignal: (s: AbortSignal) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }> };
      const { data, error } = await rpc.call(supabase, COMMERCIAL_OWNER_ORDERS_RPC, {
        p_status: normalized.status,
        p_partner_id: normalized.partnerId,
        p_start: normalized.startDate,
        p_end: normalized.endDate,
      }).abortSignal(signal);
      if (error) {
        if (error.code === "PGRST202" || error.code === "42883") return { state: "blocked", reason: "contract_not_installed" };
        if (error.code === "42501") return { state: "blocked", reason: "actor_not_allowed" };
        return { state: "blocked", reason: "unavailable" };
      }
      return readCommercialOwnerOrders(data, orgId);
    },
  });
}
