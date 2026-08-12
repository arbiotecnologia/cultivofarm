-- =====================================================================
-- OS AR BIO — RECONCILIAÇÃO E2E (Fases 1–4)
-- Incremental sobre 20260828000000_os_e2e_entrega_lote_finalizacao.sql
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq
--
-- ESCOPO
--   1. Hardening: search_path canônico (public, pg_temp) nas RPCs criadas
--      na rodada anterior + revogação de PUBLIC/anon.
--   2. Motor ÚNICO de confirmação de entrega (fn_entrega_confirmar_engine_v1),
--      com rpc_cockpit_confirmar_entrega_v1 como delegador (assinatura
--      preservada) e rpc_entrega_confirmar_v1 como porta de entrada da tela
--      de Entregas — eliminando o UPDATE direto no frontend.
--   3. Idempotência determinística do registro de CQ (substitui a janela
--      heurística de 10 segundos).
--
-- FAIL-CLOSED: exige marcador STAGING/ikaauvsflpmamgxmkhoq.
-- Produção navfzbwgwzruipouyfnk é explicitamente recusada.
-- Idempotente: pode ser reaplicada.
-- Rollback: restoration/os-e2e/90-rollback-20260829000000.sql
-- =====================================================================

DO $guard$
DECLARE v_marker text; v_ref text; v_n int;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ENV_ABORT: marcador de ambiente ausente — execução recusada';
  END IF;
  SELECT count(*) INTO v_n FROM public._fiscal_staging_marker;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ENV_ABORT: marcador ambíguo (% linhas)', v_n;
  END IF;
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ENV_ABORT: PRODUÇÃO detectada — execução proibida';
  END IF;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ENV_ABORT: ambiente não é o staging autorizado';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------
-- 1. HARDENING DAS FUNÇÕES DA RODADA ANTERIOR
-- ---------------------------------------------------------------------
ALTER FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid, text, uuid, numeric, jsonb)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_cockpit_gerar_lote_v1(uuid, uuid, text, jsonb)
  SET search_path = public, pg_temp;
