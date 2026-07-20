
-- Fase 12.8 · Fase 3 · Correções 3+4: derivar dados relacionais e restaurar integração com solicitação

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
  v_can_manage boolean;
  v_cliente_id uuid;
  v_fazenda_id uuid;
  v_talhao_id uuid;
  v_solicitacao_id uuid;
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
  IF p_registro_id IS NULL THEN
    RAISE EXCEPTION 'registro_obrigatorio' USING ERRCODE = '22023';
  END IF;

  v_can_manage := public.can_manage_technical_visit(v_uid, p_registro_id);

  SELECT * INTO v_existing FROM public.visitas_checkin
    WHERE client_uuid = p_client_uuid::text
    LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
       OR v_existing.tipo_checkin <> p_tipo
       OR (v_existing.consultor_id <> v_uid AND NOT v_can_manage) THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'data_hora_checkin', v_existing.data_hora_checkin,
      'idempotent', true
    );
  END IF;

  v_reg := public._assert_visita_editavel(p_registro_id);
  IF v_reg.consultor_profile_id IS NOT NULL
     AND v_reg.consultor_profile_id <> v_uid
     AND NOT v_can_manage THEN
    RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
  END IF;

  -- Fase 3: dados relacionais derivam SEMPRE da visita
  v_cliente_id     := v_reg.cliente_id;
  v_fazenda_id     := v_reg.fazenda_id;
  v_talhao_id      := v_reg.talhao_id;
  v_solicitacao_id := v_reg.solicitacao_id;

  -- Parâmetros do cliente, quando enviados, devem coincidir; divergência é rejeitada
  IF p_cliente_id IS NOT NULL
     AND v_cliente_id IS NOT NULL
     AND p_cliente_id <> v_cliente_id THEN
    RAISE EXCEPTION 'relacional_divergente_cliente' USING ERRCODE = '22023';
  END IF;
  IF p_fazenda_id IS NOT NULL
     AND v_fazenda_id IS NOT NULL
     AND p_fazenda_id <> v_fazenda_id THEN
    RAISE EXCEPTION 'relacional_divergente_fazenda' USING ERRCODE = '22023';
  END IF;
  IF p_talhao_id IS NOT NULL
     AND v_talhao_id IS NOT NULL
     AND p_talhao_id <> v_talhao_id THEN
    RAISE EXCEPTION 'relacional_divergente_talhao' USING ERRCODE = '22023';
  END IF;
  IF p_solicitacao_id IS NOT NULL
     AND v_solicitacao_id IS NOT NULL
     AND p_solicitacao_id <> v_solicitacao_id THEN
    RAISE EXCEPTION 'relacional_divergente_solicitacao' USING ERRCODE = '22023';
  END IF;

  IF (p_latitude IS NULL OR p_longitude IS NULL)
     AND (p_justificativa_sem_gps IS NULL OR btrim(p_justificativa_sem_gps) = '') THEN
    RAISE EXCEPTION 'gps_ou_justificativa_obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.visitas_checkin
    WHERE registro_consultor_id = p_registro_id
      AND tipo_checkin = p_tipo
      AND status <> 'inconsistente'::public.status_checkin
  ) THEN
    RAISE EXCEPTION 'checkin_duplicado_para_tipo' USING ERRCODE = '22023';
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
    p_registro_id, v_solicitacao_id, v_cliente_id, v_fazenda_id, v_talhao_id,
    v_uid, p_tipo, p_latitude, p_longitude, p_precisao,
    NULLIF(btrim(COALESCE(p_justificativa_sem_gps, '')), ''),
    v_obs, p_foto_path, p_client_uuid::text,
    now(), 'realizado'::public.status_checkin
  )
  RETURNING * INTO v_new;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (
    p_registro_id, v_uid, 'checkin_realizado',
    'Check-in ' || p_tipo::text || ' via RPC (lat=' || COALESCE(p_latitude::text, 'N/A') ||
    ', lng=' || COALESCE(p_longitude::text, 'N/A') || ')'
  );

  -- Fase 4: reincorpora integração segura com portal_solicitacoes/solicitacoes_timeline
  IF v_solicitacao_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes
       SET status = 'checkin_realizado',
           updated_at = now()
     WHERE id = v_solicitacao_id
       AND (cliente_id IS NULL OR v_cliente_id IS NULL OR cliente_id = v_cliente_id);

    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES (v_solicitacao_id, 'checkin_realizado',
            COALESCE(p_observacoes, 'Check-in realizado via visita técnica'), v_uid);
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
         OR (v_existing.consultor_id <> v_uid AND NOT v_can_manage) THEN
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
