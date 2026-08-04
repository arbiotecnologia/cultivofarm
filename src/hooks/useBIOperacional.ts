import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { differenceInDays, format, subDays } from "date-fns";
import type { DrillDownTipo } from "@/components/bi/modal/BIDrillDownModal";
import { useBIEsteiraResumo, useBIFluxoVisitasResumo } from "@/hooks/useBIResumoAgregado";



export interface BIFiltros {
  periodoInicio: string;
  periodoFim: string;
  clienteId?: string;
  fazendaId?: string;
  talhaoId?: string;
  produtoId?: string;
  microrganismoId?: string;
  consultorId?: string;
  origemOs?: "manual" | "onfarm" | "todas";
  status_solicitacao?: string;
  status_visita?: string;
  status_esteira_oficial?: string;
  status_entrega?: string;
  entrega_confirmada?: boolean;
  pode_finalizar?: boolean;
  tipo_gargalo?: string;
  gravidade?: string;
  culturaId?: string;
}

export function useBIOperacional() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const [filtros, setFiltros] = useState<BIFiltros>(() => {
    const today = new Date();
    const thirtyDaysAgo = format(subDays(today, 30), "yyyy-MM-dd");
    return {
      periodoInicio: thirtyDaysAgo,
      periodoFim: format(today, "yyyy-MM-dd"),
      origemOs: "todas",
    };
  });

  // Detalhados = rawVisitas/rawEsteira/rawEstoque. Só habilita quando o usuário
  // sai da Visão Geral, abre drilldown ou clica em exportar. Enquanto false, o
  // BI opera apenas com as RPCs agregadas (rpc_bi_esteira_resumo / rpc_bi_fluxo_visitas_resumo).
  const [detalhadosAtivos, setDetalhadosAtivos] = useState(false);
  const ativarDetalhados = useCallback(() => setDetalhadosAtivos(true), []);

  const [detalheAtivo, setDetalheAtivo] = useState<{
    tipo: DrillDownTipo;
    id: string;
    nome: string;
    origem: "visitas" | "esteira";
  } | null>(null);

  const abrirDetalhe = useCallback((tipo: DrillDownTipo, id: string, nome: string, origem: "visitas" | "esteira") => {
    setDetalhadosAtivos(true);
    setDetalheAtivo({ tipo, id, nome, origem });
  }, []);

  const fecharDetalhe = useCallback(() => {
    setDetalheAtivo(null);
  }, []);

  // RPCs agregadas — cards principais consomem daqui, não de rawVisitas/rawEsteira.
  const resumoEsteiraQuery = useBIEsteiraResumo(filtros);
  const resumoVisitasQuery = useBIFluxoVisitasResumo(filtros);
  const resumoEsteira = resumoEsteiraQuery.data;
  const resumoVisitas = resumoVisitasQuery.data;




  const { data: rawVisitas = [], isLoading: isLoadingVisitas, error: errorVisitas } = useQuery({
    queryKey: ["bi-visitas", filtros],
    queryFn: async () => {
      let query = supabase.from("vw_fluxo_visita_tecnica").select("*");
      
      if (filtros.clienteId) query = query.eq("cliente_id", filtros.clienteId);
      if (filtros.fazendaId) query = query.eq("fazenda_id", filtros.fazendaId);
      if (filtros.talhaoId) query = query.eq("talhao_id", filtros.talhaoId);
      if (filtros.consultorId) query = query.eq("consultor_id", filtros.consultorId);
      if (filtros.status_solicitacao) query = query.eq("status_solicitacao", filtros.status_solicitacao);
      if (filtros.status_visita) query = query.eq("status_visita", filtros.status_visita);
      if (filtros.periodoInicio) query = query.gte("created_at", filtros.periodoInicio);
      if (filtros.periodoFim) query = query.lte("created_at", filtros.periodoFim);



      const { data, error } = await query.limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: detalhadosAtivos,
    staleTime: 60_000,
  });


  const { data: rawEsteira = [], isLoading: isLoadingEsteira, error: errorEsteira } = useQuery({
    queryKey: ["bi-esteira", filtros],
    queryFn: async () => {
      let query = supabase.from("vw_esteira_laboratorio").select("*");
      
      if (filtros.clienteId) query = query.eq("cliente_id", filtros.clienteId);
      if (filtros.fazendaId) query = query.eq("fazenda_id", filtros.fazendaId);
      if (filtros.talhaoId) query = query.eq("talhao_id", filtros.talhaoId);
      if (filtros.produtoId) query = query.eq("produto_id", filtros.produtoId);
      if (filtros.microrganismoId) query = query.eq("microrganismo_id", filtros.microrganismoId);
      if (filtros.origemOs && filtros.origemOs !== "todas") query = query.eq("origem_os", filtros.origemOs);
      if (filtros.status_esteira_oficial) query = query.eq("status_esteira_oficial", filtros.status_esteira_oficial);
      if (filtros.status_entrega) query = query.eq("entrega_status", filtros.status_entrega);
      if (filtros.entrega_confirmada !== undefined) query = query.eq("entrega_confirmada", filtros.entrega_confirmada);
      if (filtros.pode_finalizar !== undefined) query = query.eq("pode_finalizar", filtros.pode_finalizar);
      if (filtros.periodoInicio) query = query.gte("created_at", filtros.periodoInicio);
      if (filtros.periodoFim) query = query.lte("created_at", filtros.periodoFim);


      const { data, error } = await query.limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: detalhadosAtivos,
    staleTime: 60_000,
    refetchInterval: false,
  });


  const indicadoresVisitas = useMemo(() => {
    const stats = {
      solicitacoesAbertas: 0,
      visitasAgendadas: 0,
      visitasRealizadas: 0,
      checkinsRealizados: 0,
      visitasComDiagnostico: 0,
      visitasComEvidencias: 0,
      visitasPendentesRecomendacao: 0,
    };

    rawVisitas.forEach(v => {
      if (v.status_solicitacao && !["concluida", "cancelada", "convertida_os"].includes(v.status_solicitacao)) {
        stats.solicitacoesAbertas++;
      }
      if (v.status_visita === "agendada" || v.status_visita === "atribuida") {
        stats.visitasAgendadas++;
      }
      if (["finalizado", "aprovado", "convertido_os"].includes(v.status_visita)) {
        stats.visitasRealizadas++;
      }
      if (v.possui_checkin || v.data_checkin) stats.checkinsRealizados++;
      if (v.possui_diagnostico || (v.quantidade_diagnosticos && v.quantidade_diagnosticos > 0)) stats.visitasComDiagnostico++;
      if (v.possui_evidencias || (v.quantidade_evidencias && v.quantidade_evidencias > 0)) stats.visitasComEvidencias++;
      if ((v.status_visita === "finalizado" || v.status_visita === "aprovado") && !v.possui_recomendacao) {
        stats.visitasPendentesRecomendacao++;
      }
    });

    return stats;
  }, [rawVisitas]);

  const { data: rawEstoque = [], isLoading: isLoadingEstoque } = useQuery({
    queryKey: ["bi-estoque-real", filtros],
    queryFn: async () => {
      let query = supabase.from("estoque_produto").select("*, produto:produtos(nome), microrganismo:microrganismos(nome)");
      if (filtros.produtoId) query = query.eq("produto_id", filtros.produtoId);
      if (filtros.microrganismoId) query = query.eq("microrganismo_id", filtros.microrganismoId);
      const { data, error } = await query.limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: detalhadosAtivos,
    staleTime: 60_000,
  });

  const { data: rawMovimentacoes = [] } = useQuery({
    queryKey: ["bi-movimentacoes-real", filtros],
    queryFn: async () => {
      let query = supabase
        .from("estoque_movimentacoes")
        .select("id, acao, quantidade, status_anterior, status_novo, created_at, os_id, cliente_id, lote_id");
      if (filtros.periodoInicio) query = query.gte("created_at", filtros.periodoInicio);
      if (filtros.periodoFim) query = query.lte("created_at", filtros.periodoFim);
      const { data, error } = await query.order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: detalhadosAtivos,
    staleTime: 60_000,
  });


  const indicadoresRecomendacoes = useMemo(() => {
    const stats = {
      emitidas: 0,
      liberadas: 0,
      aguardandoDecisao: 0,
      convertidasOS: 0,
      naoConvertidas: 0,
      taxaConversao: 0,
      taxaLiberacao: 0,
    };

    const PRAZO_NAO_CONVERTIDA_DIAS = 15;
    const now = new Date();

    rawVisitas.forEach(v => {
      if (v.possui_recomendacao) {
        stats.emitidas++;
        
        const liberada = v.status_aprovacao === "aprovado" || v.status_visita === "aprovado" || v.status_visita === "convertido_os" || !!v.data_liberacao_recomendacao;
        if (liberada) stats.liberadas++;

        if (v.possui_os) {
          stats.convertidasOS++;
        } else if (liberada) {
          const diasDesdeLiberacao = v.data_liberacao_recomendacao ? differenceInDays(now, new Date(v.data_liberacao_recomendacao)) : 0;
          if (diasDesdeLiberacao > PRAZO_NAO_CONVERTIDA_DIAS || v.status_aprovacao === 'reprovado' || v.status_visita === 'reprovado') {
            stats.naoConvertidas++;
          } else {
            stats.aguardandoDecisao++;
          }
        }
      }
    });

    if (stats.emitidas > 0) {
      stats.taxaConversao = (stats.convertidasOS / stats.emitidas) * 100;
      stats.taxaLiberacao = (stats.liberadas / stats.emitidas) * 100;
    }

    return stats;
  }, [rawVisitas]);

  const visitasPorConsultor = useMemo(() => {
    const map = new Map<string, any>();

    rawVisitas.forEach(v => {
      if (!v.consultor_id) return;
      const id = v.consultor_id;
      if (!map.has(id)) {
        map.set(id, {
          id,
          nome: v.consultor_nome || "Sem nome",
          solicitacoes: 0,
          checkins: 0,
          visitasFinalizadas: 0,
          recomendacoesEmitidas: 0,
          recomendacoesLiberadas: 0,
          convertidasOS: 0,
          aguardandoDecisao: 0,
          tempoCheckinFinalizacaoTotal: 0,
          tempoCheckinFinalizacaoCount: 0,
          tempoLibOSTotal: 0,
          tempoLibOSCount: 0,
          gargalos: 0,
          oportunidadesParadas: 0
        });
      }
      const data = map.get(id);
      data.solicitacoes++;
      if (v.possui_checkin) data.checkins++;
      if (["finalizado", "aprovado", "convertido_os"].includes(v.status_visita)) data.visitasFinalizadas++;
      
      if (v.possui_recomendacao) {
        data.recomendacoesEmitidas++;
        const liberada = v.status_aprovacao === "aprovado" || !!v.data_liberacao_recomendacao;
        if (liberada) data.recomendacoesLiberadas++;
        if (v.possui_os) {
          data.convertidasOS++;
          if (v.tempo_aprovacao_ate_os !== null) {
            data.tempoLibOSTotal += v.tempo_aprovacao_ate_os;
            data.tempoLibOSCount++;
          }
        } else if (liberada) {
          data.aguardandoDecisao++;
          data.oportunidadesParadas++;
        }
      }

      if (v.tempo_checkin_ate_finalizacao !== null) {
        data.tempoCheckinFinalizacaoTotal += v.tempo_checkin_ate_finalizacao;
        data.tempoCheckinFinalizacaoCount++;
      }
      const bloqueios = v.bloqueios || [];
      if (bloqueios.length > 0) data.gargalos += bloqueios.length;
    });

    return Array.from(map.values()).map(d => ({
      ...d,
      tempoMedio: d.tempoCheckinFinalizacaoCount > 0 ? (d.tempoCheckinFinalizacaoTotal / d.tempoCheckinFinalizacaoCount).toFixed(1) : null,
      tempoMedioLibOS: d.tempoLibOSCount > 0 ? (d.tempoLibOSTotal / d.tempoLibOSCount).toFixed(1) : null,
      taxaConversao: d.recomendacoesEmitidas > 0 ? (d.convertidasOS / d.recomendacoesEmitidas * 100).toFixed(1) : "0.0"
    }));
  }, [rawVisitas]);

  const visitasPorCliente = useMemo(() => {
    const map = new Map<string, any>();
    rawVisitas.forEach(v => {
      if (!v.cliente_id) return;
      const id = v.cliente_id;
      if (!map.has(id)) {
        map.set(id, {
          id,
          nome: v.cliente_nome || "Sem nome",
          solicitacoes: 0,
          visitas: 0,
          recomendacoesEmitidas: 0,
          recomendacoesLiberadas: 0,
          convertidasOS: 0,
          aguardandoDecisao: 0,
          visitasPendentes: 0,
          gargalos: 0,
          ultimaVisita: v.data_vistoria || v.created_at,
          fazendasComDemanda: new Set()
        });
      }
      const data = map.get(id);
      data.solicitacoes++;
      if (["finalizado", "aprovado", "convertido_os"].includes(v.status_visita)) data.visitas++;
      if (v.possui_recomendacao) {
        data.recomendacoesEmitidas++;
        const liberada = v.status_aprovacao === "aprovado" || !!v.data_liberacao_recomendacao;
        if (liberada) data.recomendacoesLiberadas++;
        if (v.possui_os) data.convertidasOS++;
        else if (liberada) data.aguardandoDecisao++;
      }
      if (v.status_visita === "pendente" || v.status_visita === "agendada") data.visitasPendentes++;
      const bloqueios = v.bloqueios || [];
      if (bloqueios.length > 0) data.gargalos += bloqueios.length;
      if (v.data_vistoria && (!data.ultimaVisita || new Date(v.data_vistoria) > new Date(data.ultimaVisita))) {
        data.ultimaVisita = v.data_vistoria;
      }
      if (v.fazenda_nome) data.fazendasComDemanda.add(v.fazenda_nome);
    });
    return Array.from(map.values()).map(d => ({
      ...d,
      taxaConversao: d.recomendacoesEmitidas > 0 ? (d.convertidasOS / d.recomendacoesEmitidas * 100).toFixed(1) : "0.0",
      fazendasCount: d.fazendasComDemanda.size
    }));
  }, [rawVisitas]);

  const visitasPorFazenda = useMemo(() => {
    const map = new Map<string, any>();
    rawVisitas.forEach(v => {
      if (!v.fazenda_id) return;
      const id = v.fazenda_id;
      if (!map.has(id)) {
        map.set(id, {
          id,
          nome: v.fazenda_nome || "Sem nome",
          cliente: v.cliente_nome || "Sem cliente",
          solicitacoes: 0,
          visitas: 0,
          recomendacoesEmitidas: 0,
          convertidasOS: 0,
          oportunidadesParadas: 0,
          gargalos: 0,
          ultimaVisita: v.data_vistoria || v.created_at
        });
      }
      const data = map.get(id);
      data.solicitacoes++;
      if (["finalizado", "aprovado", "convertido_os"].includes(v.status_visita)) data.visitas++;
      if (v.possui_recomendacao) {
        data.recomendacoesEmitidas++;
        if (v.possui_os) data.convertidasOS++;
        else if (v.status_aprovacao === 'aprovado' || !!v.data_liberacao_recomendacao) data.oportunidadesParadas++;
      }
      const bloqueios = v.bloqueios || [];
      if (bloqueios.length > 0) data.gargalos += bloqueios.length;
      if (v.data_vistoria && (!data.ultimaVisita || new Date(v.data_vistoria) > new Date(data.ultimaVisita))) {
        data.ultimaVisita = v.data_vistoria;
      }
    });
    return Array.from(map.values()).map(d => ({
      ...d,
      taxaConversao: d.recomendacoesEmitidas > 0 ? (d.convertidasOS / d.recomendacoesEmitidas * 100).toFixed(1) : "0.0"
    }));
  }, [rawVisitas]);

  const indicadoresLaboratorio = useMemo(() => {
    const stats = {
      abertas: 0,
      programadas: 0,
      emProducao: 0,
      aguardandoCQ: 0,
      cqAprovado: 0,
      cqReprovado: 0,
      emEnvase: 0,
      prontoEntrega: 0,
      entregaPendente: 0,
      entregue: 0,
      finalizadas: 0,
      atrasadas: 0,
      aptasFinalizacao: 0
    };

    rawEsteira.forEach(item => {
      const status = item.status_esteira_oficial;
      if (status === "aberta") stats.abertas++;
      if (status === "programada") stats.programadas++;
      if (status === "em_producao") stats.emProducao++;
      if (status === "aguardando_cq") stats.aguardandoCQ++;
      if (status === "cq_aprovado") stats.cqAprovado++;
      if (status === "cq_reprovado") stats.cqReprovado++;
      if (status === "envase") stats.emEnvase++;
      if (status === "pronto_entrega") stats.prontoEntrega++;
      if (status === "entrega_pendente") stats.entregaPendente++;
      
      if (item.entrega_confirmada || status === "entregue" || status === "finalizada") stats.entregue++;
      if (status === "finalizada" || item.status_os === "finalizada") stats.finalizadas++;
      if (item.atrasado) stats.atrasadas++;
      if (item.pode_finalizar && status !== "finalizada") stats.aptasFinalizacao++;
    });

    return stats;
  }, [rawEsteira]);

  const indicadoresQualidade = useMemo(() => {
    const stats = {
      aprovados: 0,
      reprovados: 0,
      taxaAprovacao: 0,
      taxaReprovacao: 0,
      aguardandoCQ: 0,
      produtosReprovacao: new Map<string, number>()
    };

    rawEsteira.forEach(item => {
      const status = item.status_esteira_oficial;
      if (status === "aguardando_cq") stats.aguardandoCQ++;
      if (item.cq_resultado === "aprovado") stats.aprovados++;
      if (item.cq_resultado === "reprovado") {
        stats.reprovados++;
        const prod = item.produto_nome || item.microrganismo_nome || "Desconhecido";
        stats.produtosReprovacao.set(prod, (stats.produtosReprovacao.get(prod) || 0) + 1);
      }
    });

    const total = stats.aprovados + stats.reprovados;
    if (total > 0) {
      stats.taxaAprovacao = (stats.aprovados / total) * 100;
      stats.taxaReprovacao = (stats.reprovados / total) * 100;
    }

    return stats;
  }, [rawEsteira]);

  const indicadoresEntregas = useMemo(() => {
    const stats = {
      pendentes: 0,
      confirmadas: 0,
      finalizadas: 0,
    };

    rawEsteira.forEach(item => {
      if (item.status_esteira_oficial === "entrega_pendente") stats.pendentes++;
      if (item.entrega_confirmada || item.status_esteira_oficial === "entregue") stats.confirmadas++;
      if (item.status_os === "finalizada") stats.finalizadas++;
    });

    return stats;
  }, [rawEsteira]);

  const estoquePorProdutoReal = useMemo(() => {
    const map = new Map<string, any>();
    rawEstoque.forEach(e => {
      const nome = (e as any).produto?.nome || (e as any).microrganismo?.nome || "Desconhecido";
      // volume_total em ml -> L
      const volL = e.volume_total ? Number(e.volume_total) / 1000 : null;
      if (!map.has(nome)) map.set(nome, { 
        nome, 
        volumeEstoque: 0, 
        volumeReservado: null, 
        volumeSolicitadoEntregue: 0, 
        osVinculadas: 0, 
        entregasPendentes: 0 
      });
      const data = map.get(nome);
      if (volL !== null) data.volumeEstoque += volL;

      // Buscar solicitações entregues para este produto nas OS
      const solEntregue = rawEsteira
        .filter(item => (item.produto_nome === nome || item.microrganismo_nome === nome) && (item.entrega_confirmada || ['entregue', 'finalizada'].includes(item.status_esteira_oficial as string)))
        .reduce((acc, item) => acc + Number(item.volume_solicitado_l || 0), 0);
      data.volumeSolicitadoEntregue = solEntregue;

      const osCount = rawEsteira.filter(item => (item.produto_nome === nome || item.microrganismo_nome === nome)).length;
      data.osVinculadas = osCount;

      const pendentes = rawEsteira.filter(item => (item.produto_nome === nome || item.microrganismo_nome === nome) && item.status_esteira_oficial === 'entrega_pendente').length;
      data.entregasPendentes = pendentes;
    });
    return Array.from(map.values());
  }, [rawEstoque, rawEsteira]);

  const indicadoresTempo = useMemo(() => {

    const stats = {
      solicitacaoAteCheckin: 0,
      checkinAteFinalizacao: 0,
      finalizacaoAteAprovacao: 0,
      aprovacaoAteOS: 0,
      osAteEntrega: 0,
      emissaoAteLiberacao: 0,
      osAteProg: 0,
      progAteLote: 0,
      loteAteCQ: 0,
      cqAteEnvase: 0,
      envaseAteEntrega: 0
    };

    let counts = {
      solCheck: 0, checkFin: 0, finAprov: 0, aprovOs: 0, emisLib: 0,
      osProg: 0, progLote: 0, loteCQ: 0, cqEnvase: 0, envaseEnt: 0, osEnt: 0
    };

    rawVisitas.forEach(v => {
      if (v.tempo_solicitacao_ate_checkin !== null) { stats.solicitacaoAteCheckin += v.tempo_solicitacao_ate_checkin; counts.solCheck++; }
      if (v.tempo_checkin_ate_finalizacao !== null) { stats.checkinAteFinalizacao += v.tempo_checkin_ate_finalizacao; counts.checkFin++; }
      if (v.tempo_finalizacao_ate_aprovacao !== null) { stats.finalizacaoAteAprovacao += v.tempo_finalizacao_ate_aprovacao; counts.finAprov++; }
      if (v.tempo_aprovacao_ate_os !== null) { stats.aprovacaoAteOS += v.tempo_aprovacao_ate_os; counts.aprovOs++; }
      
      if (v.data_finalizacao && v.data_liberacao_recomendacao) {
        const diff = differenceInDays(new Date(v.data_liberacao_recomendacao), new Date(v.data_finalizacao)) * 24; 
        if (diff >= 0) { stats.emissaoAteLiberacao += diff; counts.emisLib++; }
      }
    });

    const parseInterval = (val: any) => {
      if (val === null || val === undefined) return null;
      const num = parseFloat(String(val));
      return isNaN(num) ? null : num;
    };

    rawEsteira.forEach(e => {
      const tOsProg = parseInterval(e.tempo_os_ate_programacao);
      if (tOsProg !== null) { stats.osAteProg += tOsProg; counts.osProg++; }

      const tProgLote = parseInterval(e.tempo_programacao_ate_lote);
      if (tProgLote !== null) { stats.progAteLote += tProgLote; counts.progLote++; }

      const tLoteCQ = parseInterval(e.tempo_lote_ate_cq);
      if (tLoteCQ !== null) { stats.loteAteCQ += tLoteCQ; counts.loteCQ++; }

      const tCQEnvase = parseInterval(e.tempo_cq_ate_envase);
      if (tCQEnvase !== null) { stats.cqAteEnvase += tCQEnvase; counts.cqEnvase++; }

      const tEnvaseEnt = parseInterval(e.tempo_envase_ate_entrega);
      if (tEnvaseEnt !== null) { stats.envaseAteEntrega += tEnvaseEnt; counts.envaseEnt++; }

      const tOsEnt = parseInterval(e.tempo_os_ate_entrega);
      if (tOsEnt !== null) { stats.osAteEntrega += tOsEnt; counts.osEnt++; }
    });

    return {
      solicitacaoAteCheckin: counts.solCheck > 0 ? (stats.solicitacaoAteCheckin / counts.solCheck) : null,
      checkinAteFinalizacao: counts.checkFin > 0 ? (stats.checkinAteFinalizacao / counts.checkFin) : null,
      finalizacaoAteAprovacao: counts.finAprov > 0 ? (stats.finalizacaoAteAprovacao / counts.finAprov) : null,
      aprovacaoAteOS: counts.aprovOs > 0 ? (stats.aprovacaoAteOS / counts.aprovOs) : null,
      emissaoAteLiberacao: counts.emisLib > 0 ? (stats.emissaoAteLiberacao / counts.emisLib) : null,
      osAteProg: counts.osProg > 0 ? (stats.osAteProg / counts.osProg) : null,
      progAteLote: counts.progLote > 0 ? (stats.progAteLote / counts.progLote) : null,
      loteAteCQ: counts.loteCQ > 0 ? (stats.loteAteCQ / counts.loteCQ) : null,
      cqAteEnvase: counts.cqEnvase > 0 ? (stats.cqAteEnvase / counts.cqEnvase) : null,
      envaseAteEntrega: counts.envaseEnt > 0 ? (stats.envaseAteEntrega / counts.envaseEnt) : null,
      osAteEntrega: counts.osEnt > 0 ? (stats.osAteEntrega / counts.osEnt) : null,
      tempoDecisaoProdutor: counts.emisLib > 0 ? (stats.emissaoAteLiberacao / counts.emisLib) : null,
    };
  }, [rawVisitas, rawEsteira]);

  const dadosGargalos = useMemo(() => {
    const gargalos: any[] = [];
    const PRAZO_CONVERSAO_DIAS = 15;
    const now = new Date();
    const idsExistentes = new Set<string>();

    rawVisitas.forEach(v => {
      const bloqueios = v.bloqueios || [];
      const novosBloqueios: string[] = [...bloqueios];

      if (v.possui_recomendacao && !v.possui_os) {
        const liberada = v.status_aprovacao === "aprovado" || !!v.data_liberacao_recomendacao;
        if (liberada) {
          const dias = v.data_liberacao_recomendacao ? differenceInDays(now, new Date(v.data_liberacao_recomendacao)) : 0;
          if (dias > PRAZO_CONVERSAO_DIAS) {
            novosBloqueios.push("recomendacao_liberada_sem_os_apos_prazo");
          } else {
            novosBloqueios.push("recomendacao_liberada_sem_decisao");
          }
        }
      }

      if (novosBloqueios.length > 0) {
        novosBloqueios.forEach(b => {
          let gravidade = "media";
          if (["convertida_os_sem_os", "os_duplicada", "aprovada_sem_recomendacao"].includes(b)) gravidade = "critica";
          else if (["sem_recomendacao", "aprovada_com_solicitacao_antiga", "checkin_sem_registro_consultor"].includes(b)) gravidade = "alta";
          else if (["sem_diagnostico", "sem_evidencia", "recomendacao_liberada_sem_decisao", "recomendacao_liberada_sem_os_apos_prazo"].includes(b)) gravidade = "media";
          else if (["sem_consultor", "sem_agendamento", "sem_checkin"].includes(b)) gravidade = "baixa";

          const gid = `visita-${v.solicitacao_id || v.registro_consultor_id || Math.random()}-${b}`;
          if (idsExistentes.has(gid)) return;
          idsExistentes.add(gid);

          gargalos.push({
            id: gid,
            tipo: b,
            cliente: v.cliente_nome,
            fazenda: v.fazenda_nome,
            talhao: v.talhao_nome,
            consultor: v.consultor_nome,
            etapa: "Visita Técnica",
            proxima_acao: v.proxima_acao,
            gravidade: gravidade,
            origem: "Visita",
            status_solicitacao: v.status_solicitacao,
            status_visita: v.status_visita,
            dias_em_aberto: v.dias_em_aberto,
            solicitacao_id: v.solicitacao_id,
            registro_consultor_id: v.registro_consultor_id,
            data_liberacao: v.data_liberacao_recomendacao,
            possui_os: v.possui_os,
            possui_recomendacao: v.possui_recomendacao
          });
        });
      }
    });

    rawEsteira.forEach(e => {
      const bloqueios = e.bloqueios || [];
      const novosBloqueios: string[] = [...bloqueios];
      if (e.atrasado) novosBloqueios.push("os_em_atraso");

      if (novosBloqueios.length > 0) {
        novosBloqueios.forEach(b => {
          let gravidade = "alta";
          // Pendências informativas de aplicação não devem ser tratadas como gargalos críticos de produção
          const infoPendencies = ["aplicacao_nao_registrada", "cliente_nao_informou_aplicacao"];
          if (infoPendencies.includes(b)) {
            gravidade = "informativa";
          } else if (["cq_reprovado", "sem_entrega_confirmada", "sem_estoque"].includes(b)) {
            gravidade = "critica";
          } else if (["sem_programacao", "sem_lote", "cq_pendente", "sem_envase"].includes(b)) {
            gravidade = "alta";
          } else if (b === "os_em_atraso") {
            gravidade = "media";
          }

          const gid = `os-${e.os_id || Math.random()}-${b}`;
          if (idsExistentes.has(gid)) return;
          idsExistentes.add(gid);

          gargalos.push({
            id: gid,
            tipo: b,
            numero_os: e.numero_os,
            origem_os: e.origem_os,
            cliente: e.cliente_nome,
            fazenda: e.fazenda_nome,
            talhao: e.talhao_nome,
            produto: e.produto_nome || e.microrganismo_nome,
            etapa: "Laboratório / Entrega",
            proxima_acao: e.proxima_acao,
            gravidade: gravidade,
            origem: "Laboratório",
            status_esteira_oficial: e.status_esteira_oficial,
            atrasado: e.atrasado,
            pode_finalizar: e.pode_finalizar,
            bloqueios: e.bloqueios,
            pendencias_informativas: e.pendencias_informativas,
            os_id: e.os_id
          });
        });
      }
    });

    return gargalos.filter(g => {
      if (filtros.tipo_gargalo && g.tipo !== filtros.tipo_gargalo) return false;
      if (filtros.gravidade && g.gravidade !== filtros.gravidade) return false;
      return true;
    });
  }, [rawVisitas, rawEsteira, filtros.tipo_gargalo, filtros.gravidade]);

  const visitasCriticas = useMemo(() => {
    return dadosGargalos.filter(g => g.origem === "Visita" && (g.gravidade === "critica" || g.gravidade === "alta"));
  }, [dadosGargalos]);

  const oportunidadesParadas = useMemo(() => {
    return dadosGargalos.filter(g => g.origem === "Visita" && !g.possui_os && g.possui_recomendacao && (g.tipo === "recomendacao_liberada_sem_decisao" || g.tipo === "recomendacao_liberada_sem_os_apos_prazo"));
  }, [dadosGargalos]);

  const gargalosConversao = useMemo(() => {
    const conversaoTipos = [
      "aprovada_sem_recomendacao",
      "aprovada_com_solicitacao_antiga",
      "convertida_os_sem_os",
      "os_duplicada",
      "sem_recomendacao",
      "recomendacao_liberada_sem_decisao",
      "recomendacao_liberada_sem_os_apos_prazo"
    ];
    return dadosGargalos.filter(g => g.origem === "Visita" && conversaoTipos.includes(g.tipo));
  }, [dadosGargalos]);

  const laboratorioPorStatus = useMemo(() => {
    const map = new Map<string, any>();
    rawEsteira.forEach(item => {
      const s = item.status_esteira_oficial || "Indefinido";
      if (!map.has(s)) map.set(s, { status: s, count: 0, volume: 0 });
      const data = map.get(s);
      data.count++;
      data.volume += Number(item.volume_solicitado_l || 0);
    });
    return Array.from(map.values()).map(d => ({
      ...d,
      percentual: rawEsteira.length > 0 ? (d.count / rawEsteira.length * 100).toFixed(1) : 0
    }));
  }, [rawEsteira]);

  const laboratorioPorProduto = useMemo(() => {
    const map = new Map<string, any>();
    rawEsteira.forEach(item => {
      const prod = item.produto_nome || item.microrganismo_nome || "Sem Produto";
      if (!map.has(prod)) map.set(prod, { 
        nome: prod, 
        osCount: 0, 
        volumeSolicitado: 0, 
        volumeSolicitadoAprovado: 0, 
        volumeSolicitadoEntregue: 0,
        cqAprovado: 0,
        cqReprovado: 0
      });
      const data = map.get(prod);
      data.osCount++;
      const vol = Number(item.volume_solicitado_l || 0);
      data.volumeSolicitado += vol;
      if (item.cq_resultado === "aprovado") {
        data.volumeSolicitadoAprovado += vol;
        data.cqAprovado++;
      }
      if (item.cq_resultado === "reprovado") data.cqReprovado++;
      if (item.entrega_confirmada || item.status_esteira_oficial === 'entregue' || item.status_esteira_oficial === 'finalizada') {
        data.volumeSolicitadoEntregue += vol;
      }
    });
    return Array.from(map.values());
  }, [rawEsteira]);

  const laboratorioPorCliente = useMemo(() => {
    const map = new Map<string, any>();
    rawEsteira.forEach(item => {
      const cli = item.cliente_nome || "Sem Cliente";
      if (!map.has(cli)) map.set(cli, { 
        nome: cli, 
        osTotal: 0, 
        osAndamento: 0, 
        osEntregue: 0, 
        osAtrasada: 0, 
        volumeSolicitado: 0, 
        gargalos: 0 
      });
      const data = map.get(cli);
      data.osTotal++;
      const vol = Number(item.volume_solicitado_l || 0);
      data.volumeSolicitado += vol;
      if (item.atrasado) data.osAtrasada++;
      if (item.entrega_confirmada || item.status_esteira_oficial === 'entregue' || item.status_esteira_oficial === 'finalizada') {
        data.osEntregue++;
      } else {
        data.osAndamento++;
      }
      if (item.bloqueios && item.bloqueios.length > 0) data.gargalos += item.bloqueios.length;
    });
    return Array.from(map.values());
  }, [rawEsteira]);

  const osCriticas = useMemo(() => {
    return dadosGargalos.filter(g => g.origem === "Laboratório" && (g.gravidade === "critica" || g.gravidade === "alta"));
  }, [dadosGargalos]);

  const indicadoresEntregasDetalhados = useMemo(() => {
    const stats = {
      prontasEntrega: 0,
      entregasPendentes: 0,
      entregasConfirmadas: 0,
      aptasFinalizacao: 0,
      osFinalizadas: 0,
      pendenciasAplicacao: 0,
      gargalosExpedicao: 0
    };
    rawEsteira.forEach(e => {
      if (["pronto_entrega", "entrega_pendente"].includes(e.status_esteira_oficial)) stats.prontasEntrega++;
      if (e.status_esteira_oficial === "entrega_pendente") stats.entregasPendentes++;
      if (e.entrega_confirmada) stats.entregasConfirmadas++;
      if (e.pode_finalizar && e.status_esteira_oficial !== "finalizada") stats.aptasFinalizacao++;
      if (e.status_esteira_oficial === "finalizada") stats.osFinalizadas++;
      if (e.pendencias_informativas?.some(p => ["aplicacao_nao_registrada", "cliente_nao_informou_aplicacao"].includes(p))) stats.pendenciasAplicacao++;
      if (e.bloqueios?.some(b => ["sem_estoque", "sem_entrega_confirmada"].includes(b))) stats.gargalosExpedicao++;
    });
    return stats;
  }, [rawEsteira]);

  const entregasPorCliente = useMemo(() => {
    const map = new Map<string, any>();
    rawEsteira.forEach(e => {
      if (!e.cliente_id) return;
      if (!map.has(e.cliente_id)) map.set(e.cliente_id, { id: e.cliente_id, nome: e.cliente_nome, entregasPendentes: 0, entregasConfirmadas: 0, osFinalizaveis: 0, volumeSolicitadoEntregue: 0, gargalosExpedicao: 0 });
      const data = map.get(e.cliente_id);
      if (e.status_esteira_oficial === "entrega_pendente") data.entregasPendentes++;
      if (e.entrega_confirmada) data.entregasConfirmadas++;
      if (e.pode_finalizar) data.osFinalizaveis++;
      if (e.entrega_confirmada) data.volumeSolicitadoEntregue += Number(e.volume_solicitado_l || 0);
      if (e.bloqueios?.length) data.gargalosExpedicao += e.bloqueios.length;
    });
    return Array.from(map.values());
  }, [rawEsteira]);

  const entregasPorFazenda = useMemo(() => {
    const map = new Map<string, any>();
    rawEsteira.forEach(e => {
      if (!e.fazenda_id) return;
      if (!map.has(e.fazenda_id)) map.set(e.fazenda_id, { id: e.fazenda_id, nome: e.fazenda_nome, cliente: e.cliente_nome, entregasPendentes: 0, entregasConfirmadas: 0, pendencias: 0, ultimaEntrega: e.data_entrega });
      const data = map.get(e.fazenda_id);
      if (e.status_esteira_oficial === "entrega_pendente") data.entregasPendentes++;
      if (e.entrega_confirmada) data.entregasConfirmadas++;
      if (e.pendencias_informativas?.length) data.pendencias += e.pendencias_informativas.length;
      if (e.data_entrega && (!data.ultimaEntrega || new Date(e.data_entrega) > new Date(data.ultimaEntrega))) data.ultimaEntrega = e.data_entrega;
    });
    return Array.from(map.values());
  }, [rawEsteira]);

  const osFinalizaveis = useMemo(() => {
    return rawEsteira.filter(e => e.pode_finalizar && e.status_esteira_oficial !== "finalizada");
  }, [rawEsteira]);

  const entregasCriticas = useMemo(() => {
    return dadosGargalos.filter(g => g.origem === "Laboratório" && ["sem_estoque", "sem_entrega_confirmada", "pronta_entrega_sem_entrega"].includes(g.tipo));
  }, [dadosGargalos]);

  const resetFiltros = () => {
    const today = new Date();
    const thirtyDaysAgo = format(subDays(today, 30), "yyyy-MM-dd");
    setFiltros({
      periodoInicio: thirtyDaysAgo,
      periodoFim: format(today, "yyyy-MM-dd"),
      origemOs: "todas",
    });
  };

  const filtrosAtivos = useMemo(() => {
    return Object.values(filtros).filter(v => v !== "" && v !== undefined && v !== "todas").length;
  }, [filtros]);

  const dadosDetalhe = useMemo(() => {
    if (!detalheAtivo) return [];
    const { tipo, id, origem } = detalheAtivo;
    const source = origem === "visitas" ? rawVisitas : rawEsteira;
    switch (tipo) {
      case "consultor":
        return source.filter((row: any) => row.consultor_id === id);
      case "cliente":
        return source.filter((row: any) => row.cliente_id === id);
      case "fazenda":
        return source.filter((row: any) => row.fazenda_id === id);
      case "talhao":
        return source.filter((row: any) => row.talhao_id === id);
      case "produto":
        return source.filter((row: any) => row.produto_id === id);
      case "microrganismo":
        return source.filter((row: any) => row.microrganismo_id === id);
      default:
        return [];
    }
  }, [detalheAtivo, rawVisitas, rawEsteira]);

  const refetch = useCallback(() => {
    resumoEsteiraQuery.refetch();
    resumoVisitasQuery.refetch();
    queryClient.invalidateQueries({ queryKey: ["bi-visitas"] });
    queryClient.invalidateQueries({ queryKey: ["bi-esteira"] });
    queryClient.invalidateQueries({ queryKey: ["bi-estoque-real"] });
    queryClient.invalidateQueries({ queryKey: ["bi-movimentacoes-real"] });
  }, [queryClient, resumoEsteiraQuery, resumoVisitasQuery]);

  return {
    // Loading do topo: apenas RPCs agregadas. Detalhados carregam em background.
    loading: resumoEsteiraQuery.isLoading || resumoVisitasQuery.isLoading,
    loadingDetalhados: isLoadingVisitas || isLoadingEsteira,
    error: errorVisitas || errorEsteira || resumoEsteiraQuery.error || resumoVisitasQuery.error,
    lastUpdated: new Date(),
    refetch,
    detalhadosAtivos,
    ativarDetalhados,
    resumoEsteira,
    resumoVisitas,

    filtros,
    setFiltros,
    resetFiltros,
    filtrosAtivos,
    indicadoresVisitas,
    indicadoresRecomendacoes,
    indicadoresLaboratorio,
    indicadoresQualidade,
    indicadoresEntregas: indicadoresEntregasDetalhados,
    indicadoresEstoque: {
      volumeSolicitado: rawEsteira.reduce((acc, e) => acc + Number(e.volume_solicitado_l || 0), 0),
      volumeSolicitadoAprovado: rawEsteira.reduce((acc, e) => (e.cq_resultado === 'aprovado' ? acc + Number(e.volume_solicitado_l || 0) : acc), 0),
      volumeSolicitadoEntregue: rawEsteira.reduce((acc, e) => (e.entrega_confirmada || ['entregue', 'finalizada'].includes(e.status_esteira_oficial as string) ? acc + Number(e.volume_solicitado_l || 0) : acc), 0),
      volumeProduzidoReal: null, 
      volumeEmEstoqueReal: rawEstoque.reduce((acc, e) => {
        // volume_total em ml -> L
        const volL = e.volume_total ? Number(e.volume_total) / 1000 : null;
        return acc + (volL || 0);
      }, 0) || null,
      volumeReservadoReal: null,
      volumeDisponivelReal: null,
      volumeEntregueReal: null
    },
    indicadoresTempo,
    dadosGargalos,
    visitasPorConsultor,
    visitasPorCliente,
    visitasPorFazenda,
    visitasCriticas,
    oportunidadesParadas,
    gargalosConversao,
    laboratorioPorStatus,
    laboratorioPorProduto,
    laboratorioPorCliente,
    osCriticas,
    indicadoresEntregasDetalhados,
    entregasPorCliente,
    entregasPorFazenda,
    osFinalizaveis,
    entregasCriticas,
    rawVisitas,
    rawEsteira,
    rawEstoque,
    estoquePorProdutoReal,
    rawMovimentacoes,

    isLoadingEstoque,
    role,
    detalheAtivo,
    abrirDetalhe,
    fecharDetalhe,
    dadosDetalhe,
  };
}

