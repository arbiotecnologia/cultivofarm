import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";

export interface RankingClienteItem {
  cliente_id: string;
  cliente_nome: string;
  fazendas_total: number;
  solicitacoes: number;
  visitas: number;
  recomendacoes: number;
  os_total: number;
  entregas_total: number;
  entregas_nao_faturadas: number;
  valor_a_receber: number;
  valor_vencido: number;
  valor_recebido_periodo: number;
  alertas_criticos: number;
  score_cliente: number;
  classificacao: "saudavel" | "atencao" | "critico";
}

export interface RankingFazendaItem {
  fazenda_id: string;
  fazenda_nome: string;
  cliente_nome: string;
  visitas: number;
  recomendacoes: number;
  os_total: number;
  entregas_total: number;
  entregas_pendentes: number;
  entregas_sem_comprovante: number;
  entregas_nao_faturadas: number;
  alertas_criticos: number;
  score_fazenda: number;
  classificacao: "saudavel" | "atencao" | "critico";
}

export interface ClientesRanking {
  ranking_clientes: RankingClienteItem[];
  ranking_fazendas: RankingFazendaItem[];
  gerado_em: string;
}

export function useExecutivoClientesRanking(filtros: ExecutivoFiltros, limit = 10) {
  return useQuery({
    queryKey: ["executivo-clientes-ranking", filtros, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_clientes_ranking" as any, {
        p_filtros: filtros as any,
        p_limit: limit,
      });
      if (error) throw error;
      return data as unknown as ClientesRanking;
    },
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
}
