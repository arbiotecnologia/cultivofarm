-- ============================================================================
-- H9-E2 - forward reversivel (homologacao ikaauvsflpmamgxmkhoq; ledger 678 -> 679)
-- ----------------------------------------------------------------------------
-- Corrige, em lote minimo e coerente, tres RPCs de visita:
--   public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)
--   public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamptz,text)
--   public.rpc_realizar_checkin_visita(uuid,uuid,public.tipo_checkin,numeric,numeric,numeric,text,text,timestamptz,uuid,uuid,uuid,uuid,text)
--
-- DEFEITOS COMPROVADOS NO CORPO REMOTO (baseline 678):
--   D1 finish_technical_visit_secure: a busca idempotente por client_uuid ocorre
--      ANTES do SELECT ... FOR UPDATE e, depois do lock, o status e avaliado
--      ANTES de repetir a busca. Duas sessoes simultaneas sem linha previa:
--      a 2a espera o lock e recebe visit_not_in_progress em vez do mesmo
--      resultado vencedor. O handler de unique_violation nao e alcancado.
--   D2 rpc_realizar_checkout_visita: SELECT em visitas_checkin por client_uuid
--      ANTES do gate public._visita_scope_ok -> distingue client_uuid existente
--      (idempotency_conflict) de aleatorio (forbidden_visita_nao_atribuido)
--      para registro sem escopo. Oraculo.
--   D3 rpc_realizar_checkin_visita: mesmo oraculo de D2, e sem lock por registro.
--   D4 o comentario "H9-D-L6: autorizacao de escopo ANTES de qualquer leitura"
--      estava abaixo do lookup e nao descrevia o corpo efetivo.
--
-- ORDEM CANONICA APLICADA NAS TRES FUNCOES:
--   auth/validacoes sintaticas -> gate de escopo fail-closed
--   -> derivacoes de papel (can_manage/is_participant)
--   -> lock por registro (SELECT/PERFORM ... FOR UPDATE)
--   -> busca idempotente por client_uuid (POS-lock)
--   -> validacoes de estado/ciclo -> escrita -> handler de unique_violation.
--
-- PRESERVADO: assinaturas, tipos de retorno, formato JSON/RETURNS TABLE,
-- SECURITY DEFINER, owner, search_path=public, ACL sem PUBLIC e sem anon,
-- mensagens/SQLSTATE publicos, auditoria (visitas_logs, timeline) e RLS.
-- p_client_uuid continua obrigatorio nas RPCs canonicas; em
-- finish_technical_visit_secure continua opcional (compatibilidade), e nesse
-- caso NAO ha chave de idempotencia - limitacao documentada, sem identificador
-- artificial silencioso.
--
-- Sem BEGIN/COMMIT internos (aplicar em transacao externa com guardas).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- GUARDA PRE: projeto, ledger e baselines exatos das tres funcoes.
-- ---------------------------------------------------------------------------
DO $guard_pre$
DECLARE
  v_ref     text;
  v_ledger  int;
  v_oid     oid;
  v_def     text;
  v_src     text;
BEGIN
  SELECT project_ref INTO v_ref
    FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'H9E2_ABORT: projeto % nao autorizado (somente homologacao).', COALESCE(v_ref,'<nulo>');
  END IF;

  SELECT count(*)::int INTO v_ledger FROM supabase_migrations.schema_migrations;
  IF v_ledger <> 678 THEN
    RAISE EXCEPTION 'H9E2_ABORT: ledger esperado 678, encontrado %.', v_ledger;
  END IF;

  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261023000000') THEN
    RAISE EXCEPTION 'H9E2_ABORT: 20261023000000 ja registrada (ocorrencia unica).';
  END IF;

  -- finish_technical_visit_secure
  SELECT p.oid, md5(pg_get_functiondef(p.oid)), md5(p.prosrc) INTO v_oid, v_def, v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'finish_technical_visit_secure';
  IF v_oid <> 24597::oid OR v_def <> '20515c14cf017e68bebc8f99ba3cd00a' OR v_src <> 'e7e8720effb4341d8960d865503aedb8' THEN
    RAISE EXCEPTION 'H9E2_ABORT: baseline divergente em finish_technical_visit_secure (oid=%, def=%, src=%).', v_oid, v_def, v_src;
  END IF;

  -- rpc_realizar_checkout_visita
  SELECT p.oid, md5(pg_get_functiondef(p.oid)), md5(p.prosrc) INTO v_oid, v_def, v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_realizar_checkout_visita';
  IF v_oid <> 24800::oid OR v_def <> '2b2cc2d7d51a37a515ef79823c28f690' OR v_src <> 'a68dc37ed14aadd2349415e5a52f2f4a' THEN
    RAISE EXCEPTION 'H9E2_ABORT: baseline divergente em rpc_realizar_checkout_visita (oid=%, def=%, src=%).', v_oid, v_def, v_src;
  END IF;

  -- rpc_realizar_checkin_visita
  SELECT p.oid, md5(pg_get_functiondef(p.oid)), md5(p.prosrc) INTO v_oid, v_def, v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_realizar_checkin_visita';
  IF v_oid <> 24798::oid OR v_def <> '3aa7f5ef96de3e4c4e3b1d5aa73ca16c' OR v_src <> 'd049e983b610f0c7423b12247cdffaf7' THEN
    RAISE EXCEPTION 'H9E2_ABORT: baseline divergente em rpc_realizar_checkin_visita (oid=%, def=%, src=%).', v_oid, v_def, v_src;
  END IF;

  -- indice unico de idempotencia: pre-requisito do tratamento de corrida.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'visitas_checkin'
       AND indexname = 'visitas_checkin_client_uuid_uq'
  ) THEN
    RAISE EXCEPTION 'H9E2_ABORT: indice visitas_checkin_client_uuid_uq ausente.';
  END IF;
END
$guard_pre$;

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
       AND p.oid = 24597::oid
       AND pg_get_function_result(p.oid) = 'TABLE(registro_id uuid, checkout_id uuid, finalized_at timestamp with time zone)'
  ) THEN
    RAISE EXCEPTION 'H9E2_ABORT: contrato de retorno de finish_technical_visit_secure alterado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='rpc_realizar_checkin_visita'
       AND p.oid = 24798::oid AND pg_get_function_result(p.oid) = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'H9E2_ABORT: contrato de rpc_realizar_checkin_visita alterado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='rpc_realizar_checkout_visita'
       AND p.oid = 24800::oid AND pg_get_function_result(p.oid) = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'H9E2_ABORT: contrato de rpc_realizar_checkout_visita alterado.';
  END IF;
END
$guard_pos$;
