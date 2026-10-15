import { useQuery } from "@tanstack/react-query";
import { useCockpitQuery } from "@/hooks/useCockpitQuery";
import { useTechnicalQuerySession } from "@/hooks/useVisitaWorkspace";
import { supabase } from "@/integrations/supabase/client";

export interface MetricasLaboratorio {
  totalEmProducao: number;
  totalAguardandoCQ: number;
  totalEmEnvase: number;
  totalProntoEntrega: number;
  totalEntregue: number;
  totalAtrasado: number;
  volumeSolicitadoTotal: number;
  volumeSolicitadoAprovado: number;
  volumeSolicitadoEntregue: number;
  temposMedios: {
    osAteProgramacao: string | null;
    programacaoAteLote: string | null;
    loteAteCQ: string | null;
    cqAteEnvase: string | null;
    envaseAteEntrega: string | null;
    osAteEntrega: string | null;
  };
}

export interface MetricasVisitaTecnica {
  totalSolicitacoesAbertas: number;
  totalVisitasRealizadas: number;
  totalCheckinsRealizados: number;
  totalRecomendacoesEmitidas: number;
  totalRecomendacoesLiberadas: number;
  totalRecomendacoesConvertidasOS: number;
  taxaConversao: number;
  temposMedios: {
    solicitacaoAteCheckin: string | null;
    checkinAteFinalizacao: string | null;
    finalizacaoAteAprovacao: string | null;
    aprovacaoAteOS: string | null;
  };
}

