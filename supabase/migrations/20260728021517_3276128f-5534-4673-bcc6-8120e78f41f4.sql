-- Gate 6 · Observabilidade final + hardening DLQ replay
-- Staging ikaauvsflpmamgxmkhoq; produção proibida.

-- 1. Tabela de auditoria/rate-limit de replays de DLQ (id, actor, escopo, timestamp).
CREATE TABLE IF NOT EXISTS public.comunicacao_dlq_replay_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid NOT NULL,
  scope        text NOT NULL CHECK (scope IN ('unit','batch')),
  target_id    uuid,
  batch_size   int,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.comunicacao_dlq_replay_audit TO authenticated;
GRANT ALL ON public.comunicacao_dlq_replay_audit TO service_role;

ALTER TABLE public.comunicacao_dlq_replay_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dlq_replay_audit_admin_select" ON public.comunicacao_dlq_replay_audit;
CREATE POLICY "dlq_replay_audit_admin_select" ON public.comunicacao_dlq_replay_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

-- Trigger fail-closed: writes apenas via SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.comunicacao_dlq_replay_audit_no_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' OR current_user IN ('postgres','supabase_admin') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'writes proibidos fora dos helpers SECURITY DEFINER' USING ERRCODE='42501';
END;$$;

DROP TRIGGER IF EXISTS trg_dlq_replay_audit_no_mut ON public.comunicacao_dlq_replay_audit;
CREATE TRIGGER trg_dlq_replay_audit_no_mut
  BEFORE INSERT OR UPDATE OR DELETE ON public.comunicacao_dlq_replay_audit
  FOR EACH ROW EXECUTE FUNCTION public.comunicacao_dlq_replay_audit_no_mutation();

