import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { useStorageAccessScope } from "./useStorageAccessScope";
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

export const COMMERCIAL_OWNER_ORDERS_KEY = "commercial-owner-orders";

/**
 * Leitura canônica somente leitura da carteira do commercial owner.
 * Nunca cai em leitura direta de tabela nem deriva escopo de URL; quando o
 * contrato não está instalado ou o ator não é admin/gestor_comercial interno,
 * devolve bloqueio estruturado (a UI fica quieta, sem promessa).
 *
 * Atualização: MANUAL, via refetch explícito (botão "Atualizar" na seção).
 * Não há assinatura realtime: postgres_changes em partner_orders respeita RLS
 * e a política restritiva nega SELECT da linha ao commercial owner, portanto
 * o canal jamais entregaria eventos deste ator (e duplicaria a assinatura do
 * canal administrativo). Atualização automática permanece NÃO homologada e
 * pendente de decisão futura — sem ampliar RLS por causa disso.
 * Erro de transporte é propagado como erro (nunca confundido com carteira
 * vazia). Sem polling e sem reload de página.
 */
export function useCommercialOwnerOrders(filters: CommercialOwnerOrdersFilters = {}) {
  const { profile, roles = [] } = useAuth();
  const orgId = profile?.organization_id ?? null;
  const canAttempt = roles.some((r) => r === "administrador" || r === "gestor_comercial");
  const actor = useStorageAccessScope("commercial-owner-orders-actor");
  const normalized = {
    status: filters.status ?? null,
    partnerId: filters.partnerId ?? null,
    startDate: filters.startDate ?? null,
    endDate: filters.endDate ?? null,
  };
  return useScopedPortalQuery<CommercialOwnerOrdersState>({
    queryKey: [COMMERCIAL_OWNER_ORDERS_KEY, normalized],
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
  }, { request: useStorageAccessScope(`commercial-owner-orders:${JSON.stringify(normalized)}`), actor });
}
