import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";

export function useExecutivoResponsaveisPendencias(filtros: ExecutivoFiltros, limit = 10) {
  return useQuery({
    queryKey: ["executivo-responsaveis-pend", filtros, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_responsaveis_pendencias" as any, {
        p_filtros: filtros as any,
        p_limit: limit,
      });
      if (error) throw error;
      const d = data as any;
      return {
        responsaveis: d?.responsaveis ?? [],
        escopo: d?.escopo ?? "alertas_operacionais",
        observacao: d?.observacao ?? null,
      };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
