import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export type FluxoResponse = {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  os_id?: string;
  already_exists?: boolean;
  numero_os?: string;
};

export function useFluxoVisitaTecnica() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // --- Funções de Ação ---

  const criarOuObterVisitaPorSolicitacao = async (solicitacaoId: string): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Usuário não autenticado" };

    try {
      // 1. Verificar se já existe visita rascunho ou aberta para esta solicitação
      const { data: existingVisit, error: fetchError } = await supabase
        .from("registros_consultor")
        .select("id, status")
        .eq("solicitacao_id", solicitacaoId)
        .order("created_at", { ascending: false })
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existingVisit) {
        return { success: true, message: "Visita encontrada", data: { id: existingVisit.id } };
      }

      // 2. Obter dados da solicitação para cópia
      const { data: solicitacao, error: solError } = await supabase
        .from("portal_solicitacoes")
        .select("*")
        .eq("id", solicitacaoId)
        .single();

      if (solError) throw solError;

      // 3. Criar registro de consultor (Visita Técnica)
      const { data: newVisit, error: createError } = await supabase
        .from("registros_consultor")
        .insert({
          solicitacao_id: solicitacaoId,
          cliente_id: solicitacao.cliente_id,
          fazenda_id: solicitacao.fazenda_id,
          talhao_id: solicitacao.talhao_id,
          cultura_id: null, // portal_solicitacoes não possui cultura_id
          consultor_responsavel: user.id,
          created_by: user.id,
          consultor_profile_id: profile?.id || null,
          status: "rascunho",
          tipo_visita: "vistoria_inicial",
          tipo_demanda: (solicitacao.tipo_demanda as any) || "vistoria_tecnica",
          problema_principal: solicitacao.descricao || null,
          data_vistoria: new Date().toISOString().split('T')[0]
        })
        .select("id")
        .single();

      if (createError) throw createError;

      // 4. Atualizar status da solicitação
      await supabase
        .from("portal_solicitacoes")
        .update({ status: "em_visita" })
        .eq("id", solicitacaoId);

      // 5. Registrar timeline e logs
      await registrarTimeline(solicitacaoId, "visita_iniciada", "Visita técnica iniciada a partir da solicitação");
      
      await supabase.from("visitas_logs").insert({
        registro_consultor_id: newVisit.id,
        usuario_id: user.id,
        acao: "visita_criada",
        descricao: "Visita gerada automaticamente via fluxo de check-in/início"
      });

      queryClient.invalidateQueries({ queryKey: ["solicitacoes"] });
      
      return { success: true, message: "Visita iniciada", data: { id: newVisit.id } };
    } catch (error: any) {
      console.error("Erro em criarOuObterVisitaPorSolicitacao:", error);
      return { success: false, message: "Erro ao criar visita", error: error.message };
    }
  };

  const iniciarVisita = async (solicitacaoId: string) => {
    const res = await criarOuObterVisitaPorSolicitacao(solicitacaoId);
    if (res.success) {
      navigate(`/visita-tecnica/${res.data.id}`);
    } else {
      toast.error(res.message);
    }
    return res.data?.id;
  };

  const registrarTimeline = async (solicitacaoId: string, tipo: string, descricao: string) => {
    if (!solicitacaoId || !user) return;
    await supabase.from("solicitacoes_timeline").insert({
      solicitacao_id: solicitacaoId,
      tipo_evento: tipo,
      descricao: descricao,
      usuario_id: user.id
    });
  };

  const registrarCheckin = async (data: any): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };

    // Validação de regra: Check-in com solicitação deve ter registro_consultor_id
    if (data.solicitacao_id && !data.registro_consultor_id) {
      return { success: false, message: "Erro de integridade: Check-in vinculado à solicitação exige um ID de visita técnica." };
    }

    const clientUuid = data.client_uuid || crypto.randomUUID();

    try {
      // Fase 12.8 · Fase 2 — todo check-in passa pela RPC blindada.
      const { data: rpcData, error } = await supabase.rpc("rpc_realizar_checkin_visita", {
        p_registro_id: data.registro_consultor_id ?? null,
        p_client_uuid: clientUuid,
        p_tipo: data.tipo_checkin,
        p_latitude: data.latitude ?? null,
        p_longitude: data.longitude ?? null,
        p_precisao: data.precisao_gps ?? null,
        p_justificativa_sem_gps: data.justificativa_sem_gps ?? null,
        p_observacoes: data.observacoes ?? null,
        p_captured_at_local: data.data_hora_checkin ?? null,
        p_solicitacao_id: data.solicitacao_id ?? null,
        p_cliente_id: data.cliente_id ?? null,
        p_fazenda_id: data.fazenda_id ?? null,
        p_talhao_id: data.talhao_id ?? null,
        p_foto_path: data.foto_path ?? null,
      });

      if (error) throw error;
      const checkin = (rpcData as any) || {};

      // Vínculo da foto com evidências técnicas (fora da RPC para preservar retro-compat)
      if (data.registro_consultor_id && (data.foto_url || data.foto_path) && !checkin.idempotent) {
        const filePayload: any = {
          registro_consultor_id: data.registro_consultor_id,
          arquivo_path: data.foto_path || null,
          arquivo_url: data.foto_path ? null : (data.foto_url || null),
          tipo_arquivo: "image/jpeg",
          tipo_midia: "foto",
          categoria_arquivo: "checkin",
          foto_principal: false,
          uploaded_by: user.id,
          legenda: "Foto capturada no check-in",
          client_uuid: `${clientUuid}_photo`,
          metadata: {
            latitude: data.latitude,
            longitude: data.longitude,
            precisao: data.precisao_gps,
          },
        };
        await supabase.from("registros_consultor_arquivos").insert(filePayload);
      }

      return { success: true, message: "Check-in realizado", data: { id: checkin.id, data_hora_checkin: checkin.data_hora_checkin, idempotent: !!checkin.idempotent } };
    } catch (error: any) {
      console.error("Erro em registrarCheckin:", error);
      return { success: false, message: error?.message || "Erro no check-in", error: error?.message };
    }
  };

  const corrigirCheckinsOrfaos = async (): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    try {
      // 1. Buscar check-ins com solicitação_id mas sem registro_consultor_id
      const { data: orfaos, error: fetchError } = await supabase
        .from("visitas_checkin")
        .select("id, solicitacao_id")
        .not("solicitacao_id", "is", null)
        .is("registro_consultor_id", null);

      if (fetchError) throw fetchError;
      if (!orfaos || orfaos.length === 0) return { success: true, message: "Nenhum check-in órfão encontrado" };

      let corrigidos = 0;
      let inconsistentes = 0;

      for (const checkin of orfaos) {
        // Buscar visitas vinculadas a esta solicitação
        const { data: visitas } = await supabase
          .from("registros_consultor")
          .select("id")
          .eq("solicitacao_id", checkin.solicitacao_id);

        if (visitas && visitas.length === 1) {
          // Vínculo único - correção segura
          await supabase
            .from("visitas_checkin")
            .update({ registro_consultor_id: visitas[0].id })
            .eq("id", checkin.id);
          corrigidos++;
        } else {
          inconsistentes++;
        }
      }

      return { 
        success: true, 
        message: `Processamento concluído: ${corrigidos} corrigidos, ${inconsistentes} inconsistentes.`,
        data: { corrigidos, inconsistentes }
      };
    } catch (error: any) {
      return { success: false, message: "Erro na correção de órfãos", error: error.message };
    }
  };

  const liberarRecomendacaoParaProdutor = async (registroId: string): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    try {
      const { data, error } = await supabase.rpc("rpc_liberar_recomendacao_produtor", { p_registro_id: registroId });
      if (error) throw error;
      const res = (data as any) || {};

      if (res.success) {
        toast.success(res.message || "Recomendação liberada ao produtor.");
        queryClient.invalidateQueries({ queryKey: ["visita-tecnica", registroId] });
        queryClient.invalidateQueries({ queryKey: ["solicitacoes"] });
        queryClient.invalidateQueries({ queryKey: ["visitas"] });
        queryClient.invalidateQueries({ queryKey: ["inconsistencias-visita"] });
      } else {
        toast.error(res.message || "Não foi possível liberar a recomendação.");
      }

      return { success: !!res.success, message: res.message || "", data: res };
    } catch (error: any) {
      console.error("Erro em liberarRecomendacaoParaProdutor:", error);
      toast.error(error.message || "Erro na liberação da recomendação");
      return { success: false, message: "Erro na liberação", error: error.message };
    }
  };

  const converterRecomendacaoEmOS = async (registroId: string, observacao?: string): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    try {
      const { data, error } = await supabase.rpc("rpc_converter_visita_em_os", {
        p_registro_id: registroId,
        p_observacao: observacao || null,
      });
      if (error) throw error;
      const res = (data as any) || {};

      if (res.success) {
        if (res.already_exists) {
          toast.info(res.message || "OS já existente para esta visita.");
        } else {
          toast.success(res.message || "OS On-Farm gerada com sucesso.");
        }
        queryClient.invalidateQueries({ queryKey: ["visita-tecnica", registroId] });
        queryClient.invalidateQueries({ queryKey: ["solicitacoes"] });
        queryClient.invalidateQueries({ queryKey: ["ordens-servico"] });
        queryClient.invalidateQueries({ queryKey: ["visitas"] });
        queryClient.invalidateQueries({ queryKey: ["inconsistencias-visita"] });
      } else {
        toast.error(res.message || "Não foi possível converter a visita em OS.");
      }

      return {
        success: !!res.success,
        message: res.message || "",
        os_id: res.os_id,
        numero_os: res.numero_os,
        already_exists: res.already_exists,
        data: res,
      };
    } catch (error: any) {
      console.error("Erro em converterRecomendacaoEmOS:", error);
      toast.error(error.message || "Erro ao converter para OS");
      return { success: false, message: "Erro ao converter para OS", error: error.message };
    }
  };

  /**
   * Programa retorno técnico de forma transacional e idempotente via
   * `rpc_programar_retorno_visita` (cria solicitação + rascunho vinculado).
   */
  const programarRetorno = async (data: any): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    const registroId = data?.visita_original_id ?? data?.registro_id;
    const dataPrevista = data?.data_prevista ?? data?.dataProximaVisita ?? null;
    if (!registroId) return { success: false, message: "Visita de origem não informada" };
    if (!dataPrevista) return { success: false, message: "Informe a data prevista do retorno" };
    try {
      const { data: res, error } = await supabase.rpc("rpc_programar_retorno_visita" as any, {
        p_registro_id: registroId,
        p_expected_version: await fetchVersion(registroId),
        p_data_prevista: dataPrevista,
        p_descricao: data?.descricao ?? null,
      });
      if (error) throw error;
      const out = (res as any) || {};
      queryClient.invalidateQueries({ queryKey: ["solicitacoes"] });
      queryClient.invalidateQueries({ queryKey: ["visitas"] });
      queryClient.invalidateQueries({ queryKey: ["visita-workspace", registroId] });
      return {
        success: true,
        message: out.idempotent
          ? "Retorno técnico já estava programado"
          : "Retorno técnico programado com sucesso!",
        data: { solicitacao_id: out.solicitacao_id, registro_consultor_id: out.registro_id },
      };
    } catch (error: any) {
      console.error("Erro em programarRetorno:", error);
      return { success: false, message: "Erro ao programar retorno", error: error.message };
    }
  };

  const criarRetornoComRascunho = async (data: any) => {
    return programarRetorno(data);
  };

  // --- Implementação de Ações Reais (Fase 10.2.1.3.1) ---

  const salvarRascunho = async (id: string, data: any): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    try {
      const { error } = await supabase
        .from("registros_consultor")
        .update(data)
        .eq("id", id);
      if (error) throw error;
      return { success: true, message: "Rascunho salvo com sucesso" };
    } catch (error: any) {
      return { success: false, message: "Erro ao salvar rascunho", error: error.message };
    }
  };

  const finalizarVisita = async (id: string): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    try {
      const { data: reg, error: regErr } = await supabase
        .from("registros_consultor")
        .select("version")
        .eq("id", id)
        .maybeSingle();
      if (regErr) throw regErr;
      const { error } = await supabase.rpc("rpc_finalizar_visita_v2" as any, {
        p_registro_id: id,
        p_expected_version: (reg as any)?.version ?? 1,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["visita-tecnica", id] });
      return { success: true, message: "Visita finalizada com sucesso" };
    } catch (error: any) {
      return { success: false, message: "Erro ao finalizar visita", error: error.message };
    }
  };

  const enviarParaAprovacao = async (id: string): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    try {
      const { data: reg, error: regErr } = await supabase
        .from("registros_consultor")
        .select("version")
        .eq("id", id)
        .maybeSingle();
      if (regErr) throw regErr;
      const { error } = await supabase.rpc("rpc_enviar_visita_aprovacao" as any, {
        p_registro_id: id,
        p_expected_version: (reg as any)?.version ?? 1,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["visita-tecnica", id] });
      return { success: true, message: "Visita enviada para aprovação" };
    } catch (error: any) {
      return { success: false, message: "Erro ao enviar para aprovação", error: error.message };
    }
  };

  const aprovarRecomendacao = async (id: string): Promise<FluxoResponse> => {
    // Agora centralizado na RPC que também libera se configurado, ou apenas aprova
    // Para simplificar esta fase, vamos usar a liberarRecomendacaoParaProdutor que já faz o fluxo completo
    return liberarRecomendacaoParaProdutor(id);
  };

  const fetchVersion = async (id: string): Promise<number> => {
    const { data, error } = await supabase
      .from("registros_consultor")
      .select("version")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as any)?.version ?? 1;
  };

  const invalidateVisita = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ["visita-tecnica", id] });
    queryClient.invalidateQueries({ queryKey: ["visita-workspace", id] });
  };

  const reprovarRecomendacao = async (id: string, motivo: string): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    if (!motivo?.trim()) return { success: false, message: "Informe o motivo da reprovação" };
    try {
      const { error } = await supabase.rpc("rpc_reprovar_visita" as any, {
        p_registro_id: id,
        p_expected_version: await fetchVersion(id),
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      invalidateVisita(id);
      return { success: true, message: "Visita reprovada com sucesso" };
    } catch (error: any) {
      return { success: false, message: "Erro ao reprovar visita", error: error.message };
    }
  };

  const solicitarAjusteVisita = async (id: string, motivo: string): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    if (!motivo?.trim()) return { success: false, message: "Informe o motivo do ajuste" };
    try {
      const { error } = await supabase.rpc("rpc_solicitar_ajuste_visita" as any, {
        p_registro_id: id,
        p_expected_version: await fetchVersion(id),
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      invalidateVisita(id);
      return { success: true, message: "Ajuste solicitado ao consultor" };
    } catch (error: any) {
      return { success: false, message: "Erro ao solicitar ajuste", error: error.message };
    }
  };

  const reabrirVisita = async (id: string, motivo: string): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    if (!motivo?.trim()) return { success: false, message: "Informe o motivo da reabertura" };
    try {
      const { error } = await supabase.rpc("rpc_reabrir_visita" as any, {
        p_registro_id: id,
        p_expected_version: await fetchVersion(id),
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      invalidateVisita(id);
      return { success: true, message: "Visita reaberta para revisão" };
    } catch (error: any) {
      return { success: false, message: "Erro ao reabrir visita", error: error.message };
    }
  };


  const ativarMonitoramento = async (
    id: string,
    tipo = "monitoramento_pos_visita",
    dataReferencia?: string | null,
  ): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    try {
      const { data, error } = await supabase.rpc("rpc_ativar_monitoramento_visita" as any, {
        p_registro_id: id,
        p_expected_version: await fetchVersion(id),
        p_tipo: tipo,
        p_data_referencia: dataReferencia ?? null,
      });
      if (error) throw error;
      invalidateVisita(id);
      const res = (data as any) || {};
      return {
        success: true,
        message: res.idempotent ? "Monitoramento já estava ativo" : "Monitoramento ativado",
        data: res,
      };
    } catch (error: any) {
      return { success: false, message: "Erro ao ativar monitoramento", error: error.message };
    }
  };

  const arquivarVisita = async (id: string, motivo?: string | null): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    try {
      const { error } = await supabase.rpc("rpc_arquivar_visita" as any, {
        p_registro_id: id,
        p_expected_version: await fetchVersion(id),
        p_motivo: motivo ?? null,
      });
      if (error) throw error;
      invalidateVisita(id);
      return { success: true, message: "Visita arquivada com sucesso" };
    } catch (error: any) {
      return { success: false, message: "Erro ao arquivar visita", error: error.message };
    }
  };

  // Fase 12.8 · Fase 3 — Checkout server-side
  const registrarCheckout = async (data: {
    registro_consultor_id: string;
    latitude?: number | null;
    longitude?: number | null;
    precisao_gps?: number | null;
    justificativa_sem_gps?: string | null;
    observacoes?: string | null;
    foto_path?: string | null;
    client_uuid?: string;
    data_hora_checkin?: string | null;
  }): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    const clientUuid = data.client_uuid || crypto.randomUUID();
    try {
      const { data: rpcData, error } = await supabase.rpc("rpc_realizar_checkout_visita", {
        p_registro_id: data.registro_consultor_id,
        p_client_uuid: clientUuid,
        p_latitude: data.latitude ?? null,
        p_longitude: data.longitude ?? null,
        p_precisao: data.precisao_gps ?? null,
        p_justificativa_sem_gps: data.justificativa_sem_gps ?? null,
        p_observacoes: data.observacoes ?? null,
        p_captured_at_local: data.data_hora_checkin ?? null,
        p_foto_path: data.foto_path ?? null,
      });
      if (error) throw error;
      const co = (rpcData as any) || {};
      queryClient.invalidateQueries({ queryKey: ["visita-tecnica", data.registro_consultor_id] });
      queryClient.invalidateQueries({ queryKey: ["visita-checkins", data.registro_consultor_id] });
      return {
        success: true,
        message: co.idempotent ? "Checkout já registrado" : "Presença encerrada",
        data: { id: co.id, data_hora_checkin: co.data_hora_checkin, idempotent: !!co.idempotent },
      };
    } catch (error: any) {
      console.error("Erro em registrarCheckout:", error);
      return { success: false, message: error?.message || "Erro no checkout", error: error?.message };
    }
  };

  return {
    iniciarVisita,
    criarOuObterVisitaPorSolicitacao,
    registrarCheckin,
    registrarCheckout,
    corrigirCheckinsOrfaos,
    salvarRascunho,
    finalizarVisita,
    enviarParaAprovacao,
    aprovarRecomendacao,
    reprovarRecomendacao,
    solicitarAjusteVisita,
    reabrirVisita,
    liberarRecomendacaoParaProdutor,
    converterRecomendacaoEmOS,
    programarRetorno,
    criarRetornoComRascunho,
    ativarMonitoramento,
    arquivarVisita,
    registrarTimeline
  };
}
