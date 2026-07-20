import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";

export function useExecutivoAlertasPrioridades(filtros: ExecutivoFiltros, limit = 15) {
  return useQuery({
    queryKey: ["executivo-alertas-prioridades", filtros, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_alertas_prioridades" as any, {
        p_filtros: filtros as any,
        p_limit: limit,
      });
      if (error) throw error;
      return (data as any)?.prioridades ?? [];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
