
-- =========================================================
-- start_technical_visit_secure
-- =========================================================
CREATE OR REPLACE FUNCTION public.start_technical_visit_secure(
  p_registro_id uuid,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_precisao_gps numeric DEFAULT NULL,
  p_foto_url text DEFAULT NULL,
  p_foto_path text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_justificativa_sem_gps text DEFAULT NULL,
  p_client_uuid uuid DEFAULT NULL
)
RETURNS TABLE(checkin_id uuid, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_reg record;
  v_existing uuid;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Idempotência por client_uuid
  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN QUERY SELECT v_existing, false;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'registro_not_found' USING ERRCODE = '22023';
  END IF;

  SELECT public.has_role(v_uid, 'administrador'::app_role) INTO v_is_admin;

  -- Só técnico da visita ou admin
  IF NOT v_is_admin AND v_reg.consultor_responsavel IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_visit_owner' USING ERRCODE = '42501';
  END IF;

  -- Status permitido
  IF v_reg.status NOT IN ('rascunho') THEN
    RAISE EXCEPTION 'invalid_status_for_start:%', v_reg.status USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.visitas_checkin(
    registro_consultor_id, solicitacao_id, consultor_id,
    cliente_id, fazenda_id, talhao_id,
    latitude, longitude, precisao_gps,
    foto_url, foto_path, observacoes,
    justificativa_sem_gps, tipo_checkin, status, client_uuid
  ) VALUES (
    v_reg.id, v_reg.solicitacao_id, v_uid,
    v_reg.cliente_id, v_reg.fazenda_id, v_reg.talhao_id,
    p_latitude, p_longitude, p_precisao_gps,
    p_foto_url, p_foto_path, p_observacoes,
    p_justificativa_sem_gps, 'chegada_fazenda', 'realizado', p_client_uuid
  )
  RETURNING id INTO v_new_id;

  UPDATE public.registros_consultor
     SET status = 'em_andamento',
         hora_inicio = COALESCE(hora_inicio, now()),
         updated_at = now()
   WHERE id = v_reg.id;

  INSERT INTO public.visitas_logs(registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata)
  VALUES (v_reg.id, v_reg.solicitacao_id, 'checkin', 'Check-in de visita técnica', v_uid,
          jsonb_build_object('checkin_id', v_new_id, 'admin_bypass', v_is_admin));

  RETURN QUERY SELECT v_new_id, true;
END;
$$;

REVOKE ALL ON FUNCTION public.start_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,text,uuid) TO authenticated, service_role;


-- =========================================================
-- finish_technical_visit_secure
-- =========================================================
CREATE OR REPLACE FUNCTION public.finish_technical_visit_secure(
  p_registro_id uuid,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_precisao_gps numeric DEFAULT NULL,
  p_foto_url text DEFAULT NULL,
  p_foto_path text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_client_uuid uuid DEFAULT NULL
)
RETURNS TABLE(registro_id uuid, checkout_id uuid, finalized_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_reg record;
  v_diag_count int;
  v_new_checkout uuid;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'registro_not_found' USING ERRCODE = '22023';
  END IF;

  SELECT public.has_role(v_uid, 'administrador'::app_role) INTO v_is_admin;

  IF NOT v_is_admin AND v_reg.consultor_responsavel IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_visit_owner' USING ERRCODE = '42501';
  END IF;

  IF v_reg.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'visit_not_in_progress:%', v_reg.status USING ERRCODE = '22023';
  END IF;

  -- Exige ao menos um diagnóstico
  SELECT count(*) INTO v_diag_count
    FROM public.visita_diagnosticos WHERE registro_id = v_reg.id;
  IF v_diag_count = 0 THEN
    RAISE EXCEPTION 'diagnostico_required' USING ERRCODE = '22023';
  END IF;

  -- Check-out
  INSERT INTO public.visitas_checkin(
    registro_consultor_id, solicitacao_id, consultor_id,
    cliente_id, fazenda_id, talhao_id,
    latitude, longitude, precisao_gps,
    foto_url, foto_path, observacoes,
    tipo_checkin, status, client_uuid
  ) VALUES (
    v_reg.id, v_reg.solicitacao_id, v_uid,
    v_reg.cliente_id, v_reg.fazenda_id, v_reg.talhao_id,
    p_latitude, p_longitude, p_precisao_gps,
    p_foto_url, p_foto_path, p_observacoes,
    'inicio_visita', 'realizado', p_client_uuid
  )
  RETURNING id INTO v_new_checkout;

  UPDATE public.registros_consultor
     SET status = 'finalizado',
         hora_fim = v_now,
         finalized_at = v_now,
         finalized_by = v_uid,
         updated_at = v_now
   WHERE id = v_reg.id;

  INSERT INTO public.visitas_logs(registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata)
  VALUES (v_reg.id, v_reg.solicitacao_id, 'checkout', 'Check-out e finalização da visita', v_uid,
          jsonb_build_object('checkout_id', v_new_checkout, 'admin_bypass', v_is_admin));

  RETURN QUERY SELECT v_reg.id, v_new_checkout, v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid) TO authenticated, service_role;
