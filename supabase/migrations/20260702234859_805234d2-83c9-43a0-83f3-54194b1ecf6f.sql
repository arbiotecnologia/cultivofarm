-- Fix esteira laboratorio functions to support 'b2b' origem (same table as 'manual')

CREATE OR REPLACE FUNCTION public._avancar_os_status(p_origem text, p_os_id uuid, p_alvo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    status_order TEXT[] := ARRAY['aberta','aprovada','programada','em_producao','em_cq','envase','pronto_entrega','entregue','finalizada'];
    v_atual TEXT;
    v_idx_atual INT;
    v_idx_alvo INT;
    v_proximo TEXT;
    v_use_manual BOOLEAN;
BEGIN
    v_use_manual := p_origem IN ('manual','b2b');

    IF v_use_manual THEN
        SELECT status::text INTO v_atual FROM public.ordens_servico WHERE id = p_os_id;
    ELSE
        SELECT status::text INTO v_atual FROM public.ordens_servico_onfarm WHERE id = p_os_id;
    END IF;

    SELECT i INTO v_idx_atual FROM unnest(status_order) WITH ORDINALITY AS t(val,i) WHERE val = v_atual;
    SELECT i INTO v_idx_alvo FROM unnest(status_order) WITH ORDINALITY AS t(val,i) WHERE val = p_alvo;

    IF v_idx_atual IS NULL OR v_idx_alvo IS NULL THEN
        RAISE EXCEPTION 'Status OS inválido (% -> %).', v_atual, p_alvo;
    END IF;

    WHILE v_idx_atual < v_idx_alvo LOOP
        v_proximo := status_order[v_idx_atual + 1];
        IF v_use_manual THEN
            UPDATE public.ordens_servico SET status = v_proximo::public.status_os WHERE id = p_os_id;
        ELSE
            UPDATE public.ordens_servico_onfarm SET status = v_proximo::public.status_os_onfarm WHERE id = p_os_id;
        END IF;
        v_idx_atual := v_idx_atual + 1;
    END LOOP;
END;
$function$;


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
$function$;


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
                IF v_status_os = 'aprovada' THEN
                    UPDATE public.ordens_servico_onfarm SET status = 'programada' WHERE id = p_os_id;
                END IF;
                UPDATE public.ordens_servico_onfarm SET status = 'em_producao' WHERE id = p_os_id;
            ELSE
                IF v_status_os = 'aprovada' THEN
                    UPDATE public.ordens_servico SET status = 'programada' WHERE id = p_os_id;
                END IF;
                UPDATE public.ordens_servico SET status = 'em_producao' WHERE id = p_os_id;
            END IF;
        ELSE
            RETURN public._rpc_avancar_esteira_laboratorio_internal(p_os_id, p_origem, p_etapa_destino, p_programacao_id);
    END CASE;

    INSERT INTO public.laboratorio_esteira_eventos (os_id, origem_os, programacao_id, etapa_anterior, etapa_nova, acao, usuario_id)
    VALUES (p_os_id, p_origem, p_programacao_id, v_etapa_anterior, p_etapa_destino, p_etapa_destino, v_user_id);

    RETURN jsonb_build_object('success', true, 'message', 'Esteira avançada com sucesso');
END;
$function$;