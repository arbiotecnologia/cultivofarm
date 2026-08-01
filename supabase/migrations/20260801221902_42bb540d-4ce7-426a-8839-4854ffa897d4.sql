
-- =====================================================================
-- COCKPIT LABORATÓRIO — FASE 1: fonte única, transações e métricas
-- Production-safe. Sem UUIDs/dados sintéticos. Sem dependência de marker
-- para APLICABILIDADE (o marker é verificado apenas em RUNTIME do seed HML).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Estágio canônico da esteira (fonte única compartilhada com o front)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cockpit_stage(p_status_oficial text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(p_status_oficial, ''))
    WHEN 'cancelada'        THEN 'cancelada'
    WHEN 'cancelado'        THEN 'cancelada'
    WHEN 'finalizada'       THEN 'finalizada'
    WHEN 'finalizado'       THEN 'finalizada'
    WHEN 'entregue'         THEN 'entregue'
    WHEN 'aplicado'         THEN 'entregue'
    WHEN 'em_entrega'       THEN 'em_entrega'
    WHEN 'estoque_reservado' THEN 'estoque_reservado'
    WHEN 'estoque_gerado'   THEN 'estoque_disponivel'
    WHEN 'pronto_entrega'   THEN 'estoque_disponivel'
    WHEN 'envase'           THEN 'em_envase'
    WHEN 'em_envase'        THEN 'em_envase'
    WHEN 'cq_reprovado'     THEN 'cq_reprovado'
    WHEN 'reprovado'        THEN 'cq_reprovado'
    WHEN 'cq_aprovado'      THEN 'cq_aprovado'
    WHEN 'aprovado_cq'      THEN 'cq_aprovado'
    WHEN 'aguardando_cq'    THEN 'aguardando_cq'
    WHEN 'em_cq'            THEN 'aguardando_cq'
    WHEN 'em_producao'      THEN 'em_producao'
    WHEN 'programada'       THEN 'programada'
    ELSE 'aguardando'
  END
$$;

REVOKE ALL ON FUNCTION public.fn_cockpit_stage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cockpit_stage(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) Idempotência das operações críticas do Cockpit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cockpit_operacao_idempotencia (
  idempotency_key text PRIMARY KEY,
  operacao        text NOT NULL,
  usuario_id      uuid,
  resultado       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cockpit_operacao_idempotencia TO authenticated;
GRANT ALL    ON public.cockpit_operacao_idempotencia TO service_role;
ALTER TABLE public.cockpit_operacao_idempotencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cockpit_idem_select_interno ON public.cockpit_operacao_idempotencia;
CREATE POLICY cockpit_idem_select_interno
  ON public.cockpit_operacao_idempotencia FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
  );

-- ---------------------------------------------------------------------
-- 3) Alertas reconhecidos (persistência por usuário)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cockpit_alertas_reconhecidos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_key   text NOT NULL,
  usuario_id   uuid NOT NULL,
  os_id        uuid,
  motivo       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cockpit_alertas_reconhecidos_uq UNIQUE (alerta_key, usuario_id)
);

GRANT SELECT, INSERT, DELETE ON public.cockpit_alertas_reconhecidos TO authenticated;
GRANT ALL ON public.cockpit_alertas_reconhecidos TO service_role;
ALTER TABLE public.cockpit_alertas_reconhecidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cockpit_alertas_own_select ON public.cockpit_alertas_reconhecidos;
CREATE POLICY cockpit_alertas_own_select
  ON public.cockpit_alertas_reconhecidos FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS cockpit_alertas_own_insert ON public.cockpit_alertas_reconhecidos;
CREATE POLICY cockpit_alertas_own_insert
  ON public.cockpit_alertas_reconhecidos FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS cockpit_alertas_own_delete ON public.cockpit_alertas_reconhecidos;
CREATE POLICY cockpit_alertas_own_delete
  ON public.cockpit_alertas_reconhecidos FOR DELETE TO authenticated
  USING (usuario_id = auth.uid());

