import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";


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

export function usePartnerOrdersAdmin(filters: AdminFilters = {}) {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("partner-orders-admin-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "partner_orders" },
        () => {
          qc.invalidateQueries({ queryKey: ["partner-orders-admin"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  return useQuery({
    queryKey: ["partner-orders-admin", filters],
    queryFn: async (): Promise<PartnerOrderAdmin[]> => {
      let q = supabase
        .from("partner_orders")
        .select("*, partner_accounts:partner_id(razao_social, nome_fantasia)")
        .order("created_at", { ascending: false });

      if (filters.status) q = q.eq("status", filters.status as any);
      if (filters.partnerId) q = q.eq("partner_id", filters.partnerId);
      if (filters.startDate) q = q.gte("created_at", filters.startDate);
      if (filters.endDate) q = q.lte("created_at", filters.endDate);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

