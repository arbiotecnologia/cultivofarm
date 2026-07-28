CREATE OR REPLACE FUNCTION public.rpc_admin_communication_health_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_by_status jsonb;
  v_by_canal jsonb;
  v_by_event jsonb;
  v_by_canal_status jsonb;
  v_pending int;
  v_dlq int;
  v_processing int;
  v_oldest_pending_age_s int;
  v_oldest_locked_age_s int;
  v_success_24h int;
  v_failed_24h int;
  v_success_rate numeric;
  v_avg_attempts_sent numeric;
  v_avg_attempts_terminal numeric;
  v_max_attempts int;
  v_avg_latency_ms numeric;
  v_p95_latency_ms numeric;
  v_realtime_ready boolean;
  v_last_replay_at timestamptz;
  v_last_worker_activity timestamptz;
  v_last_sent_at timestamptz;
  v_worker_status text;
  v_worker_age_s int;
  v_flag_delivery boolean;
  v_flag_email boolean;
  v_flag_wa boolean;
  v_flag_inapp boolean;
  v_flag_webhook boolean;
  v_flag_test_mode boolean;
  v_prov_email jsonb;
  v_prov_wa jsonb;
  v_prov jsonb;
BEGIN
  PERFORM public._comunicacao_require_admin();

  SELECT jsonb_object_agg(status,cnt) INTO v_by_status
    FROM (SELECT status::text AS status, count(*) AS cnt
            FROM public.comunicacao_outbox GROUP BY status) s;

  SELECT jsonb_object_agg(canal,cnt) INTO v_by_canal
    FROM (SELECT canal::text AS canal, count(*) AS cnt
            FROM public.comunicacao_outbox GROUP BY canal) c;

  SELECT jsonb_object_agg(event_key, stats) INTO v_by_event
  FROM (
    SELECT e.event_key AS event_key,
           jsonb_build_object(
             'total', count(*),
             'sent', count(*) FILTER (WHERE o.status='sent'),
             'pending', count(*) FILTER (WHERE o.status='pending'),
             'failed', count(*) FILTER (WHERE o.status='failed'),
             'dead_letter', count(*) FILTER (WHERE o.status='dead_letter')
           ) AS stats
      FROM public.comunicacao_outbox o
      JOIN public.comunicacao_eventos e ON e.id = o.event_id
     WHERE o.created_at > now() - interval '7 days'
     GROUP BY e.event_key
  ) x;

  SELECT jsonb_object_agg(key, cnt) INTO v_by_canal_status
  FROM (
    SELECT (canal::text || '.' || status::text) AS key, count(*) AS cnt
      FROM public.comunicacao_outbox
     WHERE created_at > now() - interval '7 days'
     GROUP BY 1
  ) y;

  SELECT count(*) INTO v_pending FROM public.comunicacao_outbox WHERE status='pending';
  SELECT count(*) INTO v_dlq FROM public.comunicacao_outbox WHERE status='dead_letter';
  SELECT count(*) INTO v_processing FROM public.comunicacao_outbox WHERE status='processing';

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

  SELECT round(avg(attempts)::numeric, 2), max(attempts)
    INTO v_avg_attempts_sent, v_max_attempts
    FROM public.comunicacao_outbox
   WHERE status='sent' AND sent_at > now() - interval '24 hours';

  SELECT round(avg(attempts)::numeric, 2)
    INTO v_avg_attempts_terminal
    FROM public.comunicacao_outbox
   WHERE status IN ('failed','dead_letter') AND updated_at > now() - interval '24 hours';

  SELECT round(avg(EXTRACT(EPOCH FROM (sent_at - created_at))*1000)::numeric, 0),
         round((percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (sent_at - created_at))*1000))::numeric, 0)
    INTO v_avg_latency_ms, v_p95_latency_ms
    FROM public.comunicacao_outbox
   WHERE status='sent' AND sent_at > now() - interval '24 hours' AND sent_at IS NOT NULL;

  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime'
       AND schemaname='public'
       AND tablename IN ('notificacoes_operacionais','portal_notificacoes')
    HAVING count(*) >= 2
  ) INTO v_realtime_ready;

  SELECT max(created_at) INTO v_last_replay_at
    FROM public.comunicacao_dlq_replay_audit;

  SELECT GREATEST(
    COALESCE((SELECT max(locked_at) FROM public.comunicacao_outbox WHERE locked_at IS NOT NULL), 'epoch'),
    COALESCE((SELECT max(sent_at)   FROM public.comunicacao_outbox WHERE sent_at   IS NOT NULL), 'epoch'),
    COALESCE((SELECT max(updated_at) FROM public.comunicacao_outbox
               WHERE status IN ('failed','dead_letter','processing','sent')), 'epoch')
  ) INTO v_last_worker_activity;

  IF v_last_worker_activity IS NULL OR v_last_worker_activity = 'epoch'::timestamptz THEN
    v_worker_status := 'unknown';
    v_worker_age_s := NULL;
    v_last_worker_activity := NULL;
  ELSE
    v_worker_age_s := EXTRACT(EPOCH FROM (now() - v_last_worker_activity))::int;
    v_worker_status := CASE
      WHEN v_worker_age_s <= 300 THEN 'active'
      WHEN v_worker_age_s <= 1800 THEN 'idle'
      ELSE 'stale'
    END;
  END IF;

  SELECT max(sent_at) INTO v_last_sent_at FROM public.comunicacao_outbox WHERE sent_at IS NOT NULL;

  SELECT
    COALESCE(delivery_enabled, false),
    COALESCE(email_delivery_enabled, false),
    COALESCE(whatsapp_delivery_enabled, false),
    COALESCE(inapp_delivery_enabled, false),
    COALESCE(whatsapp_webhook_enabled, false),
    COALESCE(test_mode_enabled, false)
  INTO v_flag_delivery, v_flag_email, v_flag_wa, v_flag_inapp, v_flag_webhook, v_flag_test_mode
  FROM public.communication_provider_settings
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;

  IF v_flag_delivery IS NULL THEN v_flag_delivery := false; END IF;
  IF v_flag_email IS NULL THEN v_flag_email := false; END IF;
  IF v_flag_wa IS NULL THEN v_flag_wa := false; END IF;
  IF v_flag_inapp IS NULL THEN v_flag_inapp := false; END IF;
  IF v_flag_webhook IS NULL THEN v_flag_webhook := false; END IF;
  IF v_flag_test_mode IS NULL THEN v_flag_test_mode := false; END IF;

  SELECT jsonb_build_object(
           'configured', (smtp_host IS NOT NULL AND smtp_from IS NOT NULL AND secret_smtp_password IS NOT NULL),
           'enabled', COALESCE(email_delivery_enabled, false)
         )
    INTO v_prov_email
    FROM public.communication_provider_settings
    ORDER BY updated_at DESC NULLS LAST LIMIT 1;

  SELECT jsonb_build_object(
           'configured', (whatsapp_phone_number_id IS NOT NULL AND secret_whatsapp_access_token IS NOT NULL),
           'enabled', COALESCE(whatsapp_delivery_enabled, false),
           'webhook_configured', (secret_whatsapp_verify_token IS NOT NULL AND secret_whatsapp_app_secret IS NOT NULL),
           'webhook_enabled', COALESCE(whatsapp_webhook_enabled, false)
         )
    INTO v_prov_wa
    FROM public.communication_provider_settings
    ORDER BY updated_at DESC NULLS LAST LIMIT 1;

  v_prov := jsonb_build_object(
    'email', COALESCE(v_prov_email, jsonb_build_object('configured', false, 'enabled', false)),
    'whatsapp', COALESCE(v_prov_wa, jsonb_build_object('configured', false, 'enabled', false, 'webhook_configured', false, 'webhook_enabled', false)),
    'in_app', jsonb_build_object('configured', true, 'enabled', v_flag_inapp)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'flags', jsonb_build_object(
      'delivery_enabled', v_flag_delivery,
      'email_enabled', v_flag_email,
      'whatsapp_enabled', v_flag_wa,
      'in_app_enabled', v_flag_inapp,
      'whatsapp_webhook_enabled', v_flag_webhook,
      'test_mode_enabled', v_flag_test_mode
    ),
    'providers', v_prov,
    'queue', jsonb_build_object(
      'by_status', COALESCE(v_by_status,'{}'::jsonb),
      'by_canal',  COALESCE(v_by_canal,'{}'::jsonb),
      'by_event_key_7d', COALESCE(v_by_event,'{}'::jsonb),
      'by_canal_status_7d', COALESCE(v_by_canal_status,'{}'::jsonb),
      'pending', v_pending,
      'processing', v_processing,
      'dead_letter', v_dlq,
      'oldest_pending_age_seconds', v_oldest_pending_age_s,
      'oldest_processing_age_seconds', v_oldest_locked_age_s
    ),
    'throughput_24h', jsonb_build_object(
      'sent', v_success_24h,
      'failed_or_dlq', v_failed_24h,
      'success_rate_pct', v_success_rate,
      'avg_attempts_sent', v_avg_attempts_sent,
      'avg_attempts_terminal', v_avg_attempts_terminal,
      'max_attempts', v_max_attempts,
      'avg_latency_ms', v_avg_latency_ms,
      'p95_latency_ms', v_p95_latency_ms
    ),
    'worker', jsonb_build_object(
      'status', v_worker_status,
      'last_activity_at', v_last_worker_activity,
      'last_activity_age_seconds', v_worker_age_s,
      'last_sent_at', v_last_sent_at
    ),
    'realtime', jsonb_build_object('ready', COALESCE(v_realtime_ready, false)),
    'dlq_admin', jsonb_build_object('last_replay_at', v_last_replay_at)
  );
END;$function$;

REVOKE ALL ON FUNCTION public.rpc_admin_communication_health_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_admin_communication_health_snapshot() TO authenticated, service_role;