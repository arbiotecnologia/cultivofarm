CREATE OR REPLACE FUNCTION public.rpc_validar_integridade_esteira(
    p_os_id UUID,
    p_origem_os TEXT,
    p_acao_solicitada TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_integridade RECORD;
    v_permitido BOOLEAN := TRUE;
    v_bloqueios TEXT[] := ARRAY[]::TEXT[];
    v_status_esteira TEXT;
    v_pode_finalizar BOOLEAN;
    v_user_id UUID := auth.uid();
BEGIN
    -- Validação de segurança básica: usuário deve estar logado
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'permitido', FALSE,
            'bloqueios', ARRAY['Usuário não autenticado'],
            'status_esteira_atual', 'erro_seguranca'
        );
    END IF;

    SELECT * INTO v_integridade 
    FROM public.vw_os_integridade_esteira 
    WHERE os_id = p_os_id AND origem_os = p_origem_os;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'permitido', FALSE,
            'bloqueios', ARRAY['Ordem de Serviço não encontrada'],
            'status_esteira_atual', 'nao_encontrado'
        );
    END IF;

    v_status_esteira := v_integridade.status_esteira_oficial;
    v_pode_finalizar := v_integridade.pode_finalizar;

    -- Lógica de bloqueio por ação
    CASE p_acao_solicitada
        WHEN 'enviar_cq' THEN
            IF NOT v_integridade.possui_lote THEN
                v_permitido := FALSE;
                v_bloqueios := array_append(v_bloqueios, 'Não é possível enviar para CQ sem lote gerado.');
            END IF;
        
        WHEN 'enviar_envase' THEN
            IF NOT v_integridade.possui_cq_aprovado THEN
                v_permitido := FALSE;
                v_bloqueios := array_append(v_bloqueios, 'Não é possível envasar sem CQ aprovado.');
            END IF;

        WHEN 'gerar_estoque' THEN
            IF NOT v_integridade.possui_envase THEN
                v_permitido := FALSE;
                v_bloqueios := array_append(v_bloqueios, 'Não é possível gerar estoque sem envase concluído.');
            END IF;

        WHEN 'criar_entrega' THEN
            IF NOT v_integridade.possui_estoque THEN
                v_permitido := FALSE;
                v_bloqueios := array_append(v_bloqueios, 'Não é possível criar entrega sem estoque disponível.');
            END IF;

        WHEN 'finalizar_os' THEN
            IF NOT v_integridade.pode_finalizar THEN
                v_permitido := FALSE;
                v_bloqueios := v_integridade.bloqueios;
            END IF;
        
        ELSE
            -- Ações genéricas ou não mapeadas
    END CASE;

    RETURN jsonb_build_object(
        'permitido', v_permitido,
        'bloqueios', v_bloqueios,
        'status_esteira_atual', v_status_esteira,
        'pode_finalizar', v_pode_finalizar
    );
END;
$$;
