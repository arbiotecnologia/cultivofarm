import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a map of orderId → count of messages NOT authored by the partner
 * that are still unread (status='nao_lida' or 'lida' awaiting partner reply).
 * For the partner portal we count only messages from staff that the partner
 * hasn't acknowledged — i.e. autor_tipo != 'parceiro' AND status='nao_lida'.
 */
export function useUnreadCountsByOrder(orderIds: string[]) {
  return useQuery({
    queryKey: ["partner-unread-msgs", orderIds.slice().sort().join(",")],
    enabled: orderIds.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from("partner_order_messages" as any)
        .select("order_id, autor_tipo, status")
        .in("order_id", orderIds)
        .eq("status", "nao_lida");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) {
        if (r.autor_tipo === "parceiro") continue;
        counts[r.order_id] = (counts[r.order_id] ?? 0) + 1;
      }
      return counts;
    },
    refetchInterval: 30_000,
  });
}
