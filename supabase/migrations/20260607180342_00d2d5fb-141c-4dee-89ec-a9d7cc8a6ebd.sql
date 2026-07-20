-- Tabela de auditoria da esteira
CREATE TABLE IF NOT EXISTS public.laboratorio_esteira_eventos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origem_os TEXT NOT NULL,
    os_id UUID NOT NULL,
    programacao_id UUID,
    lote_id UUID,
    etapa_anterior TEXT,
    etapa_nova TEXT NOT NULL,
    acao TEXT NOT NULL,
    observacao TEXT,
    usuario_id UUID DEFAULT auth.uid(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.laboratorio_esteira_eventos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Administradores e Gestores podem ler tudo" 
ON public.laboratorio_esteira_eventos FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('administrador', 'gestor')
    )
);

CREATE POLICY "Produção pode ler eventos operacionais" 
ON public.laboratorio_esteira_eventos FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() 
        AND role = 'producao'
    )
);

-- Grant permissões
GRANT SELECT ON public.laboratorio_esteira_eventos TO authenticated;
GRANT ALL ON public.laboratorio_esteira_eventos TO service_role;

-- Função RPC para avançar a esteira
CREATE OR REPLACE FUNCTION public.rpc_avancar_esteira_laboratorio(
  p_origem_os TEXT,
  p_os_id UUID,
  p_programacao_id UUID,
  p_etapa_destino TEXT,
  p_observacao TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    v_user_role public.app_role;
    v_status_atual TEXT;
    v_lote_id UUID;
    v_cq_aprovado BOOLEAN;
    v_envase_id UUID;
    v_estoque_id UUID;
    v_entrega_status TEXT;
    v_lote_status TEXT;
    v_res JSON;
BEGIN
    -- 1. Validar usuário e papel (buscando na tabela user_roles)
    SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
    
    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'Usuário não possui perfil atribuído ou não encontrado.';
    END IF;

    -- 2. Validar permissões por etapa
    IF v_user_role NOT IN ('administrador', 'gestor') THEN
        IF v_user_role = 'producao' THEN
            IF p_etapa_destino NOT IN ('assumir_producao', 'gerar_lote', 'enviar_cq', 'enviar_envase', 'concluir_envase', 'gerar_estoque', 'reservar_estoque') THEN
                RAISE EXCEPTION 'Seu perfil de produção não tem permissão para esta ação.';
            END IF;
        ELSIF v_user_role = 'aplicador' THEN
            IF p_etapa_destino NOT IN ('liberar_aplicacao', 'finalizar_os') THEN
                RAISE EXCEPTION 'Seu perfil de aplicador só pode executar ações de aplicação.';
            END IF;
        ELSE
            RAISE EXCEPTION 'Seu perfil (%) não tem permissão para realizar ações na esteira.', v_user_role;
        END IF;
    END IF;

    -- 3. Obter dados atuais para validação
    IF p_origem_os = 'manual' THEN
        SELECT status::text INTO v_status_atual FROM public.ordens_servico WHERE id = p_os_id;
    ELSE
        SELECT status::text INTO v_status_atual FROM public.ordens_servico_onfarm WHERE id = p_os_id;
    END IF;

    SELECT id, status INTO v_lote_id, v_lote_status FROM public.lotes WHERE programacao_id = p_programacao_id ORDER BY created_at DESC LIMIT 1;
    SELECT (resultado = 'aprovado') INTO v_cq_aprovado FROM public.controle_qualidade WHERE lote_id = v_lote_id ORDER BY created_at DESC LIMIT 1;
    SELECT id INTO v_envase_id FROM public.envase WHERE lote_id = v_lote_id ORDER BY created_at DESC LIMIT 1;
    SELECT id FROM public.estoque_produto WHERE lote_id = v_lote_id ORDER BY created_at DESC LIMIT 1 INTO v_estoque_id;
    
    IF p_origem_os = 'manual' THEN
        SELECT status INTO v_entrega_status FROM public.entregas WHERE ordem_servico_id = p_os_id ORDER BY created_at DESC LIMIT 1;
    ELSE
        SELECT status INTO v_entrega_status FROM public.entregas WHERE ordem_servico_onfarm_id = p_os_id ORDER BY created_at DESC LIMIT 1;
    END IF;

    -- 4. Validar Regras de Negócio
    IF p_etapa_destino = 'enviar_cq' AND v_lote_id IS NULL THEN
        RAISE EXCEPTION 'Não é possível enviar para CQ sem um lote gerado.';
    END IF;

    IF p_etapa_destino = 'enviar_envase' AND (v_cq_aprovado IS NULL OR NOT v_cq_aprovado) THEN
        RAISE EXCEPTION 'Não é possível enviar para envase sem CQ aprovado.';
    END IF;

    IF p_etapa_destino = 'gerar_estoque' AND v_envase_id IS NULL THEN
        RAISE EXCEPTION 'Não é possível gerar estoque sem registro de envase.';
    END IF;

    IF p_etapa_destino = 'criar_entrega' AND v_estoque_id IS NULL THEN
        RAISE EXCEPTION 'Não é possível criar entrega sem estoque disponível.';
    END IF;

    IF p_etapa_destino = 'liberar_aplicacao' AND (v_entrega_status IS NULL OR v_entrega_status != 'entregue') THEN
        RAISE EXCEPTION 'Não é possível liberar aplicação sem entrega confirmada.';
    END IF;

    -- 5. Executar Transição de Status
    CASE p_etapa_destino
        WHEN 'assumir_producao' THEN
            IF p_origem_os = 'manual' THEN
                UPDATE public.ordens_servico SET status = 'em_producao' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico_onfarm SET status = 'em_producao' WHERE id = p_os_id;
            END IF;
            UPDATE public.programacao_producao SET status = 'em_producao' WHERE id = p_programacao_id;

        WHEN 'enviar_cq' THEN
            IF p_origem_os = 'manual' THEN
                UPDATE public.ordens_servico SET status = 'em_cq' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico_onfarm SET status = 'em_cq' WHERE id = p_os_id;
            END IF;
            UPDATE public.lotes SET status = 'aguardando_cq' WHERE id = v_lote_id;

        WHEN 'aprovar_cq' THEN
            UPDATE public.lotes SET status = 'aprovado' WHERE id = v_lote_id;
            INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id) 
            VALUES (v_lote_id, 'aprovado', auth.uid());

        WHEN 'reprovar_cq' THEN
            UPDATE public.lotes SET status = 'reprovado' WHERE id = v_lote_id;
            INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id) 
            VALUES (v_lote_id, 'reprovado', auth.uid());

        WHEN 'enviar_envase' THEN
            IF p_origem_os = 'manual' THEN
                UPDATE public.ordens_servico SET status = 'envase' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico_onfarm SET status = 'envase' WHERE id = p_os_id;
            END IF;

        WHEN 'concluir_envase' THEN
            IF p_origem_os = 'manual' THEN
                UPDATE public.ordens_servico SET status = 'pronto_entrega' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico_onfarm SET status = 'pronto_entrega' WHERE id = p_os_id;
            END IF;

        WHEN 'finalizar_os' THEN
            IF p_origem_os = 'manual' THEN
                UPDATE public.ordens_servico SET status = 'finalizada' WHERE id = p_os_id;
            ELSE
                UPDATE public.ordens_servico_onfarm SET status = 'finalizada' WHERE id = p_os_id;
            END IF;
        
        ELSE
            NULL;
    END CASE;

    -- 6. Registrar Auditoria
    INSERT INTO public.laboratorio_esteira_eventos (
        origem_os, os_id, programacao_id, lote_id, 
        etapa_anterior, etapa_nova, acao, observacao
    ) VALUES (
        p_origem_os, p_os_id, p_programacao_id, v_lote_id,
        v_status_atual, p_etapa_destino, p_etapa_destino, p_observacao
    );

    v_res := json_build_object(
        'success', true,
        'etapa', p_etapa_destino,
        'message', 'Esteira avançada com sucesso.'
    );

    RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Grant permissões RPC
GRANT EXECUTE ON FUNCTION public.rpc_avancar_esteira_laboratorio(TEXT, UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_avancar_esteira_laboratorio(TEXT, UUID, UUID, TEXT, TEXT) TO service_role;
