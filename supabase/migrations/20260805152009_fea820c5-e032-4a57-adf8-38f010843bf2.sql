-- ============================================================================
-- CONSOLIDAÇÃO FINAL — VISITA TÉCNICA
-- Sincroniza no repositório o estado certificado em staging (run d5d7582f,
-- 18/18 PASS). Idempotente (CREATE OR REPLACE), sem DROP, sem DDL destrutivo.
-- Rollback lógico: restoration/visita-portais-tecnicos/rollback.sql
-- Guard: aborta se o ambiente for o ref de produção.
-- ============================================================================

DO $guard$
DECLARE v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NOT NULL THEN
    SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
    IF v_ref = 'navfzbwgwzruipouyfnk' THEN
      RAISE EXCEPTION 'GUARD_ABORT: ambiente de producao nao autorizado';
    END IF;
  END IF;
END
$guard$;

-- 2) Acesso a clientes: bypass global apenas para administrador.
CREATE OR REPLACE FUNCTION public.has_active_user_cliente_access(_user_id uuid, _cliente_id uuid, _levels text[] DEFAULT ARRAY['read'::text, 'execute'::text, 'manage'::text])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _cliente_id IS NULL THEN
    RETURN false;
  END IF;
  IF public.has_role(_user_id, 'administrador'::public.app_role) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM public.user_clientes uc
     WHERE uc.user_id = _user_id
       AND uc.cliente_id = _cliente_id
       AND uc.is_active = true
       AND (uc.valid_from IS NULL OR uc.valid_from <= now())
       AND (uc.valid_until IS NULL OR uc.valid_until >= now())
       AND uc.access_level::text = ANY(_levels)
  );
END
$function$;

