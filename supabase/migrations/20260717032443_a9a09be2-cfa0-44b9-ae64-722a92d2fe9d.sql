-- Fase 12.8 · Fase 3 — Correção final: idempotência estrita e helper interno

-- ============================================================
-- 1) RPC de CHECK-IN: idempotência estrita
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_realizar_checkin_visita(
  p_registro_id uuid,
  p_client_uuid uuid,
  p_tipo public.tipo_checkin,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_precisao numeric DEFAULT NULL,
  p_justificativa_sem_gps text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_captured_at_local timestamptz DEFAULT NULL,
  p_solicitacao_id uuid DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL,
  p_fazenda_id uuid DEFAULT NULL,
  p_talhao_id uuid DEFAULT NULL,
  p_foto_path text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_existing public.visitas_checkin;
  v_new public.visitas_checkin;
  v_obs text;
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_client_uuid IS NULL THEN
    RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE = '22023';
  END IF;
  IF p_tipo = 'checkout'::public.tipo_checkin THEN
    RAISE EXCEPTION 'use_rpc_realizar_checkout_visita' USING ERRCODE = '22023';
  END IF;

  v_is_admin := public.has_role(v_uid, 'administrador'::app_role)
             OR public.has_role(v_uid, 'gestor'::app_role);

  -- Idempotência ESTRITA: mesmo client_uuid deve corresponder integralmente
  SELECT * INTO v_existing FROM public.visitas_checkin
    WHERE client_uuid = p_client_uuid::text
    LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
       OR v_existing.tipo_checkin <> p_tipo
       OR (v_existing.consultor_id <> v_uid AND NOT v_is_admin) THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'data_hora_checkin', v_existing.data_hora_checkin,
      'idempotent', true
    );
  END IF;

  IF p_registro_id IS NOT NULL THEN
    v_reg := public._assert_visita_editavel(p_registro_id);
  END IF;

  IF (p_latitude IS NULL OR p_longitude IS NULL)
     AND (p_justificativa_sem_gps IS NULL OR btrim(p_justificativa_sem_gps) = '') THEN
    RAISE EXCEPTION 'gps_ou_justificativa_obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF p_registro_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.visitas_checkin
      WHERE registro_consultor_id = p_registro_id
        AND tipo_checkin = p_tipo
        AND status <> 'inconsistente'::public.status_checkin
    ) THEN
      RAISE EXCEPTION 'checkin_duplicado_para_tipo' USING ERRCODE = '23505';
    END IF;
  END IF;

  v_obs := p_observacoes;
  IF p_captured_at_local IS NOT NULL THEN
    v_obs := COALESCE(v_obs, '') ||
             CASE WHEN v_obs IS NULL OR v_obs = '' THEN '' ELSE E'\n' END ||
             '[captured_at_local=' || p_captured_at_local::text || ']';
  END IF;

  INSERT INTO public.visitas_checkin (
    registro_consultor_id, solicitacao_id, cliente_id, fazenda_id, talhao_id,
    consultor_id, tipo_checkin, latitude, longitude, precisao_gps,
    justificativa_sem_gps, observacoes, foto_path, client_uuid,
    data_hora_checkin, status
  ) VALUES (
    p_registro_id, p_solicitacao_id, p_cliente_id, p_fazenda_id, p_talhao_id,
    v_uid, p_tipo, p_latitude, p_longitude, p_precisao,
    NULLIF(btrim(COALESCE(p_justificativa_sem_gps, '')), ''),
    v_obs, p_foto_path, p_client_uuid::text,
    now(), 'realizado'::public.status_checkin
  )
  RETURNING * INTO v_new;

  IF p_registro_id IS NOT NULL THEN
    INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
    VALUES (
      p_registro_id, v_uid, 'checkin_realizado',
      'Check-in ' || p_tipo::text ||
      ' via RPC (lat=' || COALESCE(p_latitude::text, 'N/A') ||
      ', lng=' || COALESCE(p_longitude::text, 'N/A') || ')'
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_new.id,
    'data_hora_checkin', v_new.data_hora_checkin,
    'idempotent', false
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.visitas_checkin
      WHERE client_uuid = p_client_uuid::text LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
         OR v_existing.tipo_checkin <> p_tipo
         OR (v_existing.consultor_id <> v_uid AND NOT v_is_admin) THEN
        RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
      END IF;
      RETURN jsonb_build_object(
        'id', v_existing.id,
        'data_hora_checkin', v_existing.data_hora_checkin,
        'idempotent', true
      );
    END IF;
    RAISE;
END;
$$;

-- ============================================================
-- 2) RPC de CHECK-OUT: idempotência estrita + ordenação determinística
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_realizar_checkout_visita(
  p_registro_id uuid,
  p_client_uuid uuid,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_precisao numeric DEFAULT NULL,
  p_justificativa_sem_gps text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_captured_at_local timestamptz DEFAULT NULL,
  p_foto_path text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_existing public.visitas_checkin;
  v_last_event public.visitas_checkin;
  v_new public.visitas_checkin;
  v_obs text;
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_client_uuid IS NULL THEN
    RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE = '22023';
  END IF;
  IF p_registro_id IS NULL THEN
    RAISE EXCEPTION 'registro_obrigatorio' USING ERRCODE = '22023';
  END IF;

  v_is_admin := public.has_role(v_uid, 'administrador'::app_role)
             OR public.has_role(v_uid, 'gestor'::app_role);

  -- Idempotência ESTRITA
  SELECT * INTO v_existing FROM public.visitas_checkin
    WHERE client_uuid = p_client_uuid::text
    LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
       OR v_existing.tipo_checkin <> 'checkout'::public.tipo_checkin
       OR (v_existing.consultor_id <> v_uid AND NOT v_is_admin) THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'data_hora_checkin', v_existing.data_hora_checkin,
      'idempotent', true
    );
  END IF;

  v_reg := public._assert_visita_editavel(p_registro_id);
  PERFORM 1 FROM public.registros_consultor WHERE id = p_registro_id FOR UPDATE;

  IF (p_latitude IS NULL OR p_longitude IS NULL)
     AND (p_justificativa_sem_gps IS NULL OR btrim(p_justificativa_sem_gps) = '') THEN
    RAISE EXCEPTION 'gps_ou_justificativa_obrigatorio' USING ERRCODE = '22023';
  END IF;

  -- Ordenação determinística
  SELECT * INTO v_last_event
    FROM public.visitas_checkin
    WHERE registro_consultor_id = p_registro_id
      AND consultor_id = v_uid
    ORDER BY data_hora_checkin DESC, created_at DESC, id DESC
    LIMIT 1;

  IF v_last_event.id IS NULL THEN
    RAISE EXCEPTION 'checkout_sem_checkin' USING ERRCODE = '22023';
  END IF;
  IF v_last_event.tipo_checkin = 'checkout'::public.tipo_checkin THEN
    RAISE EXCEPTION 'checkout_duplicado' USING ERRCODE = '23505';
  END IF;
  IF v_last_event.data_hora_checkin > now() THEN
    RAISE EXCEPTION 'checkin_no_futuro' USING ERRCODE = '22023';
  END IF;

  v_obs := p_observacoes;
  IF p_captured_at_local IS NOT NULL THEN
    v_obs := COALESCE(v_obs, '') ||
             CASE WHEN v_obs IS NULL OR v_obs = '' THEN '' ELSE E'\n' END ||
             '[captured_at_local=' || p_captured_at_local::text || ']';
  END IF;

  INSERT INTO public.visitas_checkin (
    registro_consultor_id, solicitacao_id, cliente_id, fazenda_id, talhao_id,
    consultor_id, tipo_checkin, latitude, longitude, precisao_gps,
    justificativa_sem_gps, observacoes, foto_path, client_uuid,
    data_hora_checkin, status
  ) VALUES (
    p_registro_id, v_last_event.solicitacao_id, v_last_event.cliente_id,
    v_last_event.fazenda_id, v_last_event.talhao_id,
    v_uid, 'checkout'::public.tipo_checkin, p_latitude, p_longitude, p_precisao,
    NULLIF(btrim(COALESCE(p_justificativa_sem_gps, '')), ''),
    v_obs, p_foto_path, p_client_uuid::text,
    now(), 'realizado'::public.status_checkin
  )
  RETURNING * INTO v_new;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (
    p_registro_id, v_uid, 'checkout_realizado',
    'Checkout via RPC (lat=' || COALESCE(p_latitude::text, 'N/A') ||
    ', lng=' || COALESCE(p_longitude::text, 'N/A') || ')'
  );

  IF v_last_event.solicitacao_id IS NOT NULL THEN
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES (v_last_event.solicitacao_id, 'checkout_realizado',
            COALESCE(p_observacoes, 'Presença encerrada com sucesso'), v_uid);
  END IF;

  RETURN jsonb_build_object(
    'id', v_new.id,
    'data_hora_checkin', v_new.data_hora_checkin,
    'idempotent', false
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.visitas_checkin
      WHERE client_uuid = p_client_uuid::text LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
         OR v_existing.tipo_checkin <> 'checkout'::public.tipo_checkin
         OR (v_existing.consultor_id <> v_uid AND NOT v_is_admin) THEN
        RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
      END IF;
      RETURN jsonb_build_object(
        'id', v_existing.id,
        'data_hora_checkin', v_existing.data_hora_checkin,
        'idempotent', true
      );
    END IF;
    RAISE;
END;
$$;

-- ============================================================
-- 3) Helper de presença: uso interno apenas
-- ============================================================
-- Regra: todos os técnicos com check-in ativo devem registrar checkout.
-- Retorna true somente quando existe ao menos um evento de entrada e cada
-- técnico participante tem checkout como último evento, sem checkout anterior
-- ao check-in correspondente.
CREATE OR REPLACE FUNCTION public.has_completed_visit_presence(p_registro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ultimos AS (
    SELECT DISTINCT ON (consultor_id)
      consultor_id, tipo_checkin, data_hora_checkin
    FROM public.visitas_checkin
    WHERE registro_consultor_id = p_registro_id
    ORDER BY consultor_id, data_hora_checkin DESC, created_at DESC, id DESC
  )
  SELECT
    EXISTS (SELECT 1 FROM ultimos)
    AND NOT EXISTS (SELECT 1 FROM ultimos WHERE tipo_checkin <> 'checkout'::public.tipo_checkin);
$$;

REVOKE ALL ON FUNCTION public.has_completed_visit_presence(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_completed_visit_presence(uuid) TO service_role;