-- 2. Helper de rate-limit (verifica último minuto do actor).
CREATE OR REPLACE FUNCTION public._comunicacao_dlq_replay_rate_check(
  p_scope text,
  p_max_per_minute int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor uuid; v_cnt int;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'sem contexto de usuário' USING ERRCODE='42501';
  END IF;
  SELECT count(*) INTO v_cnt
    FROM public.comunicacao_dlq_replay_audit
   WHERE actor_id = v_actor
     AND scope = p_scope
     AND created_at > now() - interval '1 minute';
  IF v_cnt >= p_max_per_minute THEN
    RAISE EXCEPTION 'rate_limited: replay % excede % por minuto', p_scope, p_max_per_minute
      USING ERRCODE='53400';
  END IF;
END;$$;

REVOKE ALL ON FUNCTION public._comunicacao_dlq_replay_rate_check(text,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._comunicacao_dlq_replay_rate_check(text,int) TO service_role;

-- 3. Rewrap dos RPCs de replay com rate-limit + trilha de auditoria dedicada.
CREATE OR REPLACE FUNCTION public.rpc_admin_replay_communication_dead_letter(p_outbox_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.comunicacao_outbox%rowtype; v_before jsonb; v_after jsonb;
BEGIN
  PERFORM public._comunicacao_require_admin();
  PERFORM public._comunicacao_dlq_replay_rate_check('unit', 30);

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
     SET status='pending', attempts=0, next_attempt_at=now(),
         error_code=NULL, error_message=NULL,
         locked_at=NULL, locked_by=NULL, lease_expires_at=NULL
   WHERE id = p_outbox_id;
  v_after := jsonb_build_object('status','pending','attempts',0);

  INSERT INTO public.comunicacao_dlq_replay_audit(actor_id, scope, target_id)
    VALUES (auth.uid(), 'unit', p_outbox_id);

  PERFORM public._comunicacao_write_audit(
    'outbox.dlq_replay', 'comunicacao_outbox', p_outbox_id, v_before, v_after
  );
  RETURN jsonb_build_object('ok',true,'id',p_outbox_id,'status','pending');
END;$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_replay_communication_dead_letter_batch(p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_limit int; v_ids uuid[]; v_id uuid; v_before jsonb; v_count int := 0;
BEGIN
  PERFORM public._comunicacao_require_admin();
  PERFORM public._comunicacao_dlq_replay_rate_check('batch', 6);

  v_limit := GREATEST(1, LEAST(20, COALESCE(p_limit, 10)));
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id FROM public.comunicacao_outbox
     WHERE status='dead_letter'
     ORDER BY updated_at ASC NULLS FIRST, created_at ASC
     LIMIT v_limit FOR UPDATE SKIP LOCKED
  ) s;
  IF v_ids IS NULL THEN
    INSERT INTO public.comunicacao_dlq_replay_audit(actor_id, scope, batch_size)
      VALUES (auth.uid(), 'batch', 0);
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

  INSERT INTO public.comunicacao_dlq_replay_audit(actor_id, scope, batch_size)
    VALUES (auth.uid(), 'batch', v_count);

  RETURN jsonb_build_object('ok',true,'replayed',v_count,'ids',to_jsonb(v_ids));
END;$$;

-- 4. Health snapshot consolidado (admin-only, sem PII/secrets).
CREATE OR REPLACE FUNCTION public.rpc_admin_communication_health_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_by_status jsonb;
  v_by_canal jsonb;
  v_pending int;
  v_dlq int;
  v_oldest_pending_age_s int;
  v_oldest_locked_age_s int;
  v_success_24h int;
  v_failed_24h int;
  v_success_rate numeric;
  v_realtime_ready boolean;
  v_last_replay_at timestamptz;
BEGIN
  PERFORM public._comunicacao_require_admin();

  SELECT jsonb_object_agg(status,cnt) INTO v_by_status
    FROM (SELECT status::text AS status, count(*) AS cnt
            FROM public.comunicacao_outbox GROUP BY status) s;

  SELECT jsonb_object_agg(canal,cnt) INTO v_by_canal
    FROM (SELECT canal::text AS canal, count(*) AS cnt
            FROM public.comunicacao_outbox GROUP BY canal) c;

  SELECT count(*) INTO v_pending FROM public.comunicacao_outbox WHERE status='pending';
  SELECT count(*) INTO v_dlq FROM public.comunicacao_outbox WHERE status='dead_letter';

  SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(created_at)))::int, 0)
    INTO v_oldest_pending_age_s
    FROM public.comunicacao_outbox WHERE status='pending';

  SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(locked_at)))::int, 0)
    INTO v_oldest_locked_age_s
    FROM public.comunicacao_outbox WHERE status='processing' AND locked_at IS NOT NULL;

  SELECT count(*) INTO v_success_24h
    FROM public.comunicacao_outbox
   WHERE status='sent' AND sent_at > now() - interval '24 hours';
  SELECT count(*) INTO v_failed_24h
    FROM public.comunicacao_outbox
   WHERE status IN ('failed','dead_letter') AND updated_at > now() - interval '24 hours';

  v_success_rate := CASE WHEN (v_success_24h + v_failed_24h) = 0 THEN NULL
                         ELSE round(v_success_24h::numeric / (v_success_24h + v_failed_24h) * 100, 2) END;

  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime'
       AND schemaname='public'
       AND tablename IN ('notificacoes_operacionais','portal_notificacoes')
    HAVING count(*) >= 2
  ) INTO v_realtime_ready;

  SELECT max(created_at) INTO v_last_replay_at
    FROM public.comunicacao_dlq_replay_audit;

  RETURN jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'queue', jsonb_build_object(
      'by_status', COALESCE(v_by_status,'{}'::jsonb),
      'by_canal',  COALESCE(v_by_canal,'{}'::jsonb),
      'pending', v_pending,
      'dead_letter', v_dlq,
      'oldest_pending_age_seconds', v_oldest_pending_age_s,
      'oldest_processing_age_seconds', v_oldest_locked_age_s
    ),
    'throughput_24h', jsonb_build_object(
      'sent', v_success_24h,
      'failed_or_dlq', v_failed_24h,
      'success_rate_pct', v_success_rate
    ),
    'realtime', jsonb_build_object('ready', COALESCE(v_realtime_ready, false)),
    'dlq_admin', jsonb_build_object('last_replay_at', v_last_replay_at)
  );
END;$$;

REVOKE ALL ON FUNCTION public.rpc_admin_communication_health_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_communication_health_snapshot() TO authenticated;
GRANT ALL ON FUNCTION public.rpc_admin_communication_health_snapshot() TO service_role;

REVOKE ALL ON FUNCTION public.rpc_admin_replay_communication_dead_letter(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_replay_communication_dead_letter(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_admin_replay_communication_dead_letter_batch(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_replay_communication_dead_letter_batch(int) TO authenticated;