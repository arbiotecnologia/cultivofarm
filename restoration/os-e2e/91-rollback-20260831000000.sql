-- ROLLBACK EXATO da migration 11-migration-20260831000000_os_e2e_fase5_idempotencia.sql
-- Restaura as definicoes vigentes imediatamente antes da Fase 5.
-- Guard fail-closed: staging ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk RECUSADA.
DO $guard$
BEGIN
  IF current_database() = 'navfzbwgwzruipouyfnk'
     OR coalesce(current_setting('lovable.project_ref', true), '') = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_PRODUCAO';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public._rpc_avancar_esteira_laboratorio_internal(p_os_id uuid, p_origem_os text, p_etapa_destino text, p_programacao_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_user_role public.app_role;
    v_profile_id UUID;
    v_status_atual TEXT;
    v_lote_id UUID;
    v_etapa_anterior_os TEXT;
    v_tabela_os TEXT;
    v_validacao jsonb;
    v_cq_atual TEXT;
BEGIN
    SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
    SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

    IF p_origem_os IN ('manual','b2b') THEN v_tabela_os := 'ordens_servico';
    ELSE v_tabela_os := 'ordens_servico_onfarm';
    END IF;

    SELECT * INTO v_validacao FROM public.rpc_validar_integridade_esteira(p_os_id, p_origem_os, p_etapa_destino);
    IF NOT (v_validacao->>'permitido')::BOOLEAN THEN
        RETURN jsonb_build_object('success', false, 'message', (v_validacao->'bloqueios'->>0));
    END IF;

    EXECUTE format('SELECT status::text FROM %I WHERE id = $1 FOR UPDATE', v_tabela_os)
    INTO v_status_atual USING p_os_id;

    IF v_status_atual IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço não encontrada.'); END IF;

    v_etapa_anterior_os := v_status_atual;

    IF p_programacao_id IS NOT NULL AND p_programacao_id <> '00000000-0000-0000-0000-000000000000'::uuid THEN
        SELECT id INTO v_lote_id FROM public.lotes WHERE programacao_id = p_programacao_id FOR UPDATE;
    ELSE
        IF p_origem_os IN ('manual','b2b') THEN
            SELECT l.id INTO v_lote_id FROM public.lotes l JOIN public.programacao_producao pp ON l.programacao_id = pp.id WHERE pp.ordem_servico_id = p_os_id LIMIT 1;
        ELSE
            SELECT l.id INTO v_lote_id FROM public.lotes l JOIN public.programacao_producao pp ON l.programacao_id = pp.id WHERE pp.ordem_servico_onfarm_id = p_os_id LIMIT 1;
        END IF;
    END IF;

    CASE p_etapa_destino
        WHEN 'assumir_producao' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'em_producao');
            IF p_programacao_id IS NOT NULL THEN
                UPDATE public.programacao_producao SET status = 'em_producao', responsavel_id = v_profile_id WHERE id = p_programacao_id;
            END IF;
        WHEN 'gerar_lote' THEN NULL;
        WHEN 'enviar_cq' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'em_cq');
            UPDATE public.lotes SET status = 'aguardando_cq' WHERE id = v_lote_id;
        WHEN 'aprovar_cq', 'reprovar_cq' THEN
            IF v_lote_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'Nenhum lote localizado para registrar o CQ.');
            END IF;
            PERFORM pg_advisory_xact_lock(hashtext('cq_lote:' || v_lote_id::text));

            -- laudo mais recente do lote (idempotência determinística)
            SELECT resultado::text INTO v_cq_atual
              FROM public.controle_qualidade
             WHERE lote_id = v_lote_id
             ORDER BY created_at DESC, id DESC
             LIMIT 1;

            IF p_etapa_destino = 'aprovar_cq' THEN
                UPDATE public.lotes SET status = 'aprovado' WHERE id = v_lote_id;
                IF v_cq_atual IS DISTINCT FROM 'aprovado' THEN
                    INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id)
                    VALUES (v_lote_id, 'aprovado', v_profile_id);
                END IF;
            ELSE
                UPDATE public.lotes SET status = 'reprovado' WHERE id = v_lote_id;
                IF v_cq_atual IS DISTINCT FROM 'reprovado' THEN
                    INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id)
                    VALUES (v_lote_id, 'reprovado', v_profile_id);
                END IF;
            END IF;
        WHEN 'enviar_envase' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'envase');
        WHEN 'concluir_envase' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'pronto_entrega');
        WHEN 'gerar_estoque', 'reservar_estoque' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'pronto_entrega');
        WHEN 'criar_entrega' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'entregue');
        WHEN 'enviar_entrega' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'entregue');
        WHEN 'finalizar_os' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'finalizada');
        ELSE
    END CASE;

    INSERT INTO public.laboratorio_esteira_eventos (os_id, origem_os, programacao_id, etapa_anterior, etapa_nova, acao, usuario_id)
    VALUES (p_os_id, p_origem_os, p_programacao_id, v_etapa_anterior_os, p_etapa_destino, p_etapa_destino, auth.uid());

    RETURN jsonb_build_object('success', true, 'message', 'Etapa avançada com sucesso');
END;
$function$

;

REVOKE ALL ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_cockpit_confirmar_entrega_v1(p_entrega_id uuid, p_os_id uuid, p_origem text, p_recebedor jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_os_id IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_PARAMS_INVALIDOS'; END IF;
  RETURN public.fn_entrega_confirmar_engine_v1(p_entrega_id, p_os_id, p_origem, p_recebedor, '{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text, jsonb) TO service_role;
