CREATE OR REPLACE FUNCTION public.rpc_avancar_esteira_laboratorio(
    p_origem_os TEXT,
    p_os_id UUID,
    p_programacao_id UUID,
    p_etapa_destino TEXT,
    p_observacao TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_role public.app_role;
    v_profile_id UUID;
    v_status_atual TEXT;
    v_lote_id UUID;
    v_cq_aprovado BOOLEAN;
    v_envase_id UUID;
    v_etapa_anterior_os TEXT;
    v_tabela_os TEXT;
BEGIN
    SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'Usuário não possui perfil atribuído.';
    END IF;

    SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

    IF p_origem_os = 'manual' THEN v_tabela_os := 'ordens_servico';
    ELSE v_tabela_os := 'ordens_servico_onfarm';
    END IF;

    EXECUTE format('SELECT status::text FROM %I WHERE id = $1 FOR UPDATE', v_tabela_os)
    INTO v_status_atual USING p_os_id;

    IF v_status_atual IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço não encontrada.');
    END IF;

    v_etapa_anterior_os := v_status_atual;

    IF p_programacao_id IS NOT NULL THEN
        PERFORM id FROM public.programacao_producao WHERE id = p_programacao_id FOR UPDATE;
    END IF;

    SELECT id INTO v_lote_id FROM public.lotes WHERE programacao_id = p_programacao_id FOR UPDATE;
    SELECT (resultado = 'aprovado') INTO v_cq_aprovado FROM public.controle_qualidade WHERE lote_id = v_lote_id ORDER BY created_at DESC LIMIT 1;
    SELECT id INTO v_envase_id FROM public.envase WHERE lote_id = v_lote_id ORDER BY created_at DESC LIMIT 1;

    CASE p_etapa_destino
        WHEN 'assumir_producao' THEN
            IF v_status_atual = 'em_producao' THEN RETURN jsonb_build_object('success', false, 'message', 'Esta demanda já está sendo produzida.'); END IF;
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'em_producao');
            UPDATE public.programacao_producao SET status = 'em_producao', responsavel_id = auth.uid() WHERE id = p_programacao_id;

        WHEN 'enviar_cq' THEN
            IF v_lote_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Gere o lote antes de enviar para CQ.'); END IF;
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'em_cq');
            UPDATE public.lotes SET status = 'aguardando_cq' WHERE id = v_lote_id;

        WHEN 'aprovar_cq' THEN
            UPDATE public.lotes SET status = 'aprovado' WHERE id = v_lote_id;
            INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id) VALUES (v_lote_id, 'aprovado', v_profile_id);

        WHEN 'reprovar_cq' THEN
            UPDATE public.lotes SET status = 'reprovado' WHERE id = v_lote_id;
            INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id) VALUES (v_lote_id, 'reprovado', v_profile_id);

        WHEN 'enviar_envase' THEN
            IF NOT COALESCE(v_cq_aprovado, false) THEN RETURN jsonb_build_object('success', false, 'message', 'CQ precisa estar aprovado.'); END IF;
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'envase');
            UPDATE public.lotes SET status = 'em_envase' WHERE id = v_lote_id;

        WHEN 'concluir_envase' THEN
            IF v_envase_id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Registre o envase primeiro.'); END IF;
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'pronto_entrega');
            UPDATE public.lotes SET status = 'concluido' WHERE id = v_lote_id;

        WHEN 'finalizar_os' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'finalizada');

        ELSE
    END CASE;

    INSERT INTO public.laboratorio_esteira_eventos (
        origem_os, os_id, programacao_id, lote_id, etapa_anterior, etapa_nova, acao, observacao, usuario_id
    ) VALUES (
        p_origem_os, p_os_id, p_programacao_id, v_lote_id, v_etapa_anterior_os, p_etapa_destino, 'rpc_avanco_seguro', p_observacao, auth.uid()
    );

    RETURN jsonb_build_object('success', true, 'message', 'Etapa avançada com sucesso.');
END;
$$;