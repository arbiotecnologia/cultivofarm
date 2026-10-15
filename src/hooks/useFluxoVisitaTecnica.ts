import { useEffect, useRef } from "react";
import { RPC_GERACAO_OS_DISPONIVEL } from "@/lib/fluxo-tecnico/fluxo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { mensagemAmigavelVisita, codigoTecnicoVisita } from "@/lib/visita/visitaErrorMessages";

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
  const { user, profile, roles, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const decisionLock = useRef(false);
  const conversionActor = JSON.stringify([loading, user?.id, profile?.user_id, profile?.ativo, profile?.organization_id, [...roles].sort()]);
  const conversionFence = useRef({ actor: conversionActor, epoch: 0 });
  if (conversionFence.current.actor !== conversionActor) conversionFence.current = { actor: conversionActor, epoch: conversionFence.current.epoch + 1 };
  useEffect(() => () => { conversionFence.current.epoch += 1; }, []);
  const actorScope = `${user?.id ?? ""}:${profile?.organization_id ?? ""}:${roles.join(",")}`;
  const currentActor = useRef(actorScope);
  currentActor.current = actorScope;

  // Apenas prefixos existentes ligados à decisão; nunca limpar cache global.
  const invalidateDecision = async (id: string) => {
    await Promise.all([
      ...["visita-tecnica", "visita-workspace", "mobile-wizard-registro", "wizard-revisao-registro",
        "visita-aprovacoes", "visita-status-log", "visita-timeline", "inconsistencias-visita"].map(
        (key) => queryClient.invalidateQueries({ queryKey: [key, id] }),
      ),
      ...["fluxo-pendentes", "aprovacoes-todas", "atendimentos-tecnicos", "atendimentos-tecnicos-resumo",
        "solicitacoes", "visitas"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    ]);
  };

  const executeDecision = async (
    id: string,
    action: "aprovar" | "ajuste" | "reprovar" | "reabrir",
    motivo = "",
    expectedVersion?: number,
  ): Promise<FluxoResponse> => {
    if (loading || !user || profile?.user_id !== user.id || profile.ativo !== true || !profile.organization_id) {
      return { success: false, message: "Sessão indisponível. Entre novamente para continuar." };
    }
    if (!roles.some((role) => role === "administrador" || (action !== "reabrir" && role === "gestor"))) {
      return { success: false, message: "Seu perfil não permite esta decisão." };
    }
    if (action !== "aprovar" && !motivo.trim()) return { success: false, message: "Informe o motivo para esta decisão." };
    if (decisionLock.current) return { success: false, message: "Uma decisão já está em andamento." };
    decisionLock.current = true;
    const scope = actorScope;
    try {
      // Versão/status/permissão canônicos antes da chamada; nunca usar default inventado.
      const { data: wsData, error: wsError } = await supabase.rpc("rpc_get_visita_workspace", { p_registro_id: id });
      if (wsError) throw wsError;
      const ws = wsData && typeof wsData === "object" && !Array.isArray(wsData) ? wsData : {};
      const permissions = ws.permissions;
      const canApprove = permissions && typeof permissions === "object" && !Array.isArray(permissions) && permissions.can_approve === true;
      const requiredStatus = action === "reabrir" ? "aprovado" : "enviado_aprovacao";
      if (scope !== currentActor.current || !canApprove || ws.status !== requiredStatus) {
        return { success: false, message: "Esta visita não está disponível para esta decisão." };
      }
      const version = expectedVersion ?? ws.version;
      if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
        return { success: false, message: "Não foi possível confirmar a versão da visita." };
      }
      const result = action === "aprovar"
        ? await supabase.rpc("rpc_liberar_recomendacao_produtor", { p_registro_id: id })
        : await supabase.rpc(action === "ajuste" ? "rpc_solicitar_ajuste_visita" : action === "reprovar" ? "rpc_reprovar_visita" : "rpc_reabrir_visita", {
          p_registro_id: id, p_expected_version: version, p_motivo: motivo.trim(),
        });
      if (result.error) throw result.error;
      const out = result.data && typeof result.data === "object" && !Array.isArray(result.data) ? result.data : {};
      const success = action === "aprovar" ? out.success === true : out.ok === true;
      if (!success) return { success: false, message: "Não foi possível concluir esta decisão. Reconsulte a visita e tente novamente." };
      if (scope !== currentActor.current) return { success: false, message: "A sessão mudou. Reconsulte a visita na sessão atual." };
      await invalidateDecision(id);
      return { success: true, message: action === "reabrir" ? "Análise reaberta." : "Decisão registrada.", data: out };
    } catch (error: unknown) {
      return { success: false, message: mensagemAmigavelVisita(error), error: codigoTecnicoVisita(error) ?? undefined };
    } finally {
      decisionLock.current = false;
    }
  };

  // --- Funções de Ação ---

  /**
   * Início de atendimento a partir de uma demanda do produtor.
   *
   * Fonte única e autoritativa: `rpc_iniciar_atendimento_solicitacao_v1`.
   * A RPC executa em uma única transação: valida o técnico, atribui a demanda
   * de forma atômica (advisory lock — apenas um técnico vence a disputa),
   * cria ou reaproveita a visita (idempotente por `client_uuid`) e registra a
   * timeline. O front NÃO faz INSERT/UPDATE direto nessas tabelas.
   */
  const criarOuObterVisitaPorSolicitacao = async (
    solicitacaoId: string,
    clientUuid?: string,
  ): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Usuário não autenticado" };

    try {
      const { data, error } = await (supabase as any).rpc("rpc_iniciar_atendimento_solicitacao_v1" as never, {
        p_solicitacao_id: solicitacaoId,
        p_client_uuid: clientUuid ?? crypto.randomUUID(),
      } as never);

      if (error) throw error;

      const res = (data ?? {}) as any;
      if (!res.ok) {
        const msg =
          res.error === "already_assigned"
            ? "Esta demanda já foi assumida por outro técnico."
            : res.error === "technical_access_required"
              ? "Você não possui acesso técnico a este cliente."
              : res.error === "forbidden"
                ? "Perfil sem permissão para atender demandas."
                : res.error === "not_found"
                  ? "Demanda não encontrada."
                  : "Não foi possível iniciar o atendimento.";
        return { success: false, message: msg, error: res.error };
      }

      queryClient.invalidateQueries({ queryKey: ["solicitacoes"] });
      queryClient.invalidateQueries({ queryKey: ["atendimentos-tecnicos"] });
      queryClient.invalidateQueries({ queryKey: ["atendimentos-tecnicos-resumo"] });

      return {
        success: true,
        message: res.idempotent ? "Atendimento já iniciado" : "Atendimento iniciado",
        data: {
          id: res.registro_id,
          status: res.status,
          version: res.version,
          can_edit: res.can_edit,
          next_route: res.next_route,
        },
      };
    } catch (error: any) {
      console.error("Erro em criarOuObterVisitaPorSolicitacao:", error);
      return { success: false, message: "Erro ao iniciar atendimento", error: error.message };
    }
  };

  const iniciarVisita = async (solicitacaoId: string) => {
    const res = await criarOuObterVisitaPorSolicitacao(solicitacaoId);
    if (res.success) {
      // Portais técnicos mobile: rota canônica do wizard.
      navigate(res.data.next_route ?? `/app/visita/${res.data.id}`);
    } else {
      toast.error(res.message);
    }
    return res.data?.id;
  };


  const registrarTimeline = async (solicitacaoId: string, tipo: string, descricao: string) => {
    if (!solicitacaoId || !user) return;
    await (supabase as any).from("solicitacoes_timeline").insert({
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
      const { data: rpcData, error } = await (supabase as any).rpc("rpc_realizar_checkin_visita", {
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
        await (supabase as any).from("registros_consultor_arquivos").insert(filePayload);
      }

      return { success: true, message: "Check-in realizado", data: { id: checkin.id, data_hora_checkin: checkin.data_hora_checkin, idempotent: !!checkin.idempotent } };
    } catch (error: any) {
      // H9-GR: código técnico só no log interno; usuário recebe texto amigável.
      console.error("Erro em registrarCheckin:", codigoTecnicoVisita(error) ?? error?.message, error);
      return {
        success: false,
        message: mensagemAmigavelVisita(error, "Não foi possível registrar o check-in. Tente novamente."),
        error: error?.message,
      };
    }
  };

  const corrigirCheckinsOrfaos = async (): Promise<FluxoResponse> => {
    if (!user) return { success: false, message: "Não autenticado" };
    try {
      // 1. Buscar check-ins com solicitação_id mas sem registro_consultor_id
      const { data: orfaos, error: fetchError } = await (supabase as any)
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
        const { data: visitas } = await (supabase as any)
          .from("registros_consultor")
          .select("id")
          .eq("solicitacao_id", checkin.solicitacao_id);

        if (visitas && visitas.length === 1) {
          // Vínculo único - correção segura
          await (supabase as any)
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

  const liberarRecomendacaoParaProdutor = (registroId: string): Promise<FluxoResponse> =>
    executeDecision(registroId, "aprovar");

  const converterRecomendacaoEmOS = async (registroId: string, observacao?: string): Promise<FluxoResponse> => {
    if (!RPC_GERACAO_OS_DISPONIVEL) return { success: false, message: "Encaminhamento indisponível nesta fase." };
    if (loading || !user || profile?.user_id !== user.id || profile.ativo !== true || !profile.organization_id) {
      return { success: false, message: "Sessão indisponível. Entre novamente para continuar." };
    }
    if (!roles.some(role => ["administrador", "gestor", "consultor_tecnico", "tecnico_agronomo"].includes(role))) {
      return { success: false, message: "Seu perfil não permite este encaminhamento." };
    }
    if (decisionLock.current) return { success: false, message: "Uma operação já está em andamento." };
    decisionLock.current = true;
    const scope = actorScope;
    const epoch = conversionFence.current.epoch;
    try {
      const { data: wsData, error: wsError } = await supabase.rpc("rpc_get_visita_workspace", { p_registro_id: registroId });
      if (wsError) throw wsError;
      const ws = wsData as { status?: string; permissions?: { can_convert_os?: boolean; can_manage?: boolean } } | null;
      if ((scope !== currentActor.current || epoch !== conversionFence.current.epoch) || ws?.permissions?.can_manage !== true || ws.permissions.can_convert_os !== true || !["aprovado", "convertido_os"].includes(ws.status ?? "")) {
        return { success: false, message: "Esta visita não está disponível para encaminhamento laboratorial." };
      }
      // Retry manual por visita: o servidor faz lock/replay. Nunca repetir escrita automaticamente.
      const { data, error } = await supabase.rpc("rpc_converter_visita_em_os", {
        p_registro_id: registroId, p_observacao: observacao?.trim() || null,
      });
      if (error) throw error;
      if ((scope !== currentActor.current || epoch !== conversionFence.current.epoch)) return { success: false, message: "A sessão mudou. Reconsulte a visita na sessão atual." };
      const res = data as { success?: boolean; os_id?: string; registro_id?: string; already_exists?: boolean; numero_os?: string; code?: string } | null;
      if (res?.success !== true) {
        const messages: Record<string, string> = {
          LAB_VISIT_NO_SELECTION: "Revise a visita e marque uma recomendação biológica ou um microrganismo para encaminhar à OS.",
          LAB_VISIT_MULTIPLE_SELECTIONS: "Revise os encaminhamentos e mantenha apenas uma recomendação para esta visita.",
          LAB_VISIT_SELECTION_CONFLICT: "O item encaminhado não está disponível para produção. Químicos, adubos e itens sem família não geram produção.",
          LAB_VISIT_EMPTY_RECOMMENDATION: "Preencha a recomendação técnica encaminhada antes de gerar a OS.",
          LAB_VISIT_CONVERSION_FAILED: "Não foi possível encaminhar a recomendação. Nenhuma alteração foi mantida; revise a visita.",
        };
        return { success: false, message: messages[res?.code ?? ""] ?? "Não foi possível encaminhar esta visita. Reconsulte antes de tentar novamente." };
      }
      if (typeof res.os_id !== "string" || !res.os_id || res.registro_id !== registroId) {
        return { success: false, message: "Não foi possível confirmar a OS. Reconsulte a visita antes de tentar novamente." };
      }
      await invalidateDecision(registroId);
      if ((scope !== currentActor.current || epoch !== conversionFence.current.epoch)) return { success: false, message: "A sessão mudou. Reconsulte a visita na sessão atual." };
      await Promise.all(["ordens-servico", "os-onfarm", "cockpit-laboratorio", "pcp-kanban"].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
      if ((scope !== currentActor.current || epoch !== conversionFence.current.epoch)) return { success: false, message: "A sessão mudou. Reconsulte a visita na sessão atual." };
      return { success: true, message: res.already_exists ? "Encaminhamento já registrado para esta visita." : "OS e programação pendente criadas. Consulte a OS para validar o volume antes de fabricar.",
        os_id: res.os_id, numero_os: res.numero_os, already_exists: res.already_exists, data: res };
    } catch (error: unknown) {
      return { success: false, message: mensagemAmigavelVisita(error, "Não foi possível confirmar o encaminhamento. Reconsulte a visita antes de tentar novamente.") };
    } finally { decisionLock.current = false; }
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
      const { data: res, error } = await (supabase as any).rpc("rpc_programar_retorno_visita" as any, {
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

  const readWorkflowContext = async (id: string, statuses: string[], permission: "can_edit" | "can_manage") => {
    if (loading || !user || profile?.user_id !== user.id || profile.ativo !== true || !profile.organization_id) {
      throw new Error("unauthenticated");
    }
    const scope = actorScope;
    const { data, error } = await supabase.rpc("rpc_get_visita_workspace", { p_registro_id: id });
    if (error) throw error;
    const ws = data as { status?: string; version?: number; permissions?: Record<string, boolean> } | null;
    if (scope !== currentActor.current || !ws || !statuses.includes(ws.status ?? "") || ws.permissions?.[permission] !== true) {
      throw new Error("forbidden_visita");
    }
    if (!ws.version || !Number.isInteger(ws.version)) throw new Error("version_conflict");
    return { version: ws.version, scope };
  };

  const salvarRascunho = async (id: string, data: any): Promise<FluxoResponse> => {
    if (decisionLock.current) return { success: false, message: "Uma operação já está em andamento." };
    decisionLock.current = true;
    try {
      const context = await readWorkflowContext(id, ["rascunho", "em_andamento"], "can_edit");
      // Este canal salva conteúdo, nunca status/versão/ownership vindos do caller.
      if (Object.keys(data).some(key => ["status", "version", "created_by", "consultor_responsavel", "organization_id"].includes(key))) {
        throw new Error("forbidden_visita");
      }
      const { data: saved, error } = await supabase.from("registros_consultor").update(data)
        .eq("id", id).eq("version", context.version).select("id").single();
      if (error) throw error;
      if (!saved || context.scope !== currentActor.current) throw new Error("version_conflict");
      await invalidateDecision(id);
      return { success: true, message: "Rascunho salvo com sucesso" };
    } catch (error: unknown) {
      return { success: false, message: mensagemAmigavelVisita(error) };
    } finally { decisionLock.current = false; }
  };

  const executeWorkflow = async (id: string, action: "finalizar" | "enviar"): Promise<FluxoResponse> => {
    if (decisionLock.current) return { success: false, message: "Uma operação já está em andamento." };
    decisionLock.current = true;
    try {
      const context = await readWorkflowContext(id, action === "finalizar" ? ["rascunho", "em_andamento"] : ["finalizado"], action === "finalizar" ? "can_edit" : "can_manage");
      const { data, error } = await supabase.rpc(action === "finalizar" ? "rpc_finalizar_visita_v2" : "rpc_enviar_visita_aprovacao", {
        p_registro_id: id, p_expected_version: context.version,
      });
      if (error) throw error;
      const out = data as { id?: string; status?: string; version?: number; ok?: boolean; success?: boolean } | null;
      const target = action === "finalizar" ? "finalizado" : "enviado_aprovacao";
      if (!out || out.ok === false || out.success === false || out.id !== id || out.status !== target || !out.version || context.scope !== currentActor.current) {
        throw new Error("Não foi possível confirmar a operação.");
      }
      await invalidateDecision(id);
      return { success: true, message: action === "finalizar" ? "Visita finalizada com sucesso" : "Visita enviada para aprovação" };
    } catch (error: unknown) {
      return { success: false, message: mensagemAmigavelVisita(error) };
    } finally { decisionLock.current = false; }
  };
  const finalizarVisita = (id: string) => executeWorkflow(id, "finalizar");
  const enviarParaAprovacao = (id: string) => executeWorkflow(id, "enviar");

  const aprovarRecomendacao = async (id: string): Promise<FluxoResponse> => {
    // Agora centralizado na RPC que também libera se configurado, ou apenas aprova
    // Para simplificar esta fase, vamos usar a liberarRecomendacaoParaProdutor que já faz o fluxo completo
    return liberarRecomendacaoParaProdutor(id);
  };

  const fetchVersion = async (id: string): Promise<number> => {
    const { data, error } = await (supabase as any)
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

  const reprovarRecomendacao = (id: string, motivo: string, expectedVersion?: number): Promise<FluxoResponse> =>
    executeDecision(id, "reprovar", motivo, expectedVersion);

  const solicitarAjusteVisita = (id: string, motivo: string, expectedVersion?: number): Promise<FluxoResponse> =>
    executeDecision(id, "ajuste", motivo, expectedVersion);

  const reabrirVisita = (id: string, motivo: string, expectedVersion?: number): Promise<FluxoResponse> =>
    executeDecision(id, "reabrir", motivo, expectedVersion);

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
      const { data: rpcData, error } = await (supabase as any).rpc("rpc_realizar_checkout_visita" as any, {
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
      // H9-GR: código técnico só no log interno; usuário recebe texto amigável.
      console.error("Erro em registrarCheckout:", codigoTecnicoVisita(error) ?? error?.message, error);
      return {
        success: false,
        message: mensagemAmigavelVisita(error, "Não foi possível encerrar a presença. Tente novamente."),
        error: error?.message,
      };
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
