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
    try {
      await supabase.from("laboratorio_esteira_eventos").insert({
        origem_os: params.origem,
        os_id: params.osId,
        programacao_id: params.programacaoId,
        lote_id: params.loteId,
        etapa_anterior: params.etapaAnterior,
        etapa_nova: params.etapaNova,
        acao: params.acao,
        observacao: params.observacao,
        usuario_id: user?.id
      } as any);
    } catch (e) {
      console.warn("Falha ao registrar auditoria:", e);
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
   * Registra o envase e gera a entrada no estoque em uma única operação lógica.
   * Garante que a OS avance para a etapa de estoque_reserva se for o primeiro envase.
   */
  const registrarEnvaseEEstoque = async (params: {
    envaseData: any;
    estoqueData: any;
    osId: string;
    origem: string;
    programacaoId: string;
  }) => {
    try {
      // 1. Registra o Envase
      const { data: envase, error: envErr } = await supabase
        .from("envase")
        .insert([params.envaseData])
        .select()
        .single();
      
      if (envErr) throw envErr;

      // 2. Registra o Estoque (vinculado ao envase criado)
      const { error: estErr } = await supabase
        .from("estoque_produto")
        .insert([{ ...params.estoqueData, envase_id: envase?.id ?? params.estoqueData.envase_id ?? null }]);
      
      if (estErr) throw estErr;

      // 3. Auditoria
      await registrarAuditoria({
        origem: params.origem,
        osId: params.osId,
        programacaoId: params.programacaoId,
        loteId: params.envaseData.lote_id,
        etapaNova: "estoque_gerado",
        acao: "registrar_envase_estoque",
        observacao: `Envase e entrada no estoque realizados (${params.estoqueData.quantidade} unidades).`
      });

      // 4. Avança a esteira se for o caso
      // A RPC rpc_avancar_esteira_laboratorio com 'concluir_envase' cuida disso
      await concluirEnvase(params.programacaoId, params.osId, params.origem);

      toast.success("Envase e estoque registrados com sucesso");
      invalidateAll();
      return true;
    } catch (error: any) {
      toast.error(error.message);
      return false;
    }
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

  const cancelarReservaEstoque = async (item: any, osId: string, origem: string) => {
    try {
      // Busca o registro principal "disponível" deste lote para devolver o saldo
      const { data: mainRecords } = await supabase
        .from("estoque_produto")
        .select("*")
        .eq("lote_id", item.lote_id)
        .is("quantidade_reservada", null)
        .eq("status", "disponivel")
        .limit(1);

      const mainRecord = mainRecords?.[0];

      if (mainRecord && mainRecord.id !== item.id) {
        // RESERVA PARCIAL: Devolve a quantidade ao registro principal e marca o desmembrado como estornado
        const { error: updateError } = await supabase
          .from("estoque_produto")
          .update({
            quantidade: Number(mainRecord.quantidade || 0) + Number(item.quantidade || 0),
            volume_total: (Number(mainRecord.volume_total || 0) + Number(item.volume_total || 0)) || null,
          } as any)
          .eq("id", mainRecord.id);

        if (updateError) throw updateError;

        // NÃO DELETAR. Abordagem auditável (Fase 10.2.1.11.3)
        const { error: estornoError } = await supabase
          .from("estoque_produto")
          .update({ 
            status: "estornado", 
            quantidade: 0, 
            volume_total: 0,
            observacao_reserva: `Reserva cancelada e estornada para o registro ${mainRecord.id}` 
          } as any)
          .eq("id", item.id);

        if (estornoError) throw estornoError;

        // Registrar movimentação de estorno
        await supabase.from("estoque_movimentacoes").insert({
          estoque_produto_id: mainRecord.id,
          acao: "estorno_reserva",
          quantidade: Number(item.quantidade || 0),
          status_anterior: "reservado",
          status_novo: "disponivel",
          os_id: osId,
          os_tipo: origem,
          usuario_id: user?.id,
          observacao: `Estorno de reserva parcial da OS ${osId}`
        } as any);

      } else {
        // RESERVA TOTAL: Altera o status de volta para disponível e limpa campos de reserva
        const { error } = await supabase
          .from("estoque_produto")
          .update({ 
            status: "disponivel",
            quantidade_reservada: null,
            reservado_para_os_id: null,
            reservado_para_os_tipo: null,
            reservado_para_cliente_id: null
          } as any)
          .eq("id", item.id);
        
        if (error) throw error;

        // Registrar movimentação
        await supabase.from("estoque_movimentacoes").insert({
          estoque_produto_id: item.id,
          acao: "cancelamento_reserva",
          quantidade: Number(item.quantidade || 0),
          status_anterior: "reservado",
          status_novo: "disponivel",
          os_id: osId,
          os_tipo: origem,
          usuario_id: user?.id,
          observacao: `Cancelamento de reserva total da OS ${osId}`
        } as any);
      }

      await registrarAuditoria({
        origem,
        osId,
        etapaNova: "disponivel",
        acao: "cancelar_reserva",
        observacao: `Reserva cancelada para OS ${osId}. Saldo devolvido ao estoque disponível.`
      });

      toast.success("Reserva cancelada com sucesso");
      invalidateAll();
      return true;
    } catch (error: any) {
      toast.error(error.message);
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

  const confirmarEntrega = async (entregaId: string, osId: string, origem: string) => {
    try {
      const { data: entrega, error: fetchErr } = await supabase
        .from("entregas")
        .select("*, estoque_produto_id, quantidade_entregue, tipo_entrega, motorista")
        .eq("id", entregaId)
        .single();
      
      if (fetchErr) throw fetchErr;

      // 1. Atualiza entrega
      const { error: updateErr } = await supabase
        .from("entregas")
        .update({ status: 'entregue', entregue_em: new Date().toISOString() } as any)
        .eq("id", entregaId);
      
      if (updateErr) throw updateErr;

      // 2. Atualiza OS para entregue
      const osField = origem === 'onfarm' ? 'ordem_servico_onfarm_id' : 'ordem_servico_id';
      const osTable = origem === 'onfarm' ? 'ordens_servico_onfarm' : 'ordens_servico';
      await supabase.from(osTable).update({ status: 'entregue' } as any).eq("id", osId);

      // 3. Auditoria da confirmação
      const tipo = (entrega as any)?.tipo_entrega || 'motorista';
      const quem = (entrega as any)?.motorista || (tipo === 'retirada' ? 'retirante' : 'motorista');
      const obsBase = tipo === 'retirada'
        ? `Retirada confirmada pelo cliente/parceiro (${quem}).`
        : `Entrega confirmada pelo motorista (${quem}).`;

      await registrarAuditoria({
        origem,
        osId,
        etapaNova: "entregue",
        acao: "confirmar_entrega",
        observacao: obsBase,
      });

      // 4. Verifica se todas as entregas ativas da OS estão entregues e cobrem a reserva
      //    → finaliza a OS automaticamente
      let finalizada = false;
      try {
        const { data: todasEntregas } = await supabase
          .from("entregas")
          .select("status, quantidade_entregue, estoque_produto_id")
          .eq(osField, osId);

        const ativas = (todasEntregas || []).filter((e: any) => e.status !== 'cancelada');
        const pendentes = ativas.filter((e: any) => e.status !== 'entregue');
        const totalEntregue = ativas
          .filter((e: any) => e.status === 'entregue')
          .reduce((s: number, e: any) => s + Number(e.quantidade_entregue || 0), 0);

        // Soma da quantidade reservada dos lotes vinculados à OS
        const { data: reservas } = await supabase
          .from("estoque_produto")
          .select("quantidade_reservada")
          .eq("reservado_para_os_id", osId);
        const totalReservado = (reservas || []).reduce(
          (s: number, r: any) => s + Number(r.quantidade_reservada || 0), 0,
        );

        const cobreReserva = totalReservado === 0 || totalEntregue >= totalReservado;

        if (pendentes.length === 0 && cobreReserva) {
          const ok = await avancarEtapa({
            origem,
            osId,
            programacaoId: null,
            etapaDestino: "finalizar_os",
          });
          if (ok) {
            finalizada = true;
            await registrarAuditoria({
              origem,
              osId,
              etapaAnterior: "entregue",
              etapaNova: "finalizada",
              acao: "finalizacao_automatica_por_entrega",
              observacao: obsBase + " OS finalizada automaticamente.",
            });
          }
        }
      } catch (autoErr) {
        console.warn("[confirmarEntrega] falha na finalização automática:", autoErr);
      }

      toast.success(finalizada ? "Entrega confirmada — OS finalizada" : "Entrega confirmada");
      invalidateAll();
      return true;
    } catch (error: any) {
      toast.error(error.message);
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
