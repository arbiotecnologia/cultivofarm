-- Fase 12.8 · Fase 2 — Check-in server-side seguro

-- Idempotência por client_uuid (partial: ignora NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS visitas_checkin_client_uuid_uq
  ON public.visitas_checkin (client_uuid)
  WHERE client_uuid IS NOT NULL;

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_client_uuid IS NULL THEN
    RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE = '22023';
  END IF;

  -- Idempotência: se já existe check-in com este client_uuid, retorna-o.
  SELECT * INTO v_existing FROM public.visitas_checkin
    WHERE client_uuid = p_client_uuid::text
    LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'data_hora_checkin', v_existing.data_hora_checkin,
      'idempotent', true
    );
  END IF;

  -- Validação permissão + status editável da visita
  IF p_registro_id IS NOT NULL THEN
    v_reg := public._assert_visita_editavel(p_registro_id);
  END IF;

  -- GPS ou justificativa
  IF (p_latitude IS NULL OR p_longitude IS NULL)
     AND (p_justificativa_sem_gps IS NULL OR btrim(p_justificativa_sem_gps) = '') THEN
    RAISE EXCEPTION 'gps_ou_justificativa_obrigatorio' USING ERRCODE = '22023';
  END IF;

  -- Impedir check-in ativo duplicado do mesmo tipo para a mesma visita
  IF p_registro_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.visitas_checkin
      WHERE registro_consultor_id = p_registro_id
        AND tipo_checkin = p_tipo
        AND status <> 'inconsistente'::status_checkin
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
    now(), 'realizado'::status_checkin
  )
  RETURNING * INTO v_new;

  -- Log técnico
  IF p_registro_id IS NOT NULL THEN
    INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
    VALUES (
      p_registro_id, v_uid, 'checkin_realizado',
      'Check-in ' || p_tipo::text ||
      ' via RPC (lat=' || COALESCE(p_latitude::text, 'N/A') ||
      ', lng=' || COALESCE(p_longitude::text, 'N/A') || ')'
    );
  END IF;

  -- Timeline da solicitação
  IF p_solicitacao_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes
      SET status = 'checkin_realizado'
      WHERE id = p_solicitacao_id;
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES (p_solicitacao_id, 'checkin_realizado',
            COALESCE(p_observacoes, 'Check-in realizado com sucesso'), v_uid);
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
      RETURN jsonb_build_object(
        'id', v_existing.id,
        'data_hora_checkin', v_existing.data_hora_checkin,
        'idempotent', true
      );
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_realizar_checkin_visita(
  uuid, uuid, public.tipo_checkin, numeric, numeric, numeric, text, text,
  timestamptz, uuid, uuid, uuid, uuid, text
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_realizar_checkin_visita(
  uuid, uuid, public.tipo_checkin, numeric, numeric, numeric, text, text,
  timestamptz, uuid, uuid, uuid, uuid, text
) TO authenticated, service_role;