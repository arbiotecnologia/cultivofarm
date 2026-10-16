CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_lane_invoke() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_secret text; v_header text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_gate WHERE id AND approved) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_jobs WHERE state IN ('executing','authorized') AND lease_expires_at>clock_timestamp()) THEN RETURN; END IF;
 IF NOT (EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_jobs WHERE state='queued')
  OR EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_jobs WHERE state IN ('executing','authorized') AND lease_expires_at<=clock_timestamp())
  OR NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_lane_heartbeat WHERE id AND seen_at>clock_timestamp()-interval '5 minutes')) THEN RETURN; END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('tenant_smtp_lane_invoke',0)) THEN RETURN; END IF;
 SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='tenant_smtp_lane_invoker_secret';
 IF v_secret IS NULL OR length(v_secret)<32 THEN RETURN; END IF;
 -- Transport v1: ASCII header 'b64u1.' || base64url(UTF-8), no padding/CR/LF; computed in memory, never stored/logged.
 v_header:='b64u1.'||rtrim(translate(replace(replace(encode(convert_to(v_secret,'UTF8'),'base64'),E'\n',''),E'\r',''),'+/','-_'),'=');
 PERFORM net.http_post(url:='https://swzpzcwiasxmjutrmvkm.supabase.co/functions/v1/process-communication-outbox?lane=tenant_smtp',
  headers:=jsonb_build_object('Content-Type','application/json','x-tenant-smtp-secret',v_header),body:='{}'::jsonb,timeout_milliseconds:=55000);
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_lane_invoke() FROM PUBLIC,anon,authenticated,service_role;