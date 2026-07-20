import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";

export interface RankingCliente {
  cliente_id: string;
  cliente: string;
  valor_a_receber: number;
  valor_vencido: number;
  titulos_abertos: number;
  entregas_nao_faturadas: number;
  entregas_sem_comprovante: number;
}

export function useExecutivoFinanceiroRanking(filtros: ExecutivoFiltros, limit = 10) {
  return useQuery({
    queryKey: ["executivo-financeiro-ranking", filtros, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_financeiro_ranking_clientes" as any, {
        p_filtros: filtros as any,
        p_limit: limit,
      });
      if (error) throw error;
      const payload = data as any;
      return (payload?.ranking ?? []) as RankingCliente[];
    },
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
}
