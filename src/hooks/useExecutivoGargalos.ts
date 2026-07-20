import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";

export interface Gargalo {
  tipo: string;
  titulo: string;
  descricao: string;
  gravidade: "alta" | "media" | "baixa" | string;
  referencia_id: string;
  referencia_tabela: string;
  cliente: string | null;
  fazenda: string | null;
  dias_em_aberto: number;
  acao_recomendada: string;
}

export function useExecutivoGargalos(filtros: ExecutivoFiltros, limit = 10) {
  return useQuery({
    queryKey: ["executivo-gargalos", filtros, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_gargalos" as any, {
        p_filtros: filtros as any,
        p_limit: limit,
      });
      if (error) throw error;
      const payload = data as any;
      return (payload?.gargalos ?? []) as Gargalo[];
    },
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
}
