-- H9-D-L6 rollback | staging ikaauvsflpmamgxmkhoq
-- Restaura as 4 definicoes vigentes antes de 20261017000000 (estado do ledger 672)
-- e remove o helper introduzido pelo forward.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_realizar_checkin_visita(p_registro_id uuid, p_client_uuid uuid, p_tipo tipo_checkin, p_latitude numeric, p_longitude numeric, p_precisao numeric, p_justificativa_sem_gps text, p_observacoes text, p_captured_at_local timestamp with time zone, p_solicitacao_id uuid, p_cliente_id uuid, p_fazenda_id uuid, p_talhao_id uuid, p_foto_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_existing public.visitas_checkin;
  v_new public.visitas_checkin;
  v_obs text;
  v_can_manage boolean;
  v_is_participant boolean;
  v_cliente_id uuid;
  v_fazenda_id uuid;
  v_talhao_id uuid;
  v_solicitacao_id uuid;
  v_last_checkout timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF p_client_uuid IS NULL THEN RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE = '22023'; END IF;
  IF p_tipo = 'checkout'::public.tipo_checkin THEN RAISE EXCEPTION 'use_rpc_realizar_checkout_visita' USING ERRCODE = '22023'; END IF;
  IF p_registro_id IS NULL THEN RAISE EXCEPTION 'registro_obrigatorio' USING ERRCODE = '22023'; END IF;

  v_can_manage := public.can_manage_technical_visit(v_uid, p_registro_id);
  v_is_participant := public.is_active_visit_participant(v_uid, p_registro_id);

  SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
       OR v_existing.tipo_checkin <> p_tipo
       OR (v_existing.consultor_id <> v_uid AND NOT v_can_manage) THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'data_hora_checkin', v_existing.data_hora_checkin, 'idempotent', true);
  END IF;

  v_reg := public._assert_visita_editavel(p_registro_id);

  IF NOT v_can_manage AND NOT v_is_participant
     AND (v_reg.consultor_profile_id IS NULL OR v_reg.consultor_profile_id <> v_uid) THEN
    RAISE EXCEPTION 'forbidden_visita_nao_atribuido' USING ERRCODE = '42501';
  END IF;

  v_cliente_id := v_reg.cliente_id;
  v_fazenda_id := v_reg.fazenda_id;
  v_talhao_id  := v_reg.talhao_id;
  v_solicitacao_id := v_reg.solicitacao_id;

  IF p_cliente_id IS NOT NULL AND v_cliente_id IS NOT NULL AND p_cliente_id <> v_cliente_id THEN
    RAISE EXCEPTION 'relacional_divergente_cliente' USING ERRCODE = '22023'; END IF;
  IF p_fazenda_id IS NOT NULL AND v_fazenda_id IS NOT NULL AND p_fazenda_id <> v_fazenda_id THEN
    RAISE EXCEPTION 'relacional_divergente_fazenda' USING ERRCODE = '22023'; END IF;
  IF p_talhao_id IS NOT NULL AND v_talhao_id IS NOT NULL AND p_talhao_id <> v_talhao_id THEN
    RAISE EXCEPTION 'relacional_divergente_talhao' USING ERRCODE = '22023'; END IF;
  IF p_solicitacao_id IS NOT NULL AND v_solicitacao_id IS NOT NULL AND p_solicitacao_id <> v_solicitacao_id THEN
    RAISE EXCEPTION 'relacional_divergente_solicitacao' USING ERRCODE = '22023'; END IF;

  IF (p_latitude IS NULL OR p_longitude IS NULL)
     AND (p_justificativa_sem_gps IS NULL OR btrim(p_justificativa_sem_gps) = '') THEN
    RAISE EXCEPTION 'gps_ou_justificativa_obrigatorio' USING ERRCODE = '22023';
  END IF;

  SELECT MAX(data_hora_checkin) INTO v_last_checkout
    FROM public.visitas_checkin
   WHERE registro_consultor_id = p_registro_id
     AND consultor_id = v_uid
     AND tipo_checkin = 'checkout'::public.tipo_checkin;

  IF EXISTS (
    SELECT 1 FROM public.visitas_checkin
     WHERE registro_consultor_id = p_registro_id
       AND consultor_id = v_uid
       AND tipo_checkin = p_tipo
       AND status <> 'inconsistente'::public.status_checkin
       AND data_hora_checkin > COALESCE(v_last_checkout, '-infinity'::timestamptz)
  ) THEN
    RAISE EXCEPTION 'checkin_duplicado_para_tipo_no_ciclo' USING ERRCODE = '22023';
  END IF;

  v_obs := p_observacoes;
  IF p_captured_at_local IS NOT NULL THEN
    v_obs := COALESCE(v_obs,'') ||
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
    NULLIF(btrim(COALESCE(p_justificativa_sem_gps,'')), ''),
    v_obs, p_foto_path, p_client_uuid,
    now(), 'realizado'::public.status_checkin
  ) RETURNING * INTO v_new;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, v_uid, 'checkin_realizado',
          'Check-in ' || p_tipo::text || ' via RPC (lat=' || COALESCE(p_latitude::text,'N/A') ||
          ', lng=' || COALESCE(p_longitude::text,'N/A') || ')');

  IF v_solicitacao_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes SET status='checkin_realizado', updated_at=now()
     WHERE id = v_solicitacao_id
       AND (cliente_id IS NULL OR v_cliente_id IS NULL OR cliente_id = v_cliente_id);
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES (v_solicitacao_id, 'checkin_realizado',
            COALESCE(p_observacoes,'Check-in realizado via visita técnica'), v_uid);
  END IF;

  RETURN jsonb_build_object('id', v_new.id, 'data_hora_checkin', v_new.data_hora_checkin, 'idempotent', false);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
         OR v_existing.tipo_checkin <> p_tipo
         OR (v_existing.consultor_id <> v_uid AND NOT v_can_manage) THEN
        RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
      END IF;
      RETURN jsonb_build_object('id', v_existing.id, 'data_hora_checkin', v_existing.data_hora_checkin, 'idempotent', true);
    END IF;
    RAISE;
