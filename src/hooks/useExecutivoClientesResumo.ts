import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ExecutivoFiltros } from "./useExecutivoResumo";

export interface ClientesResumo {
  periodo: { data_inicio: string; data_fim: string; periodo: string };
  resumo: {
    total_clientes_ativos: number;
    total_fazendas_ativas: number;
    clientes_com_pendencia_operacional: number;
    clientes_com_pendencia_financeira: number;
    clientes_com_entrega_pendente: number;
    clientes_com_entrega_sem_comprovante: number;
    clientes_com_entrega_nao_faturada: number;
    fazendas_com_visita_recente: number;
    fazendas_sem_visita_no_periodo: number;
    clientes_com_alerta_critico: number;
    oportunidades_identificadas: number;
  };
  saude_carteira: { score: number; classificacao: string; motivos: string[] };
  dados_indisponiveis: string[];
  gerado_em: string;
}

export function useExecutivoClientesResumo(filtros: ExecutivoFiltros) {
  return useQuery({
    queryKey: ["executivo-clientes-resumo", filtros],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_executivo_clientes_resumo" as any, {
        p_filtros: filtros as any,
      });
      if (error) throw error;
      return data as unknown as ClientesResumo;
    },
    staleTime: 45_000,
    refetchOnWindowFocus: false,
  });
}
