import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

const ordersSchema = z.object({
  partner_id: z.string().uuid(),
  orders: z.array(z.object({
    id: z.string().uuid(), numero: z.string(), status: z.string(),
    created_at: z.string().datetime({ offset: true }),
  }).strict()).max(100),
}).strict();

export interface OwnCommercialOrder {
  id: string;
  numero: string;
  status: string;
  created_at: string;
}

/** Explicit required output after validation, including projects without strictNullChecks. */
export function parseOwnCommercialOrders(data: unknown, partnerId: string): OwnCommercialOrder[] {
  const parsed = ordersSchema.safeParse(data);
  if (!parsed.success || parsed.data.partner_id !== partnerId) throw new Error("commercial_orders_unavailable");
  return parsed.data.orders.map(row => {
    if (typeof row.id !== "string" || typeof row.numero !== "string" || typeof row.status !== "string" || typeof row.created_at !== "string") {
      throw new Error("commercial_orders_unavailable");
    }
    return { id: row.id, numero: row.numero, status: row.status, created_at: row.created_at };
  });
}

export function useMyCommercialOrders(partnerId: string | null) {
  const { roles } = useAuth();
  const fence = useStorageAccessScope(`commercial-orders:${partnerId ?? "closed"}`);
  const client = useQueryClient();
  const ready = fence.ready && !!partnerId && roles.length === 1 && roles[0] === "parceiro_b2b";
  useEffect(() => {
    const predicate = (q: { queryKey: readonly unknown[] }) => q.queryKey[0] === "commercial-own-orders" && q.queryKey[1] !== fence.scope;
    void client.cancelQueries({ predicate });
    client.removeQueries({ predicate });
  }, [client, fence.scope]);
  const result = useQuery({
    queryKey: ["commercial-own-orders", fence.scope], enabled: ready, retry: false,
    queryFn: async ({ signal }) => {
      const current = fence.capture();
      const check = () => { if (!current() || signal.aborted) throw new Error("commercial_orders_context_changed"); };
      check();
      const rpc = supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: unknown }>;
      const { data, error } = await rpc.call(supabase, "get_my_commercial_orders_projection");
      check();
      if (error) throw new Error("commercial_orders_unavailable");
      return parseOwnCommercialOrders(data, partnerId);
    },
  });
  return { ...result, data: ready ? result.data : undefined, ready };
}