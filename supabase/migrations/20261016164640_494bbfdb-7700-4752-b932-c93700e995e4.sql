-- lovable-cron-fallback-reviewed: owner-approved reviewed design; SQL-only no-op check each minute, HTTP only when gate open AND (queued work, expired lease or heartbeat older than 5 min); 1-minute delivery window required for assignment notices
DO $$ BEGIN
 IF to_regnamespace('cron') IS NULL OR to_regnamespace('net') IS NULL OR to_regclass('platform_private.tenant_smtp_dispatch_gate') IS NULL
 OR NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='tenant_smtp_lane_invoker_secret') THEN
  RAISE EXCEPTION 'TENANT_SMTP_LANE_INVOKER_PREREQ_MISSING';
 END IF;
END $$;
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_lane_invoke() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_secret text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_gate WHERE id AND approved) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_jobs WHERE state IN ('executing','authorized') AND lease_expires_at>clock_timestamp()) THEN RETURN; END IF;
 IF NOT (EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_jobs WHERE state='queued')
  OR EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_jobs WHERE state IN ('executing','authorized') AND lease_expires_at<=clock_timestamp())
  OR NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_lane_heartbeat WHERE id AND seen_at>clock_timestamp()-interval '5 minutes')) THEN RETURN; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('tenant_smtp_lane_invoke',0)) THEN RETURN; END IF;
 SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='tenant_smtp_lane_invoker_secret';
 IF v_secret IS NULL OR length(v_secret)<32 THEN RETURN; END IF;
 PERFORM net.http_post(url:='https://swzpzcwiasxmjutrmvkm.supabase.co/functions/v1/process-communication-outbox?lane=tenant_smtp',
  headers:=jsonb_build_object('Content-Type','application/json','x-tenant-smtp-secret',v_secret),body:='{}'::jsonb,timeout_milliseconds:=55000);
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_lane_invoke() FROM PUBLIC,anon,authenticated,service_role;
SELECT cron.schedule('tenant-smtp-lane','* * * * *','SELECT platform_private.tenant_smtp_lane_invoke();');