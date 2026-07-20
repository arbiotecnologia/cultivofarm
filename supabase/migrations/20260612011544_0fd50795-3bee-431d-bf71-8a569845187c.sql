-- 1. Índice único para evitar duplicidade de OS On-Farm por visita
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_os_onfarm_registro_consultor 
ON public.ordens_servico_onfarm(registro_consultor_id) 
WHERE registro_consultor_id IS NOT NULL;

-- 2. Correção da RPC rpc_liberar_recomendacao_produtor
CREATE OR REPLACE FUNCTION public.rpc_liberar_recomendacao_produtor(p_registro_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_registro RECORD;
    v_has_recomendacao BOOLEAN;
    v_solicitacao_id UUID;
    v_status_anterior TEXT;
BEGIN
    v_user_id := auth.uid();
    
    -- Obter role do usuário
    SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
    
    -- Obter dados da visita
    SELECT * INTO v_registro FROM public.registros_consultor WHERE id = p_registro_id;
    
    IF v_registro IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Visita técnica não encontrada.');
    END IF;

    -- Validação de Permissão
    IF NOT (
        v_user_role IN ('administrador', 'gestor') OR 
        (v_user_role IN ('consultor_tecnico', 'tecnico_agronomo') AND v_registro.consultor_responsavel = v_user_id)
    ) THEN
        RETURN jsonb_build_object('success', false, 'message', 'Permissão negada para liberar esta recomendação.');
    END IF;

    -- Validação de Estado
    IF v_registro.status IN ('arquivado', 'convertido_os', 'reprovado') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Visita em status que não permite liberação (' || v_registro.status || ').');
    END IF;

    -- Validação de Recomendação Existente
    SELECT EXISTS (
        SELECT 1 FROM public.registros_consultor_recomendacoes WHERE registro_consultor_id = p_registro_id
    ) INTO v_has_recomendacao;

    IF NOT v_has_recomendacao THEN
        RETURN jsonb_build_object('success', false, 'message', 'Não é possível liberar: nenhuma recomendação técnica registrada.');
    END IF;

    v_status_anterior := v_registro.status;
    v_solicitacao_id := v_registro.solicitacao_id;

    -- Início da transação (automática em RPC)
    -- Atualizar Visita
    UPDATE public.registros_consultor 
    SET status = 'aprovado', updated_at = NOW() 
    WHERE id = p_registro_id;

    -- Atualizar Solicitação se houver
    IF v_solicitacao_id IS NOT NULL THEN
        UPDATE public.portal_solicitacoes 
        SET status = 'aguardando_decisao_produtor', updated_at = NOW() 
        WHERE id = v_solicitacao_id;
        
        -- Timeline
        INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
        VALUES (v_solicitacao_id, 'recomendacao_liberada', 'Recomendação técnica liberada para decisão do produtor.', v_user_id);
    END IF;

    -- Logs
    INSERT INTO public.registros_consultor_status_log (registro_id, status_anterior, status_novo, usuario_id, motivo)
    VALUES (p_registro_id, v_status_anterior, 'aprovado', v_user_id, 'Liberação automática via RPC');

    INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
    VALUES (p_registro_id, v_user_id, 'liberacao_recomendacao', 'Recomendação liberada para o produtor.');

    RETURN jsonb_build_object('success', true, 'message', 'Recomendação liberada com sucesso.');
END;
$$;

-- 3. Correção da RPC rpc_converter_visita_em_os
CREATE OR REPLACE FUNCTION public.rpc_converter_visita_em_os(p_registro_id UUID, p_observacao TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_registro RECORD;
    v_recomendacao RECORD;
    v_existing_os_id UUID;
    v_new_os_id UUID;
    v_status_anterior TEXT;
BEGIN
    v_user_id := auth.uid();
    
    -- Verificar se já existe OS
    SELECT id INTO v_existing_os_id FROM public.ordens_servico_onfarm WHERE registro_consultor_id = p_registro_id LIMIT 1;
    
    IF v_existing_os_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true, 
            'already_exists', true, 
            'os_id', v_existing_os_id, 
            'message', 'OS já existente para esta visita.'
        );
    END IF;

    -- Obter dados da visita
    SELECT * INTO v_registro FROM public.registros_consultor WHERE id = p_registro_id;
    
    IF v_registro IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Visita técnica não encontrada.');
    END IF;

    -- Validação de Status
    IF v_registro.status != 'aprovado' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Apenas visitas com recomendação aprovada podem ser convertidas em OS.');
    END IF;

    -- Obter Recomendação
    SELECT * INTO v_recomendacao FROM public.registros_consultor_recomendacoes WHERE registro_consultor_id = p_registro_id LIMIT 1;
    
    IF v_recomendacao IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Recomendação técnica não encontrada para esta visita.');
    END IF;

    -- Inserir OS On-Farm
    INSERT INTO public.ordens_servico_onfarm (
        cliente_id, fazenda_id, talhao_id, produto_id, dose_ml_ha, area_hectares, 
        volume_total_ml, modo_aplicacao, data_recomendada, prioridade, status, 
        registro_consultor_id, solicitacao_id, consultor_responsavel, cultura_id, 
        fase_fenologica, problema_principal, diagnostico, recomendacao_tecnica, 
        observacoes_adicionais, created_by
    ) VALUES (
        v_registro.cliente_id, v_registro.fazenda_id, v_registro.talhao_id, v_recomendacao.produto_id, 
        v_recomendacao.dose_ml_ha, v_recomendacao.area_hectares, v_recomendacao.volume_total_ml, 
        v_recomendacao.modo_aplicacao, v_recomendacao.data_recomendada, 'media', 'aberta', 
        p_registro_id, v_registro.solicitacao_id, v_registro.consultor_responsavel, v_registro.cultura_id,
        v_registro.fase_fenologica, v_registro.problema_principal, v_recomendacao.diagnostico, 
        v_recomendacao.recomendacao_detalhada, p_observacao, v_user_id
    ) RETURNING id INTO v_new_os_id;

    -- Atualizar Visita
    v_status_anterior := v_registro.status;
    UPDATE public.registros_consultor SET status = 'convertido_os', updated_at = NOW() WHERE id = p_registro_id;

    -- Atualizar Solicitação se houver
    IF v_registro.solicitacao_id IS NOT NULL THEN
        UPDATE public.portal_solicitacoes SET status = 'convertida_os', updated_at = NOW() WHERE id = v_registro.solicitacao_id;
        
        INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
        VALUES (v_registro.solicitacao_id, 'convertida_os', 'Visita técnica convertida em Ordem de Serviço On-Farm.', v_user_id);
    END IF;

    -- Logs
    INSERT INTO public.registros_consultor_status_log (registro_id, status_anterior, status_novo, usuario_id, motivo)
    VALUES (p_registro_id, v_status_anterior, 'convertido_os', v_user_id, 'Conversão para OS On-Farm');

    INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
    VALUES (p_registro_id, v_user_id, 'conversao_os', 'Visita convertida em OS On-Farm ID: ' || v_new_os_id);

    RETURN jsonb_build_object('success', true, 'message', 'OS On-Farm gerada com sucesso.', 'os_id', v_new_os_id);
END;
$$;

-- 4. Melhoria da RPC rpc_avancar_esteira_laboratorio
CREATE OR REPLACE FUNCTION public.rpc_avancar_esteira_laboratorio(
    p_origem TEXT,
    p_os_id UUID,
    p_programacao_id UUID,
    p_etapa_destino TEXT,
    p_usuario_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_status_os TEXT;
    v_msg TEXT;
BEGIN
    v_user_id := COALESCE(p_usuario_id, auth.uid());
    
    -- Verificar Role
    SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
    
    -- Bloquear ações simuladas que devem ser feitas via hooks com auditoria real
    IF p_etapa_destino IN ('gerar_lote', 'gerar_estoque', 'reservar_estoque', 'criar_entrega') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ação ' || p_etapa_destino || ' deve ser executada pelo fluxo específico de dados, não pela RPC de status.');
    END IF;

    -- Validação de Permissão por Etapa
    IF v_user_role IN ('consultor_tecnico', 'tecnico_agronomo', 'cliente_produtor', 'aplicador') AND 
       p_etapa_destino NOT IN ('assumir_producao', 'enviar_entrega') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Seu perfil não tem permissão para avançar a esteira laboratorial nesta etapa.');
    END IF;

    -- Lógica de Status Baseada na Etapa
    CASE p_etapa_destino
        WHEN 'assumir_producao' THEN v_status_os := 'em_producao';
        WHEN 'enviar_cq' THEN v_status_os := 'em_cq';
        WHEN 'aprovar_cq' THEN v_status_os := 'envase';
        WHEN 'reprovar_cq' THEN v_status_os := 'aberta'; -- Volta para fila
        WHEN 'enviar_envase' THEN v_status_os := 'envase';
        WHEN 'concluir_envase' THEN v_status_os := 'pronto_entrega';
        WHEN 'enviar_entrega' THEN v_status_os := 'entregue';
        ELSE
            RETURN jsonb_build_object('success', false, 'message', 'Etapa de destino inválida: ' || p_etapa_destino);
    END CASE;

    -- Atualizar OS correta
    IF p_origem = 'onfarm' THEN
        UPDATE public.ordens_servico_onfarm SET status = v_status_os, updated_at = NOW() WHERE id = p_os_id;
    ELSE
        UPDATE public.ordens_servico SET status = v_status_os, updated_at = NOW() WHERE id = p_os_id;
    END IF;

    -- Atualizar Programação se houver
    IF p_programacao_id IS NOT NULL THEN
        UPDATE public.programacao_producao SET status = v_status_os, updated_at = NOW() WHERE id = p_programacao_id;
    END IF;

    -- Registrar Evento
    INSERT INTO public.laboratorio_esteira_eventos (origem_os, os_id, programacao_id, etapa_nova, acao, usuario_id)
    VALUES (p_origem, p_os_id, p_programacao_id, p_etapa_destino, 'mudanca_status_rpc', v_user_id);

    RETURN jsonb_build_object('success', true, 'message', 'Esteira avançada para: ' || v_status_os);
END;
$$;