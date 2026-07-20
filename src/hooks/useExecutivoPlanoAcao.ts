import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";

export function useExecutivoPlanoAcao(filtros: ExecutivoFiltros, limit = 20) {
  return useQuery({
    queryKey: ["executivo-plano-acao", filtros, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_plano_acao" as any, {
        p_filtros: filtros as any,
        p_limit: limit,
      });
      if (error) throw error;
      return (data as any)?.acoes ?? [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
