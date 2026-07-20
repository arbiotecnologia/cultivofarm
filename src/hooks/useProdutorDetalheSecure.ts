import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProdutorDetalheHeader {
  id: string;
  numero?: string;
  titulo?: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
  requested_delivery_date?: string | null;
  estimated_delivery_date?: string | null;
  approved_at?: string | null;
  partner_id: string;
  partner_nome: string | null;
  total?: number;
  total_cheio?: number;
  origin_simulation_id?: string | null;
  converted_order_id?: string | null;
  cultura: string | null;
  area_total_ha: number | null;
  objetivo_tecnico?: string | null;
}
export interface ProdutorDetalheItem {
  id: string;
  nome: string | null;
  codigo?: string | null;
  item_tipo?: string | null;
  quantidade: number;
  unidade_medida?: string | null;
  preco_unitario?: number | null;
  valor_unitario_cheio?: number | null;
  subtotal: number;
}
export interface ProdutorDetalhePayload {
  header: ProdutorDetalheHeader;
  items: ProdutorDetalheItem[];
}

export function useProdutorPedidoDetalhe(orderId: string | null | undefined) {
  return useQuery({
    queryKey: ["produtor-pedido-detalhe", orderId],
    enabled: !!orderId,
    queryFn: async (): Promise<ProdutorDetalhePayload> => {
      const { data, error } = await (supabase as any).rpc(
        "get_portal_cliente_b2b_order_detail_secure",
        { p_order_id: orderId! },
      );
      if (error) throw error;
      return data as ProdutorDetalhePayload;
    },
  });
}

export function useProdutorSimulacaoDetalhe(simulationId: string | null | undefined) {
  return useQuery({
    queryKey: ["produtor-simulacao-detalhe", simulationId],
    enabled: !!simulationId,
    queryFn: async (): Promise<ProdutorDetalhePayload> => {
      const { data, error } = await (supabase as any).rpc(
        "get_portal_cliente_b2b_simulation_detail_secure",
        { p_simulation_id: simulationId! },
      );
      if (error) throw error;
      return data as ProdutorDetalhePayload;
    },
  });
}
