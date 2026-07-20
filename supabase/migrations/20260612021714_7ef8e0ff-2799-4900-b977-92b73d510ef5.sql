-- Primeiro dropamos as versões existentes para evitar erro de mudança de nome de parâmetro
DROP FUNCTION IF EXISTS public.rpc_avancar_esteira_laboratorio(uuid, text, text, uuid);

CREATE OR REPLACE FUNCTION public.rpc_avancar_esteira_laboratorio(
    p_os_id uuid,
    p_origem text,
    p_etapa_destino text,
    p_programacao_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid;
    v_role text;
    v_status_os text;
    v_lote_id uuid;
    v_success boolean := true;
    v_message text := 'Esteira avançada com sucesso';
    v_etapa_anterior text;
    v_has_envase boolean;
    v_has_estoque boolean;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
    END IF;

    -- 1. Validação de Perfil (Administrador, Gestor, Produção, Estoque)
    SELECT role INTO v_role 
    FROM public.user_roles 
    WHERE user_id = v_user_id 
      AND role IN ('administrador', 'gestor', 'producao', 'estoque') 
    LIMIT 1;

    IF v_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Seu perfil não possui permissão para avançar a esteira laboratorial.');
    END IF;

    -- 2. Validação da OS e Origem
    IF p_origem = 'manual' THEN
        SELECT status::text INTO v_status_os FROM public.ordens_servico WHERE id = p_os_id;
        IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço manual não encontrada.'); END IF;
    ELSIF p_origem = 'onfarm' THEN
        SELECT status::text INTO v_status_os FROM public.ordens_servico_onfarm WHERE id = p_os_id;
        IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço On-Farm não encontrada.'); END IF;
    ELSE
        RETURN jsonb_build_object('success', false, 'message', 'Origem de OS inválida: ' || p_origem);
    END IF;

    v_etapa_anterior := v_status_os;

    IF v_status_os IN ('finalizada', 'cancelada') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Operação não permitida: OS já está ' || v_status_os);
    END IF;

    -- 3. Lógica por etapa (CASE)
    CASE p_etapa_destino
        
        WHEN 'assumir_producao' THEN
            IF p_programacao_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'ID da programação é obrigatório para assumir produção.');
            END IF;
            UPDATE public.programacao_producao 
            SET status = 'em_producao', 
                responsavel_id = v_user_id 
            WHERE id = p_programacao_id;
            
            IF p_origem = 'onfarm' THEN
                UPDATE public.ordens_servico_onfarm SET status = 'em_producao' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico SET status = 'em_producao' WHERE id = p_os_id;
            END IF;

        WHEN 'enviar_cq' THEN
            IF p_programacao_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'ID da programação é obrigatório para enviar para CQ.');
            END IF;
            
            SELECT id INTO v_lote_id FROM public.lotes WHERE programacao_id = p_programacao_id LIMIT 1;
            IF v_lote_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'Lote não encontrado para esta programação. Gere o lote primeiro.');
            END IF;
            
            UPDATE public.lotes SET status = 'aguardando_cq' WHERE id = v_lote_id;
            
            IF p_origem = 'onfarm' THEN
                UPDATE public.ordens_servico_onfarm SET status = 'em_cq' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico SET status = 'em_cq' WHERE id = p_os_id;
            END IF;

        WHEN 'aprovar_cq' THEN
            IF p_programacao_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'ID da programação é obrigatório para aprovar CQ.');
            END IF;
            
            SELECT id INTO v_lote_id FROM public.lotes WHERE programacao_id = p_programacao_id LIMIT 1;
            IF v_lote_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'Lote não encontrado.');
            END IF;
            
            UPDATE public.lotes SET status = 'aprovado' WHERE id = v_lote_id;
            -- OS não muda de status aqui, pois ainda precisa ser enviada para envase

        WHEN 'reprovar_cq' THEN
            IF p_programacao_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'message', 'ID da programação é obrigatório para reprovar CQ.');
            END IF;
            
            SELECT id INTO v_lote_id FROM public.lotes WHERE programacao_id = p_programacao_id LIMIT 1;
            UPDATE public.lotes SET status = 'reprovado' WHERE id = v_lote_id;

        WHEN 'enviar_envase' THEN
            IF p_origem = 'onfarm' THEN
                UPDATE public.ordens_servico_onfarm SET status = 'envase' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico SET status = 'envase' WHERE id = p_os_id;
            END IF;

        WHEN 'concluir_envase' THEN
            -- Valida se existe lote e envase
            IF p_programacao_id IS NOT NULL THEN
                SELECT id INTO v_lote_id FROM public.lotes WHERE programacao_id = p_programacao_id LIMIT 1;
                IF v_lote_id IS NOT NULL THEN
                    SELECT EXISTS(SELECT 1 FROM public.envase WHERE lote_id = v_lote_id) INTO v_has_envase;
                    SELECT EXISTS(SELECT 1 FROM public.estoque_produto WHERE lote_id = v_lote_id) INTO v_has_estoque;
                    
                    IF NOT v_has_envase THEN
                        RETURN jsonb_build_object('success', false, 'message', 'Registro de envase não encontrado para este lote.');
                    END IF;
                    
                    IF NOT v_has_estoque THEN
                        v_message := 'Envase registrado, mas ainda não há estoque/reserva para pronta entrega.';
                        -- Não avança a OS para pronto_entrega se não houver estoque
                    ELSE
                        IF p_origem = 'onfarm' THEN
                            UPDATE public.ordens_servico_onfarm SET status = 'pronto_entrega' WHERE id = p_os_id;
                        ELSE
                            UPDATE public.ordens_servico SET status = 'pronto_entrega' WHERE id = p_os_id;
                        END IF;
                    END IF;
                ELSE
                    RETURN jsonb_build_object('success', false, 'message', 'Lote não encontrado para esta programação.');
                END IF;
            ELSE
                 RETURN jsonb_build_object('success', false, 'message', 'Programação ID é necessária para concluir envase.');
            END IF;

        WHEN 'enviar_entrega' THEN
            -- Não usamos 'em_entrega' em OS On-Farm
            IF p_origem = 'onfarm' THEN
                UPDATE public.ordens_servico_onfarm SET status = 'pronto_entrega' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico SET status = 'pronto_entrega' WHERE id = p_os_id;
            END IF;

        WHEN 'finalizar_os' THEN
            -- Valida integridade antes de finalizar (usa a view)
            IF NOT EXISTS (SELECT 1 FROM public.vw_os_integridade_esteira WHERE os_id = p_os_id AND origem_os = p_origem AND pode_finalizar = true) THEN
                RETURN jsonb_build_object('success', false, 'message', 'OS não cumpre os requisitos mínimos de integridade para ser finalizada.');
            END IF;
            
            IF p_origem = 'onfarm' THEN
                UPDATE public.ordens_servico_onfarm SET status = 'finalizada' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico SET status = 'finalizada' WHERE id = p_os_id;
            END IF;

        ELSE
            RETURN jsonb_build_object('success', false, 'message', 'Etapa de destino não suportada ou inválida: ' || p_etapa_destino);
    END CASE;

    -- 4. Registro de Evento (Auditoria)
    INSERT INTO public.laboratorio_esteira_eventos (
        origem_os, os_id, programacao_id, lote_id, 
        etapa_anterior, etapa_nova, acao, usuario_id
    ) VALUES (
        p_origem, p_os_id, p_programacao_id, v_lote_id,
        v_etapa_anterior, p_etapa_destino, 'avancar_esteira', v_user_id
    );

    RETURN jsonb_build_object(
        'success', v_success, 
        'message', v_message,
        'origem', p_origem,
        'os_id', p_os_id,
        'etapa_destino', p_etapa_destino
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'Erro interno ao avançar esteira: ' || SQLERRM);
END;
$$;