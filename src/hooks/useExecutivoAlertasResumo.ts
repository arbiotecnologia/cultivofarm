import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";

export function useExecutivoAlertasResumo(filtros: ExecutivoFiltros) {
  return useQuery({
    queryKey: ["executivo-alertas-resumo", filtros],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_alertas_resumo" as any, { p_filtros: filtros as any });
      if (error) throw error;
      return data as any;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
