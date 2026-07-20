import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExecutivoRelatorioListItem {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  gerado_por: string | null;
  gerado_por_nome: string | null;
  gerado_em: string;
  observacoes: string | null;
  versao: number;
  ativo: boolean;
}

export interface ListarRelatoriosFiltros {
  tipo?: string;
  status?: string;
  data_inicio?: string;
  data_fim?: string;
  gerado_por?: string;
  texto?: string;
  ativo?: boolean;
}

export function useExecutivoRelatorios(filtros: ListarRelatoriosFiltros) {
  return useQuery({
    queryKey: ["executivo-relatorios", filtros],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "rpc_executivo_listar_relatorios" as any,
        { p_filtros: filtros as any }
      );
      if (error) throw error;
      return (data ?? []) as unknown as ExecutivoRelatorioListItem[];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
