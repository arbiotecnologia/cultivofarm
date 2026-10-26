import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useScopedPortalQuery } from "./useScopedPortalQuery";
import { useStorageAccessScope } from "./useStorageAccessScope";

export interface PartnerOrderAdmin {
  id: string;
  numero: string;
  partner_id: string;
  cliente_id: string | null;
  origin_simulation_id: string | null;
  status: string;
  subtotal: number;
  desconto_total: number;
  total: number;
  observacoes: string | null;

  commercial_notes: string | null;
  approval_notes: string | null;
  requested_delivery_date: string | null;
  estimated_delivery_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  ready_for_production: boolean;
  created_at: string;
  updated_at?: string;
  c2_external_origin_snapshot?: unknown;
  itens_pendentes_motivo?: string | null;
  itens_pendentes_solicitado_em?: string | null;
  itens_pendentes_solicitado_por?: string | null;
  itens_pendentes_resolvido_em?: string | null;
  partner_accounts?: { razao_social: string; nome_fantasia: string | null } | null;
}

export interface AdminFilters {
  status?: string;
  partnerId?: string;
  startDate?: string;
  endDate?: string;
}

export const PARTNER_ORDERS_ADMIN_KEY = "partner-orders-admin";

/**
 * Lista administrativa de pedidos B2B. Cache e respostas são cercados pelo escopo
 * canônico (identidade/tenant/papéis/época) via useScopedPortalQuery; respostas de
 * outro escopo nunca são adotadas. RLS continua sendo a autoridade.
 */
export function usePartnerOrdersAdmin(filters: AdminFilters = {}) {
  const qc = useQueryClient();
  const actor = useStorageAccessScope("partner-orders-admin-actor");
  const normalized = {
    status: filters.status ?? null,
    partnerId: filters.partnerId ?? null,
    startDate: filters.startDate ?? null,
    endDate: filters.endDate ?? null,
  };

  const result = useScopedPortalQuery<PartnerOrderAdmin[]>({
    queryKey: [PARTNER_ORDERS_ADMIN_KEY, normalized],
    queryFn: async (signal) => {
      let q = supabase
        .from("partner_orders")
        .select("*, partner_accounts:partner_id(razao_social, nome_fantasia)")
        .order("created_at", { ascending: false })
        .abortSignal(signal);
      if (normalized.status) q = q.eq("status", normalized.status as any);
      if (normalized.partnerId) q = q.eq("partner_id", normalized.partnerId);
      if (normalized.startDate) q = q.gte("created_at", normalized.startDate);
      if (normalized.endDate) q = q.lte("created_at", normalized.endDate);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
  }, { request: useStorageAccessScope(`partner-orders-admin:${JSON.stringify(normalized)}`), actor });

  // Realtime só com escopo pronto; canal único por escopo; invalida apenas as chaves deste ator.
  const actorScope = useRef(actor.scope);
  actorScope.current = actor.scope;
  const ready = actor.ready;
  useEffect(() => {
    if (!ready) return;
    const scopeAtSubscribe = actor.scope;
    const channel = supabase
      .channel(`partner-orders-admin-rt-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_orders" }, () => {
        if (actorScope.current !== scopeAtSubscribe) return;
        void qc.invalidateQueries({
          predicate: (query) => query.queryKey[0] === PARTNER_ORDERS_ADMIN_KEY && query.queryKey.at(-2) === scopeAtSubscribe,
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, ready, actor.scope]);

  return result;
}
