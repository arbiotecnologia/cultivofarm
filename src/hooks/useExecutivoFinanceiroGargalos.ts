import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";

export interface FinanceiroGargalo {
  tipo: string;
  titulo: string;
  descricao: string;
  gravidade: string;
  valor: number | null;
  cliente: string | null;
  fazenda: string | null;
  dias_atraso: number;
  referencia_tabela: string;
  referencia_id: string;
  acao_recomendada: string;
}

export function useExecutivoFinanceiroGargalos(filtros: ExecutivoFiltros, limit = 10) {
  return useQuery({
    queryKey: ["executivo-financeiro-gargalos", filtros, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_financeiro_gargalos" as any, {
        p_filtros: filtros as any,
        p_limit: limit,
      });
      if (error) throw error;
      const payload = data as any;
      return (payload?.gargalos ?? []) as FinanceiroGargalo[];
    },
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
}
