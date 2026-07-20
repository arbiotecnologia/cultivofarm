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
            IF v_integridade.lote_id IS NULL THEN
                v_permitido := FALSE;
                v_bloqueios := array_append(v_bloqueios, 'Não é possível enviar para CQ sem lote gerado.');
            END IF;
        WHEN 'enviar_envase' THEN
            IF v_integridade.cq_resultado IS DISTINCT FROM 'aprovado' THEN
                v_permitido := FALSE;
                v_bloqueios := array_append(v_bloqueios, 'Não é possível envasar sem CQ aprovado.');
            END IF;
        WHEN 'gerar_estoque' THEN
            IF v_integridade.envase_id IS NULL THEN
                v_permitido := FALSE;
                v_bloqueios := array_append(v_bloqueios, 'Não é possível gerar estoque sem envase concluído.');
            END IF;
        WHEN 'criar_entrega' THEN
            IF v_integridade.estoque_id IS NULL THEN
                v_permitido := FALSE;
                v_bloqueios := array_append(v_bloqueios, 'Não é possível criar entrega sem estoque disponível.');
            END IF;
        WHEN 'finalizar_os' THEN
            IF NOT COALESCE(v_integridade.pode_finalizar, FALSE) THEN
                v_permitido := FALSE;
                v_bloqueios := COALESCE(v_integridade.bloqueios, ARRAY['Ordem não pode ser finalizada.']);
            END IF;
        ELSE
            NULL;
    END CASE;

    RETURN jsonb_build_object('permitido', v_permitido, 'bloqueios', v_bloqueios, 'status_esteira_atual', v_status_esteira, 'pode_finalizar', v_pode_finalizar);
END;
$function$;