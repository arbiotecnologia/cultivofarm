CREATE OR REPLACE VIEW public._src_vw_esteira_laboratorio AS
SELECT
  os_id,
  origem_os,
  numero_os,
  cliente_id,
  fazenda_id,
  talhao_id,
  status_os,
  created_at,
  volume_total_ml,
  produto_id,
  microrganismo_id,
  prioridade,
  volume_solicitado_l,
  cliente_nome,
  fazenda_nome,
  talhao_nome,
  produto_nome,
  microrganismo_nome,
  partner_id,
  partner_numero,
  partner_nome,
  titular_tipo,
  titular_nome,
  programacao_id,
  status_programacao,
  data_programada,
  data_inicio_producao,
  lote_id,
  codigo_lote,
  status_lote,
  data_lote,
  cq_id,
  cq_resultado,
  data_cq,
  envase_id,
  data_envase,
  estoque_id,
  data_estoque,
  estoque_reservado_id,
  data_estoque_reservado,
  entrega_id,
  entrega_status,
  data_entrega,
  aplicacao_id,
  data_aplicacao,
  entrega_confirmada,
  aplicacao_bloqueante,
  pendencias_informativas,
  bloqueios,
  pode_finalizar,
  CASE
    WHEN status_esteira_oficial IN ('programada','aberta')
      AND (status_os = 'em_producao' OR status_programacao = 'em_producao')
      THEN 'em_producao'::text
    ELSE status_esteira_oficial
  END AS status_esteira_oficial,
  tempo_os_ate_programacao,
  tempo_programacao_ate_lote,
  tempo_lote_ate_cq,
  tempo_cq_ate_envase,
  tempo_envase_ate_entrega,
  tempo_os_ate_entrega,
  atrasado,
  CASE
    WHEN programacao_id IS NULL THEN 'Programar Produção'::text
    WHEN lote_id IS NULL THEN 'Gerar Lote'::text
    WHEN cq_id IS NULL OR cq_resultado IS NULL THEN 'Realizar CQ'::text
    WHEN cq_resultado = 'reprovado'::text THEN 'Tratar reprovação'::text
    WHEN envase_id IS NULL THEN 'Registrar Envase'::text
    WHEN estoque_reservado_id IS NULL THEN 'Gerar Estoque/Reserva'::text
    WHEN entrega_id IS NULL THEN 'Confirmar Entrega'::text
    WHEN NOT entrega_confirmada THEN 'Confirmar Entrega'::text
    WHEN pode_finalizar AND status_os <> 'finalizada'::text THEN 'Finalizar OS'::text
    WHEN status_os = 'finalizada'::text THEN 'Concluído'::text
    ELSE 'Verificar Status'::text
  END AS proxima_acao
FROM public.vw_os_integridade_esteira;

CREATE OR REPLACE FUNCTION public.rpc_avancar_esteira_laboratorio(p_os_id uuid, p_origem text, p_etapa_destino text, p_programacao_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_id uuid;
    v_profile_id uuid;
    v_role text;
    v_status_os text;
    v_etapa_anterior text;
    v_result jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
    END IF;

    SELECT role::text INTO v_role
    FROM public.user_roles
    WHERE user_id = v_user_id
      AND role IN ('administrador', 'gestor', 'producao', 'administrativo')
    LIMIT 1;

    IF v_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Seu perfil não possui permissão para avançar a esteira laboratorial.');
    END IF;

    SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_user_id LIMIT 1;

    IF p_origem IN ('manual','b2b') THEN
        SELECT status::text INTO v_status_os FROM public.ordens_servico WHERE id = p_os_id;
        IF NOT FOUND OR v_status_os IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço não encontrada.'); END IF;
    ELSIF p_origem = 'onfarm' THEN
        SELECT status::text INTO v_status_os FROM public.ordens_servico_onfarm WHERE id = p_os_id;
        IF NOT FOUND OR v_status_os IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço On-Farm não encontrada.'); END IF;
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Origem de OS inválida: ' || p_origem);
    END IF;

    v_etapa_anterior := v_status_os;

    IF v_status_os IN ('finalizada', 'cancelada') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Operação não permitida: OS já está ' || v_status_os);
    END IF;

    CASE p_etapa_destino
        WHEN 'assumir_producao' THEN
            IF p_programacao_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'ID da programação é obrigatório para assumir produção.');
            END IF;
            IF v_profile_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'Perfil do usuário não encontrado.');
            END IF;
            UPDATE public.programacao_producao
            SET status = 'em_producao', responsavel_id = v_profile_id
            WHERE id = p_programacao_id;

            IF p_origem = 'onfarm' THEN
                UPDATE public.ordens_servico_onfarm SET status = 'em_producao' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico SET status = 'em_producao' WHERE id = p_os_id;
            END IF;

            INSERT INTO public.laboratorio_esteira_eventos (os_id, origem_os, programacao_id, etapa_anterior, etapa_nova, acao, usuario_id)
            VALUES (p_os_id, p_origem, p_programacao_id, v_etapa_anterior, p_etapa_destino, p_etapa_destino, v_user_id);

            PERFORM public.refresh_esteira_laboratorio();
            RETURN jsonb_build_object('success', true, 'message', 'Produção assumida com sucesso');
        ELSE
            v_result := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, p_origem, p_etapa_destino, p_programacao_id);
            IF COALESCE((v_result->>'success')::boolean, false) THEN
              PERFORM public.refresh_esteira_laboratorio();
            END IF;
            RETURN v_result;
    END CASE;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_avancar_esteira_laboratorio(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_avancar_esteira_laboratorio(uuid, text, text, uuid) TO authenticated, service_role;

SELECT public.refresh_esteira_laboratorio();