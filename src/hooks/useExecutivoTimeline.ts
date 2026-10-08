import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";
import { parseExecutivoOperationalPayload, useExecutivoOperationalScope } from "./useExecutivoOperationalScope";

export interface TimelineEvento {
  tipo: string;
  descricao: string;
  data_evento: string;
  modulo: string;
  referencia_id: string;
}

export function useExecutivoTimeline(filtros: ExecutivoFiltros, limit = 20) {
  const scope = useExecutivoOperationalScope();
  const query = useQuery({
    queryKey: ["executivo-timeline", ...scope.key, filtros, limit],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_timeline_operacional", {
        p_filtros: { ...filtros },
        p_limit: limit,
      });
      if (error) throw error;
      return parseExecutivoOperationalPayload<TimelineEvento>(data, "eventos");
    },
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
  return { ...query, data: scope.ready ? query.data : undefined };
}
