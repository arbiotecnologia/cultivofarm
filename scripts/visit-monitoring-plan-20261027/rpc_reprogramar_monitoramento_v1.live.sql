CREATE OR REPLACE FUNCTION public.rpc_reprogramar_monitoramento_v1(p_alerta_id uuid, p_nova_data date, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_alerta public.alertas_agronomicos%ROWTYPE;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF v_uid IS NULL OR NOT public.technical_actor_ready(v_uid) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador'::public.app_role)
    OR public.has_role(v_uid, 'gestor'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_alerta_id IS NULL OR p_nova_data IS NULL THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE = '22023';
  END IF;
  IF p_nova_data < v_hoje THEN
    RAISE EXCEPTION 'past_date_not_allowed' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'monitoring_gate_unavailable' USING ERRCODE='55000'; END IF;
  IF NOT public.technical_actor_ready(v_uid) OR NOT (public.has_role(v_uid,'administrador'::public.app_role) OR public.has_role(v_uid,'gestor'::public.app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_alerta
    FROM public.alertas_agronomicos
   WHERE id = p_alerta_id AND platform_private.monitoring_refs_in_actor_tenant(fazenda_id,talhao_id,registro_origem_id)
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'monitoring_alert_not_found' USING ERRCODE = 'PT404';
  END IF;
  IF NOT public.technical_actor_ready(v_uid) OR NOT platform_private.monitoring_refs_in_actor_tenant(v_alerta.fazenda_id,v_alerta.talhao_id,v_alerta.registro_origem_id) THEN
    RAISE EXCEPTION 'monitoring_alert_not_found' USING ERRCODE='PT404';
  END IF;
  IF v_alerta.registro_origem_id IS NOT NULL THEN
    PERFORM 1 FROM public.registros_consultor WHERE id=v_alerta.registro_origem_id
      AND public.can_manage_technical_visit(v_uid,id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'monitoring_alert_not_found' USING ERRCODE='PT404'; END IF;
  END IF;
  IF v_alerta.status IS DISTINCT FROM 'monitoramento'::public.status_alerta THEN
    RAISE EXCEPTION 'monitoring_alert_not_active' USING ERRCODE = 'P0001';
  END IF;
  IF p_expected_updated_at IS NULL OR v_alerta.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'concurrent_update' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.alertas_agronomicos
     SET data_vencimento = p_nova_data,
         nivel_risco = 'medio'::public.nivel_risco,
         updated_at = greatest(clock_timestamp(),v_alerta.updated_at+interval '1 microsecond')
   WHERE id = p_alerta_id AND updated_at=p_expected_updated_at
     AND platform_private.monitoring_refs_in_actor_tenant(fazenda_id,talhao_id,registro_origem_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'concurrent_update' USING ERRCODE='PT409'; END IF;
  IF v_alerta.registro_origem_id IS NOT NULL THEN
    UPDATE public.registros_consultor
       SET data_proxima_visita = p_nova_data,
           version = version + 1,
           updated_at = now()
     WHERE id = v_alerta.registro_origem_id AND public.can_manage_technical_visit(v_uid,id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'source_record_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'alerta_id', p_alerta_id,
    'data_anterior', v_alerta.data_vencimento,
    'nova_data', p_nova_data,
    'registro_origem_id', v_alerta.registro_origem_id
  );
END;
$function$