END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_realizar_checkout_visita(p_registro_id uuid, p_client_uuid uuid, p_latitude numeric, p_longitude numeric, p_precisao numeric, p_justificativa_sem_gps text, p_observacoes text, p_captured_at_local timestamp with time zone, p_foto_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_existing public.visitas_checkin;
  v_last_event public.visitas_checkin;
  v_new public.visitas_checkin;
  v_obs text;
  v_can_manage boolean;
  v_is_participant boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
  IF p_client_uuid IS NULL THEN RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE='22023'; END IF;
  IF p_registro_id IS NULL THEN RAISE EXCEPTION 'registro_obrigatorio' USING ERRCODE='22023'; END IF;

  v_can_manage := public.can_manage_technical_visit(v_uid, p_registro_id);
  v_is_participant := public.is_active_visit_participant(v_uid, p_registro_id);

  SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid::text LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
       OR v_existing.tipo_checkin <> 'checkout'::public.tipo_checkin
       OR (v_existing.consultor_id <> v_uid AND NOT v_can_manage) THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'data_hora_checkin', v_existing.data_hora_checkin, 'idempotent', true);
  END IF;

  v_reg := public._assert_visita_editavel(p_registro_id);

  IF NOT v_can_manage AND NOT v_is_participant
     AND (v_reg.consultor_profile_id IS NULL OR v_reg.consultor_profile_id <> v_uid) THEN
    RAISE EXCEPTION 'forbidden_visita_nao_atribuido' USING ERRCODE='42501';
  END IF;

  PERFORM 1 FROM public.registros_consultor WHERE id = p_registro_id FOR UPDATE;

  IF (p_latitude IS NULL OR p_longitude IS NULL)
     AND (p_justificativa_sem_gps IS NULL OR btrim(p_justificativa_sem_gps) = '') THEN
    RAISE EXCEPTION 'gps_ou_justificativa_obrigatorio' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_last_event FROM public.visitas_checkin
   WHERE registro_consultor_id = p_registro_id AND consultor_id = v_uid
   ORDER BY data_hora_checkin DESC, created_at DESC, id DESC LIMIT 1;

  IF v_last_event.id IS NULL THEN RAISE EXCEPTION 'checkout_sem_checkin' USING ERRCODE='22023'; END IF;
  IF v_last_event.tipo_checkin = 'checkout'::public.tipo_checkin THEN RAISE EXCEPTION 'checkout_duplicado' USING ERRCODE='22023'; END IF;
  IF v_last_event.data_hora_checkin > now() THEN RAISE EXCEPTION 'checkin_no_futuro' USING ERRCODE='22023'; END IF;

  v_obs := p_observacoes;
  IF p_captured_at_local IS NOT NULL THEN
    v_obs := COALESCE(v_obs,'') ||
             CASE WHEN v_obs IS NULL OR v_obs='' THEN '' ELSE E'\n' END ||
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
    NULLIF(btrim(COALESCE(p_justificativa_sem_gps,'')), ''),
    v_obs, p_foto_path, p_client_uuid::text,
    now(), 'realizado'::public.status_checkin
  ) RETURNING * INTO v_new;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, v_uid, 'checkout_realizado',
          'Checkout via RPC (lat=' || COALESCE(p_latitude::text,'N/A') ||
          ', lng=' || COALESCE(p_longitude::text,'N/A') || ')');

  IF v_last_event.solicitacao_id IS NOT NULL THEN
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES (v_last_event.solicitacao_id, 'checkout_realizado',
            COALESCE(p_observacoes,'Presença encerrada com sucesso'), v_uid);
  END IF;

  RETURN jsonb_build_object('id', v_new.id, 'data_hora_checkin', v_new.data_hora_checkin, 'idempotent', false);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid::text LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
         OR v_existing.tipo_checkin <> 'checkout'::public.tipo_checkin
         OR (v_existing.consultor_id <> v_uid AND NOT v_can_manage) THEN
        RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='22023';
      END IF;
      RETURN jsonb_build_object('id', v_existing.id, 'data_hora_checkin', v_existing.data_hora_checkin, 'idempotent', true);
    END IF;
    RAISE;