-- 3) Predicados de participação/responsabilidade/escopo.
CREATE OR REPLACE FUNCTION public.is_active_visit_participant(p_user_id uuid, p_registro_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.technical_visit_assignments
    WHERE registro_consultor_id = p_registro_id
      AND user_id = p_user_id
      AND is_active = true
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_visit_org_manager(p_user_id uuid, p_registro_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id AND o.ativo = true
    WHERE p.user_id = p_user_id
      AND p.ativo = true
      AND p.organization_id IS NOT NULL
      AND p.organization_id = public.get_visit_organization_id(p_registro_id)
      AND public.has_role(p_user_id, 'gestor')
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_visit_responsible(p_user_id uuid, p_registro_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.registros_consultor r
     WHERE r.id = p_registro_id
       AND (
         r.consultor_responsavel = p_user_id
         OR r.created_by = p_user_id
         OR r.consultor_profile_id IN (
              SELECT pr.id FROM public.profiles pr WHERE pr.user_id = p_user_id
            )
       )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_technical_visit(p_user_id uuid, p_registro_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(p_user_id, 'administrador')
    OR public.is_visit_responsible(p_user_id, p_registro_id)
    OR public.is_active_visit_participant(p_user_id, p_registro_id)
    OR public.is_visit_org_manager(p_user_id, p_registro_id)
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_technical_visit(p_user_id uuid, p_registro_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(p_user_id, 'administrador')
    OR public.is_visit_responsible(p_user_id, p_registro_id)
    OR public.is_visit_org_manager(p_user_id, p_registro_id)
$function$;

CREATE OR REPLACE FUNCTION public.can_checkin_technical_visit(p_user_id uuid, p_registro_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(p_user_id, 'administrador'::public.app_role)
    OR public.is_active_visit_participant(p_user_id, p_registro_id)
    OR EXISTS (
      SELECT 1 FROM public.registros_consultor r
      WHERE r.id = p_registro_id
        AND (r.consultor_profile_id = p_user_id OR r.created_by = p_user_id)
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_checkout_technical_visit(p_user_id uuid, p_registro_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Somente encerra o próprio ciclo se já tem entrada ativa
  SELECT EXISTS (
    SELECT 1 FROM public.visitas_checkin c
    WHERE c.registro_consultor_id = p_registro_id
      AND c.consultor_id = p_user_id
      AND c.tipo_checkin <> 'checkout'::public.tipo_checkin
      AND NOT EXISTS (
        SELECT 1 FROM public.visitas_checkin c2
        WHERE c2.registro_consultor_id = c.registro_consultor_id
          AND c2.consultor_id = c.consultor_id
          AND c2.tipo_checkin = 'checkout'::public.tipo_checkin
          AND c2.data_hora_checkin > c.data_hora_checkin
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public._assert_visita_editavel(p_registro_id uuid)
 RETURNS registros_consultor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_is_admin boolean;
  v_has_scope boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id;
  IF v_reg.id IS NULL THEN RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002'; END IF;
  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);
  v_has_scope := v_reg.cliente_id IS NOT NULL
    AND public.has_active_user_cliente_access(v_uid, v_reg.cliente_id, ARRAY['execute','manage']);
  IF NOT (v_is_admin OR v_reg.created_by = v_uid OR v_reg.consultor_responsavel = v_uid OR v_has_scope) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_technical_visit_editable_status(v_reg.status::text) THEN
    RAISE EXCEPTION 'visita_nao_editavel' USING ERRCODE = '42501';
  END IF;
  RETURN v_reg;
END;
$function$;

CREATE OR REPLACE FUNCTION public._visita_lock_and_check(p_registro_id uuid, p_expected_version integer, p_require_approver boolean DEFAULT false)
 RETURNS registros_consultor
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor%ROWTYPE;
  v_scoped_gestor boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_reg
    FROM public.registros_consultor
   WHERE id = p_registro_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registro_inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF v_reg.cliente_id IS NOT NULL AND public.has_role(v_uid, 'gestor'::public.app_role) THEN
    v_scoped_gestor := public.has_active_user_cliente_access(
      v_uid, v_reg.cliente_id, ARRAY['manage']::text[]
    );
  END IF;

  IF p_require_approver THEN
    IF NOT (
      public.has_role(v_uid, 'administrador'::public.app_role)
      OR public.is_visit_org_manager(v_uid, p_registro_id)
      OR v_scoped_gestor
    ) THEN
      RAISE EXCEPTION 'forbidden_aprovacao' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.can_manage_technical_visit(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
  END IF;

  IF p_expected_version IS NOT NULL
     AND COALESCE(v_reg.version, 1) <> p_expected_version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_reg;
END
$function$;

-- 4) Check-in: UUID tipado e indexável, sem coerção uuid = text.
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

-- 5) Diagnóstico: autorização antes da escrita + sincronização na visita.
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

-- 6) Recomendação: btrim apenas em estrategia_manejo::text na leitura de aprovação.
CREATE OR REPLACE FUNCTION public.rpc_upsert_recomendacao_visita(p_registro_id uuid, p_client_uuid uuid, p_payload jsonb, p_expected_versao integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.registros_consultor_recomendacoes;
  v_new public.registros_consultor_recomendacoes;
BEGIN
  PERFORM public._assert_visita_editavel(p_registro_id);
  IF p_client_uuid IS NULL THEN RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE = '22004'; END IF;

  SELECT * INTO v_existing FROM public.registros_consultor_recomendacoes
    WHERE registro_consultor_id = p_registro_id AND client_uuid = p_client_uuid;

  IF v_existing.id IS NOT NULL AND COALESCE(p_expected_versao, -1) < v_existing.versao THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = '40001';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.registros_consultor_recomendacoes (
      registro_consultor_id, client_uuid, recomendacao_tecnica,
      objetivo_recomendacao, estrategia_manejo,
      microrganismo_id, produto_biologico_sugerido_id,
      dose_recomendada_valor, dose_recomendada_unidade,
      volume_calda, volume_total_recomendado,
      numero_aplicacoes, intervalo_aplicacoes,
      modo_aplicacao, momento_aplicacao,
      cuidados_operacionais, compatibilidade_observacoes,
      observacoes_finais, encaminhar_para_os,
      versao, created_by
    ) VALUES (
      p_registro_id, p_client_uuid,
      NULLIF(p_payload->>'recomendacao_tecnica',''),
      NULLIF(p_payload->>'objetivo_recomendacao','')::objetivo_recomendacao,
      NULLIF(p_payload->>'estrategia_manejo','')::estrategia_manejo,
      NULLIF((p_payload->>'microrganismo_id'),'')::uuid,
      NULLIF((p_payload->>'produto_biologico_sugerido_id'),'')::uuid,
      NULLIF((p_payload->>'dose_recomendada_valor'),'')::numeric,
      NULLIF(p_payload->>'dose_recomendada_unidade',''),
      NULLIF(p_payload->>'volume_calda',''),
      NULLIF((p_payload->>'volume_total_recomendado'),'')::numeric,
      NULLIF((p_payload->>'numero_aplicacoes'),'')::integer,
      NULLIF(p_payload->>'intervalo_aplicacoes',''),
      NULLIF(p_payload->>'modo_aplicacao','')::modo_aplicacao_consultor,
      NULLIF(p_payload->>'momento_aplicacao',''),
      NULLIF(p_payload->>'cuidados_operacionais',''),
      NULLIF(p_payload->>'compatibilidade_observacoes',''),
      NULLIF(p_payload->>'observacoes_finais',''),
      COALESCE((p_payload->>'encaminhar_para_os')::boolean, false),
      GREATEST(1, COALESCE(p_expected_versao, 1)),
      v_uid
    ) RETURNING * INTO v_new;
  ELSE
    UPDATE public.registros_consultor_recomendacoes SET
      recomendacao_tecnica = NULLIF(p_payload->>'recomendacao_tecnica',''),
      objetivo_recomendacao = NULLIF(p_payload->>'objetivo_recomendacao','')::objetivo_recomendacao,
      estrategia_manejo = NULLIF(p_payload->>'estrategia_manejo','')::estrategia_manejo,
      microrganismo_id = NULLIF((p_payload->>'microrganismo_id'),'')::uuid,
      produto_biologico_sugerido_id = NULLIF((p_payload->>'produto_biologico_sugerido_id'),'')::uuid,
      dose_recomendada_valor = NULLIF((p_payload->>'dose_recomendada_valor'),'')::numeric,
      dose_recomendada_unidade = NULLIF(p_payload->>'dose_recomendada_unidade',''),
      volume_calda = NULLIF(p_payload->>'volume_calda',''),
      volume_total_recomendado = NULLIF((p_payload->>'volume_total_recomendado'),'')::numeric,
      numero_aplicacoes = NULLIF((p_payload->>'numero_aplicacoes'),'')::integer,
      intervalo_aplicacoes = NULLIF(p_payload->>'intervalo_aplicacoes',''),
      modo_aplicacao = NULLIF(p_payload->>'modo_aplicacao','')::modo_aplicacao_consultor,
      momento_aplicacao = NULLIF(p_payload->>'momento_aplicacao',''),
      cuidados_operacionais = NULLIF(p_payload->>'cuidados_operacionais',''),
      compatibilidade_observacoes = NULLIF(p_payload->>'compatibilidade_observacoes',''),
      observacoes_finais = NULLIF(p_payload->>'observacoes_finais',''),
      encaminhar_para_os = COALESCE((p_payload->>'encaminhar_para_os')::boolean, encaminhar_para_os),
      versao = v_existing.versao + 1,
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING * INTO v_new;
  END IF;

  RETURN jsonb_build_object('id', v_new.id, 'versao', v_new.versao, 'client_uuid', v_new.client_uuid);
END;
$function$;

-- 7) Finalização: cultura + check-in + diagnóstico obrigatórios; sem escrita parcial.
CREATE OR REPLACE FUNCTION public.rpc_finalizar_visita_v2(p_registro_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_is_admin boolean;
  v_has_scope boolean;
  v_diag_count integer;
  v_checkin_count integer;
  v_new_version integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reg
    FROM public.registros_consultor
   WHERE id = p_registro_id
   FOR UPDATE;

  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'registro_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);
  v_has_scope := public.has_role(v_uid, 'gestor'::public.app_role) AND v_reg.cliente_id IS NOT NULL AND public.has_active_user_cliente_access(v_uid, v_reg.cliente_id, ARRAY['execute','manage']);

  IF NOT (
    v_is_admin
    OR v_reg.created_by = v_uid
    OR v_reg.consultor_responsavel = v_uid
    OR v_has_scope
  ) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_technical_visit_editable_status(v_reg.status::text) THEN
    RAISE EXCEPTION 'visita_nao_editavel' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_expected_version, -1) <> v_reg.version THEN
    RAISE EXCEPTION 'version_conflict' USING ERRCODE = 'P0001';
  END IF;

  IF v_reg.cultura_id IS NULL THEN
    RAISE EXCEPTION 'cultura_obrigatoria' USING ERRCODE = '23514', DETAIL = 'invalid_request';
  END IF;

  SELECT count(*) INTO v_diag_count
    FROM public.visita_diagnosticos
   WHERE registro_id = p_registro_id;
  IF v_diag_count = 0 THEN
    RAISE EXCEPTION 'diagnostico_obrigatorio' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_checkin_count
    FROM public.visitas_checkin
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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_enviar_visita_aprovacao(p_registro_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- 8) Aprovação: somente em enviado_aprovacao, por administrador ou gestor com escopo.
CREATE OR REPLACE FUNCTION public.rpc_liberar_recomendacao_produtor(p_registro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_registro public.registros_consultor;
  v_rec_count integer;
  v_solic_id uuid;
  v_can_approve boolean;
  v_new_version integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT * INTO v_registro
    FROM public.registros_consultor
   WHERE id = p_registro_id
   FOR UPDATE;

  IF v_registro.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Visita técnica não encontrada.');
  END IF;

  v_can_approve :=
    public.has_role(v_user_id, 'administrador'::public.app_role)
    OR (
      public.has_role(v_user_id, 'gestor'::public.app_role)
      AND v_registro.cliente_id IS NOT NULL
      AND public.has_active_user_cliente_access(
        v_user_id, v_registro.cliente_id, ARRAY['manage']
      )
    );

  IF NOT v_can_approve THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão para aprovar esta recomendação.');
  END IF;

  IF v_registro.status::text <> 'enviado_aprovacao' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Visita em status ' || v_registro.status::text || ' não pode ser aprovada.'
    );
  END IF;

  SELECT count(*) INTO v_rec_count
    FROM public.registros_consultor_recomendacoes
   WHERE registro_consultor_id = p_registro_id
     AND (
       coalesce(btrim(recomendacao_tecnica), '') <> ''
       OR coalesce(btrim(observacoes_finais), '') <> ''
       OR coalesce(btrim(estrategia_manejo::text), '') <> ''
     );

  IF v_rec_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não existe recomendação técnica preenchida para esta visita.');
  END IF;

  v_solic_id := v_registro.solicitacao_id;
  v_new_version := COALESCE(v_registro.version, 1) + 1;

  UPDATE public.registros_consultor
     SET status = 'aprovado'::public.status_registro_consultor,
         version = v_new_version,
         updated_at = now()
   WHERE id = p_registro_id;

  IF v_solic_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes
       SET status = 'aguardando_decisao_produtor', updated_at = now()
     WHERE id = v_solic_id;

    INSERT INTO public.solicitacoes_timeline
      (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES
      (v_solic_id, 'recomendacao_liberada', 'Recomendação técnica liberada para decisão do produtor.', v_user_id);
  END IF;

  INSERT INTO public.registros_consultor_status_log
    (registro_consultor_id, status_anterior, status_novo, motivo, changed_by, changed_at)
  VALUES
    (p_registro_id, v_registro.status::text, 'aprovado', 'Liberação da recomendação ao produtor', v_user_id, now());

  INSERT INTO public.visitas_logs
    (registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata)
  VALUES
    (p_registro_id, v_solic_id, 'recomendacao_liberada',
     'Recomendação técnica liberada ao produtor.', v_user_id,
     jsonb_build_object('status_anterior', v_registro.status::text,
                        'status_novo', 'aprovado',
                        'version', v_new_version));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Recomendação liberada ao produtor com sucesso.',
    'registro_id', p_registro_id,
    'solicitacao_id', v_solic_id,
    'status_anterior', v_registro.status::text,
    'status_novo', 'aprovado',
    'version', v_new_version
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', 'Erro ao liberar recomendação: ' || SQLERRM);
END;
$function$;

-- 9) Reprovação e pedido de ajuste com escopo, versão e logs.
CREATE OR REPLACE FUNCTION public.rpc_reprovar_visita(p_registro_id uuid, p_expected_version integer, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg public.registros_consultor%ROWTYPE;
  v_new_version integer;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'P0001';
  END IF;
  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, true);
  IF v_reg.status::text <> 'enviado_aprovacao' THEN
    RAISE EXCEPTION 'status_invalido' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.registros_consultor
     SET status = 'reprovado', version = COALESCE(version,1)+1, updated_at = now()
   WHERE id = p_registro_id
  RETURNING version INTO v_new_version;
  INSERT INTO public.aprovacoes_tecnicas
    (registro_consultor_id, status_aprovacao, comentario_gestor, aprovado_por, data_aprovacao)
  VALUES (p_registro_id, 'reprovado', p_motivo, auth.uid(), now());
  INSERT INTO public.registros_consultor_status_log
    (registro_consultor_id, status_anterior, status_novo, motivo, changed_by, changed_at)
  VALUES (p_registro_id, v_reg.status::text, 'reprovado', p_motivo, auth.uid(), now());
  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, auth.uid(), 'recomendacao_reprovada', 'Visita reprovada. Motivo: ' || p_motivo);
  RETURN jsonb_build_object('ok', true, 'version', v_new_version, 'status', 'reprovado');
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_solicitar_ajuste_visita(p_registro_id uuid, p_expected_version integer, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg public.registros_consultor%ROWTYPE;
  v_new_version integer;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'P0001';
  END IF;
  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, true);
  IF v_reg.status::text <> 'enviado_aprovacao' THEN
    RAISE EXCEPTION 'status_invalido' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.registros_consultor
     SET status = 'rascunho', version = COALESCE(version,1)+1, updated_at = now()
   WHERE id = p_registro_id
  RETURNING version INTO v_new_version;
  INSERT INTO public.aprovacoes_tecnicas
    (registro_consultor_id, status_aprovacao, comentario_gestor, aprovado_por, data_aprovacao)
  VALUES (p_registro_id, 'ajuste_solicitado', p_motivo, auth.uid(), now());
  INSERT INTO public.registros_consultor_status_log
    (registro_consultor_id, status_anterior, status_novo, motivo, changed_by, changed_at)
  VALUES (p_registro_id, v_reg.status::text, 'rascunho', p_motivo, auth.uid(), now());
  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, auth.uid(), 'ajuste_solicitado', 'Ajuste solicitado. Motivo: ' || p_motivo);
  RETURN jsonb_build_object('ok', true, 'version', v_new_version, 'status', 'rascunho');
END
$function$;

-- 10) Endurecimento de EXECUTE: sem PUBLIC, sem anon.
DO $grants$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'has_active_user_cliente_access','is_active_visit_participant','is_visit_org_manager',
         'is_visit_responsible','can_view_technical_visit','can_manage_technical_visit',
         'can_checkin_technical_visit','can_checkout_technical_visit',
         '_assert_visita_editavel','_visita_lock_and_check',
         'rpc_realizar_checkin_visita','rpc_upsert_diagnostico_visita','rpc_upsert_recomendacao_visita',
         'rpc_finalizar_visita_v2','rpc_enviar_visita_aprovacao','rpc_liberar_recomendacao_produtor',
         'rpc_reprovar_visita','rpc_solicitar_ajuste_visita'
       )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'has_active_user_cliente_access','is_active_visit_participant','is_visit_org_manager',
         'is_visit_responsible','can_view_technical_visit','can_manage_technical_visit',
         'can_checkin_technical_visit','can_checkout_technical_visit',
         '_assert_visita_editavel',
         'rpc_realizar_checkin_visita','rpc_upsert_diagnostico_visita','rpc_upsert_recomendacao_visita',
         'rpc_finalizar_visita_v2','rpc_enviar_visita_aprovacao','rpc_liberar_recomendacao_produtor',
         'rpc_reprovar_visita','rpc_solicitar_ajuste_visita'
       )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END
$grants$;