export function useMetricasOperacionais(options: { visitas?: boolean } = {}) {
  const session = useTechnicalQuerySession("metricas-visita-tecnica");
  const laboratorio = useCockpitQuery({
    queryKey: ["metricas-laboratorio"],
    queryFn: async ({ signal }) => {
      const { data, error } = await (supabase as any)
        .from("vw_esteira_laboratorio")
        .select("*")
        .abortSignal(signal);
      
      if (error) throw error;

      const metricas: MetricasLaboratorio = {
        totalEmProducao: 0,
        totalAguardandoCQ: 0,
        totalEmEnvase: 0,
        totalProntoEntrega: 0,
        totalEntregue: 0,
        totalAtrasado: 0,
        volumeSolicitadoTotal: 0,
        volumeSolicitadoAprovado: 0,
        volumeSolicitadoEntregue: 0,
        temposMedios: {
          osAteProgramacao: null,
          programacaoAteLote: null,
          loteAteCQ: null,
          cqAteEnvase: null,
          envaseAteEntrega: null,
          osAteEntrega: null,
        }
      };

      if (!data || data.length === 0) return metricas;

      let countOsAteProg = 0;
      let countProgAteLote = 0;
      let countLoteAteCQ = 0;
      let countCQAteEnvase = 0;
      let countEnvaseAteEntrega = 0;
      let countOsAteEntrega = 0;

      // Simplificando: o banco retorna strings de intervalo ou objetos. 
      // Para fins de métrica "real" no frontend, vamos apenas coletar os valores.
      // Em uma Fase 11 real, isso seria uma RPC agregadora.
      
      (data ?? []).forEach((item: any) => {
        const statusOficial = item.status_esteira_oficial as string;
        
        // Usar status_esteira_oficial para as contagens principais
        if (statusOficial === "em_producao") metricas.totalEmProducao++;
        if (statusOficial === "aguardando_cq") metricas.totalAguardandoCQ++;
        if (statusOficial === "envase") metricas.totalEmEnvase++;
        if (["pronto_entrega", "entrega_pendente"].includes(statusOficial)) metricas.totalProntoEntrega++;
        if (["entregue", "finalizada"].includes(statusOficial) || item.entrega_confirmada === true) metricas.totalEntregue++;
        if (item.atrasado) metricas.totalAtrasado++;


        metricas.volumeSolicitadoTotal += Number((item as any).volume_solicitado_l || 0);
        
        // Volume solicitado quando CQ aprovado
        if (item.cq_resultado === "aprovado") {
          metricas.volumeSolicitadoAprovado += Number((item as any).volume_solicitado_l || 0);
        }

        // Volume solicitado quando status entregue ou finalizado
        if (statusOficial === "entregue" || statusOficial === "finalizada" || item.entrega_confirmada === true) {
          metricas.volumeSolicitadoEntregue += Number((item as any).volume_solicitado_l || 0);
        }
      });

      return metricas;
    },
    refetchInterval: 180000, // 1 minuto
  });

  const visitas = useQuery({
    queryKey: ["metricas-visita-tecnica", session.scope],
    enabled: session.ready && options.visitas !== false,
    queryFn: async ({ signal }) => {
      const assertCurrent = session.fence();
      assertCurrent(signal);
      const { data, error } = await (supabase as any)
        .from("vw_fluxo_visita_tecnica")
        .select("*")
        .abortSignal(signal);
      assertCurrent(signal);

      if (error) throw error;

      const metricas: MetricasVisitaTecnica = {
        totalSolicitacoesAbertas: 0,
        totalVisitasRealizadas: 0,
        totalCheckinsRealizados: 0,
        totalRecomendacoesEmitidas: 0,
        totalRecomendacoesLiberadas: 0,
        totalRecomendacoesConvertidasOS: 0,
        taxaConversao: 0,
        temposMedios: {
          solicitacaoAteCheckin: null,
          checkinAteFinalizacao: null,
          finalizacaoAteAprovacao: null,
          aprovacaoAteOS: null,
        }
      };

      if (!data || data.length === 0) return metricas;

      let tSolCheck = 0, cSolCheck = 0;
      let tCheckFin = 0, cCheckFin = 0;
      let tFinAprov = 0, cFinAprov = 0;
      let tAprovOs = 0, cAprovOs = 0;

      (data ?? []).forEach((item: any) => {
        if (item.status_solicitacao && !["concluida", "cancelada", "convertida_os"].includes(item.status_solicitacao)) {
          metricas.totalSolicitacoesAbertas++;
        }
        
        if (["finalizado", "aprovado", "convertido_os"].includes(item.status_visita)) {
          metricas.totalVisitasRealizadas++;
        }
        
        if (item.possui_checkin) metricas.totalCheckinsRealizados++;
        if (item.possui_recomendacao) metricas.totalRecomendacoesEmitidas++;
        
        if (item.status_aprovacao === "aprovado" || item.status_visita === "aprovado" || item.status_visita === "convertido_os") {
          metricas.totalRecomendacoesLiberadas++;
        }
        
        if (item.possui_os) metricas.totalRecomendacoesConvertidasOS++;

        // Acumular tempos para médias
        if (item.tempo_solicitacao_ate_checkin !== null) { tSolCheck += Number(item.tempo_solicitacao_ate_checkin); cSolCheck++; }
        if (item.tempo_checkin_ate_finalizacao !== null) { tCheckFin += Number(item.tempo_checkin_ate_finalizacao); cCheckFin++; }
        if (item.tempo_finalizacao_ate_aprovacao !== null) { tFinAprov += Number(item.tempo_finalizacao_ate_aprovacao); cFinAprov++; }
        if (item.tempo_aprovacao_ate_os !== null) { tAprovOs += Number(item.tempo_aprovacao_ate_os); cAprovOs++; }
      });

      if (metricas.totalRecomendacoesEmitidas > 0) {
        metricas.taxaConversao = (metricas.totalRecomendacoesConvertidasOS / metricas.totalRecomendacoesEmitidas) * 100;
      }

      metricas.temposMedios = {
        solicitacaoAteCheckin: cSolCheck > 0 ? (tSolCheck / cSolCheck).toFixed(1) + "h" : null,
        checkinAteFinalizacao: cCheckFin > 0 ? (tCheckFin / cCheckFin).toFixed(1) + "h" : null,
        finalizacaoAteAprovacao: cFinAprov > 0 ? (tFinAprov / cFinAprov).toFixed(1) + "h" : null,
        aprovacaoAteOS: cAprovOs > 0 ? (tAprovOs / cAprovOs).toFixed(1) + "h" : null,
      };

      return metricas;
    },
    refetchInterval: 180000,
  });

  return {
    laboratorio: {
      data: laboratorio.data,
      isLoading: laboratorio.isLoading,
      error: laboratorio.error,
    },
    visitas: {
      data: session.ready && options.visitas !== false ? visitas.data : undefined,
      isLoading: visitas.isLoading,
      error: visitas.error,
    },
    lastUpdated: new Date(),
  };
}
