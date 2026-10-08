import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";
import { parseExecutivoOperationalPayload, useExecutivoOperationalScope } from "./useExecutivoOperationalScope";

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
  const scope = useExecutivoOperationalScope();
  const query = useQuery({
    queryKey: ["executivo-gargalos", ...scope.key, filtros, limit],
    enabled: scope.ready,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_gargalos", {
        p_filtros: { ...filtros },
        p_limit: limit,
      });
      if (error) throw error;
      return parseExecutivoOperationalPayload<Gargalo>(data, "gargalos");
    },
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
  return { ...query, data: scope.ready ? query.data : undefined };
}
