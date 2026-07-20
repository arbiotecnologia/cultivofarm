
DROP FUNCTION IF EXISTS public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamptz,text);

-- FASE 5 · RLS de leitura estendida para participantes ativos
DROP POLICY IF EXISTS registros_consultor_select_hardened ON public.registros_consultor;
CREATE POLICY registros_consultor_select_hardened ON public.registros_consultor
FOR SELECT USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role)
  OR public.has_role(auth.uid(), 'gestor'::public.app_role)
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::public.natureza_registro_consultor) <> 'visita'::public.natureza_registro_consultor
    AND public.can_user_access_cliente(cliente_id)
  )
  OR (
    COALESCE(natureza_registro, 'ocorrencia'::public.natureza_registro_consultor) = 'visita'::public.natureza_registro_consultor
    AND (
      public.has_active_user_cliente_access(auth.uid(), cliente_id, ARRAY['read','execute','manage'])
      OR public.is_active_visit_participant(auth.uid(), id)
      OR (
        public.has_role(auth.uid(), 'cliente_produtor'::public.app_role)
        AND public.can_user_access_cliente(cliente_id)
        AND status = ANY (ARRAY['aprovado'::public.status_registro_consultor,'finalizado'::public.status_registro_consultor,'convertido_os'::public.status_registro_consultor])
      )
    )
  )
);

DROP POLICY IF EXISTS visitas_checkin_select_hardened ON public.visitas_checkin;
CREATE POLICY visitas_checkin_select_hardened ON public.visitas_checkin
FOR SELECT USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role)
  OR public.has_role(auth.uid(), 'gestor'::public.app_role)
  OR public.is_active_visit_participant(auth.uid(), registro_consultor_id)
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = visitas_checkin.registro_consultor_id
      AND r.cliente_id = visitas_checkin.cliente_id
      AND (
        public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['read','execute','manage'])
        OR (
          public.has_role(auth.uid(), 'cliente_produtor'::public.app_role)
          AND public.can_user_access_cliente(r.cliente_id)
          AND r.status = ANY (ARRAY['aprovado'::public.status_registro_consultor,'finalizado'::public.status_registro_consultor,'convertido_os'::public.status_registro_consultor])
        )
      )
  )
);

DROP POLICY IF EXISTS visitas_campo_select ON public.visitas_campo;
CREATE POLICY visitas_campo_select ON public.visitas_campo
FOR SELECT USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.id = visitas_campo.registro_consultor_id AND r.created_by = auth.uid())
  OR public.is_active_visit_participant(auth.uid(), registro_consultor_id)
  OR public.has_active_user_cliente_access(auth.uid(), cliente_id, ARRAY['read','execute','manage'])
);

DROP POLICY IF EXISTS visita_diagnosticos_select_hardened ON public.visita_diagnosticos;
CREATE POLICY visita_diagnosticos_select_hardened ON public.visita_diagnosticos
FOR SELECT USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role)
  OR public.has_role(auth.uid(), 'gestor'::public.app_role)
  OR public.is_active_visit_participant(auth.uid(), registro_id)
  OR EXISTS (
    SELECT 1 FROM public.registros_consultor r
    WHERE r.id = visita_diagnosticos.registro_id
      AND (
        (COALESCE(r.natureza_registro, 'ocorrencia'::public.natureza_registro_consultor) <> 'visita'::public.natureza_registro_consultor
         AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid() OR public.can_user_access_cliente(r.cliente_id)))
        OR (COALESCE(r.natureza_registro, 'ocorrencia'::public.natureza_registro_consultor) = 'visita'::public.natureza_registro_consultor
            AND (
              public.has_active_user_cliente_access(auth.uid(), r.cliente_id, ARRAY['read','execute','manage'])
              OR (public.has_role(auth.uid(), 'cliente_produtor'::public.app_role)
                  AND public.can_user_access_cliente(r.cliente_id)
                  AND r.status = ANY (ARRAY['aprovado'::public.status_registro_consultor,'finalizado'::public.status_registro_consultor,'convertido_os'::public.status_registro_consultor]))
            )
        )
      )
  )
);

DROP POLICY IF EXISTS rec_select_participants ON public.registros_consultor_recomendacoes;
CREATE POLICY rec_select_participants ON public.registros_consultor_recomendacoes
FOR SELECT USING (public.is_active_visit_participant(auth.uid(), registro_consultor_id));

