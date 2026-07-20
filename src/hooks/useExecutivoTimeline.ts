import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";

export interface TimelineEvento {
  tipo: string;
  descricao: string;
  data_evento: string;
  modulo: string;
  referencia_id: string;
}

export function useExecutivoTimeline(filtros: ExecutivoFiltros, limit = 20) {
  return useQuery({
    queryKey: ["executivo-timeline", filtros, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_timeline_operacional" as any, {
        p_filtros: filtros as any,
        p_limit: limit,
      });
      if (error) throw error;
      const payload = data as any;
      return (payload?.eventos ?? []) as TimelineEvento[];
    },
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
}