END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_diagnostico_visita(p_registro_id uuid, p_client_uuid uuid, p_payload jsonb, p_expected_versao integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.visita_diagnosticos;
  v_new public.visita_diagnosticos;
  v_registro_version integer;
BEGIN
  PERFORM public._assert_visita_editavel(p_registro_id);
  IF NOT public.can_manage_technical_visit(v_uid, p_registro_id)
     AND NOT public.is_active_visit_participant(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
  END IF;
  IF p_client_uuid IS NULL THEN
    RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE = '22004';
  END IF;

  SELECT * INTO v_existing
    FROM public.visita_diagnosticos
   WHERE registro_id = p_registro_id
     AND client_uuid = p_client_uuid
   FOR UPDATE;

  IF v_existing.id IS NOT NULL
     AND COALESCE(p_expected_versao, -1) < v_existing.versao THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0001';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.visita_diagnosticos (
      registro_id, client_uuid, categoria, problema, descricao, severidade,
      incidencia, urgencia, risco, intervencao, localizacao, versao, created_by
    ) VALUES (
      p_registro_id, p_client_uuid,
      NULLIF(COALESCE(p_payload->>'categoria', p_payload->>'categoria_problema'),''), NULLIF(COALESCE(p_payload->>'problema', p_payload->>'problema_principal'),''),
      NULLIF(COALESCE(p_payload->>'descricao', p_payload->>'observacoes_tecnicas'),''), NULLIF(COALESCE(p_payload->>'severidade', p_payload->>'nivel_pressao'),''),
      NULLIF(COALESCE(p_payload->>'incidencia', p_payload->>'percentual_area_afetada'),'')::numeric,
      NULLIF(p_payload->>'urgencia',''), NULLIF(p_payload->>'risco',''),
      NULLIF(p_payload->>'intervencao',''), NULLIF(p_payload->>'localizacao',''),
      GREATEST(1, COALESCE(p_expected_versao, 1)), v_uid
    ) RETURNING * INTO v_new;
  ELSE
    UPDATE public.visita_diagnosticos SET
      categoria = NULLIF(COALESCE(p_payload->>'categoria', p_payload->>'categoria_problema'),''),
      problema = NULLIF(COALESCE(p_payload->>'problema', p_payload->>'problema_principal'),''),
      descricao = NULLIF(COALESCE(p_payload->>'descricao', p_payload->>'observacoes_tecnicas'),''),
      severidade = NULLIF(COALESCE(p_payload->>'severidade', p_payload->>'nivel_pressao'),''),
      incidencia = NULLIF(COALESCE(p_payload->>'incidencia', p_payload->>'percentual_area_afetada'),'')::numeric,
      urgencia = NULLIF(p_payload->>'urgencia',''),
      risco = NULLIF(p_payload->>'risco',''),
      intervencao = NULLIF(p_payload->>'intervencao',''),
      localizacao = NULLIF(p_payload->>'localizacao',''),
      versao = v_existing.versao + 1,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_new;
  END IF;

  UPDATE public.registros_consultor
     SET problema_principal = COALESCE(NULLIF(COALESCE(p_payload->>'problema_principal', p_payload->>'problema'),''), problema_principal),
         categoria_problema = COALESCE(NULLIF(COALESCE(p_payload->>'categoria_problema', p_payload->>'categoria'),'')::public.categoria_problema_consultor, categoria_problema),
         nivel_pressao = COALESCE(NULLIF(COALESCE(p_payload->>'nivel_pressao', p_payload->>'severidade'),'')::public.nivel_pressao, nivel_pressao),
         percentual_area_afetada = COALESCE(NULLIF(COALESCE(p_payload->>'percentual_area_afetada', p_payload->>'incidencia'),'')::numeric, percentual_area_afetada),
         observacoes_tecnicas = COALESCE(NULLIF(COALESCE(p_payload->>'observacoes_tecnicas', p_payload->>'descricao'),''), observacoes_tecnicas),
         urgencia = COALESCE(NULLIF(p_payload->>'urgencia','')::public.urgencia_consultor, urgencia),
         version = COALESCE(version,1) + 1,
         updated_at = now()
   WHERE id = p_registro_id
   RETURNING version INTO v_registro_version;

  RETURN jsonb_build_object(
    'id', v_new.id,
    'versao', v_new.versao,
    'registro_version', v_registro_version,
    'client_uuid', v_new.client_uuid
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_salvar_campo_visita(p_registro_consultor_id uuid, p_client_uuid uuid, p_payload jsonb, p_versao integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_registro public.registros_consultor;
  v_existing public.visitas_campo;
  v_result public.visitas_campo;
  v_is_admin boolean;
  v_has_scope boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_registro FROM public.registros_consultor WHERE id = p_registro_consultor_id;
  IF v_registro.id IS NULL THEN
    RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);
  v_has_scope := v_registro.cliente_id IS NOT NULL
    AND public.has_active_user_cliente_access(v_uid, v_registro.cliente_id, ARRAY['execute','manage']);

  IF NOT (v_is_admin OR v_registro.created_by = v_uid OR v_has_scope) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_technical_visit_editable_status(v_registro.status::text) THEN
    RAISE EXCEPTION 'visita_locked' USING ERRCODE = '42501';
  END IF;

  IF v_registro.cliente_id IS NULL THEN
    RAISE EXCEPTION 'registro_sem_cliente' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing FROM public.visitas_campo WHERE registro_consultor_id = p_registro_consultor_id;

  IF v_existing.id IS NOT NULL AND COALESCE(p_versao, 0) < v_existing.versao THEN
    RAISE EXCEPTION 'stale_version' USING ERRCODE = '40001';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.visitas_campo (
      registro_consultor_id, cliente_id, talhao_id, cultura_id,
      area_avaliada_ha, fase_fenologica, estande_plantas_ha, uniformidade,
      observacoes_campo, dados_extras, client_uuid, versao, created_by
    ) VALUES (
      p_registro_consultor_id,
      v_registro.cliente_id,
      NULLIF((p_payload->>'talhao_id'),'')::uuid,
      NULLIF((p_payload->>'cultura_id'),'')::uuid,
      NULLIF((p_payload->>'area_avaliada_ha'),'')::numeric,
      NULLIF(p_payload->>'fase_fenologica',''),
      NULLIF((p_payload->>'estande_plantas_ha'),'')::numeric,
      NULLIF(p_payload->>'uniformidade',''),
      NULLIF(p_payload->>'observacoes_campo',''),
      COALESCE(p_payload->'dados_extras', '{}'::jsonb),
      p_client_uuid,
      1,
      v_uid
    ) RETURNING * INTO v_result;
  ELSE
    UPDATE public.visitas_campo SET
      talhao_id = NULLIF((p_payload->>'talhao_id'),'')::uuid,
      cultura_id = NULLIF((p_payload->>'cultura_id'),'')::uuid,
      area_avaliada_ha = NULLIF((p_payload->>'area_avaliada_ha'),'')::numeric,
      fase_fenologica = NULLIF(p_payload->>'fase_fenologica',''),
      estande_plantas_ha = NULLIF((p_payload->>'estande_plantas_ha'),'')::numeric,
      uniformidade = NULLIF(p_payload->>'uniformidade',''),
      observacoes_campo = NULLIF(p_payload->>'observacoes_campo',''),
      dados_extras = COALESCE(p_payload->'dados_extras', '{}'::jsonb),
      versao = v_existing.versao + 1,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_result;
  END IF;

  RETURN jsonb_build_object(
    'id', v_result.id,
    'versao', v_result.versao,
    'client_uuid', v_result.client_uuid
  );
END;
$function$;

DROP FUNCTION IF EXISTS public._visita_scope_ok(uuid,uuid);
COMMIT;
