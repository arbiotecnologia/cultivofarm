import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExecutivoFiltros {
  periodo?: "hoje" | "7_dias" | "15_dias" | "30_dias" | "safra_atual" | "personalizado";
  data_inicio?: string;
  data_fim?: string;
  cliente_id?: string;
  fazenda_id?: string;
  consultor_id?: string;
  status_operacional?: string;
}

export interface ResumoGeral {
  periodo: { data_inicio: string; data_fim: string; periodo: string };
  resumo: Record<string, number>;
  saude_operacional: { score: number; classificacao: string; motivos: string[] };
  dados_indisponiveis: string[];
  gerado_em: string;
}

export function useExecutivoResumo(filtros: ExecutivoFiltros) {
  return useQuery({
    queryKey: ["executivo-resumo", filtros],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_resumo_geral" as any, {
        p_filtros: filtros as any,
      });
      if (error) throw error;
      return data as unknown as ResumoGeral;
    },
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
}
