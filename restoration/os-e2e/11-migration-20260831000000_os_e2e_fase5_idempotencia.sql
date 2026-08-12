-- =====================================================================
-- FASE 5 — E2E determinístico da esteira laboratório
-- Migration incremental (não reescreve migrations já aplicadas).
--
-- Correções:
--   Gate 4: etapa 'criar_entrega' NÃO pode antecipar a OS para 'entregue'.
--           A OS só vai a 'entregue' na CONFIRMAÇÃO da entrega
--           (fn_entrega_confirmar_engine_v1).
--   Gate 5: replay de etapa que já atingiu o status alvo (ex.: finalizar_os)
--           NÃO pode inserir novo evento de auditoria.
--
-- Guard fail-closed: EXCLUSIVO staging ikaauvsflpmamgxmkhoq.
-- =====================================================================

DO $guard$
DECLARE
  v_db text := current_database();
  v_host text := coalesce(current_setting('lovable.project_ref', true), '');
  v_ok boolean := false;
BEGIN
  -- Recusa explícita de produção
  IF v_host = 'navfzbwgwzruipouyfnk' OR v_db = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_PRODUCAO: migration proibida em navfzbwgwzruipouyfnk';
  END IF;
  -- Assinatura estrutural do staging autorizado
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_entrega_confirmar_engine_v1'
  ) AND EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_rpc_avancar_esteira_laboratorio_internal'
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: alvo nao e o staging ikaauvsflpmamgxmkhoq certificado nas Fases 0-4';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public._rpc_avancar_esteira_laboratorio_internal(
  p_os_id uuid,
  p_origem_os text,
  p_etapa_destino text,
  p_programacao_id uuid DEFAULT NULL::uuid
)
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
    v_status_alvo TEXT;
BEGIN
    SELECT role INTO v_user_role FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1;
    SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;

    IF p_origem_os IN ('manual','b2b') THEN v_tabela_os := 'ordens_servico';
    ELSE v_tabela_os := 'ordens_servico_onfarm';
    END IF;

    -- Status alvo canônico por etapa. 'criar_entrega' NAO tem status alvo:
    -- criar a entrega deixa a OS em pronto_entrega ate a confirmacao fisica.
    v_status_alvo := CASE p_etapa_destino
        WHEN 'assumir_producao' THEN 'em_producao'
        WHEN 'enviar_cq'        THEN 'em_cq'
        WHEN 'enviar_envase'    THEN 'envase'
        WHEN 'concluir_envase'  THEN 'pronto_entrega'
        WHEN 'gerar_estoque'    THEN 'pronto_entrega'
        WHEN 'reservar_estoque' THEN 'pronto_entrega'
        WHEN 'enviar_entrega'   THEN 'entregue'
        WHEN 'finalizar_os'     THEN 'finalizada'
        ELSE NULL
    END;

    EXECUTE format('SELECT status::text FROM %I WHERE id = $1 FOR UPDATE', v_tabela_os)
    INTO v_status_atual USING p_os_id;

    IF v_status_atual IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ordem de serviço não encontrada.');
    END IF;

    -- IDEMPOTÊNCIA SERVER-SIDE (Gate 5): se a OS já está no status alvo da
    -- etapa, o replay é absorvido SEM novo evento de auditoria e SEM efeito.
    IF v_status_alvo IS NOT NULL AND v_status_atual = v_status_alvo THEN
        RETURN jsonb_build_object(
            'success', true,
            'replay', true,
            'message', 'Etapa já aplicada anteriormente.'
        );
    END IF;

    SELECT * INTO v_validacao FROM public.rpc_validar_integridade_esteira(p_os_id, p_origem_os, p_etapa_destino);
    IF NOT (v_validacao->>'permitido')::BOOLEAN THEN
        RETURN jsonb_build_object('success', false, 'message', (v_validacao->'bloqueios'->>0));
    END IF;

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

            SELECT resultado::text INTO v_cq_atual
              FROM public.controle_qualidade
             WHERE lote_id = v_lote_id
             ORDER BY created_at DESC, id DESC
             LIMIT 1;

            IF p_etapa_destino = 'aprovar_cq' THEN
                -- replay de CQ aprovado: nao duplica laudo NEM evento
                IF v_cq_atual IS NOT DISTINCT FROM 'aprovado' THEN
                    UPDATE public.lotes SET status = 'aprovado' WHERE id = v_lote_id;
                    RETURN jsonb_build_object('success', true, 'replay', true,
                        'message', 'CQ já registrado como aprovado.');
                END IF;
                UPDATE public.lotes SET status = 'aprovado' WHERE id = v_lote_id;
                INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id)
                VALUES (v_lote_id, 'aprovado', v_profile_id);
            ELSE
                IF v_cq_atual IS NOT DISTINCT FROM 'reprovado' THEN
                    UPDATE public.lotes SET status = 'reprovado' WHERE id = v_lote_id;
                    RETURN jsonb_build_object('success', true, 'replay', true,
                        'message', 'CQ já registrado como reprovado.');
                END IF;
                UPDATE public.lotes SET status = 'reprovado' WHERE id = v_lote_id;
                INSERT INTO public.controle_qualidade (lote_id, resultado, responsavel_id)
                VALUES (v_lote_id, 'reprovado', v_profile_id);
            END IF;
        WHEN 'enviar_envase' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'envase');
        WHEN 'concluir_envase' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'pronto_entrega');
        WHEN 'gerar_estoque', 'reservar_estoque' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'pronto_entrega');
        -- GATE 4: criar_entrega NAO altera o status da OS para 'entregue'.
        WHEN 'criar_entrega' THEN NULL;
        WHEN 'enviar_entrega' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'entregue');
        WHEN 'finalizar_os' THEN PERFORM public._avancar_os_status(p_origem_os, p_os_id, 'finalizada');
        ELSE
    END CASE;

    INSERT INTO public.laboratorio_esteira_eventos (os_id, origem_os, programacao_id, etapa_anterior, etapa_nova, acao, usuario_id)
    VALUES (p_os_id, p_origem_os, p_programacao_id, v_etapa_anterior_os, p_etapa_destino, p_etapa_destino, auth.uid());

    RETURN jsonb_build_object('success', true, 'replay', false, 'message', 'Etapa avançada com sucesso');
END;
$function$;

-- Menor privilégio: função interna, apenas o wrapper/serviço executa.
REVOKE ALL ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- Confirmação de entrega: recebedor físico é OBRIGATÓRIO (sem fallback
-- para o operador). Reforça o contrato exigido pelo Gate 6.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cockpit_confirmar_entrega_v1(
  p_entrega_id uuid,
  p_os_id uuid,
  p_origem text,
  p_recebedor jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_os_id IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_PARAMS_INVALIDOS'; END IF;
  IF coalesce(btrim(p_recebedor->>'nome'), '') = '' THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_RECEBEDOR_OBRIGATORIO';
  END IF;
  RETURN public.fn_entrega_confirmar_engine_v1(p_entrega_id, p_os_id, p_origem, p_recebedor, '{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text, jsonb) TO service_role;
