import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ExecutivoRelatorioDetalhe {
  id: string;
  titulo: string;
  tipo: string;
  status: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  filtros: any;
  resumo: any;
  indicadores: any;
  gargalos: any[];
  plano_acao: any[];
  ranking_clientes: any[];
  ranking_fazendas: any[];
  alertas: any[];
  gerado_por: string | null;
  gerado_em: string;
  atualizado_em: string;
  observacoes: string | null;
  hash_conteudo: string | null;
  versao: number;
  ativo: boolean;
}

export function useExecutivoRelatorioDetalhe(relatorioId: string | null) {
  return useQuery({
    queryKey: ["executivo-relatorio-detalhe", relatorioId],
    queryFn: async () => {
      if (!relatorioId) return null;
      const { data, error } = await supabase.rpc(
        "rpc_executivo_obter_relatorio" as any,
        { p_relatorio_id: relatorioId }
      );
      if (error) throw error;
      return data as unknown as ExecutivoRelatorioDetalhe;
    },
    enabled: !!relatorioId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
