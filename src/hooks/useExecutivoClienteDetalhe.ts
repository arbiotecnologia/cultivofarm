import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";

export function useExecutivoClienteDetalhe(clienteId: string | null, filtros: ExecutivoFiltros) {
  return useQuery({
    queryKey: ["executivo-cliente-detalhe", clienteId, filtros],
    enabled: !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_cliente_detalhe" as any, {
        p_cliente_id: clienteId,
        p_filtros: filtros as any,
      });
      if (error) throw error;
      return data as any;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useExecutivoFazendaDetalhe(fazendaId: string | null, filtros: ExecutivoFiltros) {
  return useQuery({
    queryKey: ["executivo-fazenda-detalhe", fazendaId, filtros],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_fazenda_detalhe" as any, {
        p_fazenda_id: fazendaId,
        p_filtros: filtros as any,
      });
      if (error) throw error;
      return data as any;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
