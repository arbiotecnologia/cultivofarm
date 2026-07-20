import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PartnerOrder {
  id: string;
  numero: string;
  partner_id: string;
  status: string;
  subtotal: number;
  desconto_total: number;
  total: number;
  observacoes: string | null;
  
  approval_notes: string | null;
  requested_delivery_date: string | null;
  estimated_delivery_date: string | null;
  ready_for_production: boolean;
  created_at: string;
}

export function usePartnerOrders(partnerId: string | null | undefined, status?: string) {
  return useQuery({
    queryKey: ["partner-orders", partnerId, status],
    enabled: !!partnerId,
    queryFn: async (): Promise<PartnerOrder[]> => {
      let q = supabase
        .from("partner_orders")
        .select("*")
        .eq("partner_id", partnerId!)
        .order("created_at", { ascending: false });
      if (status) q = q.eq("status", status as any);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PartnerOrder[];
    },
  });
}

export function usePartnerOrderItems(orderId: string | null | undefined) {
  return useQuery({
    queryKey: ["partner-order-items", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_order_items")
        .select(`
          *,
          produtos:product_id (
            nome, codigo, tipo, funcao_completa, modo_acao, modo_aplicacao, dose_ml_ha,
            formulacoes:formulacoes!produto_id (
              proporcao, volume_ml, concentracao, unidade,
              microrganismos:microrganismo_id (nome, concentracao_label)
            )
          ),
          microrganismos:microrganismo_id (nome, codigo, tipo, nome_cientifico, concentracao_label, funcao_agronomica, dose_ml_ha)
        `)
        .eq("order_id", orderId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}
