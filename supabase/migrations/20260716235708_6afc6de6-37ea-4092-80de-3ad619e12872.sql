-- Fase 3: finalização atômica
CREATE OR REPLACE FUNCTION public.rpc_finalizar_visita_v2(
  p_registro_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_is_admin boolean;
  v_has_scope boolean;
  v_diag_count int;
  v_checkin_count int;
  v_new_version integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);
  v_has_scope := v_reg.cliente_id IS NOT NULL
    AND public.has_active_user_cliente_access(v_uid, v_reg.cliente_id, ARRAY['execute','manage']);

  IF NOT (v_is_admin OR v_reg.created_by = v_uid OR v_reg.consultor_responsavel = v_uid OR v_has_scope) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_technical_visit_editable_status(v_reg.status::text) THEN
    RAISE EXCEPTION 'visita_nao_editavel' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_expected_version, -1) <> v_reg.version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = '40001';
  END IF;

  SELECT count(*) INTO v_diag_count FROM public.visita_diagnosticos WHERE registro_id = p_registro_id;
  IF v_diag_count = 0 THEN
    RAISE EXCEPTION 'diagnostico_obrigatorio' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_checkin_count FROM public.visitas_checkin
    WHERE registro_consultor_id = p_registro_id;
  IF v_checkin_count = 0 THEN
    RAISE EXCEPTION 'checkin_obrigatorio' USING ERRCODE = '23514';
  END IF;

  v_new_version := v_reg.version + 1;

  UPDATE public.registros_consultor
     SET status = 'finalizado'::status_registro_consultor,
         finalized_at = now(),
         finalized_by = v_uid,
         version = v_new_version,
         pdf_status = COALESCE(pdf_status, 'pending'),
         updated_at = now()
   WHERE id = p_registro_id;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
    VALUES (p_registro_id, v_uid, 'visita_finalizada', 'Visita finalizada via rpc_finalizar_visita_v2');

  RETURN jsonb_build_object(
    'id', p_registro_id,
    'status', 'finalizado',
    'version', v_new_version,
    'finalized_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_finalizar_visita_v2(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_finalizar_visita_v2(uuid, integer) TO authenticated, service_role;


-- Fase 4: envio para aprovação seguro
CREATE OR REPLACE FUNCTION public.rpc_enviar_visita_aprovacao(
  p_registro_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_is_admin boolean;
  v_has_scope boolean;
  v_new_version integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id FOR UPDATE;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);
  v_has_scope := v_reg.cliente_id IS NOT NULL
    AND public.has_active_user_cliente_access(v_uid, v_reg.cliente_id, ARRAY['execute','manage']);

  IF NOT (v_is_admin OR v_reg.created_by = v_uid OR v_reg.consultor_responsavel = v_uid OR v_has_scope) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF v_reg.status::text <> 'finalizado' THEN
    RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_expected_version, -1) <> v_reg.version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = '40001';
  END IF;

  v_new_version := v_reg.version + 1;

  UPDATE public.registros_consultor
     SET status = 'enviado_aprovacao'::status_registro_consultor,
         version = v_new_version,
         updated_at = now()
   WHERE id = p_registro_id;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
    VALUES (p_registro_id, v_uid, 'enviado_aprovacao', 'Visita enviada para aprovação via rpc_enviar_visita_aprovacao');

  RETURN jsonb_build_object(
    'id', p_registro_id,
    'status', 'enviado_aprovacao',
    'version', v_new_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_enviar_visita_aprovacao(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_enviar_visita_aprovacao(uuid, integer) TO authenticated, service_role;