ALTER FUNCTION public._avancar_os_status(text, uuid, text)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.check_os_status_transition()
  SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid, text, uuid, numeric, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_cockpit_gerar_lote_v1(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_cockpit_cancelar_reserva_v1(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_criar_entrega_v1(uuid, text, uuid, numeric, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_gerar_lote_v1(uuid, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_cancelar_reserva_v1(uuid, uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. AUTORIZAÇÃO DE CONFIRMAÇÃO DE ENTREGA
--    União exata das alçadas hoje vigentes:
--      - cockpit (fn_cockpit_assert_operador_origem): admin, gestor,
--        producao, operador_onfarm(onfarm);
--      - RLS de UPDATE em public.entregas: admin, gestor, administrativo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_entrega_assert_confirmador(p_origem text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_origem text := public.fn_cockpit_norm_origem(p_origem);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'COCKPIT_UNAUTHENTICATED'; END IF;

  IF public.has_role(v_uid, 'administrador'::app_role)
     OR public.has_role(v_uid, 'gestor'::app_role)
     OR public.has_role(v_uid, 'administrativo'::app_role)
     OR public.has_role(v_uid, 'producao'::app_role) THEN
    RETURN v_origem;
  END IF;

  IF public.has_role(v_uid, 'operador_onfarm'::app_role) THEN
    IF v_origem <> 'onfarm' THEN RAISE EXCEPTION 'COCKPIT_FORBIDDEN_ORIGEM'; END IF;
    RETURN v_origem;
  END IF;

  RAISE EXCEPTION 'COCKPIT_FORBIDDEN';
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_entrega_assert_confirmador(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_entrega_assert_confirmador(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. MOTOR ÚNICO DE CONFIRMAÇÃO DE ENTREGA
--    Toda confirmação real (cockpit ou tela de Entregas) passa por aqui.
--    Exige recebedor explícito: NÃO usa o nome do operador como recebedor.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_entrega_confirmar_engine_v1(
  p_entrega_id uuid,
  p_os_id      uuid,
  p_origem     text,
  p_recebedor  jsonb DEFAULT '{}'::jsonb,
  p_opcoes     jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_origem text;
  v_os_id uuid;
  v_ent record;
  v_est public.estoque_produto%ROWTYPE;
  v_pendentes int; v_total_entregue numeric; v_total_reservado numeric;
  v_finalizada boolean := false; v_avanco jsonb;
  v_recebedor_nome text;
  v_entregue_em timestamptz;
  v_faturamento text := nullif(btrim(coalesce(p_opcoes->>'faturamento','')), '');
  v_motivo_nb text := nullif(btrim(coalesce(p_opcoes->>'motivo_nao_faturavel','')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'COCKPIT_UNAUTHENTICATED'; END IF;
  IF p_entrega_id IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_PARAMS_INVALIDOS'; END IF;

  PERFORM public.fn_estoque_ctx_open(jsonb_build_object(
    'acao','entrega','origem','fn_entrega_confirmar_engine_v1','usuario_id', v_uid::text));

  PERFORM pg_advisory_xact_lock(hashtext('cockpit_entrega:' || p_entrega_id::text));

  SELECT e.id, e.status::text AS status, e.estoque_produto_id,
         coalesce(e.quantidade_entregue, 0) AS qtd, e.partner_order_id,
         e.ordem_servico_id, e.ordem_servico_onfarm_id
    INTO v_ent
    FROM public.entregas e
   WHERE e.id = p_entrega_id
   FOR UPDATE;

  IF v_ent.id IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_NAO_ENCONTRADA'; END IF;

  -- Origem: explícita quando informada; derivada do vínculo caso contrário.
  IF nullif(btrim(coalesce(p_origem,'')), '') IS NOT NULL THEN
    v_origem := public.fn_cockpit_norm_origem(p_origem);
  ELSIF v_ent.ordem_servico_onfarm_id IS NOT NULL THEN
    v_origem := 'onfarm';
  ELSIF v_ent.partner_order_id IS NOT NULL THEN
    v_origem := 'b2b';
  ELSE
    v_origem := 'manual';
  END IF;

  v_origem := public.fn_entrega_assert_confirmador(v_origem);

  v_os_id := CASE WHEN v_origem = 'onfarm' THEN v_ent.ordem_servico_onfarm_id
                  ELSE v_ent.ordem_servico_id END;

  IF p_os_id IS NOT NULL AND v_os_id IS DISTINCT FROM p_os_id THEN
    RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ENTREGA_OS';
  END IF;

  IF v_ent.status = 'cancelada' THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_CANCELADA'; END IF;
  IF v_ent.status = 'entregue' THEN
    RETURN jsonb_build_object('success', true, 'replay', true, 'finalizada', false,
      'entrega_id', p_entrega_id,
      'message', 'Entrega já confirmada anteriormente.');
  END IF;

  IF v_origem = 'b2b' AND v_ent.partner_order_id IS NOT NULL THEN
    PERFORM public.fn_cockpit_assert_b2b_liberado(v_ent.partner_order_id);
  END IF;

  IF v_ent.estoque_produto_id IS NOT NULL THEN
    SELECT * INTO v_est FROM public.estoque_produto WHERE id = v_ent.estoque_produto_id FOR UPDATE;
    IF v_est.id IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_ESTOQUE_NAO_ENCONTRADO'; END IF;
    IF v_est.status::text <> 'expedido' THEN
      IF v_os_id IS NOT NULL THEN
        IF v_est.reservado_para_os_id IS DISTINCT FROM v_os_id THEN
          RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ENTREGA_ESTOQUE';
        END IF;
        IF coalesce(v_est.reservado_para_os_tipo, v_origem) IS DISTINCT FROM v_origem THEN
          RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ENTREGA_ORIGEM';
        END IF;
      END IF;
      IF v_ent.qtd > coalesce(v_est.quantidade, 0) THEN
        RAISE EXCEPTION 'COCKPIT_ENTREGA_QUANTIDADE_EXCEDE_RESERVA';
      END IF;
    END IF;
  END IF;

  -- Recebedor físico é OBRIGATÓRIO e distinto de confirmado_por.
  v_recebedor_nome := nullif(btrim(coalesce(p_recebedor->>'nome','')), '');
  IF v_recebedor_nome IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_RECEBEDOR_OBRIGATORIO';
  END IF;

  v_entregue_em := coalesce(nullif(btrim(coalesce(p_opcoes->>'entregue_em','')), '')::timestamptz, now());

  UPDATE public.entregas
     SET status = 'entregue'::public.status_entrega,
         entregue_em = v_entregue_em,
         recebido_por_nome = v_recebedor_nome,
         recebido_por_cargo = coalesce(nullif(btrim(coalesce(p_recebedor->>'cargo','')), ''), recebido_por_cargo),
         recebido_por_documento = coalesce(nullif(btrim(coalesce(p_recebedor->>'documento','')), ''), recebido_por_documento),
         observacoes_confirmacao = coalesce(nullif(btrim(coalesce(p_recebedor->>'observacoes','')), ''), observacoes_confirmacao),
         confirmado_por = v_uid,
         financial_status = CASE WHEN v_faturamento = 'bill_later' THEN 'PENDING_BILLING'
                                 ELSE financial_status END
   WHERE id = p_entrega_id;

  IF v_est.id IS NOT NULL THEN
    UPDATE public.estoque_produto
       SET status = 'expedido'::public.status_estoque, expedido_por = v_uid,
           expedido_em = now(), updated_at = now()
     WHERE id = v_est.id AND status <> 'expedido'::public.status_estoque;

    IF FOUND THEN
      INSERT INTO public.estoque_movimentacoes
        (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
      VALUES (v_est.id, 'expedicao', v_ent.qtd, 'reservado', 'expedido',
              v_os_id, v_origem, v_uid, v_est.lote_id, 'Baixa por confirmação de entrega');
    END IF;
  END IF;

  IF v_os_id IS NOT NULL THEN
    v_avanco := public._rpc_avancar_esteira_laboratorio_internal(v_os_id, v_origem, 'enviar_entrega', NULL);

    INSERT INTO public.laboratorio_esteira_eventos
      (os_id, origem_os, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
    VALUES (v_os_id, v_origem, 'em_entrega', 'entregue', 'confirmar_entrega_v1', v_uid,
            format('Confirmação transacional da entrega %s (recebedor: %s)', p_entrega_id, v_recebedor_nome));

    IF v_origem = 'onfarm' THEN
      SELECT count(*) FILTER (WHERE status::text NOT IN ('entregue','cancelada')),
             coalesce(sum(quantidade_entregue) FILTER (WHERE status::text = 'entregue'), 0)
        INTO v_pendentes, v_total_entregue
        FROM public.entregas WHERE ordem_servico_onfarm_id = v_os_id;
    ELSE
      SELECT count(*) FILTER (WHERE status::text NOT IN ('entregue','cancelada')),
             coalesce(sum(quantidade_entregue) FILTER (WHERE status::text = 'entregue'), 0)
        INTO v_pendentes, v_total_entregue
        FROM public.entregas WHERE ordem_servico_id = v_os_id;
    END IF;

    SELECT coalesce(sum(quantidade_reservada), 0) INTO v_total_reservado
      FROM public.estoque_produto
     WHERE reservado_para_os_id = v_os_id
       AND coalesce(reservado_para_os_tipo, v_origem) = v_origem
       AND status <> 'estornado'::public.status_estoque;

    IF v_pendentes = 0 AND v_total_reservado > 0 AND v_total_entregue >= v_total_reservado THEN
      v_avanco := public._rpc_avancar_esteira_laboratorio_internal(v_os_id, v_origem, 'finalizar_os', NULL);
      IF coalesce((v_avanco->>'success')::boolean, false) THEN
        v_finalizada := true;
        INSERT INTO public.laboratorio_esteira_eventos
          (os_id, origem_os, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
        VALUES (v_os_id, v_origem, 'entregue', 'finalizada', 'finalizacao_automatica_por_entrega', v_uid,
                'Cobertura completa: OS finalizada na mesma transação da confirmação de entrega.');
      END IF;
    END IF;
  END IF;

  IF v_faturamento = 'not_billable' THEN
    IF v_motivo_nb IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_MOTIVO_NAO_FATURAVEL_OBRIGATORIO'; END IF;
    PERFORM public.fn_mark_entrega_not_billable(p_entrega_id, v_motivo_nb);
  END IF;

  RETURN jsonb_build_object('success', true, 'replay', false, 'finalizada', v_finalizada,
    'entrega_id', p_entrega_id, 'os_id', v_os_id, 'origem', v_origem,
    'parcial', (coalesce(v_pendentes, 0) > 0 OR coalesce(v_total_entregue, 0) < coalesce(v_total_reservado, 0)),
    'total_entregue', coalesce(v_total_entregue, 0), 'total_reservado', coalesce(v_total_reservado, 0),
    'message', CASE WHEN v_finalizada THEN 'Entrega confirmada — OS finalizada.'
                    ELSE 'Entrega confirmada.' END);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_entrega_confirmar_engine_v1(uuid, uuid, text, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_entrega_confirmar_engine_v1(uuid, uuid, text, jsonb, jsonb) TO authenticated, service_role;

-- Delegador do cockpit: assinatura preservada, lógica única no motor.
CREATE OR REPLACE FUNCTION public.rpc_cockpit_confirmar_entrega_v1(
  p_entrega_id uuid, p_os_id uuid, p_origem text, p_recebedor jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF p_os_id IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_PARAMS_INVALIDOS'; END IF;
  RETURN public.fn_entrega_confirmar_engine_v1(p_entrega_id, p_os_id, p_origem, p_recebedor, '{}'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid, uuid, text, jsonb) TO authenticated, service_role;

-- Porta de entrada da tela de Entregas (substitui o UPDATE direto).
CREATE OR REPLACE FUNCTION public.rpc_entrega_confirmar_v1(
  p_entrega_id uuid, p_recebedor jsonb, p_opcoes jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN public.fn_entrega_confirmar_engine_v1(p_entrega_id, NULL, NULL, p_recebedor, p_opcoes);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_entrega_confirmar_v1(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_entrega_confirmar_v1(uuid, jsonb, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. IDEMPOTÊNCIA DETERMINÍSTICA DO CQ
--    Substitui a janela heurística de 10 s por verificação do laudo mais
--    recente do lote + lock por lote.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._rpc_avancar_esteira_laboratorio_internal(
  p_os_id uuid, p_origem_os text, p_etapa_destino text, p_programacao_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
$function$;

REVOKE ALL ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) TO authenticated, service_role;