-- FASE 6 · RPCs check-in/out exigem participação ativa
CREATE OR REPLACE FUNCTION public.rpc_realizar_checkin_visita(
  p_registro_id uuid,
  p_client_uuid uuid,
  p_tipo public.tipo_checkin,
  p_latitude numeric,
  p_longitude numeric,
  p_precisao numeric,
  p_justificativa_sem_gps text,
  p_observacoes text,
  p_captured_at_local timestamptz,
  p_solicitacao_id uuid,
  p_cliente_id uuid,
  p_fazenda_id uuid,
  p_talhao_id uuid,
  p_foto_path text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid::text LIMIT 1;
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
    v_obs, p_foto_path, p_client_uuid::text,
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
    SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid::text LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
         OR v_existing.tipo_checkin <> p_tipo
         OR (v_existing.consultor_id <> v_uid AND NOT v_can_manage) THEN
        RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
      END IF;
      RETURN jsonb_build_object('id', v_existing.id, 'data_hora_checkin', v_existing.data_hora_checkin, 'idempotent', true);
    END IF;
    RAISE;
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_realizar_checkout_visita(
  p_registro_id uuid,
  p_client_uuid uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_precisao numeric,
  p_justificativa_sem_gps text,
  p_observacoes text,
  p_captured_at_local timestamptz,
  p_foto_path text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
END; $$;

REVOKE ALL ON FUNCTION public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamptz,text) TO authenticated;

-- FASE 7 · helper de presença considera apenas participantes ativos + responsável
CREATE OR REPLACE FUNCTION public.has_completed_visit_presence(p_registro_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_total integer; v_ok integer;
BEGIN
  IF p_registro_id IS NULL THEN RETURN false; END IF;

  WITH elegiveis AS (
    SELECT r.consultor_profile_id AS user_id
      FROM public.registros_consultor r
     WHERE r.id = p_registro_id AND r.consultor_profile_id IS NOT NULL
    UNION
    SELECT tva.user_id FROM public.technical_visit_assignments tva
     WHERE tva.registro_consultor_id = p_registro_id AND tva.is_active = true
  )
  SELECT COUNT(*) INTO v_total FROM elegiveis;

  IF COALESCE(v_total,0) = 0 THEN RETURN false; END IF;

  WITH elegiveis AS (
    SELECT r.consultor_profile_id AS user_id
      FROM public.registros_consultor r
     WHERE r.id = p_registro_id AND r.consultor_profile_id IS NOT NULL
    UNION
    SELECT tva.user_id FROM public.technical_visit_assignments tva
     WHERE tva.registro_consultor_id = p_registro_id AND tva.is_active = true
  ),
  eventos AS (
    SELECT vc.consultor_id, vc.tipo_checkin, vc.data_hora_checkin, vc.created_at, vc.id
      FROM public.visitas_checkin vc
      JOIN elegiveis e ON e.user_id = vc.consultor_id
     WHERE vc.registro_consultor_id = p_registro_id
       AND vc.status <> 'inconsistente'::public.status_checkin
  ),
  ultimo AS (
    SELECT DISTINCT ON (consultor_id) consultor_id, tipo_checkin, data_hora_checkin
      FROM eventos
     ORDER BY consultor_id, data_hora_checkin DESC, created_at DESC, id DESC
  ),
  ultima_entrada AS (
    SELECT consultor_id, MAX(data_hora_checkin) AS dt_entrada
      FROM eventos
     WHERE tipo_checkin <> 'checkout'::public.tipo_checkin
     GROUP BY consultor_id
  )
  SELECT COUNT(*) INTO v_ok
    FROM ultimo u JOIN ultima_entrada e ON e.consultor_id = u.consultor_id
   WHERE u.tipo_checkin = 'checkout'::public.tipo_checkin
     AND u.data_hora_checkin > e.dt_entrada;

  RETURN v_ok = v_total;
END; $$;

-- RPCs de gestão de participantes
CREATE OR REPLACE FUNCTION public.rpc_assign_visit_technician(
  p_registro_id uuid, p_user_id uuid, p_role text DEFAULT 'tecnico'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_reactivated boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
  IF p_registro_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'parametros_obrigatorios' USING ERRCODE='22023';
  END IF;
  IF NOT public.can_manage_technical_visit(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_gestao_equipe' USING ERRCODE='42501';
  END IF;

  SELECT id INTO v_id FROM public.technical_visit_assignments
    WHERE registro_consultor_id = p_registro_id AND user_id = p_user_id LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.technical_visit_assignments
       SET is_active = true,
           role = COALESCE(p_role, role),
           removed_at = NULL,
           removal_reason = NULL,
           assigned_by = v_uid,
           assigned_at = now(),
           updated_at = now()
     WHERE id = v_id;
    v_reactivated := true;
  ELSE
    INSERT INTO public.technical_visit_assignments
      (registro_consultor_id, user_id, role, is_active, assigned_by, assigned_at)
    VALUES (p_registro_id, p_user_id, COALESCE(p_role,'tecnico'), true, v_uid, now())
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, v_uid,
          CASE WHEN v_reactivated THEN 'tecnico_reativado' ELSE 'tecnico_atribuido' END,
          'Técnico ' || p_user_id::text || ' (' || COALESCE(p_role,'tecnico') || ') atribuído à visita');

  RETURN jsonb_build_object('id', v_id, 'reactivated', v_reactivated);
END; $$;

CREATE OR REPLACE FUNCTION public.rpc_remove_visit_technician(
  p_registro_id uuid, p_user_id uuid, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
  IF p_registro_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'parametros_obrigatorios' USING ERRCODE='22023';
  END IF;
  IF NOT public.can_manage_technical_visit(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_gestao_equipe' USING ERRCODE='42501';
  END IF;

  UPDATE public.technical_visit_assignments
     SET is_active = false,
         removed_at = now(),
         removal_reason = NULLIF(btrim(COALESCE(p_reason,'')), ''),
         updated_at = now()
   WHERE registro_consultor_id = p_registro_id
     AND user_id = p_user_id
     AND is_active = true
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN RAISE EXCEPTION 'atribuicao_inexistente' USING ERRCODE='22023'; END IF;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao)
  VALUES (p_registro_id, v_uid, 'tecnico_removido',
          'Técnico ' || p_user_id::text || ' removido da visita' ||
          COALESCE(' — motivo: ' || NULLIF(btrim(COALESCE(p_reason,'')), ''), ''));

  RETURN jsonb_build_object('id', v_id, 'removed', true);
END; $$;

REVOKE ALL ON FUNCTION public.rpc_assign_visit_technician(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_assign_visit_technician(uuid,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_remove_visit_technician(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_remove_visit_technician(uuid,uuid,text) TO authenticated;
