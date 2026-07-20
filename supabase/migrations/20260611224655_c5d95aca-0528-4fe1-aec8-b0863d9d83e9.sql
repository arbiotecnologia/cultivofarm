-- 1. Refinar rpc_avancar_esteira_laboratorio
CREATE OR REPLACE FUNCTION public.rpc_avancar_esteira_laboratorio(
    p_origem_os text, 
    p_os_id uuid, 
    p_programacao_id uuid, 
    p_etapa_destino text, 
    p_observacao text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_role public.app_role;
    v_profile_id UUID;
    v_status_atual TEXT;
    v_lote_id UUID;
    v_etapa_anterior_os TEXT;
    v_tabela_os TEXT;
    v_validacao jsonb;
BEGIN
    SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
    IF v_user_role IS NULL THEN RAISE EXCEPTION 'Usuário não possui perfil atribuído.'; END IF;

    SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

    IF p_origem_os = 'manual' THEN v_tabela_os := 'ordens_servico';
    ELSE v_tabela_os := 'ordens_servico_onfarm';
    END IF;

    -- Validação de integridade antes de avançar
    SELECT * INTO v_validacao FROM public.rpc_validar_integridade_esteira(p_os_id, p_origem_os, p_etapa_destino);
    IF NOT (v_validacao->>'permitido')::BOOLEAN THEN
        RETURN jsonb_build_object('success', false, 'message', (v_validacao->'bloqueios'->>0));
    END IF;

    EXECUTE format('SELECT status::text FROM %I WHERE id = $1 FOR UPDATE', v_tabela_os)
    INTO v_status_atual USING p_os_id;

    IF v_status_atual IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço não encontrada.'); END IF;

    v_etapa_anterior_os := v_status_atual;

    -- Localiza lote vinculado
    IF p_programacao_id IS NOT NULL AND p_programacao_id <> '00000000-0000-0000-0000-000000000000'::uuid THEN
        SELECT id INTO v_lote_id FROM public.lotes WHERE programacao_id = p_programacao_id FOR UPDATE;
    ELSE
        IF p_origem_os = 'manual' THEN
            SELECT l.id INTO v_lote_id FROM public.lotes l JOIN public.programacao_producao pp ON l.programacao_id = pp.id WHERE pp.ordem_servico_id = p_os_id LIMIT 1;
        ELSE
            SELECT l.id INTO v_lote_id FROM public.lotes l JOIN public.programacao_producao pp ON l.programacao_id = pp.id WHERE pp.ordem_servico_onfarm_id = p_os_id LIMIT 1;
        END IF;
    END IF;

    CASE p_etapa_destino
        WHEN 'assumir_producao' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'em_producao');
            IF p_programacao_id IS NOT NULL THEN
                UPDATE public.programacao_producao SET status = 'em_producao', responsavel_id = auth.uid() WHERE id = p_programacao_id;
            END IF;

        WHEN 'gerar_lote' THEN
            -- Ação informativa, o insert é feito pelo front, mas a RPC registra o avanço
            NULL;

        WHEN 'enviar_cq' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'em_cq');
            UPDATE public.lotes SET status = 'aguardando_cq' WHERE id = v_lote_id;

        WHEN 'aprovar_cq' THEN
            UPDATE public.lotes SET status = 'aprovado' WHERE id = v_lote_id;
            IF NOT EXISTS (SELECT 1 FROM public.controle_qualidade WHERE lote_id = v_lote_id AND resultado = 'aprovado' AND created_at > now() - interval '10 seconds') THEN
                INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id) VALUES (v_lote_id, 'aprovado', v_profile_id);
            END IF;

        WHEN 'reprovar_cq' THEN
            UPDATE public.lotes SET status = 'reprovado' WHERE id = v_lote_id;
            IF NOT EXISTS (SELECT 1 FROM public.controle_qualidade WHERE lote_id = v_lote_id AND resultado = 'reprovado' AND created_at > now() - interval '10 seconds') THEN
                INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id) VALUES (v_lote_id, 'reprovado', v_profile_id);
            END IF;

        WHEN 'enviar_envase' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'envase');

        WHEN 'concluir_envase' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'pronto_entrega');

        WHEN 'gerar_estoque', 'reservar_estoque' THEN
            -- Ações informativas para auditoria
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'pronto_entrega');

        WHEN 'criar_entrega' THEN
            -- Ação informativa, o insert é feito pelo front
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'entregue');

        WHEN 'enviar_entrega' THEN
            PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'entregue');

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
$function$;

-- 2. Refinar rpc_validar_integridade_esteira
CREATE OR REPLACE FUNCTION public.rpc_validar_integridade_esteira(p_os_id uuid, p_origem_os text, p_acao_solicitada text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_integridade RECORD;
    v_permitido BOOLEAN := TRUE;
    v_bloqueios TEXT[] := ARRAY[]::TEXT[];
    v_status_esteira TEXT;
    v_pode_finalizar BOOLEAN;
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('permitido', FALSE, 'bloqueios', ARRAY['Usuário não autenticado'], 'status_esteira_atual', 'erro_seguranca');
    END IF;

    SELECT * INTO v_integridade FROM public.vw_os_integridade_esteira WHERE os_id = p_os_id AND origem_os = p_origem_os;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('permitido', FALSE, 'bloqueios', ARRAY['Ordem de Serviço não encontrada'], 'status_esteira_atual', 'nao_encontrado');
    END IF;

    v_status_esteira := v_integridade.status_esteira_oficial;
    v_pode_finalizar := v_integridade.pode_finalizar;

    CASE p_acao_solicitada
        WHEN 'enviar_cq' THEN
            IF NOT v_integridade.possui_lote THEN v_permitido := FALSE; v_bloqueios := array_append(v_bloqueios, 'Não é possível enviar para CQ sem lote gerado.'); END IF;
        WHEN 'enviar_envase' THEN
            IF NOT v_integridade.possui_cq_aprovado THEN v_permitido := FALSE; v_bloqueios := array_append(v_bloqueios, 'Não é possível envasar sem CQ aprovado.'); END IF;
        WHEN 'gerar_estoque' THEN
            IF NOT v_integridade.possui_envase THEN v_permitido := FALSE; v_bloqueios := array_append(v_bloqueios, 'Não é possível gerar estoque sem envase concluído.'); END IF;
        WHEN 'criar_entrega' THEN
            IF NOT v_integridade.possui_estoque THEN v_permitido := FALSE; v_bloqueios := array_append(v_bloqueios, 'Não é possível criar entrega sem estoque disponível.'); END IF;
        WHEN 'finalizar_os' THEN
            IF NOT v_integridade.pode_finalizar THEN v_permitido := FALSE; v_bloqueios := v_integridade.bloqueios; END IF;
        ELSE
    END CASE;

    RETURN jsonb_build_object('permitido', v_permitido, 'bloqueios', v_bloqueios, 'status_esteira_atual', v_status_esteira, 'pode_finalizar', v_pode_finalizar);
END;
$function$;
