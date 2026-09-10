-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : restoration/homologacao-h9/h9e-forwards/20261023000000_h9e2_visit_rpcs_authz_and_concurrent_idempotency_v1.sql
-- SHA-256 orig: 33ae040962d24249f23bd0841f14452a85107eefc7fe5df1aa04cb8cc98460fe
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-manuais.py
-- Transformação: guard_pre de homologação (marcador, ledger=678, OIDs e md5 de prosrc de homologação) substituído por guarda canônica de promoção + baseline semântico por regprocedure/SECDEF/owner/search_path + precheck do índice único; OIDs fixos do pós-check trocados por assinatura ::regprocedure; 3 CREATE OR REPLACE, ACL, SECURITY DEFINER e pós-checks preservados
--
-- O runner valida o ref do alvo por canal externo (API/DSN) e só então executa
-- `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela marcadora de
-- homologação é consultada, nenhum OID e nenhuma contagem de ledger é fixada.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- ---------------------------------------------------------------------------
-- PRECHECK FAIL-CLOSED (baseline semântico; sem ledger fixo e sem OID).
-- Em produção o corpo destas funções resulta das ondas anteriores desta mesma
-- promoção, e não do corpo medido em homologação; por isso o baseline é
-- semântico e verificável, nunca um md5(prosrc) importado de outro ambiente.
-- ---------------------------------------------------------------------------
DO $h9e2_pre$
DECLARE
  v_sig  text;
  v_oid  oid;
  v_rec  record;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)',
    'public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text)',
    'public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamptz,text)'
  ] LOOP
    v_oid := to_regprocedure(v_sig);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'H9E2_PROMO: assinatura ausente: %', v_sig;
    END IF;
    SELECT p.prosecdef, pg_get_userbyid(p.proowner) AS owner, p.proconfig
      INTO v_rec FROM pg_proc p WHERE p.oid = v_oid;
    IF NOT v_rec.prosecdef THEN
      RAISE EXCEPTION 'H9E2_PROMO: % sem SECURITY DEFINER no baseline', v_sig;
    END IF;
    IF v_rec.owner <> 'postgres' THEN
      RAISE EXCEPTION 'H9E2_PROMO: % com owner inesperado (%)', v_sig, v_rec.owner;
    END IF;
    IF NOT (v_rec.proconfig @> ARRAY['search_path=public']) THEN
      RAISE EXCEPTION 'H9E2_PROMO: % sem search_path=public fixo', v_sig;
    END IF;
  END LOOP;

  -- Dependências do tratamento de corrida.
  IF to_regprocedure('public._visita_scope_ok(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'H9E2_PROMO: helper _visita_scope_ok(uuid,uuid) ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'visitas_checkin'
       AND indexname = 'visitas_checkin_client_uuid_uq'
  ) THEN
    RAISE EXCEPTION 'H9E2_PROMO: indice unico visitas_checkin_client_uuid_uq ausente';
  END IF;

  -- Idempotência da própria promoção: se o corpo já contém a ordem canônica,
  -- a reaplicação é inofensiva (CREATE OR REPLACE), mas fica registrada.
  RAISE NOTICE 'H9E2_PROMO: baseline semantico validado.';
END
$h9e2_pre$;

-- ---------------------------------------------------------------------------
-- 1/3 finish_technical_visit_secure
-- ---------------------------------------------------------------------------
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

  -- H9-E2 (A): gate de escopo fail-closed ANTES de qualquer SELECT em
  -- registros_consultor ou visitas_checkin. Registro inexistente, registro
  -- alheio, p_registro_id NULL e qualquer client_uuid (existente, alheio ou
  -- aleatorio) produzem a MESMA superficie publica: 42501 not_visit_owner.
  IF NOT v_is_admin
     AND NOT COALESCE(public._visita_scope_ok(v_uid, p_registro_id), false) THEN
    RAISE EXCEPTION 'not_visit_owner' USING ERRCODE = '42501';
  END IF;

  -- H9-E2 (B): lock por registro ANTES da busca idempotente. Serializa
  -- encerramentos concorrentes do mesmo agregado; nao ha lock global.
  SELECT * INTO v_reg
    FROM public.registros_consultor r
   WHERE r.id = p_registro_id
     FOR UPDATE;

  IF v_reg.id IS NULL THEN
    -- Alcancavel apenas no bypass de administrador; mantem a superficie unica.
    RAISE EXCEPTION 'not_visit_owner' USING ERRCODE = '42501';
  END IF;

  -- H9-E2 (B): busca idempotente POS-lock e ANTES de qualquer rejeicao por
  -- estado. A sessao perdedora da corrida encontra aqui o resultado vencedor
  -- (ja commitado) e retorna identico, em vez de erro de estado.
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
  -- Nota: com p_client_uuid NULL nao existe chave de idempotencia; a chamada
  -- permanece compativel, porem NAO e idempotente. Limitacao documentada.

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
    -- Corrida do mesmo client_uuid em registros distintos (fora do lock):
    -- converge para o vencedor, fail-closed.
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

-- ---------------------------------------------------------------------------
-- 2/3 rpc_realizar_checkin_visita
-- ---------------------------------------------------------------------------
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

  -- H9-E2 (A): gate de escopo fail-closed ANTES de qualquer leitura sensivel,
  -- inclusive do lookup por client_uuid. Corrige o oraculo remanescente da
  -- H9-D-L6, cujo comentario estava abaixo do lookup. Registro inexistente,
  -- registro alheio e qualquer client_uuid convergem para o mesmo erro.
  IF NOT COALESCE(public._visita_scope_ok(v_uid, p_registro_id), false) THEN
    RAISE EXCEPTION 'forbidden_visita_nao_atribuido' USING ERRCODE = '42501';
  END IF;

  -- Derivacoes de papel somente apos o gate.
  v_can_manage := COALESCE(public.can_manage_technical_visit(v_uid, p_registro_id), false);
  v_is_participant := COALESCE(public.is_active_visit_participant(v_uid, p_registro_id), false);

  -- H9-E2 (B): lock por registro antes da busca idempotente determinante.
  PERFORM 1 FROM public.registros_consultor WHERE id = p_registro_id FOR UPDATE;

  -- H9-E2 (B): busca idempotente POS-lock, ANTES de qualquer rejeicao por
  -- estado ou por duplicidade de ciclo.
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

REVOKE ALL ON FUNCTION public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3/3 rpc_realizar_checkout_visita
-- ---------------------------------------------------------------------------
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

  -- H9-E2 (A): gate de escopo fail-closed ANTES de qualquer leitura sensivel,
  -- inclusive do lookup por client_uuid (oraculo remanescente da H9-D-L6).
  IF NOT COALESCE(public._visita_scope_ok(v_uid, p_registro_id), false) THEN
    RAISE EXCEPTION 'forbidden_visita_nao_atribuido' USING ERRCODE = '42501';
  END IF;

  -- Derivacoes de papel somente apos o gate.
  v_can_manage := COALESCE(public.can_manage_technical_visit(v_uid, p_registro_id), false);
  v_is_participant := COALESCE(public.is_active_visit_participant(v_uid, p_registro_id), false);

  -- H9-E2 (B): lock por registro antes da busca idempotente determinante.
  PERFORM 1 FROM public.registros_consultor WHERE id = p_registro_id FOR UPDATE;

  -- H9-E2 (B): busca idempotente POS-lock, ANTES da duplicidade de encerramento e das
  -- demais rejeicoes de ciclo. A sessao perdedora converge para o vencedor.
  SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid LIMIT 1;
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

-- ---------------------------------------------------------------------------
-- GUARDA POS: ordem canonica, contratos, ACL e search_path das tres funcoes.
-- ---------------------------------------------------------------------------
DO $guard_pos$
DECLARE
  r            record;
  v_src        text;
  v_gate       int;
  v_lock       int;
  v_lookup     int;
  v_state      int;
  v_acl        text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.prosrc, p.prosecdef, p.proconfig,
           array_to_string(p.proacl, ',') AS acl,
           pg_get_userbyid(p.proowner) AS owner
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('finish_technical_visit_secure','rpc_realizar_checkout_visita','rpc_realizar_checkin_visita')
  LOOP
    v_src := r.prosrc;

    IF NOT r.prosecdef THEN
      RAISE EXCEPTION 'H9E2_ABORT: % perdeu SECURITY DEFINER.', r.proname;
    END IF;
    IF r.owner <> 'postgres' THEN
      RAISE EXCEPTION 'H9E2_ABORT: % com owner inesperado (%).', r.proname, r.owner;
    END IF;
    IF NOT (r.proconfig @> ARRAY['search_path=public']) THEN
      RAISE EXCEPTION 'H9E2_ABORT: % sem search_path=public fixo.', r.proname;
    END IF;

    v_acl := COALESCE(r.acl, '');
    IF v_acl LIKE '%=X/%' AND v_acl LIKE '%anon=%' THEN
      RAISE EXCEPTION 'H9E2_ABORT: % concede execucao a anon.', r.proname;
    END IF;
    IF v_acl ~ '(^|,)=X/' THEN
      RAISE EXCEPTION 'H9E2_ABORT: % concede execucao a PUBLIC.', r.proname;
    END IF;
    IF v_acl NOT LIKE '%authenticated=X/%' OR v_acl NOT LIKE '%service_role=X/%' THEN
      RAISE EXCEPTION 'H9E2_ABORT: % perdeu grants legitimos (%).', r.proname, v_acl;
    END IF;

    -- Ordem canonica por posicao textual no corpo.
    v_gate   := position('_visita_scope_ok' in v_src);
    v_lock   := position('FOR UPDATE' in v_src);
    v_lookup := position('WHERE client_uuid = p_client_uuid' in v_src);

    IF v_gate = 0 THEN
      RAISE EXCEPTION 'H9E2_ABORT: % sem gate _visita_scope_ok.', r.proname;
    END IF;
    IF v_lock = 0 THEN
      RAISE EXCEPTION 'H9E2_ABORT: % sem lock por registro.', r.proname;
    END IF;
    IF v_lookup = 0 THEN
      RAISE EXCEPTION 'H9E2_ABORT: % sem busca idempotente por client_uuid.', r.proname;
    END IF;
    IF NOT (v_gate < v_lock AND v_lock < v_lookup) THEN
      RAISE EXCEPTION 'H9E2_ABORT: % com ordem invalida (gate=%, lock=%, lookup=%).',
        r.proname, v_gate, v_lock, v_lookup;
    END IF;

    -- A busca pos-lock precede as rejeicoes de estado/ciclo.
    v_state := LEAST(
      NULLIF(position('visit_not_in_progress' in v_src), 0),
      NULLIF(position('checkout_duplicado' in v_src), 0),
      NULLIF(position('checkin_duplicado_para_tipo_no_ciclo' in v_src), 0)
    );
    IF v_state IS NOT NULL AND v_state < v_lookup THEN
      RAISE EXCEPTION 'H9E2_ABORT: % rejeita estado/ciclo antes da busca idempotente.', r.proname;
    END IF;
  END LOOP;

  -- Contratos preservados.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='finish_technical_visit_secure'
       AND p.oid = 'public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)'::regprocedure
       AND pg_get_function_result(p.oid) = 'TABLE(registro_id uuid, checkout_id uuid, finalized_at timestamp with time zone)'
  ) THEN
    RAISE EXCEPTION 'H9E2_ABORT: contrato de retorno de finish_technical_visit_secure alterado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='rpc_realizar_checkin_visita'
       AND p.oid = 'public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text)'::regprocedure AND pg_get_function_result(p.oid) = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'H9E2_ABORT: contrato de rpc_realizar_checkin_visita alterado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='rpc_realizar_checkout_visita'
       AND p.oid = 'public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamptz,text)'::regprocedure AND pg_get_function_result(p.oid) = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'H9E2_ABORT: contrato de rpc_realizar_checkout_visita alterado.';
  END IF;
END
$guard_pos$;
