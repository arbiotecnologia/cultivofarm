import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useB2BSlaConfigMap } from "./useB2BSlaConfig";
import { computeSlaBadge, type SlaBadgeInfo } from "@/lib/b2bSla";

/**
 * Para uma lista de partner_order_ids, devolve um Map<orderId, SlaBadgeInfo>.
 * Busca o planning mais recente de cada pedido e calcula a fase atual + atraso.
 */
export function useOrdersSlaMap(orderIds: string[]) {
  const { map: configMap } = useB2BSlaConfigMap();
  const key = [...new Set(orderIds)].filter(Boolean).sort();

  return useQuery({
    queryKey: ["b2b-sla-map", key, configMap],
    enabled: key.length > 0 && Object.keys(configMap).length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, SlaBadgeInfo>> => {
      const { data, error } = await (supabase as any)
        .from("production_planning")
        .select("partner_order_id, status, updated_at")
        .in("partner_order_id", key as any);
      if (error) throw error;
      const result = new Map<string, SlaBadgeInfo>();
      for (const r of (data ?? []) as any[]) {
        const info = computeSlaBadge(r.status, r.updated_at, configMap);
        if (info) result.set(r.partner_order_id, info);
      }
      return result;
    },
  });
}
