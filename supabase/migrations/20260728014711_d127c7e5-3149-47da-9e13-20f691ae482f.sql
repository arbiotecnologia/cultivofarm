-- Gate 3 — hardening de retry (jitter) + RPCs administrativos de DLQ/métricas.
-- Idempotente: usa CREATE OR REPLACE FUNCTION. Nenhuma tabela nova.

BEGIN;

-- 1) Retry com jitter (±20%) preservando teto de 3600s e semântica anterior.
CREATE OR REPLACE FUNCTION public.rpc_fail_communication_delivery_v2(
  p_outbox_id uuid, p_worker_id text, p_error_code text, p_error_message text, p_is_permanent boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r public.comunicacao_outbox%rowtype;
  v_role text;
  v_base int;
  v_jitter numeric;
  v_backoff int;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims',true)::jsonb->>'role', session_user);
  IF v_role IS NOT NULL AND v_role NOT IN ('service_role') AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'apenas service_role' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NULLIF(trim(COALESCE(p_worker_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'worker_id obrigatório';
  END IF;
  IF p_error_code IS NOT NULL AND length(p_error_code) > 80 THEN
    RAISE EXCEPTION 'error_code >80';
  END IF;
  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status <> 'processing' THEN RAISE EXCEPTION 'não estava em processing'; END IF;
  IF r.locked_by IS DISTINCT FROM p_worker_id THEN RAISE EXCEPTION 'lease de outro'; END IF;
  IF p_is_permanent OR r.attempts >= r.max_attempts THEN
    UPDATE public.comunicacao_outbox
       SET status='dead_letter',
           error_code=left(COALESCE(p_error_code,''),80),
           error_message=left(COALESCE(p_error_message,''),2000),
           locked_at=NULL, locked_by=NULL, lease_expires_at=NULL
     WHERE id = p_outbox_id;
    RETURN jsonb_build_object('ok',true,'status','dead_letter','attempts',r.attempts);
  END IF;
  -- Backoff exponencial base + jitter simétrico ±20%. Teto 3600s, piso 1s.
  v_base := LEAST(3600, GREATEST(1, POWER(2, GREATEST(r.attempts-1, 0))::int * 30));
  v_jitter := 0.8 + (random() * 0.4); -- [0.8, 1.2)
  v_backoff := LEAST(3600, GREATEST(1, floor(v_base * v_jitter)::int));
  UPDATE public.comunicacao_outbox
     SET status='pending',
         next_attempt_at=now() + make_interval(secs => v_backoff),
         error_code=left(COALESCE(p_error_code,''),80),
         error_message=left(COALESCE(p_error_message,''),2000),
         locked_at=NULL, locked_by=NULL, lease_expires_at=NULL
   WHERE id = p_outbox_id;
  RETURN jsonb_build_object('ok',true,'status','pending','retry_in_seconds',v_backoff,'attempts',r.attempts);
END$fn$;
REVOKE ALL ON FUNCTION public.rpc_fail_communication_delivery_v2(uuid,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fail_communication_delivery_v2(uuid,text,text,text,boolean) TO service_role;

-- 2) Helper interno de guard admin (usa has_role já existente).
CREATE OR REPLACE FUNCTION public._comunicacao_require_admin() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_role text;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims',true)::jsonb->>'role', session_user);
  IF v_role = 'service_role' OR current_user = 'service_role' THEN RETURN; END IF;
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'administrador') THEN
    RAISE EXCEPTION 'apenas administrador' USING ERRCODE='insufficient_privilege';
  END IF;
END$fn$;
REVOKE ALL ON FUNCTION public._comunicacao_require_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._comunicacao_require_admin() TO authenticated, service_role;

-- 3) Listagem paginada de dead_letter (admin-only).
CREATE OR REPLACE FUNCTION public.rpc_admin_list_communication_dead_letter(
  p_limit int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE (
  id uuid,
  canal public.comunicacao_canal,
  template_chave text,
  template_versao int,
  attempts int,
  max_attempts int,
  error_code text,
  error_message text,
  recipient_user_id uuid,
  recipient_cliente_id uuid,
  created_at timestamptz,
  updated_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_limit int; v_offset int;
BEGIN
  PERFORM public._comunicacao_require_admin();
  v_limit := GREATEST(1, LEAST(200, COALESCE(p_limit, 50)));
  v_offset := GREATEST(0, COALESCE(p_offset, 0));
  RETURN QUERY
    SELECT o.id, o.canal, o.template_chave, o.template_versao,
           o.attempts, o.max_attempts,
           left(COALESCE(o.error_code,''), 80),
           left(COALESCE(o.error_message,''), 500),
           o.recipient_user_id, o.recipient_cliente_id,
           o.created_at, o.updated_at
      FROM public.comunicacao_outbox o
     WHERE o.status = 'dead_letter'
     ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC
     LIMIT v_limit OFFSET v_offset;
END$fn$;
REVOKE ALL ON FUNCTION public.rpc_admin_list_communication_dead_letter(int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_list_communication_dead_letter(int,int) TO authenticated, service_role;

-- 4) Métricas agregadas do outbox (admin-only, sem PII/segredos).
CREATE OR REPLACE FUNCTION public.rpc_admin_communication_outbox_metrics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_by_status jsonb;
  v_by_canal jsonb;
  v_dlq_count bigint;
  v_pending_count bigint;
  v_last_dlq_at timestamptz;
  v_avg_attempts numeric;
  v_avg_latency_ms numeric;
BEGIN
  PERFORM public._comunicacao_require_admin();

  SELECT jsonb_object_agg(status, cnt) INTO v_by_status FROM (
    SELECT status::text AS status, count(*) AS cnt
      FROM public.comunicacao_outbox
     GROUP BY status
  ) s;

  SELECT jsonb_object_agg(canal, cnt) INTO v_by_canal FROM (
    SELECT canal::text AS canal, count(*) AS cnt
      FROM public.comunicacao_outbox
     GROUP BY canal
  ) c;

  SELECT count(*), max(updated_at) INTO v_dlq_count, v_last_dlq_at
    FROM public.comunicacao_outbox WHERE status = 'dead_letter';

  SELECT count(*) INTO v_pending_count
    FROM public.comunicacao_outbox WHERE status = 'pending';

  SELECT COALESCE(avg(attempts),0) INTO v_avg_attempts
    FROM public.comunicacao_outbox
   WHERE status IN ('sent','dead_letter');

  SELECT COALESCE(avg(EXTRACT(EPOCH FROM (sent_at - created_at)) * 1000), 0)
    INTO v_avg_latency_ms
    FROM public.comunicacao_outbox
   WHERE status = 'sent' AND sent_at IS NOT NULL;

  RETURN jsonb_build_object(
    'by_status', COALESCE(v_by_status, '{}'::jsonb),
    'by_canal', COALESCE(v_by_canal, '{}'::jsonb),
    'dead_letter_count', COALESCE(v_dlq_count, 0),
    'pending_count', COALESCE(v_pending_count, 0),
    'last_dead_letter_at', v_last_dlq_at,
    'avg_attempts_terminal', round(COALESCE(v_avg_attempts,0)::numeric, 2),
    'avg_latency_ms_sent', round(COALESCE(v_avg_latency_ms,0)::numeric, 0)
  );
END$fn$;
REVOKE ALL ON FUNCTION public.rpc_admin_communication_outbox_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_communication_outbox_metrics() TO authenticated, service_role;

-- 5) Replay de um único item de dead_letter (admin-only + audit).
CREATE OR REPLACE FUNCTION public.rpc_admin_replay_communication_dead_letter(
  p_outbox_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r public.comunicacao_outbox%rowtype; v_before jsonb; v_after jsonb;
BEGIN
  PERFORM public._comunicacao_require_admin();
  SELECT * INTO r FROM public.comunicacao_outbox WHERE id = p_outbox_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbox não encontrado'; END IF;
  IF r.status <> 'dead_letter' THEN
    RAISE EXCEPTION 'item não está em dead_letter (status=%)', r.status
      USING ERRCODE='invalid_parameter_value';
  END IF;
  v_before := jsonb_build_object(
    'status', r.status::text, 'attempts', r.attempts,
    'error_code', r.error_code, 'error_message', left(COALESCE(r.error_message,''),200)
  );
  UPDATE public.comunicacao_outbox
     SET status='pending',
         attempts=0,
         next_attempt_at=now(),
         error_code=NULL,
         error_message=NULL,
         locked_at=NULL, locked_by=NULL, lease_expires_at=NULL
   WHERE id = p_outbox_id;
  v_after := jsonb_build_object('status','pending','attempts',0);
  PERFORM public._comunicacao_write_audit(
    'outbox.dlq_replay', 'comunicacao_outbox', p_outbox_id, v_before, v_after
  );
  RETURN jsonb_build_object('ok',true,'id',p_outbox_id,'status','pending');
END$fn$;
REVOKE ALL ON FUNCTION public.rpc_admin_replay_communication_dead_letter(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_replay_communication_dead_letter(uuid) TO authenticated, service_role;

-- 6) Replay em lote — até 20 itens por chamada, SKIP LOCKED, audit por item.
CREATE OR REPLACE FUNCTION public.rpc_admin_replay_communication_dead_letter_batch(
  p_limit int DEFAULT 10
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_limit int;
  v_ids uuid[];
  v_id uuid;
  v_before jsonb;
  v_count int := 0;
BEGIN
  PERFORM public._comunicacao_require_admin();
  v_limit := GREATEST(1, LEAST(20, COALESCE(p_limit, 10)));
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id FROM public.comunicacao_outbox
     WHERE status='dead_letter'
     ORDER BY updated_at ASC NULLS FIRST, created_at ASC
     LIMIT v_limit FOR UPDATE SKIP LOCKED
  ) s;
  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('ok',true,'replayed',0,'ids','[]'::jsonb);
  END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT jsonb_build_object(
      'status', o.status::text, 'attempts', o.attempts,
      'error_code', o.error_code, 'error_message', left(COALESCE(o.error_message,''),200)
    ) INTO v_before FROM public.comunicacao_outbox o WHERE o.id = v_id;
    UPDATE public.comunicacao_outbox
       SET status='pending', attempts=0, next_attempt_at=now(),
           error_code=NULL, error_message=NULL,
           locked_at=NULL, locked_by=NULL, lease_expires_at=NULL
     WHERE id = v_id;
    PERFORM public._comunicacao_write_audit(
      'outbox.dlq_replay_batch', 'comunicacao_outbox', v_id, v_before,
      jsonb_build_object('status','pending','attempts',0)
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'replayed',v_count,'ids',to_jsonb(v_ids));
END$fn$;
REVOKE ALL ON FUNCTION public.rpc_admin_replay_communication_dead_letter_batch(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_replay_communication_dead_letter_batch(int) TO authenticated, service_role;

COMMIT;