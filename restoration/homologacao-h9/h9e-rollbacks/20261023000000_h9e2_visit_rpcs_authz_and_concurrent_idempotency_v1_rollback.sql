-- H9-E2 - ROLLBACK de 20261023000000 (homologacao ikaauvsflpmamgxmkhoq).
-- Restaura byte-a-byte as definicoes imediatamente anteriores de:
--   public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)
--     OID 24597 | md5(def)=20515c14cf017e68bebc8f99ba3cd00a | md5(prosrc)=e7e8720effb4341d8960d865503aedb8
--   public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamptz,text)
--     OID 24800 | md5(def)=2b2cc2d7d51a37a515ef79823c28f690 | md5(prosrc)=a68dc37ed14aadd2349415e5a52f2f4a
--   public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text)
--     OID 24798 | md5(def)=3aa7f5ef96de3e4c4e3b1d5aa73ca16c | md5(prosrc)=d049e983b610f0c7423b12247cdffaf7
-- Todas: owner postgres, SECURITY DEFINER, search_path=public,
-- ACL postgres=X,authenticated=X,service_role=X (sem PUBLIC, sem anon).
--
-- IMPACTO DE EXECUTAR ESTE ROLLBACK (NAO executar agora):
--   1. reintroduz o lookup de idempotencia por client_uuid ANTES do gate de
--      escopo em rpc_realizar_checkin_visita e rpc_realizar_checkout_visita,
--      devolvendo o oraculo idempotency_conflict vs forbidden_visita_nao_atribuido;
--   2. reintroduz, em finish_technical_visit_secure, a busca idempotente ANTES
--      do SELECT ... FOR UPDATE e a checagem de status ANTES da rebusca pos-lock,
--      quebrando a idempotencia concorrente (2a sessao recebe visit_not_in_progress);
--   3. remove o lock por registro em rpc_realizar_checkin_visita;
--   4. linhas gravadas sob 20261023000000 permanecem validas e nao sao revertidas
--      (visitas_checkin e append-only por trg_enforce_checkin_immutability).
-- Sem BEGIN/COMMIT internos (aplicar em transacao externa).

