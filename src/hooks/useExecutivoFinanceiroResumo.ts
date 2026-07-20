import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";

export interface FinanceiroResumo {
  periodo: { data_inicio: string; data_fim: string; periodo: string };
  receitas: {
    total_a_receber: number;
    total_recebido: number;
    total_vencido: number;
    total_a_vencer: number;
    quantidade_titulos_abertos: number;
    quantidade_parcelas_vencidas: number;
  };
  despesas: {
    total_a_pagar: number;
    total_pago: number;
    total_vencido: number;
    total_a_vencer: number;
    quantidade_titulos_abertos: number;
    quantidade_parcelas_vencidas: number;
  };
  faturamento: {
    entregas_nao_faturadas: number;
    valor_estimado_nao_faturado: number;
    entregas_faturadas: number;
    valor_faturado_entregas: number;
    fiscal_pendente: number;
    recibos_pendentes: number;
  };
  risco_financeiro: { score: number; classificacao: string; motivos: string[] };
  dados_indisponiveis: string[];
  gerado_em: string;
}

export function useExecutivoFinanceiroResumo(filtros: ExecutivoFiltros) {
  return useQuery({
    queryKey: ["executivo-financeiro-resumo", filtros],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_financeiro_resumo" as any, {
        p_filtros: filtros as any,
      });
      if (error) throw error;
      return data as unknown as FinanceiroResumo;
    },
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
}