-- ---------------------------------------------------------------------
-- 4) Guarda de autorização operacional do Cockpit
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cockpit_assert_operador()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_UNAUTHENTICATED';
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
    OR public.has_role(auth.uid(), 'producao'::app_role)
    OR public.has_role(auth.uid(), 'operador_onfarm'::app_role)
  ) THEN
    RAISE EXCEPTION 'COCKPIT_FORBIDDEN';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cockpit_assert_operador() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cockpit_assert_operador() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5) RPC transacional: registrar envase + estoque + movimentações
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cockpit_registrar_envase_v1(
  p_lote_id         uuid,
  p_os_id           uuid,
  p_origem          text,
  p_programacao_id  uuid,
  p_linhas          jsonb,
  p_validade        date,
  p_operador        text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_key            text := coalesce(nullif(p_idempotency_key, ''), NULL);
  v_replay         jsonb;
  v_produzido_ml   numeric := 0;
  v_envasado_ml    numeric := 0;
  v_saldo_ml       numeric := 0;
  v_total_ml       numeric := 0;
  v_demanda_ml     numeric := 0;
  v_reservado_ml   numeric := 0;
  v_pendente_ml    numeric := 0;
  v_linha          jsonb;
  v_tipo           text;
  v_qtd            integer;
  v_unit_ml        numeric;
  v_reservadas     integer;
  v_livres         integer;
  v_envase_id      uuid;
  v_estoque_id     uuid;
  v_produto_id     uuid;
  v_micro_id       uuid;
  v_cq_ok          boolean;
  v_lote_status    text;
  v_env_ct         int := 0;
  v_est_ct         int := 0;
  v_res_ml         numeric := 0;
  v_liv_ml         numeric := 0;
  v_avanco         jsonb;
  v_result         jsonb;
BEGIN
  PERFORM public.fn_cockpit_assert_operador();

  IF v_key IS NOT NULL THEN
    SELECT resultado INTO v_replay
      FROM public.cockpit_operacao_idempotencia
     WHERE idempotency_key = v_key;
    IF v_replay IS NOT NULL THEN
      RETURN v_replay || jsonb_build_object('replay', true);
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('cockpit_envase:' || v_key));
  END IF;

  IF p_lote_id IS NULL OR p_os_id IS NULL OR p_programacao_id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_ENVASE_PARAMS_INVALIDOS';
  END IF;
  IF p_validade IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_ENVASE_VALIDADE_OBRIGATORIA';
  END IF;
  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'COCKPIT_ENVASE_SEM_LINHAS';
  END IF;

  -- lock do lote (serializa envases concorrentes sobre o mesmo saldo)
  SELECT coalesce(volume_produzido, 0), status::text, produto_id, microrganismo_id
    INTO v_produzido_ml, v_lote_status, v_produto_id, v_micro_id
    FROM public.lotes
   WHERE id = p_lote_id
     FOR UPDATE;

  IF v_lote_status IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_NAO_ENCONTRADO';
  END IF;
  IF v_lote_status = 'reprovado' THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_REPROVADO_BLOQUEIA_ENVASE';
  END IF;
  IF v_produzido_ml <= 0 THEN
    RAISE EXCEPTION 'COCKPIT_LOTE_SEM_VOLUME_PRODUZIDO';
  END IF;

  -- CQ aprovado é pré-condição (fail-closed)
  SELECT (resultado::text = 'aprovado') INTO v_cq_ok
    FROM public.controle_qualidade
   WHERE lote_id = p_lote_id
   ORDER BY created_at DESC
   LIMIT 1;
  IF coalesce(v_cq_ok, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'COCKPIT_ENVASE_EXIGE_CQ_APROVADO';
  END IF;

  SELECT coalesce(sum(coalesce(volume_por_unidade, 0) * coalesce(quantidade, 0)), 0)
    INTO v_envasado_ml
    FROM public.envase
   WHERE lote_id = p_lote_id;

  v_saldo_ml := v_produzido_ml - v_envasado_ml;

  -- demanda pendente da OS (para dividir reservado x livre no servidor)
  SELECT coalesce(volume_necessario, 0) INTO v_demanda_ml
    FROM public.programacao_producao WHERE id = p_programacao_id;

  SELECT coalesce(sum(coalesce(volume_total, 0)), 0) * 1000
    INTO v_reservado_ml
    FROM public.estoque_produto
   WHERE reservado_para_os_id = p_os_id
     AND status <> 'estornado';

  v_pendente_ml := greatest(0, v_demanda_ml - v_reservado_ml);

  -- validação de volumes
  FOR v_linha IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    v_tipo := v_linha->>'tipo_embalagem';
    v_qtd  := coalesce((v_linha->>'quantidade')::int, 0);
    v_unit_ml := CASE v_tipo
      WHEN 'frasco_1L'   THEN 1000
      WHEN 'bombona_5L'  THEN 5000
      WHEN 'bombona_20L' THEN 20000
      ELSE NULL END;
    IF v_unit_ml IS NULL THEN
      RAISE EXCEPTION 'COCKPIT_EMBALAGEM_INVALIDA';
    END IF;
    IF v_qtd <= 0 THEN
      RAISE EXCEPTION 'COCKPIT_QUANTIDADE_INVALIDA';
    END IF;
    v_total_ml := v_total_ml + (v_unit_ml * v_qtd);
  END LOOP;

  IF v_total_ml > v_saldo_ml THEN
    RAISE EXCEPTION 'COCKPIT_ENVASE_EXCEDE_PRODUZIDO';
  END IF;

  -- gravação
  FOR v_linha IN SELECT * FROM jsonb_array_elements(p_linhas) LOOP
    v_tipo := v_linha->>'tipo_embalagem';
    v_qtd  := (v_linha->>'quantidade')::int;
    v_unit_ml := CASE v_tipo
      WHEN 'frasco_1L'   THEN 1000
      WHEN 'bombona_5L'  THEN 5000
      WHEN 'bombona_20L' THEN 20000 END;

    INSERT INTO public.envase (lote_id, tipo_embalagem, volume_por_unidade, quantidade, data_envase, operador)
    VALUES (p_lote_id, v_tipo::public.tipo_embalagem, v_unit_ml, v_qtd, current_date, nullif(p_operador, ''))
    RETURNING id INTO v_envase_id;
    v_env_ct := v_env_ct + 1;

    v_reservadas := CASE WHEN v_pendente_ml > 0
                         THEN least(v_qtd, floor(v_pendente_ml / v_unit_ml)::int)
                         ELSE 0 END;
    v_livres := v_qtd - v_reservadas;
    v_pendente_ml := v_pendente_ml - (v_reservadas * v_unit_ml);

    IF v_reservadas > 0 THEN
      INSERT INTO public.estoque_produto (
        produto_id, microrganismo_id, lote_id, envase_id, quantidade, volume_total,
        validade, status, reservado_para_os_id, reservado_para_os_tipo,
        quantidade_reservada, reservado_por, reservado_em
      ) VALUES (
        v_produto_id, v_micro_id, p_lote_id, v_envase_id, v_reservadas,
        (v_unit_ml * v_reservadas) / 1000.0, p_validade, 'reservado'::public.status_estoque,
        p_os_id, p_origem, v_reservadas, v_uid, now()
      ) RETURNING id INTO v_estoque_id;
      v_est_ct := v_est_ct + 1;
      v_res_ml := v_res_ml + (v_unit_ml * v_reservadas);

      INSERT INTO public.estoque_movimentacoes
        (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
      VALUES (v_estoque_id, 'entrada_envase_reservado', v_reservadas, NULL, 'reservado',
              p_os_id, p_origem, v_uid, p_lote_id, 'Entrada de envase reservada para a OS');
    END IF;

    IF v_livres > 0 THEN
      INSERT INTO public.estoque_produto (
        produto_id, microrganismo_id, lote_id, envase_id, quantidade, volume_total,
        validade, status
      ) VALUES (
        v_produto_id, v_micro_id, p_lote_id, v_envase_id, v_livres,
        (v_unit_ml * v_livres) / 1000.0, p_validade, 'disponivel'::public.status_estoque
      ) RETURNING id INTO v_estoque_id;
      v_est_ct := v_est_ct + 1;
      v_liv_ml := v_liv_ml + (v_unit_ml * v_livres);

      INSERT INTO public.estoque_movimentacoes
        (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
      VALUES (v_estoque_id, 'entrada_envase_livre', v_livres, NULL, 'disponivel',
              p_os_id, p_origem, v_uid, p_lote_id, 'Excedente de envase para estoque livre');
    END IF;
  END LOOP;

  -- auditoria na MESMA transação (não engolida)
  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, programacao_id, lote_id, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
  VALUES (p_os_id, p_origem, p_programacao_id, p_lote_id, 'em_envase', 'estoque_gerado',
          'registrar_envase_v1', v_uid,
          format('Envase transacional: %s registros, %s entradas de estoque, reservado %s ml, livre %s ml%s',
                 v_env_ct, v_est_ct, v_res_ml, v_liv_ml,
                 CASE WHEN v_key IS NULL THEN '' ELSE ' [key=' || v_key || ']' END));

  v_avanco := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, p_origem, 'concluir_envase', p_programacao_id);

  v_result := jsonb_build_object(
    'success', true,
    'replay', false,
    'envases', v_env_ct,
    'entradas_estoque', v_est_ct,
    'volume_reservado_ml', v_res_ml,
    'volume_livre_ml', v_liv_ml,
    'saldo_restante_ml', v_saldo_ml - v_total_ml,
    'avanco', v_avanco,
    'message', 'Envase e estoque registrados em transação única.'
  );

  IF v_key IS NOT NULL THEN
    INSERT INTO public.cockpit_operacao_idempotencia (idempotency_key, operacao, usuario_id, resultado)
    VALUES (v_key, 'registrar_envase_v1', v_uid, v_result);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_registrar_envase_v1(uuid,uuid,text,uuid,jsonb,date,text,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6) RPC transacional: cancelar/estornar reserva
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cockpit_cancelar_reserva_v1(
  p_item_id uuid,
  p_os_id   uuid,
  p_origem  text,
  p_motivo  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_item      public.estoque_produto%ROWTYPE;
  v_main      public.estoque_produto%ROWTYPE;
  v_modo      text;
BEGIN
  PERFORM public.fn_cockpit_assert_operador();

  IF p_item_id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_RESERVA_PARAMS_INVALIDOS';
  END IF;

  SELECT * INTO v_item FROM public.estoque_produto WHERE id = p_item_id FOR UPDATE;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_RESERVA_NAO_ENCONTRADA';
  END IF;

  IF v_item.status::text = 'estornado' OR v_item.quantidade_reservada IS NULL THEN
    RETURN jsonb_build_object('success', true, 'replay', true,
      'message', 'Reserva já cancelada anteriormente.');
  END IF;
  IF v_item.status::text = 'expedido' THEN
    RAISE EXCEPTION 'COCKPIT_RESERVA_JA_EXPEDIDA';
  END IF;

  -- registro principal (saldo livre do mesmo lote), travado em ordem determinística
  SELECT * INTO v_main
    FROM public.estoque_produto
   WHERE lote_id = v_item.lote_id
     AND quantidade_reservada IS NULL
     AND status = 'disponivel'::public.status_estoque
     AND id <> v_item.id
   ORDER BY id
   LIMIT 1
   FOR UPDATE;

  IF v_main.id IS NOT NULL THEN
    v_modo := 'estorno_para_saldo_principal';

    UPDATE public.estoque_produto
       SET quantidade    = coalesce(v_main.quantidade, 0) + coalesce(v_item.quantidade, 0),
           volume_total  = coalesce(v_main.volume_total, 0) + coalesce(v_item.volume_total, 0),
           updated_at    = now()
     WHERE id = v_main.id;

    UPDATE public.estoque_produto
       SET status = 'estornado'::public.status_estoque,
           quantidade = 0,
           volume_total = 0,
           quantidade_reservada = NULL,
           reservado_para_os_id = NULL,
           reservado_para_os_tipo = NULL,
           reservado_para_cliente_id = NULL,
           reservado_para_partner_id = NULL,
           reservado_para_partner_order_id = NULL,
           observacao_reserva = coalesce(p_motivo, 'Reserva cancelada') ||
             format(' — saldo devolvido ao registro %s', v_main.id),
           updated_at = now()
     WHERE id = v_item.id;

    INSERT INTO public.estoque_movimentacoes
      (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
    VALUES (v_main.id, 'estorno_reserva', coalesce(v_item.quantidade, 0), 'reservado', 'disponivel',
            p_os_id, p_origem, v_uid, v_item.lote_id, coalesce(p_motivo, 'Estorno de reserva parcial'));
  ELSE
    v_modo := 'liberacao_no_proprio_registro';

    UPDATE public.estoque_produto
       SET status = 'disponivel'::public.status_estoque,
           quantidade_reservada = NULL,
           reservado_para_os_id = NULL,
           reservado_para_os_tipo = NULL,
           reservado_para_cliente_id = NULL,
           reservado_para_partner_id = NULL,
           reservado_para_partner_order_id = NULL,
           observacao_reserva = coalesce(p_motivo, 'Reserva cancelada'),
           updated_at = now()
     WHERE id = v_item.id;

    INSERT INTO public.estoque_movimentacoes
      (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, lote_id, observacao)
    VALUES (v_item.id, 'cancelamento_reserva', coalesce(v_item.quantidade, 0), 'reservado', 'disponivel',
            p_os_id, p_origem, v_uid, v_item.lote_id, coalesce(p_motivo, 'Cancelamento de reserva total'));
  END IF;

  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, lote_id, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
  VALUES (p_os_id, p_origem, v_item.lote_id, 'estoque_reservado', 'estoque_disponivel',
          'cancelar_reserva_v1', v_uid,
          format('Cancelamento transacional (%s). Motivo: %s', v_modo, coalesce(p_motivo, 'não informado')));

  RETURN jsonb_build_object('success', true, 'replay', false, 'modo', v_modo,
    'message', 'Reserva cancelada e saldo devolvido em transação única.');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cockpit_cancelar_reserva_v1(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_cancelar_reserva_v1(uuid,uuid,text,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7) RPC transacional: confirmar entrega + baixa de estoque + finalização
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cockpit_confirmar_entrega_v1(
  p_entrega_id uuid,
  p_os_id      uuid,
  p_origem     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_status         text;
  v_estoque_id     uuid;
  v_qtd            numeric;
  v_pendentes      int;
  v_total_entregue numeric;
  v_total_reservado numeric;
  v_finalizada     boolean := false;
  v_avanco         jsonb;
BEGIN
  PERFORM public.fn_cockpit_assert_operador();

  IF p_entrega_id IS NULL OR p_os_id IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_PARAMS_INVALIDOS';
  END IF;

  SELECT status::text, estoque_produto_id, coalesce(quantidade_entregue, 0)
    INTO v_status, v_estoque_id, v_qtd
    FROM public.entregas
   WHERE id = p_entrega_id
     FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_NAO_ENCONTRADA';
  END IF;
  IF v_status = 'cancelada' THEN
    RAISE EXCEPTION 'COCKPIT_ENTREGA_CANCELADA';
  END IF;
  IF v_status = 'entregue' THEN
    RETURN jsonb_build_object('success', true, 'replay', true, 'finalizada', false,
      'message', 'Entrega já confirmada anteriormente.');
  END IF;

  UPDATE public.entregas
     SET status = 'entregue'::public.status_entrega,
         entregue_em = now()
   WHERE id = p_entrega_id;

  -- baixa do estoque reservado vinculado à entrega (sem dupla baixa)
  IF v_estoque_id IS NOT NULL THEN
    PERFORM 1 FROM public.estoque_produto WHERE id = v_estoque_id FOR UPDATE;

    UPDATE public.estoque_produto
       SET status = 'expedido'::public.status_estoque,
           expedido_por = v_uid,
           expedido_em = now(),
           updated_at = now()
     WHERE id = v_estoque_id
       AND status <> 'expedido'::public.status_estoque;

    IF FOUND THEN
      INSERT INTO public.estoque_movimentacoes
        (estoque_produto_id, acao, quantidade, status_anterior, status_novo, os_id, os_tipo, usuario_id, observacao)
      VALUES (v_estoque_id, 'baixa_entrega', v_qtd, 'reservado', 'expedido',
              p_os_id, p_origem, v_uid, 'Baixa por confirmação de entrega');
    END IF;
  END IF;

  v_avanco := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, p_origem, 'enviar_entrega', NULL);

  INSERT INTO public.laboratorio_esteira_eventos
    (os_id, origem_os, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
  VALUES (p_os_id, p_origem, 'em_entrega', 'entregue', 'confirmar_entrega_v1', v_uid,
          format('Confirmação transacional da entrega %s', p_entrega_id));

  -- cobertura: só finaliza quando não há entrega pendente e a reserva foi coberta
  IF p_origem = 'onfarm' THEN
    SELECT count(*) FILTER (WHERE status::text NOT IN ('entregue', 'cancelada')),
           coalesce(sum(quantidade_entregue) FILTER (WHERE status::text = 'entregue'), 0)
      INTO v_pendentes, v_total_entregue
      FROM public.entregas WHERE ordem_servico_onfarm_id = p_os_id;
  ELSE
    SELECT count(*) FILTER (WHERE status::text NOT IN ('entregue', 'cancelada')),
           coalesce(sum(quantidade_entregue) FILTER (WHERE status::text = 'entregue'), 0)
      INTO v_pendentes, v_total_entregue
      FROM public.entregas WHERE ordem_servico_id = p_os_id;
  END IF;

  SELECT coalesce(sum(quantidade_reservada), 0) INTO v_total_reservado
    FROM public.estoque_produto
   WHERE reservado_para_os_id = p_os_id
     AND status <> 'estornado'::public.status_estoque;

  IF v_pendentes = 0 AND (v_total_reservado = 0 OR v_total_entregue >= v_total_reservado) THEN
    v_avanco := public._rpc_avancar_esteira_laboratorio_internal(p_os_id, p_origem, 'finalizar_os', NULL);
    IF coalesce((v_avanco->>'success')::boolean, false) THEN
      v_finalizada := true;
      INSERT INTO public.laboratorio_esteira_eventos
        (os_id, origem_os, etapa_anterior, etapa_nova, acao, usuario_id, observacao)
      VALUES (p_os_id, p_origem, 'entregue', 'finalizada', 'finalizacao_automatica_por_entrega', v_uid,
              'Cobertura completa: OS finalizada na mesma transação da confirmação de entrega.');
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'replay', false, 'finalizada', v_finalizada,
    'total_entregue', v_total_entregue, 'total_reservado', v_total_reservado,
    'message', CASE WHEN v_finalizada THEN 'Entrega confirmada — OS finalizada.' ELSE 'Entrega confirmada.' END);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_confirmar_entrega_v1(uuid,uuid,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8) Métricas agregadas do Cockpit (universo completo autorizado)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_cockpit_metricas_v1()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT v.*, public.fn_cockpit_stage(v.status_esteira_oficial) AS stage
      FROM public.vw_esteira_laboratorio v
     WHERE v.status_os <> 'finalizada'
  ),
  sem_prog AS (
    SELECT count(*) AS n
      FROM public.ordens_servico os
     WHERE os.status::text = 'aberta'
       AND NOT EXISTS (
         SELECT 1 FROM public.programacao_producao pp
          WHERE pp.ordem_servico_id = os.id
       )
  ),
  sem_prog_onfarm AS (
    SELECT count(*) AS n
      FROM public.ordens_servico_onfarm os
     WHERE os.status::text = 'aberta'
       AND NOT EXISTS (
         SELECT 1 FROM public.programacao_producao pp
          WHERE pp.ordem_servico_onfarm_id = os.id
       )
  )
  SELECT jsonb_build_object(
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
    'bloqueadas',         (SELECT count(*) FROM base WHERE coalesce(array_length(bloqueios,1),0) > 0),
    'os_sem_programacao', (SELECT n FROM sem_prog) + (SELECT n FROM sem_prog_onfarm)
  )
$$;

REVOKE ALL ON FUNCTION public.rpc_cockpit_metricas_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_metricas_v1() TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 9) Hardening de ACL: validação de integridade não pode ser pública/anon
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_validar_integridade_esteira(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_validar_integridade_esteira(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_validar_integridade_esteira(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 10) Seed de fixtures: admin-only + ambiente de homologação comprovado
--     (verificação em RUNTIME; a migration continua aplicável em produção,
--      onde a função simplesmente recusa a execução — fail-closed)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cockpit_is_hml_environment()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_ok boolean := false;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE 'SELECT EXISTS (SELECT 1 FROM public._fiscal_staging_marker WHERE marker = ''STAGING'')'
    INTO v_ok;
  RETURN coalesce(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cockpit_is_hml_environment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cockpit_is_hml_environment() TO authenticated, service_role;

DO $wrap$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'seed_cockpit_fixtures'
       AND pg_get_function_identity_arguments(p.oid) = 'p_prefix text'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = '_seed_cockpit_fixtures_impl'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.seed_cockpit_fixtures(text) RENAME TO _seed_cockpit_fixtures_impl';
    EXECUTE 'REVOKE ALL ON FUNCTION public._seed_cockpit_fixtures_impl(text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public._seed_cockpit_fixtures_impl(text) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public._seed_cockpit_fixtures_impl(text) FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public._seed_cockpit_fixtures_impl(text) TO service_role';
  END IF;
END
$wrap$;

CREATE OR REPLACE FUNCTION public.seed_cockpit_fixtures(p_prefix text DEFAULT 'FIXT')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrador'::app_role) THEN
    RAISE EXCEPTION 'COCKPIT_SEED_FORBIDDEN: apenas administradores';
  END IF;
  IF NOT public.fn_cockpit_is_hml_environment() THEN
    RAISE EXCEPTION 'COCKPIT_SEED_BLOQUEADO: ambiente nao e de homologacao';
  END IF;
  IF to_regprocedure('public._seed_cockpit_fixtures_impl(text)') IS NULL THEN
    RAISE EXCEPTION 'COCKPIT_SEED_INDISPONIVEL';
  END IF;
  RETURN public._seed_cockpit_fixtures_impl(p_prefix);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_cockpit_fixtures(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_cockpit_fixtures(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.seed_cockpit_fixtures(text) TO authenticated, service_role;