CREATE OR REPLACE FUNCTION public.finish_technical_visit_secure(p_registro_id uuid, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_precisao_gps numeric DEFAULT NULL::numeric, p_foto_url text DEFAULT NULL::text, p_foto_path text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text, p_client_uuid uuid DEFAULT NULL::uuid)
 RETURNS TABLE(registro_id uuid, checkout_id uuid, finalized_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_reg public.registros_consultor;
  v_existing public.visitas_checkin;
  v_diag_count int;
  v_new_checkout uuid;
  v_now timestamptz := now();
  v_prev_final timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  v_is_admin := COALESCE(public.has_role(v_uid, 'administrador'::app_role), false);

  -- H9-E1R (1): autorizacao de escopo ANTES de qualquer leitura de registro,
  -- check-in ou client_uuid. Inexistente / alheio / NULL: mesma superficie.
  IF NOT v_is_admin
     AND NOT COALESCE(public._visita_scope_ok(v_uid, p_registro_id), false) THEN
    RAISE EXCEPTION 'not_visit_owner' USING ERRCODE = '42501';
  END IF;

  -- H9-E1R (3): idempotencia por client_uuid, somente depois do gate de escopo.
  IF p_client_uuid IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.visitas_checkin
     WHERE client_uuid = p_client_uuid
     LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
      IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
         OR v_existing.tipo_checkin <> 'checkout'::public.tipo_checkin
         OR (v_existing.consultor_id IS DISTINCT FROM v_uid AND NOT v_is_admin) THEN
        RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
      END IF;

      SELECT r.finalized_at INTO v_prev_final
        FROM public.registros_consultor r
       WHERE r.id = p_registro_id;

      RETURN QUERY
        SELECT p_registro_id,
               v_existing.id,
               COALESCE(v_prev_final, v_existing.data_hora_checkin);
      RETURN;
    END IF;
  END IF;

  -- Serializa encerramentos concorrentes do mesmo registro.
  SELECT * INTO v_reg
    FROM public.registros_consultor r
   WHERE r.id = p_registro_id
     FOR UPDATE;

  IF v_reg.id IS NULL THEN
    -- Alcancavel apenas no bypass de administrador; mantem a superficie unica.
    RAISE EXCEPTION 'not_visit_owner' USING ERRCODE = '42501';
  END IF;

  IF v_reg.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'visit_not_in_progress:%', v_reg.status USING ERRCODE = '22023';
  END IF;

  -- Exige ao menos um diagnostico
  SELECT count(*) INTO v_diag_count
    FROM public.visita_diagnosticos vd WHERE vd.registro_id = v_reg.id;
  IF v_diag_count = 0 THEN
    RAISE EXCEPTION 'diagnostico_required' USING ERRCODE = '22023';
  END IF;

  -- H9-E1R (2): check-out gravado com o tipo canonico 'checkout'.
  BEGIN
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
      'checkout'::public.tipo_checkin, 'realizado', p_client_uuid
    )
    RETURNING id INTO v_new_checkout;
  EXCEPTION WHEN unique_violation THEN
    -- Corrida no mesmo client_uuid: converge para o vencedor, fail-closed.
    SELECT * INTO v_existing
      FROM public.visitas_checkin
     WHERE client_uuid = p_client_uuid
     LIMIT 1;

    IF v_existing.id IS NULL
       OR v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
       OR v_existing.tipo_checkin <> 'checkout'::public.tipo_checkin
       OR (v_existing.consultor_id IS DISTINCT FROM v_uid AND NOT v_is_admin) THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
    END IF;

    SELECT r.finalized_at INTO v_prev_final
      FROM public.registros_consultor r
     WHERE r.id = p_registro_id;

    RETURN QUERY
      SELECT p_registro_id,
             v_existing.id,
             COALESCE(v_prev_final, v_existing.data_hora_checkin);
    RETURN;
  END;

  UPDATE public.registros_consultor
     SET status = 'finalizado',
         hora_fim = v_now,
         finalized_at = v_now,
         finalized_by = v_uid,
         updated_at = v_now
   WHERE id = v_reg.id;

  INSERT INTO public.visitas_logs(registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata)
  VALUES (v_reg.id, v_reg.solicitacao_id, 'checkout', 'Check-out e finalizacao da visita', v_uid,
          jsonb_build_object('checkout_id', v_new_checkout, 'admin_bypass', v_is_admin));

  RETURN QUERY SELECT v_reg.id, v_new_checkout, v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid) TO authenticated, service_role;

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

  SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
       OR v_existing.tipo_checkin <> 'checkout'::public.tipo_checkin
       OR (v_existing.consultor_id <> v_uid AND NOT v_can_manage) THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'data_hora_checkin', v_existing.data_hora_checkin, 'idempotent', true);
  END IF;

  -- H9-D-L6: autorizacao de escopo ANTES de qualquer leitura da visita.
  -- Registro inexistente e registro alheio (editavel ou nao) produzem o MESMO
  -- erro, eliminando o oraculo de existencia sobre registros_consultor.
  IF NOT public._visita_scope_ok(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_visita_nao_atribuido' USING ERRCODE = '42501';
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
    v_obs, p_foto_path, p_client_uuid,
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
    SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid LIMIT 1;
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

REVOKE ALL ON FUNCTION public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamptz,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamptz,text) TO authenticated, service_role;

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

  -- H9-D-L6: autorizacao de escopo ANTES de qualquer leitura da visita.
  -- Registro inexistente e registro alheio (editavel ou nao) produzem o MESMO
  -- erro, eliminando o oraculo de existencia sobre registros_consultor.
  IF NOT public._visita_scope_ok(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_visita_nao_atribuido' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text) TO authenticated, service_role;

