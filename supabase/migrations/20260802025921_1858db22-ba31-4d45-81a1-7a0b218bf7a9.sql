-- ============================================================
-- Cockpit Laboratório — migration corretiva pós-auditoria
-- Forward-only, production-safe, sem dados/UUIDs fixos.
-- ============================================================

-- ---------- 0. Idempotência: escopo + hash de payload ----------
ALTER TABLE public.cockpit_operacao_idempotencia
  ADD COLUMN IF NOT EXISTS payload_hash text,
  ADD COLUMN IF NOT EXISTS alvo_id uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.cockpit_operacao_idempotencia
  ALTER COLUMN resultado DROP NOT NULL;

-- ---------- 1. Origem canônica ----------
CREATE OR REPLACE FUNCTION public.fn_cockpit_norm_origem(p_origem text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v text := lower(btrim(coalesce(p_origem, '')));
BEGIN
  IF v IN ('manual', 'os', 'ordem_servico') THEN RETURN 'manual'; END IF;
  IF v IN ('onfarm', 'on_farm', 'ordem_servico_onfarm') THEN RETURN 'onfarm'; END IF;
  IF v = 'b2b' THEN RETURN 'b2b'; END IF;
  RAISE EXCEPTION 'COCKPIT_ORIGEM_INVALIDA';
END;
$$;

-- ---------- 2. Alçada por origem ----------
CREATE OR REPLACE FUNCTION public.fn_cockpit_assert_operador_origem(p_origem text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_origem text := public.fn_cockpit_norm_origem(p_origem);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'COCKPIT_UNAUTHENTICATED'; END IF;

  IF public.has_role(v_uid, 'administrador'::app_role)
     OR public.has_role(v_uid, 'gestor'::app_role) THEN
    RETURN v_origem;
  END IF;

  -- produção: fluxo industrial (manual/onfarm/b2b), sem privilégio de override
  IF public.has_role(v_uid, 'producao'::app_role) THEN
    RETURN v_origem;
  END IF;

  -- operador on-farm: alçada restrita à própria origem
  IF public.has_role(v_uid, 'operador_onfarm'::app_role) THEN
    IF v_origem <> 'onfarm' THEN
      RAISE EXCEPTION 'COCKPIT_FORBIDDEN_ORIGEM';
    END IF;
    RETURN v_origem;
  END IF;

  RAISE EXCEPTION 'COCKPIT_FORBIDDEN';
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cockpit_is_gestor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.has_role(auth.uid(), 'administrador'::app_role)
      OR public.has_role(auth.uid(), 'gestor'::app_role)
$$;

-- ---------- 3. Gate B2B ----------
CREATE OR REPLACE FUNCTION public.fn_cockpit_assert_b2b_liberado(p_partner_order_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE r record;
BEGIN
  IF p_partner_order_id IS NULL THEN RETURN; END IF;

  SELECT status::text AS status,
         coalesce(financial_status, '')          AS fin,
         coalesce(financial_approval_status, '') AS fin_apr,
         coalesce(payment_condition_status, '')  AS pay,
         partner_id
    INTO r
    FROM public.partner_orders
   WHERE id = p_partner_order_id;

  IF r IS NULL THEN RAISE EXCEPTION 'COCKPIT_B2B_PEDIDO_NAO_ENCONTRADO'; END IF;
  IF r.partner_id IS NULL THEN RAISE EXCEPTION 'COCKPIT_B2B_PARCEIRO_INVALIDO'; END IF;

  IF r.status IN ('rascunho','pendente','solicitado','em_analise_comercial',
                  'aguardando_cotacao','aguardando_aprovacao_credito',
                  'aguardando_ajuste_comercial','aguardando_itens') THEN
    RAISE EXCEPTION 'COCKPIT_B2B_APROVACAO_PENDENTE';
  END IF;
  IF r.status IN ('reprovado','reprovado_sem_itens','cancelado') THEN
    RAISE EXCEPTION 'COCKPIT_B2B_PEDIDO_BLOQUEADO';
  END IF;
  IF r.fin_apr IN ('pendente','rejeitado','bloqueado')
     OR r.fin IN ('bloqueado','inadimplente')
     OR r.pay IN ('pendente','rejeitado') THEN
    RAISE EXCEPTION 'COCKPIT_B2B_FINANCEIRO_BLOQUEADO';
  END IF;
END;
$$;

-- ---------- 4. Contexto canônico derivado do banco ----------
CREATE OR REPLACE FUNCTION public.fn_cockpit_ctx_programacao(p_programacao_id uuid)
RETURNS TABLE (
  programacao_id uuid, os_id uuid, origem text, produto_id uuid,
  microrganismo_id uuid, cliente_id uuid, partner_order_id uuid,
  volume_necessario numeric, status_os text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE pp record;
BEGIN
  SELECT * INTO pp FROM public.programacao_producao WHERE id = p_programacao_id;
  IF pp IS NULL THEN RAISE EXCEPTION 'COCKPIT_PROGRAMACAO_NAO_ENCONTRADA'; END IF;

  IF pp.ordem_servico_onfarm_id IS NOT NULL THEN
    RETURN QUERY
      SELECT pp.id, os.id, 'onfarm'::text, coalesce(pp.produto_id, os.produto_id),
             coalesce(pp.microrganismo_id, os.microrganismo_id), os.cliente_id,
             NULL::uuid, coalesce(pp.volume_necessario, 0), os.status::text
        FROM public.ordens_servico_onfarm os
       WHERE os.id = pp.ordem_servico_onfarm_id;
  ELSIF pp.ordem_servico_id IS NOT NULL THEN
    RETURN QUERY
      SELECT pp.id, os.id,
             CASE WHEN os.partner_order_id IS NOT NULL THEN 'b2b' ELSE 'manual' END,
             coalesce(pp.produto_id, os.produto_id),
             coalesce(pp.microrganismo_id, os.microrganismo_id), os.cliente_id,
             os.partner_order_id, coalesce(pp.volume_necessario, 0), os.status::text
        FROM public.ordens_servico os
       WHERE os.id = pp.ordem_servico_id;
  ELSE
    RAISE EXCEPTION 'COCKPIT_PROGRAMACAO_SEM_OS';
  END IF;
END;
$$;

-- ---------- 5. ENVASE v1 (corrigido) ----------
CREATE OR REPLACE FUNCTION public.rpc_cockpit_registrar_envase_v1(
  p_lote_id uuid, p_os_id uuid, p_origem text, p_programacao_id uuid,
  p_linhas jsonb, p_validade date, p_operador text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_permitir_parcial boolean DEFAULT false,
  p_motivo_parcial text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_origem text;
  v_ctx record;
  v_scope text;
  v_hash text;
  v_row record;
  v_produzido_ml numeric := 0; v_envasado_ml numeric := 0; v_saldo_ml numeric := 0;
  v_total_ml numeric := 0; v_demanda_ml numeric := 0; v_reservado_ml numeric := 0;
  v_pendente_ml numeric := 0;
  v_linha jsonb; v_tipo text; v_qtd integer; v_unit_ml numeric;
  v_reservadas integer; v_livres integer;
  v_envase_id uuid; v_estoque_id uuid;
  v_produto_id uuid; v_micro_id uuid; v_cq_ok boolean; v_lote_status text;
  v_lote_prog uuid;
  v_env_ct int := 0; v_est_ct int := 0; v_res_ml numeric := 0; v_liv_ml numeric := 0;
  v_avanco jsonb; v_result jsonb; v_estado text;
BEGIN
  v_origem := public.fn_cockpit_assert_operador_origem(p_origem);

  IF p_lote_id IS NULL OR p_os_id IS NULL OR p_programacao_id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_ENVASE_PARAMS_INVALIDOS';
  END IF;
  IF p_validade IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENVASE_VALIDADE_OBRIGATORIA'; END IF;
  IF p_validade <= current_date THEN RAISE EXCEPTION 'COCKPIT_ENVASE_VALIDADE_INVALIDA'; END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'COCKPIT_ENVASE_SEM_LINHAS';
  END IF;

  -- idempotência: LOCK primeiro, leitura definitiva depois (claim atômico)
  IF nullif(btrim(coalesce(p_idempotency_key, '')), '') IS NOT NULL THEN
    v_scope := 'registrar_envase_v1:' || v_uid::text || ':' || btrim(p_idempotency_key);
    v_hash  := encode(digest(jsonb_build_object(
                 'lote', p_lote_id, 'os', p_os_id, 'origem', v_origem,
                 'prog', p_programacao_id, 'linhas', p_linhas,
                 'validade', p_validade, 'parcial', p_permitir_parcial)::text, 'sha256'), 'hex');
    PERFORM pg_advisory_xact_lock(hashtext(v_scope));

    SELECT * INTO v_row FROM public.cockpit_operacao_idempotencia
     WHERE idempotency_key = v_scope FOR UPDATE;

    IF v_row.idempotency_key IS NOT NULL THEN
      IF coalesce(v_row.payload_hash, '') <> v_hash THEN
        RAISE EXCEPTION 'COCKPIT_IDEMPOTENCY_CONFLICT';
      END IF;
      IF v_row.resultado IS NOT NULL THEN
        RETURN v_row.resultado || jsonb_build_object('replay', true);
      END IF;
      RAISE EXCEPTION 'COCKPIT_IDEMPOTENCY_IN_PROGRESS';
    END IF;

    INSERT INTO public.cockpit_operacao_idempotencia
      (idempotency_key, operacao, usuario_id, payload_hash, alvo_id, status)
    VALUES (v_scope, 'registrar_envase_v1', v_uid, v_hash, p_lote_id, 'in_progress');
  END IF;

  -- contexto canônico e coerência de vínculos
  SELECT * INTO v_ctx FROM public.fn_cockpit_ctx_programacao(p_programacao_id);
  IF v_ctx.os_id <> p_os_id THEN RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_PROGRAMACAO_OS'; END IF;
  IF v_ctx.origem <> v_origem THEN RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ORIGEM'; END IF;
  IF v_ctx.status_os IN ('cancelada','finalizada') THEN RAISE EXCEPTION 'COCKPIT_OS_ESTADO_TERMINAL'; END IF;
  PERFORM public.fn_cockpit_assert_b2b_liberado(v_ctx.partner_order_id);

  -- lock determinístico: programação e lote
  PERFORM 1 FROM public.programacao_producao WHERE id = p_programacao_id FOR UPDATE;

  SELECT coalesce(volume_produzido, 0), status::text, produto_id, microrganismo_id, programacao_id
    INTO v_produzido_ml, v_lote_status, v_produto_id, v_micro_id, v_lote_prog
    FROM public.lotes WHERE id = p_lote_id FOR UPDATE;

  IF v_lote_status IS NULL THEN RAISE EXCEPTION 'COCKPIT_LOTE_NAO_ENCONTRADO'; END IF;
  IF v_lote_prog IS DISTINCT FROM p_programacao_id THEN
    RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_LOTE_PROGRAMACAO';
  END IF;
  IF (v_produto_id IS DISTINCT FROM v_ctx.produto_id)
     AND (v_micro_id IS DISTINCT FROM v_ctx.microrganismo_id) THEN
    RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ITEM';
  END IF;
  IF v_lote_status = 'reprovado' THEN RAISE EXCEPTION 'COCKPIT_LOTE_REPROVADO_BLOQUEIA_ENVASE'; END IF;
  IF v_produzido_ml <= 0 THEN RAISE EXCEPTION 'COCKPIT_LOTE_SEM_VOLUME_PRODUZIDO'; END IF;

  SELECT (resultado::text = 'aprovado') INTO v_cq_ok
    FROM public.controle_qualidade WHERE lote_id = p_lote_id
   ORDER BY created_at DESC LIMIT 1;
  IF coalesce(v_cq_ok, false) IS NOT TRUE THEN RAISE EXCEPTION 'COCKPIT_ENVASE_EXIGE_CQ_APROVADO'; END IF;

  SELECT coalesce(sum(coalesce(volume_por_unidade,0) * coalesce(quantidade,0)), 0)
    INTO v_envasado_ml FROM public.envase WHERE lote_id = p_lote_id;
  v_saldo_ml := v_produzido_ml - v_envasado_ml;

  v_demanda_ml := coalesce(v_ctx.volume_necessario, 0);
  SELECT coalesce(sum(coalesce(volume_total,0)), 0) * 1000 INTO v_reservado_ml
    FROM public.estoque_produto
   WHERE reservado_para_os_id = p_os_id
     AND coalesce(reservado_para_os_tipo, v_origem) = v_origem
     AND status <> 'estornado'::public.status_estoque;
  v_pendente_ml := greatest(0, v_demanda_ml - v_reservado_ml);

  FOR v_linha IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    v_tipo := v_linha->>'tipo_embalagem';
    IF (v_linha->>'quantidade') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'COCKPIT_QUANTIDADE_INVALIDA'; END IF;
    v_qtd := (v_linha->>'quantidade')::int;
    v_unit_ml := CASE v_tipo WHEN 'frasco_1L' THEN 1000 WHEN 'bombona_5L' THEN 5000
                             WHEN 'bombona_20L' THEN 20000 ELSE NULL END;
    IF v_unit_ml IS NULL THEN RAISE EXCEPTION 'COCKPIT_EMBALAGEM_INVALIDA'; END IF;
    IF v_qtd <= 0 THEN RAISE EXCEPTION 'COCKPIT_QUANTIDADE_INVALIDA'; END IF;
    v_total_ml := v_total_ml + (v_unit_ml * v_qtd);
  END LOOP;

  IF v_total_ml > v_saldo_ml THEN RAISE EXCEPTION 'COCKPIT_ENVASE_EXCEDE_PRODUZIDO'; END IF;

  FOR v_linha IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    v_tipo := v_linha->>'tipo_embalagem';
    v_qtd  := (v_linha->>'quantidade')::int;
    v_unit_ml := CASE v_tipo WHEN 'frasco_1L' THEN 1000 WHEN 'bombona_5L' THEN 5000
                             WHEN 'bombona_20L' THEN 20000 END;

    INSERT INTO public.envase (lote_id, tipo_embalagem, volume_por_unidade, quantidade, data_envase, operador)
    VALUES (p_lote_id, v_tipo::public.tipo_embalagem, v_unit_ml, v_qtd, current_date, nullif(p_operador, ''))
    RETURNING id INTO v_envase_id;
    v_env_ct := v_env_ct + 1;

    v_reservadas := CASE WHEN v_pendente_ml > 0
                         THEN least(v_qtd, floor(v_pendente_ml / v_unit_ml)::int) ELSE 0 END;
    v_livres := v_qtd - v_reservadas;
    v_pendente_ml := v_pendente_ml - (v_reservadas * v_unit_ml);

    IF v_reservadas > 0 THEN
      INSERT INTO public.estoque_produto (
        produto_id, microrganismo_id, lote_id, envase_id, quantidade, volume_total,
        validade, status, reservado_para_os_id, reservado_para_os_tipo,
        reservado_para_cliente_id, reservado_para_partner_order_id,
        quantidade_reservada, reservado_por, reservado_em
      ) VALUES (
        v_produto_id, v_micro_id, p_lote_id, v_envase_id, v_reservadas,
        (v_unit_ml * v_reservadas) / 1000.0, p_validade, 'reservado'::public.status_estoque,
        p_os_id, v_origem, v_ctx.cliente_id, v_ctx.partner_order_id,
        v_reservadas, v_uid, now()
      ) RETURNING id INTO v_estoque_id;
      v_est_ct := v_est_ct + 1;
      v_res_ml := v_res_ml + (v_unit_ml * v_reservadas);

      INSERT INTO public.estoque_movimentacoes
        (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
      VALUES (v_estoque_id, 'entrada_envase_reservado', v_reservadas, NULL, 'reservado',
              p_os_id, v_origem, v_uid, p_lote_id, 'Entrada de envase reservada para a OS');
    END IF;

    IF v_livres > 0 THEN
      INSERT INTO public.estoque_produto (
        produto_id, microrganismo_id, lote_id, envase_id, quantidade, volume_total, validade, status
      ) VALUES (
        v_produto_id, v_micro_id, p_lote_id, v_envase_id, v_livres,
        (v_unit_ml * v_livres) / 1000.0, p_validade, 'disponivel'::public.status_estoque
      ) RETURNING id INTO v_estoque_id;
      v_est_ct := v_est_ct + 1;
      v_liv_ml := v_liv_ml + (v_unit_ml * v_livres);

      INSERT INTO public.estoque_movimentacoes
        (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
      VALUES (v_estoque_id, 'entrada_envase_livre', v_livres, NULL, 'disponivel',
              p_os_id, v_origem, v_uid, p_lote_id, 'Excedente de envase para estoque livre');
    END IF;
  END LOOP;

  -- regra canônica de encerramento
  IF v_pendente_ml <= 0 THEN
    v_estado := 'completed';
  ELSIF p_permitir_parcial THEN
    IF NOT public.fn_cockpit_is_gestor() THEN RAISE EXCEPTION 'COCKPIT_ENVASE_PARCIAL_SEM_ALCADA'; END IF;
    IF nullif(btrim(coalesce(p_motivo_parcial, '')), '') IS NULL THEN
      RAISE EXCEPTION 'COCKPIT_ENVASE_PARCIAL_SEM_MOTIVO';
    END IF;
    v_estado := 'completed_override';
  ELSE
    v_estado := 'partial';
  END IF;

  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, programacao_id, lote_id, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
  VALUES (p_os_id, v_origem, p_programacao_id, p_lote_id, 'em_envase',
          CASE WHEN v_estado = 'partial' THEN 'em_envase' ELSE 'estoque_gerado' END,
          'registrar_envase_v1', v_uid,
          format('Envase transacional [%s]: %s registros, %s entradas, reservado %s ml, livre %s ml, pendente %s ml. %s',
                 v_estado, v_env_ct, v_est_ct, v_res_ml, v_liv_ml, v_pendente_ml,
                 coalesce('Motivo: ' || nullif(btrim(coalesce(p_motivo_parcial, '')), ''), '')));

  IF v_estado <> 'partial' THEN
    v_avanco := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, v_origem, 'concluir_envase', p_programacao_id);
  ELSE
    v_avanco := jsonb_build_object('success', false, 'motivo', 'COCKPIT_ENVASE_PARCIAL_NAO_AVANCA');
  END IF;

  v_result := jsonb_build_object(
    'success', true, 'replay', false, 'estado', v_estado,
    'envases', v_env_ct, 'entradas_estoque', v_est_ct,
    'volume_reservado_ml', v_res_ml, 'volume_livre_ml', v_liv_ml,
    'pendente_os_ml', v_pendente_ml, 'saldo_restante_ml', v_saldo_ml - v_total_ml,
    'avanco', v_avanco,
    'message', CASE WHEN v_estado = 'partial'
                    THEN 'Envase registrado — necessidade da OS ainda não coberta.'
                    ELSE 'Envase e estoque registrados em transação única.' END);

  IF v_scope IS NOT NULL THEN
    UPDATE public.cockpit_operacao_idempotencia
       SET resultado = v_result, status = 'done', updated_at = now()
     WHERE idempotency_key = v_scope;
  END IF;

  RETURN v_result;
END;
$$;

-- ---------- 6. CANCELAR RESERVA (corrigido) ----------
CREATE OR REPLACE FUNCTION public.rpc_cockpit_cancelar_reserva_v1(
  p_item_id uuid, p_os_id uuid, p_origem text, p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_origem text;
  v_item public.estoque_produto%ROWTYPE;
  v_main public.estoque_produto%ROWTYPE;
  v_modo text;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  v_origem := public.fn_cockpit_assert_operador_origem(p_origem);

  IF p_item_id IS NULL OR p_os_id IS NULL THEN RAISE EXCEPTION 'COCKPIT_RESERVA_PARAMS_INVALIDOS'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'COCKPIT_RESERVA_MOTIVO_OBRIGATORIO'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cockpit_reserva:' || p_item_id::text));

  SELECT * INTO v_item FROM public.estoque_produto WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'COCKPIT_RESERVA_NAO_ENCONTRADA'; END IF;

  IF v_item.status::text = 'estornado' OR v_item.quantidade_reservada IS NULL THEN
    RETURN jsonb_build_object('success', true, 'replay', true,
      'message', 'Reserva já cancelada anteriormente.');
  END IF;
  IF v_item.status::text = 'expedido' THEN RAISE EXCEPTION 'COCKPIT_RESERVA_JA_EXPEDIDA'; END IF;

  -- coerência: a reserva precisa pertencer à MESMA OS/origem
  IF v_item.reservado_para_os_id IS DISTINCT FROM p_os_id THEN
    RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_RESERVA_OS';
  END IF;
  IF coalesce(v_item.reservado_para_os_tipo, v_origem) IS DISTINCT FROM v_origem THEN
    RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_RESERVA_ORIGEM';
  END IF;

  -- override (cancelar reserva feita por outro operador) exige gestor
  IF v_item.reservado_por IS DISTINCT FROM v_uid AND NOT public.fn_cockpit_is_gestor() THEN
    RAISE EXCEPTION 'COCKPIT_RESERVA_OVERRIDE_SEM_ALCADA';
  END IF;

  -- saldo principal compatível (mesmo lote, envase, item e validade)
  SELECT * INTO v_main
    FROM public.estoque_produto
   WHERE lote_id = v_item.lote_id
     AND envase_id IS NOT DISTINCT FROM v_item.envase_id
     AND produto_id IS NOT DISTINCT FROM v_item.produto_id
     AND microrganismo_id IS NOT DISTINCT FROM v_item.microrganismo_id
     AND validade IS NOT DISTINCT FROM v_item.validade
     AND quantidade_reservada IS NULL
     AND status = 'disponivel'::public.status_estoque
     AND id <> v_item.id
   ORDER BY id LIMIT 1 FOR UPDATE;

  IF v_main.id IS NOT NULL THEN
    v_modo := 'estorno_para_saldo_principal';
    UPDATE public.estoque_produto
       SET quantidade = coalesce(v_main.quantidade,0) + coalesce(v_item.quantidade,0),
           volume_total = coalesce(v_main.volume_total,0) + coalesce(v_item.volume_total,0),
           updated_at = now()
     WHERE id = v_main.id;

    UPDATE public.estoque_produto
       SET status = 'estornado'::public.status_estoque, quantidade = 0, volume_total = 0,
           quantidade_reservada = NULL, reservado_para_os_id = NULL, reservado_para_os_tipo = NULL,
           reservado_para_cliente_id = NULL, reservado_para_partner_id = NULL,
           reservado_para_partner_order_id = NULL,
           observacao_reserva = v_motivo || format(' — saldo devolvido ao registro %s', v_main.id),
           updated_at = now()
     WHERE id = v_item.id;

    INSERT INTO public.estoque_movimentacoes
      (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
    VALUES (v_main.id, 'estorno_reserva', coalesce(v_item.quantidade,0), 'reservado', 'disponivel',
            p_os_id, v_origem, v_uid, v_item.lote_id, v_motivo);
  ELSE
    v_modo := 'liberacao_no_proprio_registro';
    UPDATE public.estoque_produto
       SET status = 'disponivel'::public.status_estoque, quantidade_reservada = NULL,
           reservado_para_os_id = NULL, reservado_para_os_tipo = NULL,
           reservado_para_cliente_id = NULL, reservado_para_partner_id = NULL,
           reservado_para_partner_order_id = NULL,
           observacao_reserva = v_motivo, updated_at = now()
     WHERE id = v_item.id;

    INSERT INTO public.estoque_movimentacoes
      (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
    VALUES (v_item.id, 'cancelamento_reserva', coalesce(v_item.quantidade,0), 'reservado', 'disponivel',
            p_os_id, v_origem, v_uid, v_item.lote_id, v_motivo);
  END IF;

  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, lote_id, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
  VALUES (p_os_id, v_origem, v_item.lote_id, 'estoque_reservado', 'estoque_disponivel',
          'cancelar_reserva_v1', v_uid, format('Cancelamento transacional (%s). Motivo: %s', v_modo, v_motivo));

  RETURN jsonb_build_object('success', true, 'replay', false, 'modo', v_modo,
    'message', 'Reserva cancelada e saldo devolvido em transação única.');
END;
$$;

-- ---------- 7. CONFIRMAR ENTREGA (corrigido) ----------
CREATE OR REPLACE FUNCTION public.rpc_cockpit_confirmar_entrega_v1(
  p_entrega_id uuid, p_os_id uuid, p_origem text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_origem text;
  v_ent record;
  v_est public.estoque_produto%ROWTYPE;
  v_pendentes int; v_total_entregue numeric; v_total_reservado numeric;
  v_finalizada boolean := false; v_avanco jsonb;
BEGIN
  v_origem := public.fn_cockpit_assert_operador_origem(p_origem);
  IF p_entrega_id IS NULL OR p_os_id IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_PARAMS_INVALIDOS'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cockpit_entrega:' || p_entrega_id::text));

  -- busca já restrita pela coluna correta da OS conforme a origem
  SELECT e.id, e.status::text AS status, e.estoque_produto_id,
         coalesce(e.quantidade_entregue, 0) AS qtd, e.partner_order_id
    INTO v_ent
    FROM public.entregas e
   WHERE e.id = p_entrega_id
     AND ( (v_origem = 'onfarm' AND e.ordem_servico_onfarm_id = p_os_id)
        OR (v_origem <> 'onfarm' AND e.ordem_servico_id = p_os_id) )
   FOR UPDATE;

  IF v_ent.id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.entregas WHERE id = p_entrega_id) THEN
      RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ENTREGA_OS';
    END IF;
    RAISE EXCEPTION 'COCKPIT_ENTREGA_NAO_ENCONTRADA';
  END IF;
  IF v_ent.status = 'cancelada' THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_CANCELADA'; END IF;
  IF v_ent.status = 'entregue' THEN
    RETURN jsonb_build_object('success', true, 'replay', true, 'finalizada', false,
      'message', 'Entrega já confirmada anteriormente.');
  END IF;

  IF v_origem = 'b2b' THEN
    PERFORM public.fn_cockpit_assert_b2b_liberado(v_ent.partner_order_id);
  END IF;

  IF v_ent.estoque_produto_id IS NOT NULL THEN
    SELECT * INTO v_est FROM public.estoque_produto WHERE id = v_ent.estoque_produto_id FOR UPDATE;
    IF v_est.id IS NULL THEN RAISE EXCEPTION 'COCKPIT_ENTREGA_ESTOQUE_NAO_ENCONTRADO'; END IF;
    IF v_est.status::text <> 'expedido' THEN
      IF v_est.reservado_para_os_id IS DISTINCT FROM p_os_id THEN
        RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ENTREGA_ESTOQUE';
      END IF;
      IF coalesce(v_est.reservado_para_os_tipo, v_origem) IS DISTINCT FROM v_origem THEN
        RAISE EXCEPTION 'COCKPIT_RELATION_MISMATCH_ENTREGA_ORIGEM';
      END IF;
      IF v_ent.qtd > coalesce(v_est.quantidade, 0) THEN
        RAISE EXCEPTION 'COCKPIT_ENTREGA_QUANTIDADE_EXCEDE_RESERVA';
      END IF;
    END IF;
  END IF;

  UPDATE public.entregas
     SET status = 'entregue'::public.status_entrega, entregue_em = now()
   WHERE id = p_entrega_id;

  IF v_est.id IS NOT NULL THEN
    UPDATE public.estoque_produto
       SET status = 'expedido'::public.status_estoque, expedido_por = v_uid,
           expedido_em = now(), updated_at = now()
     WHERE id = v_est.id AND status <> 'expedido'::public.status_estoque;

    IF FOUND THEN
      INSERT INTO public.estoque_movimentacoes
        (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
      VALUES (v_est.id, 'baixa_entrega', v_ent.qtd, 'reservado', 'expedido',
              p_os_id, v_origem, v_uid, v_est.lote_id, 'Baixa por confirmação de entrega');
    END IF;
  END IF;

  v_avanco := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, v_origem, 'enviar_entrega', NULL);

  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
  VALUES (p_os_id, v_origem, 'em_entrega', 'entregue', 'confirmar_entrega_v1', v_uid,
          format('Confirmação transacional da entrega %s', p_entrega_id));

  IF v_origem = 'onfarm' THEN
    SELECT count(*) FILTER (WHERE status::text NOT IN ('entregue','cancelada')),
           coalesce(sum(quantidade_entregue) FILTER (WHERE status::text = 'entregue'), 0)
      INTO v_pendentes, v_total_entregue
      FROM public.entregas WHERE ordem_servico_onfarm_id = p_os_id;
  ELSE
    SELECT count(*) FILTER (WHERE status::text NOT IN ('entregue','cancelada')),
           coalesce(sum(quantidade_entregue) FILTER (WHERE status::text = 'entregue'), 0)
      INTO v_pendentes, v_total_entregue
      FROM public.entregas WHERE ordem_servico_id = p_os_id;
  END IF;

  SELECT coalesce(sum(quantidade_reservada), 0) INTO v_total_reservado
    FROM public.estoque_produto
   WHERE reservado_para_os_id = p_os_id
     AND coalesce(reservado_para_os_tipo, v_origem) = v_origem
     AND status <> 'estornado'::public.status_estoque;

  IF v_pendentes = 0 AND v_total_reservado > 0 AND v_total_entregue >= v_total_reservado THEN
    v_avanco := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, v_origem, 'finalizar_os', NULL);
    IF coalesce((v_avanco->>'success')::boolean, false) THEN
      v_finalizada := true;
      INSERT INTO public.laboratorio_esteira_eventos
        (os_id, origem_os, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
      VALUES (p_os_id, v_origem, 'entregue', 'finalizada', 'finalizacao_automatica_por_entrega', v_uid,
              'Cobertura completa: OS finalizada na mesma transação da confirmação de entrega.');
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'replay', false, 'finalizada', v_finalizada,
    'parcial', (v_pendentes > 0 OR v_total_entregue < v_total_reservado),
    'total_entregue', v_total_entregue, 'total_reservado', v_total_reservado,
    'message', CASE WHEN v_finalizada THEN 'Entrega confirmada — OS finalizada.'
                    ELSE 'Entrega confirmada.' END);
END;
$$;

-- ---------- 8. Listagem paginada server-side ----------
CREATE OR REPLACE FUNCTION public.rpc_cockpit_listar_esteira_v1(
  p_busca text DEFAULT NULL,
  p_stages text[] DEFAULT NULL,
  p_origens text[] DEFAULT NULL,
  p_prioridades text[] DEFAULT NULL,
  p_atrasado boolean DEFAULT NULL,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL,
  p_incluir_finalizadas boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT v.os_id, v.origem_os, v.numero_os, v.cliente_id, v.cliente_nome,
           v.fazenda_nome, v.talhao_nome, v.produto_nome, v.microrganismo_nome,
           v.partner_nome, v.titular_nome, v.prioridade, v.volume_solicitado_l,
           v.status_os, v.status_esteira_oficial,
           public.fn_cockpit_stage(v.status_esteira_oficial) AS stage,
           v.programacao_id, v.data_programada, v.lote_id, v.codigo_lote, v.status_lote,
           v.cq_resultado, v.envase_id, v.estoque_id, v.estoque_reservado_id,
           v.entrega_id, v.entrega_status, v.atrasado, v.bloqueios, v.pode_finalizar,
           v.proxima_acao, v.created_at,
           pp.responsavel_id,
           coalesce(pr.nome, pp.responsavel) AS responsavel_nome
      FROM public.vw_esteira_laboratorio v
      LEFT JOIN public.programacao_producao pp ON pp.id = v.programacao_id
      LEFT JOIN public.profiles pr ON pr.user_id = pp.responsavel_id
     WHERE (p_incluir_finalizadas OR v.status_os <> 'finalizada')
       AND (p_origens IS NULL OR v.origem_os = ANY (p_origens))
       AND (p_prioridades IS NULL OR v.prioridade::text = ANY (p_prioridades))
       AND (p_atrasado IS NULL OR v.atrasado = p_atrasado)
       AND (p_de IS NULL OR v.created_at::date >= p_de)
       AND (p_ate IS NULL OR v.created_at::date <= p_ate)
       AND (p_stages IS NULL OR public.fn_cockpit_stage(v.status_esteira_oficial) = ANY (p_stages))
       AND (
         nullif(btrim(coalesce(p_busca, '')), '') IS NULL
         OR concat_ws(' ', v.numero_os, v.codigo_lote, v.cliente_nome, v.partner_nome,
                      v.titular_nome, v.fazenda_nome, v.talhao_nome, v.produto_nome,
                      v.microrganismo_nome, pp.responsavel, pr.nome)
            ILIKE '%' || btrim(p_busca) || '%'
       )
  )
  SELECT jsonb_build_object(
    'total_count', (SELECT count(*) FROM base),
    'limit', greatest(1, least(coalesce(p_limit, 50), 200)),
    'offset', greatest(0, coalesce(p_offset, 0)),
    'items', coalesce((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.atrasado DESC NULLS LAST, t.created_at DESC)
        FROM (
          SELECT * FROM base
          ORDER BY atrasado DESC NULLS LAST, created_at DESC
          LIMIT greatest(1, least(coalesce(p_limit, 50), 200))
          OFFSET greatest(0, coalesce(p_offset, 0))
        ) t
    ), '[]'::jsonb)
  )
$$;

-- ---------- 9. Métricas com os mesmos filtros ----------
CREATE OR REPLACE FUNCTION public.rpc_cockpit_metricas_v2(
  p_busca text DEFAULT NULL,
  p_stages text[] DEFAULT NULL,
  p_origens text[] DEFAULT NULL,
  p_prioridades text[] DEFAULT NULL,
  p_atrasado boolean DEFAULT NULL,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT v.*, public.fn_cockpit_stage(v.status_esteira_oficial) AS stage
      FROM public.vw_esteira_laboratorio v
      LEFT JOIN public.programacao_producao pp ON pp.id = v.programacao_id
      LEFT JOIN public.profiles pr ON pr.user_id = pp.responsavel_id
     WHERE v.status_os <> 'finalizada'
       AND (p_origens IS NULL OR v.origem_os = ANY (p_origens))
       AND (p_prioridades IS NULL OR v.prioridade::text = ANY (p_prioridades))
       AND (p_atrasado IS NULL OR v.atrasado = p_atrasado)
       AND (p_de IS NULL OR v.created_at::date >= p_de)
       AND (p_ate IS NULL OR v.created_at::date <= p_ate)
       AND (p_stages IS NULL OR public.fn_cockpit_stage(v.status_esteira_oficial) = ANY (p_stages))
       AND (
         nullif(btrim(coalesce(p_busca, '')), '') IS NULL
         OR concat_ws(' ', v.numero_os, v.codigo_lote, v.cliente_nome, v.partner_nome,
                      v.titular_nome, v.fazenda_nome, v.talhao_nome, v.produto_nome,
                      v.microrganismo_nome, pp.responsavel, pr.nome)
            ILIKE '%' || btrim(p_busca) || '%'
       )
  )
  SELECT jsonb_build_object(
    'escopo_filtrado',    true,
    'total',              (SELECT count(*) FROM base),
    'demandas',           (SELECT count(*) FROM base WHERE stage IN ('aguardando','programada')),
    'producao',           (SELECT count(*) FROM base WHERE stage = 'em_producao'),
    'vol_producao',       (SELECT coalesce(sum(volume_solicitado_l),0) FROM base WHERE stage = 'em_producao'),
    'aguardando_cq',      (SELECT count(*) FROM base WHERE stage = 'aguardando_cq'),
    'vol_cq',             (SELECT coalesce(sum(volume_solicitado_l),0) FROM base WHERE stage = 'aguardando_cq'),
    'aprovados',          (SELECT count(*) FROM base WHERE status_lote::text = 'aprovado'),
    'reprovados',         (SELECT count(*) FROM base WHERE status_lote::text = 'reprovado'),
    'envase_pendente',    (SELECT count(*) FROM base WHERE stage = 'cq_aprovado'),
    'em_envase',          (SELECT count(*) FROM base WHERE stage = 'em_envase'),
    'estoque_disponivel', (SELECT count(*) FROM base WHERE stage = 'estoque_disponivel'),
    'estoque_reservado',  (SELECT count(*) FROM base WHERE stage = 'estoque_reservado'),
    'em_entrega',         (SELECT count(*) FROM base WHERE stage = 'em_entrega'),
    'entregues',          (SELECT count(*) FROM base WHERE stage = 'entregue'),
    'atrasadas',          (SELECT count(*) FROM base WHERE atrasado),
    'bloqueadas',         (SELECT count(*) FROM base WHERE coalesce(array_length(bloqueios,1),0) > 0)
  )
$$;

-- ---------- 10. Índices de apoio ----------
CREATE INDEX IF NOT EXISTS idx_estoque_produto_reserva_os
  ON public.estoque_produto (reservado_para_os_id, reservado_para_os_tipo)
  WHERE reservado_para_os_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entregas_os_onfarm ON public.entregas (ordem_servico_onfarm_id);
CREATE INDEX IF NOT EXISTS idx_entregas_os_manual ON public.entregas (ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_prog_producao_responsavel ON public.programacao_producao (responsavel_id);
CREATE INDEX IF NOT EXISTS idx_cockpit_idem_alvo ON public.cockpit_operacao_idempotencia (operacao, alvo_id);

-- ---------- 11. ACLs ----------
REVOKE ALL ON FUNCTION public.fn_cockpit_norm_origem(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cockpit_assert_operador_origem(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cockpit_is_gestor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cockpit_assert_b2b_liberado(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_cockpit_ctx_programacao(uuid) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_cockpit_cancelar_reserva_v1(uuid,uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_cockpit_metricas_v2(text,text[],text[],text[],boolean,date,date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_cancelar_reserva_v1(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_metricas_v2(text,text[],text[],text[],boolean,date,date) TO authenticated;

-- versão antiga do envase (8 args) removida para evitar bypass das novas validações
DROP FUNCTION IF EXISTS public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text);