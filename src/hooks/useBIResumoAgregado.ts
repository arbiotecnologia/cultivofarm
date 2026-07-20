import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BIFiltros } from "@/hooks/useBIOperacional";

/**
 * KPIs agregados servidor-side (não baixa linhas — retorna apenas contadores/somas).
 * Substitui o cálculo em memória sobre até 1000 linhas de vw_esteira_laboratorio
 * e vw_fluxo_visita_tecnica quando a tela só precisa dos indicadores do topo.
 *
 * Segurança: RPC valida perfil via can_view_bi_operacional; consultor/técnico
 * recebe apenas seus próprios dados; cliente/produtor/parceiro recebe zeros.
 */

export interface BIResumoEsteira {
  total_os: number;
  os_abertas: number;
  os_finalizadas: number;
  os_atrasadas: number;
  aguardando_cq: number;
  cq_aprovado: number;
  cq_reprovado: number;
  envases_realizados: number;
  entregas_realizadas: number;
  entregas_confirmadas: number;
  pendencias_bloqueantes: number;
  pode_finalizar: number;
  volume_solicitado_l: number;
  tempo_medio_os_ate_entrega_h: number;
  tempo_medio_cq_ate_envase_h: number;
  por_status: Record<string, number> | null;
  por_origem: Record<string, number> | null;
  ok: boolean;
  reason?: string;
}

export interface BIResumoVisitas {
  total_visitas: number;
  solicitacoes_abertas: number;
  com_checkin: number;
  com_diagnostico: number;
  com_evidencias: number;
  com_recomendacao: number;
  convertidas_em_os: number;
  aprovadas: number;
  em_atraso: number;
  dias_medios_em_aberto: number;
  tempo_medio_solicitacao_ate_checkin_h: number;
  por_status_solicitacao: Record<string, number> | null;
  por_status_visita: Record<string, number> | null;
  por_consultor: Record<string, number> | null;
  ok: boolean;
  reason?: string;
}

export function useBIEsteiraResumo(filtros: BIFiltros) {
  return useQuery({
    queryKey: ["bi-esteira-resumo", filtros],
    queryFn: async (): Promise<BIResumoEsteira> => {
      const { data, error } = await supabase.rpc("rpc_bi_esteira_resumo" as any, {
        p_data_inicio: filtros.periodoInicio,
        p_data_fim: filtros.periodoFim,
        p_cliente_id: filtros.clienteId ?? null,
        p_fazenda_id: filtros.fazendaId ?? null,
        p_produto_id: filtros.produtoId ?? null,
        p_microrganismo_id: filtros.microrganismoId ?? null,
        p_origem_os: filtros.origemOs && filtros.origemOs !== "todas" ? filtros.origemOs : null,
        p_status: filtros.status_esteira_oficial ?? null,
      });
      if (error) throw error;
      return (data as unknown) as BIResumoEsteira;
    },
    staleTime: 2 * 60_000, // 2min
    refetchOnWindowFocus: false,
  });
}

export function useBIFluxoVisitasResumo(filtros: BIFiltros) {
  return useQuery({
    queryKey: ["bi-fluxo-visitas-resumo", filtros],
    queryFn: async (): Promise<BIResumoVisitas> => {
      const { data, error } = await supabase.rpc("rpc_bi_fluxo_visitas_resumo" as any, {
        p_data_inicio: filtros.periodoInicio,
        p_data_fim: filtros.periodoFim,
        p_cliente_id: filtros.clienteId ?? null,
        p_fazenda_id: filtros.fazendaId ?? null,
        p_consultor_id: filtros.consultorId ?? null,
        p_status_solicitacao: filtros.status_solicitacao ?? null,
        p_status_visita: filtros.status_visita ?? null,
      });
      if (error) throw error;
      return (data as unknown) as BIResumoVisitas;
    },
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });
}
