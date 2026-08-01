import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type EsteiraStage =
  | "aguardando"
  | "em_producao"
  | "aguardando_cq"
  | "aprovado_cq"
  | "envase"
  | "estoque_reserva"
  | "entrega"
  | "aplicacao";


export function useEsteiraLaboratorio() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-esteira"],
    queryFn: async () => {
      const ROLES_PRODUCAO = ["administrador", "gestor", "operador_onfarm", "producao"];
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ROLES_PRODUCAO as any);
      if (rolesErr) throw rolesErr;
      const userIds = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email, ativo, user_id")
        .in("user_id", userIds);
      if (error) throw error;
      return (data ?? [])
        .filter((p: any) => p.ativo !== false)
        .sort((a: any, b: any) => (a.nome || "").localeCompare(b.nome || ""));
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["cockpit-laboratorio"] });
    qc.invalidateQueries({ queryKey: ["pcp-kanban"] });
    qc.invalidateQueries({ queryKey: ["lotes"] });
    qc.invalidateQueries({ queryKey: ["controle_qualidade"] });
    qc.invalidateQueries({ queryKey: ["envase"] });
    qc.invalidateQueries({ queryKey: ["estoque_produto"] });
    qc.invalidateQueries({ queryKey: ["entregas"] });
    qc.invalidateQueries({ queryKey: ["aplicacoes"] });
  };

  /**
   * Auditoria da esteira. NÃO engole falhas: se o histórico não puder ser
   * gravado, a operação chamadora deve falhar (requisito H da auditoria).
   * Operações críticas gravam a auditoria dentro da própria transação da RPC.
   */
  const registrarAuditoria = async (params: {
    origem: string;
    osId: string;
    programacaoId?: string;
    loteId?: string;
    etapaAnterior?: string;
    etapaNova: string;
    acao: string;
    observacao?: string;
  }) => {
    const { error } = await supabase.from("laboratorio_esteira_eventos").insert({
      origem_os: params.origem,
      os_id: params.osId,
      programacao_id: params.programacaoId,
      lote_id: params.loteId,
      etapa_anterior: params.etapaAnterior,
      etapa_nova: params.etapaNova,
      acao: params.acao,
      observacao: params.observacao,
      usuario_id: user?.id,
    } as any);
    if (error) {
      throw new Error(`Falha ao registrar auditoria da esteira: ${error.message}`);
    }
  };

  const assumirProducao = async (programacaoId: string, osId?: string, origem?: string) => {
    if (!user) return false;
    
    if (osId && origem) {
      return await avancarEtapa({
        origem,
        osId,
        programacaoId,
        etapaDestino: "assumir_producao"
      });
    }

    const { error } = await supabase
      .from("programacao_producao")
      .update({ responsavel_id: user.id, status: 'em_producao' } as any)
      .eq("id", programacaoId);
    
    if (error) {
      toast.error(error.message);
      return false;
    }
    
    toast.success("Demanda assumida com sucesso");
    invalidateAll();
    return true;
  };

  const gerarLote = async (loteData: any, osId: string, origem: string) => {
    // Guarda de unicidade: garante que cada programação só gere um lote
    if (loteData.programacao_id) {
      const { data: existente } = await supabase
        .from("lotes")
        .select("id, codigo_lote")
        .eq("programacao_id", loteData.programacao_id)
        .limit(1)
        .maybeSingle();

      if (existente) {
        toast.error(`Já existe um lote (${existente.codigo_lote}) para esta programação.`);
        invalidateAll();
        return null;
      }
    }

    const { data, error } = await supabase
      .from("lotes")
      .insert([loteData])
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      return null;
    }

    await registrarAuditoria({
      origem,
      osId,
      programacaoId: loteData.programacao_id,
      loteId: data.id,
      etapaNova: "lote_gerado",
      acao: "gerar_lote",
      observacao: `Lote ${data.codigo_lote} gerado.`
    });

    toast.success(`Lote ${data.codigo_lote} gerado com sucesso`);
    invalidateAll();
    return data;
  };


  const enviarParaCQ = async (programacaoId: string | null, osId: string, origem: string) => {
    if (!programacaoId) {
      toast.error("Programação não identificada.");
      return false;
    }

    const { data: lote } = await supabase
      .from("lotes")
      .select("id")
      .eq("programacao_id", programacaoId)
      .limit(1)
      .maybeSingle();

    if (!lote) {
      toast.error("Não é possível enviar para CQ sem um lote gerado.");
      return false;
    }

    return await avancarEtapa({
      origem,
      osId,
      programacaoId,
      etapaDestino: "enviar_cq"
    });
  };

  const aprovarCQ = async (programacaoId: string | null, osId: string, origem: string) => {
    if (!programacaoId) return false;
    return await avancarEtapa({
      origem,
      osId,
      programacaoId,
      etapaDestino: "aprovar_cq"
    });
  };

  const reprovarCQ = async (programacaoId: string | null, osId: string, origem: string) => {
    if (!programacaoId) return false;
    return await avancarEtapa({
      origem,
      osId,
      programacaoId,
      etapaDestino: "reprovar_cq"
    });
  };

  const enviarParaEnvase = async (programacaoId: string | null, osId: string, origem: string) => {
    if (!programacaoId) return false;
    const { data: lote } = await supabase
      .from("lotes")
      .select("id")
      .eq("programacao_id", programacaoId)
      .limit(1)
      .maybeSingle();

    if (lote) {
      const { data: cq } = await supabase
        .from("controle_qualidade")
        .select("resultado")
        .eq("lote_id", lote.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cq || cq.resultado !== 'aprovado') {
        toast.error("Não é possível enviar para envase sem CQ aprovado.");
        return false;
      }
    }

    return await avancarEtapa({
      origem,
      osId,
      programacaoId,
      etapaDestino: "enviar_envase"
    });
  };

  const concluirEnvase = async (programacaoId: string | null, osId: string, origem: string) => {
    if (!programacaoId) return false;
    return await avancarEtapa({
      origem,
      osId,
      programacaoId,
      etapaDestino: "concluir_envase"
    });
  };

  /**
   * Registra envase + entradas de estoque (reservado/livre) + movimentações +
   * auditoria + avanço da esteira em UMA ÚNICA TRANSAÇÃO no banco.
   *
   * Substitui a antiga orquestração client-side (insert de envase → insert de
   * estoque → auditoria → avanço), que deixava dados parciais quando uma etapa
   * intermediária falhava. A divisão entre volume reservado para a OS e
   * excedente livre passa a ser calculada no servidor.
   */
  const registrarEnvaseTransacional = async (params: {
    loteId: string;
    osId: string;
    origem: string;
    programacaoId: string;
    linhas: Array<{ tipo_embalagem: string; quantidade: number }>;
    validade: string;
    operador?: string | null;
    idempotencyKey?: string | null;
  }): Promise<any | null> => {
    try {
      const { data, error } = await (supabase as any).rpc("rpc_cockpit_registrar_envase_v1", {
        p_lote_id: params.loteId,
        p_os_id: params.osId,
        p_origem: params.origem,
        p_programacao_id: params.programacaoId,
        p_linhas: params.linhas,
        p_validade: params.validade,
        p_operador: params.operador ?? null,
        p_idempotency_key: params.idempotencyKey ?? null,
      });

      if (error) {
        toast.error(traduzErroCockpit(error.message));
        return null;
      }

      if (data?.replay) {
        toast.info("Envase já registrado — operação repetida ignorada.");
      } else {
        toast.success(data?.message || "Envase e estoque registrados.");
      }
      invalidateAll();
      return data;
    } catch (error: any) {
      toast.error(traduzErroCockpit(error?.message));
      return null;
    }
  };

  /**
   * Compatibilidade com a página Envase: converte o payload legado em uma
   * chamada única à RPC transacional.
   */
  const registrarEnvaseEEstoque = async (params: {
    envaseData: any;
    estoqueData: any;
    osId: string;
    origem: string;
    programacaoId: string;
  }) => {
    const result = await registrarEnvaseTransacional({
      loteId: params.envaseData.lote_id,
      osId: params.osId,
      origem: params.origem,
      programacaoId: params.programacaoId,
      linhas: [
        {
          tipo_embalagem: params.envaseData.tipo_embalagem,
          quantidade: Number(params.envaseData.quantidade || 0),
        },
      ],
      validade: params.estoqueData?.validade,
      operador: params.envaseData.operador ?? null,
    });
    return !!result;
  };

  const gerarEstoque = async (estoqueData: any, osId: string, origem: string) => {
    // Mantido por retrocompatibilidade, mas prefira registrarEnvaseEEstoque
    const { error } = await supabase
      .from("estoque_produto")
      .insert([estoqueData] as any);

    if (error) {
      toast.error(error.message);
      return false;
    }

    await registrarAuditoria({
      origem,
      osId,
      loteId: estoqueData.lote_id,
      etapaNova: "estoque_gerado",
      acao: "gerar_estoque"
    });

    toast.success("Entrada no estoque realizada");
    invalidateAll();
    return true;
  };

  const reservarEstoque = async (
    item: any,
    reservaData: any,
    osId: string,
    origem: string,
    overrideOrigem: boolean = false,
  ) => {
    const qtyToReserve = Number(reservaData.quantidade_reservada);
    if (!qtyToReserve || qtyToReserve <= 0) {
      toast.error("Informe uma quantidade válida.");
      return false;
    }

    // Guarda de rastreabilidade: garante que o lote pertence à OS informada
    // (a menos que o operador tenha confirmado override explicitamente na UI).
    try {
      const loteId = item?.lote_id;
      if (loteId && !overrideOrigem) {
        const { data: loteRow } = await supabase
          .from("lotes")
          .select("programacao_id")
          .eq("id", loteId)
          .maybeSingle();
        const programacaoId = (loteRow as any)?.programacao_id;
        if (programacaoId) {
          const { data: progRow } = await supabase
            .from("programacao_producao")
            .select("ordem_servico_id, ordem_servico_onfarm_id")
            .eq("id", programacaoId)
            .maybeSingle();
          const origemOsId =
            (progRow as any)?.ordem_servico_id ??
            (progRow as any)?.ordem_servico_onfarm_id ??
            null;
          if (origemOsId && origemOsId !== osId) {
            toast.error(
              "Este lote foi produzido para outra OS/OP. Confirme o override na tela antes de reservar.",
            );
            return false;
          }
        }
      }
    } catch (e) {
      console.warn("[reservarEstoque] verificação de origem falhou:", e);
    }

    try {
      const isB2B = origem === "b2b";
      const { error } = await (supabase as any).rpc("reservar_estoque_item", {
        p_item_id: item.id,
        p_qty: qtyToReserve,
        p_os_id: osId,
        p_os_tipo: origem,
        p_cliente_id: isB2B ? null : (reservaData.cliente_id ?? null),
        p_partner_id: isB2B ? (reservaData.partner_id ?? null) : null,
        p_partner_order_id: isB2B ? (reservaData.partner_order_id ?? null) : null,
        p_observacao: reservaData.observacao ?? null,
      });

      if (error) {
        toast.error(error.message || "Erro ao reservar estoque");
        invalidateAll();
        return false;
      }

      await registrarAuditoria({
        origem,
        osId,
        etapaNova: "estoque_reservado",
        acao: "reservar_estoque",
        observacao: overrideOrigem
          ? `Reserva com OVERRIDE de origem para OS ${osId}`
          : `Reserva realizada para OS ${osId}`,
      });

      const titular = reservaData?.titular_nome || reservaData?.cliente_nome;
      toast.success(titular ? `Estoque reservado para ${titular}` : "Estoque reservado com sucesso");
      invalidateAll();
      return true;
    } catch (error: any) {
      toast.error(error.message);
      return false;
    }
  };

  /**
   * Cancela/estorna a reserva em UMA ÚNICA TRANSAÇÃO no banco (lock de linha,
   * devolução de saldo, estorno auditável e movimentação). Substitui a antiga
   * sequência de updates client-side, que podia duplicar ou perder saldo.
   */
  const cancelarReservaEstoque = async (
    item: any,
    osId: string,
    origem: string,
    motivo?: string,
  ) => {
    try {
      const { data, error } = await (supabase as any).rpc("rpc_cockpit_cancelar_reserva_v1", {
        p_item_id: item?.id,
        p_os_id: osId,
        p_origem: origem,
        p_motivo: motivo ?? null,
      });

      if (error) {
        toast.error(traduzErroCockpit(error.message));
        return false;
      }

      toast.success(data?.replay ? "Reserva já estava cancelada." : "Reserva cancelada com sucesso");
      invalidateAll();
      return true;
    } catch (error: any) {
      toast.error(traduzErroCockpit(error?.message));
      return false;
    }
  };

  const criarEntrega = async (entregaData: any, osId: string, origem: string) => {
    if (!entregaData.estoque_produto_id) {
      toast.error("Não é possível criar entrega sem estoque disponível.");
      return false;
    }

    try {
      const osField = origem === 'onfarm' ? 'ordem_servico_onfarm_id' : 'ordem_servico_id';
      const { data: created, error } = await supabase
        .from("entregas")
        .insert([{
          ...entregaData,
          [osField]: osId
        }] as any)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      await registrarAuditoria({
        origem,
        osId,
        etapaNova: "entrega_criada",
        acao: "criar_entrega"
      });

      // Se a OS estiver em envase ou estoque_reserva, avança para entrega
      await avancarEtapa({
        origem,
        osId,
        programacaoId: null,
        etapaDestino: "enviar_entrega"
      });

      toast.success("Entrega registrada");
      invalidateAll();
      return created;
    } catch (error: any) {
      console.error("[criarEntrega] falha no insert:", error);
      throw new Error(error?.message || "Falha ao gravar entrega.");
    }
  };

  /**
   * Confirma a entrega em UMA ÚNICA TRANSAÇÃO: baixa do estoque reservado,
   * atualização da OS, verificação de cobertura e finalização automática.
   * Chamadas repetidas retornam replay em vez de dupla baixa/dupla finalização.
   */
  const confirmarEntrega = async (entregaId: string, osId: string, origem: string) => {
    try {
      const { data, error } = await (supabase as any).rpc("rpc_cockpit_confirmar_entrega_v1", {
        p_entrega_id: entregaId,
        p_os_id: osId,
        p_origem: origem,
      });

      if (error) {
        toast.error(traduzErroCockpit(error.message));
        return false;
      }

      if (data?.replay) {
        toast.info("Entrega já confirmada anteriormente.");
      } else {
        toast.success(data?.message || "Entrega confirmada");
      }
      invalidateAll();
      return true;
    } catch (error: any) {
      toast.error(traduzErroCockpit(error?.message));
      return false;
    }
  };

  const liberarAplicacao = async (programacaoId: string | null, osId: string, origem: string) => {
    const osField = origem === 'onfarm' ? 'ordem_servico_onfarm_id' : 'ordem_servico_id';
    
    const { data: entrega } = await supabase
      .from("entregas")
      .select("status")
      .eq(osField, osId)
      .eq("status", "entregue")
      .limit(1)
      .maybeSingle();

    if (!entrega) {
      toast.error("Não é possível liberar aplicação sem entrega confirmada.");
      return false;
    }

    await registrarAuditoria({
      origem,
      osId,
      programacaoId,
      etapaNova: "liberado_aplicacao",
      acao: "liberar_aplicacao"
    });

    toast.success("Aplicação liberada");
    invalidateAll();
    return true;
  };

  const validarIntegridade = async (osId: string, origem: string) => {
    const { data, error } = await supabase.rpc("rpc_validar_integridade_esteira", {
      p_os_id: osId,
      p_origem: origem
    });

    if (error) {
      console.error("Erro ao validar integridade:", error);
      return { success: false, message: "Erro técnico na validação" };
    }

    return data;
  };

  const finalizarOS = async (programacaoId: string | null, osId: string, origem: string) => {
    return await avancarEtapa({
      origem,
      osId,
      programacaoId,
      etapaDestino: "finalizar_os"
    });
  };
  const atualizarPrioridade = async (osId: string, origem: "manual" | "onfarm", prioridade: string) => {
    const table = origem === "onfarm" ? "ordens_servico_onfarm" : "ordens_servico";
    const { error } = await supabase
      .from(table as any)
      .update({ prioridade } as any)
      .eq("id", osId);

    if (error) {
      toast.error(error.message);
      return false;
    }

    toast.success("Prioridade atualizada");
    invalidateAll();
    return true;
  };

  const atualizarDataProgramada = async (programacaoId: string, data: string) => {
    const { error } = await supabase
      .from("programacao_producao")
      .update({ data_programada: data || null } as any)
      .eq("id", programacaoId);

    if (error) {
      toast.error(error.message);
      return false;
    }

    toast.success("Data programada atualizada");
    invalidateAll();
    return true;
  };

  const vincularResponsavel = async (programacaoId: string, responsavelId: string) => {
    const { error } = await supabase
      .from("programacao_producao")
      .update({ responsavel_id: responsavelId } as any)
      .eq("id", programacaoId);

    if (error) {
      toast.error(error.message);
      return false;
    }

    toast.success("Responsável vinculado");
    invalidateAll();
    return true;
  };

  const avancarEtapa = async (params: {
    origem: string;
    osId: string;
    programacaoId: string | null;
    etapaDestino: string;
    observacao?: string;
  }) => {
    try {
      // Garantir que programacaoId seja null se for string vazia
      const progId = params.programacaoId && params.programacaoId.trim() !== "" ? params.programacaoId : null;

      const { data, error } = await supabase.rpc("rpc_avancar_esteira_laboratorio", {
        p_os_id: params.osId,
        p_origem: params.origem,
        p_etapa_destino: params.etapaDestino,
        p_programacao_id: progId,
      });

      if (error) throw error;
      
      const result = data as any;
      if (result?.success === false) {
        toast.error(result.message || "Erro ao avançar etapa");
        return false;
      }

      // Tratar mensagens específicas de estoque ou envase pendente
      if (result.message?.includes("estoque/reserva")) {
        toast.warning(result.message);
        invalidateAll();
        return true; 
      }

      toast.success(result?.message || "Etapa avançada com sucesso");
      invalidateAll();
      return true;
    } catch (e: any) {
      toast.error(e.message || "Erro na comunicação com o servidor");
      return false;
    }
  };

  // --- Helpers de orquestração (fonte única para PCP/Cockpit) ---

  const proximaEtapaDoStage = (stage: EsteiraStage): string | null => {
    switch (stage) {
      case "aguardando": return "assumir_producao";
      case "em_producao": return "enviar_cq";
      case "aprovado_cq": return "enviar_envase";
      case "envase": return "concluir_envase";
      case "aplicacao": return "finalizar_os";
      default: return null;
    }
  };

  const executarProximaAcao = async (item: {
    id: string;
    os_id: string;
    origem: string;
    stage: EsteiraStage;
  }): Promise<boolean> => {
    if (!item.os_id) {
      toast.error("OS vinculada não encontrada.");
      return false;
    }
    switch (item.stage) {
      case "aguardando":
        return await assumirProducao(item.id, item.os_id, item.origem);
      case "em_producao":
        return await enviarParaCQ(item.id, item.os_id, item.origem);
      case "aprovado_cq":
        return await enviarParaEnvase(item.id, item.os_id, item.origem);
      case "envase":
        return await concluirEnvase(item.id, item.os_id, item.origem);
      case "entrega":
        // Liberar finalização se já estiver entregue
        return await finalizarOS(item.id, item.os_id, item.origem);
      case "aguardando_cq":
        toast.info("Registre o resultado do CQ no Cockpit Laboratório.");
        return false;
      case "estoque_reserva":
        toast.info("Crie a entrega no módulo Entregas com o estoque disponível.");
        return false;
      case "aplicacao" as any: // stage legado se ainda vier do banco
        return await finalizarOS(item.id, item.os_id, item.origem);
      default:
        toast.info("Sem próxima ação automática para este estágio.");
        return false;
    }

  };

  return {
    profiles,
    assumirProducao,
    gerarLote,
    enviarParaCQ,
    aprovarCQ,
    reprovarCQ,
    enviarParaEnvase,
    concluirEnvase,
    registrarEnvaseEEstoque,
    gerarEstoque,
    reservarEstoque,
    cancelarReservaEstoque,
    criarEntrega,
    confirmarEntrega,
    liberarAplicacao,
    finalizarOS,
    validarIntegridade,
    atualizarPrioridade,
    atualizarDataProgramada,
    vincularResponsavel,
    avancarEtapa,
    proximaEtapaDoStage,
    executarProximaAcao
  };
}
