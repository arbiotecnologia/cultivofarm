-- REVIEW ONLY. Prove target swzpzcwiasxmjutrmvkm externally BEFORE execution.
-- Additive successor to diagnostics_closed + executor ACL. NEVER replay T1/F2/F3.
-- F4a/F4b: sender mailbox possession + tenant activation. Gate false.
-- dispatch_enabled stays false: the global worker remains NOTIF3-contained.
-- Codes: generated in the Edge executor; DB stores only salted SHA-256.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('platform_private.tenant_email_actor_org()') IS NULL
 OR to_regprocedure('platform_private.tenant_smtp_test_actor(uuid)') IS NULL
 OR to_regclass('platform_private.tenant_smtp_test_receipts') IS NULL
 OR to_regclass('platform_private.tenant_smtp_test_gate') IS NULL
 OR to_regnamespace('tenant_smtp_executor') IS NULL
 OR has_schema_privilege('service_role','platform_private','USAGE') THEN
  RAISE EXCEPTION 'SMTP_F4_PREFLIGHT_FAILED';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform_private.tenant_smtp_f4_gate(id boolean PRIMARY KEY DEFAULT true CHECK(id),approved boolean NOT NULL DEFAULT false);
REVOKE ALL ON platform_private.tenant_smtp_f4_gate FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.tenant_smtp_f4_gate ENABLE ROW LEVEL SECURITY;
INSERT INTO platform_private.tenant_smtp_f4_gate VALUES(true,false) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS platform_private.tenant_smtp_sender_challenges(
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id), actor_id uuid NOT NULL,
 version bigint NOT NULL, from_email text NOT NULL, request_key uuid NOT NULL, fence uuid NOT NULL, actor_iat bigint NOT NULL,
 state text NOT NULL CHECK(state IN ('claimed','executing','sent','ambiguous','failed','verified','invalidated','exhausted','expired')),
 code_salt text CHECK(code_salt IS NULL OR code_salt ~ '^[0-9a-f]{32}$'),
 code_hash text CHECK(code_hash IS NULL OR code_hash ~ '^[0-9a-f]{64}$'),
 attempts int NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz, closed_at timestamptz,
 UNIQUE(organization_id,actor_id,request_key)
);
REVOKE ALL ON platform_private.tenant_smtp_sender_challenges FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.tenant_smtp_sender_challenges ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS tenant_smtp_sender_challenges_org_created ON platform_private.tenant_smtp_sender_challenges(organization_id,created_at DESC);

CREATE TABLE IF NOT EXISTS platform_private.tenant_smtp_sender_verifications(
 organization_id uuid NOT NULL REFERENCES public.organizations(id), version bigint NOT NULL, from_email text NOT NULL,
 challenge_id uuid NOT NULL REFERENCES platform_private.tenant_smtp_sender_challenges(id), verified_by uuid NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(), invalidated_at timestamptz,
 PRIMARY KEY(organization_id,version)
);
REVOKE ALL ON platform_private.tenant_smtp_sender_verifications FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.tenant_smtp_sender_verifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS platform_private.tenant_smtp_activation(
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id), active boolean NOT NULL DEFAULT false,
 version bigint NOT NULL, from_email text NOT NULL, changed_by uuid, reason text NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON platform_private.tenant_smtp_activation FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.tenant_smtp_activation ENABLE ROW LEVEL SECURITY;

-- Shared actor guard: same Admin/tenant/ready contract as F2/F3; superadmin denied.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_f4_actor_org() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
 v_org:=platform_private.tenant_email_actor_org();
 IF v_org IS NULL OR platform_private.tenant_smtp_test_actor(auth.uid()) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN v_org;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_f4_actor_org() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_f4_verified(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.communication_tenant_email_settings s JOIN platform_private.tenant_smtp_sender_verifications v
  ON v.organization_id=s.organization_id AND v.version=s.version AND v.from_email=lower(s.config->>'from_email') AND v.invalidated_at IS NULL
  WHERE s.organization_id=p_org AND s.credential_configured)
$$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_f4_verified(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_f4_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; s public.communication_tenant_email_settings; c platform_private.tenant_smtp_sender_challenges; a platform_private.tenant_smtp_activation; v_verified boolean;
BEGIN
 v_org:=platform_private.tenant_smtp_f4_actor_org();
 SELECT * INTO s FROM public.communication_tenant_email_settings WHERE organization_id=v_org;
 v_verified:=platform_private.tenant_smtp_f4_verified(v_org);
 SELECT * INTO a FROM platform_private.tenant_smtp_activation WHERE organization_id=v_org;
 SELECT * INTO c FROM platform_private.tenant_smtp_sender_challenges WHERE organization_id=v_org AND actor_id=auth.uid() AND version=s.version ORDER BY created_at DESC LIMIT 1;
 RETURN jsonb_build_object('version',coalesce(s.version,0),'sender_verified',v_verified,
  'active',coalesce(a.active AND a.version=s.version AND a.from_email=lower(s.config->>'from_email') AND v_verified,false),
  'dispatch_enabled',false,
  'challenge',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,
   'state',CASE WHEN c.state IN ('sent','ambiguous') AND c.expires_at<clock_timestamp() THEN 'expired' ELSE c.state END,
   'expires_at',c.expires_at,'attempts_left',5-c.attempts) END);
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_f4_status() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_smtp_f4_status() TO authenticated;

-- Claim: CAS, gates, fresh connection PASS of same version, cooldown/day quota, one pending per tenant.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_sender_challenge_claim(p_version bigint,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; s public.communication_tenant_email_settings; c platform_private.tenant_smtp_sender_challenges; v_id uuid:=gen_random_uuid(); v_fence uuid:=gen_random_uuid();
BEGIN
 v_org:=platform_private.tenant_smtp_f4_actor_org();
 IF p_version IS NULL OR p_version<1 OR p_version>9007199254740991 OR p_key IS NULL THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 v_org:=platform_private.tenant_smtp_f4_actor_org();
 SELECT * INTO s FROM public.communication_tenant_email_settings WHERE organization_id=v_org FOR UPDATE;
 IF s.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
 SELECT * INTO c FROM platform_private.tenant_smtp_sender_challenges WHERE organization_id=v_org AND actor_id=auth.uid() AND request_key=p_key;
 IF FOUND THEN
  IF c.version<>p_version THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('replay',true,'challenge_id',c.id,'state',c.state,'version',c.version);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_f4_gate WHERE id AND approved) OR NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_gate WHERE id AND approved)
 OR s.config->>'port'<>'465' OR s.config->>'tls_mode'<>'implicit_tls' OR NOT s.credential_configured THEN RAISE EXCEPTION 'SMTP_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM platform_private.tenant_smtp_sender_challenges WHERE organization_id=v_org AND state IN ('claimed','executing'))
 OR EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_receipts WHERE organization_id=v_org AND state<>'complete') THEN RAISE EXCEPTION 'SMTP_BUSY' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM platform_private.tenant_smtp_sender_challenges WHERE organization_id=v_org AND created_at>clock_timestamp()-interval '60 seconds') THEN RAISE EXCEPTION 'SMTP_COOLDOWN' USING ERRCODE='40001'; END IF;
 IF (SELECT count(*) FROM platform_private.tenant_smtp_sender_challenges WHERE organization_id=v_org AND created_at>clock_timestamp()-interval '24 hours')>=5 THEN RAISE EXCEPTION 'SMTP_QUOTA' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_receipts WHERE organization_id=v_org AND actor_id=auth.uid() AND version=p_version
  AND mode='connection' AND code='smtp_connection_ok' AND state='complete' AND completed_at>clock_timestamp()-interval '10 minutes') THEN RAISE EXCEPTION 'SMTP_NOT_READY' USING ERRCODE='42501'; END IF;
 -- A new challenge supersedes every open one (single valid code per tenant).
 UPDATE platform_private.tenant_smtp_sender_challenges SET state='invalidated',code_hash=NULL,code_salt=NULL,closed_at=clock_timestamp()
  WHERE organization_id=v_org AND state IN ('sent','ambiguous');
 INSERT INTO platform_private.tenant_smtp_sender_challenges(id,organization_id,actor_id,version,from_email,request_key,fence,actor_iat,state)
 VALUES(v_id,v_org,auth.uid(),p_version,lower(s.config->>'from_email'),p_key,v_fence,coalesce((auth.jwt()->>'iat')::bigint,0),'claimed');
 INSERT INTO public.communication_tenant_email_audit(organization_id,actor_id,version,action) VALUES(v_org,auth.uid(),p_version,'sender_challenge_claimed');
 RETURN jsonb_build_object('replay',false,'challenge_id',v_id,'fence',v_fence);
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_sender_challenge_claim(bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_smtp_sender_challenge_claim(bigint,uuid) TO authenticated;

-- Executor-only (service_role via dedicated schema). Receives only salt+hash, never the code.
CREATE OR REPLACE FUNCTION tenant_smtp_executor.tenant_smtp_sender_challenge_prepare(p_challenge uuid,p_fence uuid,p_actor uuid,p_salt text,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c platform_private.tenant_smtp_sender_challenges; s public.communication_tenant_email_settings; v_password text;
BEGIN
 SELECT * INTO c FROM platform_private.tenant_smtp_sender_challenges WHERE id=p_challenge;
 IF c.id IS NULL THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c.organization_id::text,0));
 SELECT * INTO c FROM platform_private.tenant_smtp_sender_challenges WHERE id=p_challenge FOR UPDATE;
 IF c.actor_id IS DISTINCT FROM p_actor OR c.fence IS DISTINCT FROM p_fence OR c.state<>'claimed'
 OR platform_private.tenant_smtp_test_actor(p_actor) IS DISTINCT FROM c.organization_id THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF c.actor_iat<=0 OR EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_actor
  AND (i.access_operation_status='processing' OR (i.access_valid_after IS NOT NULL AND to_timestamp(c.actor_iat)<=i.access_valid_after))) THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_salt IS NULL OR p_salt !~ '^[0-9a-f]{32}$' OR p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.communication_tenant_email_settings WHERE organization_id=c.organization_id FOR UPDATE;
 IF s.version IS DISTINCT FROM c.version OR lower(s.config->>'from_email') IS DISTINCT FROM c.from_email THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_f4_gate WHERE id AND approved) OR NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_gate WHERE id AND approved)
 OR s.config->>'port'<>'465' OR s.config->>'tls_mode'<>'implicit_tls' OR c.created_at<clock_timestamp()-interval '30 seconds' THEN RAISE EXCEPTION 'SMTP_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 SELECT d.decrypted_secret INTO v_password FROM platform_private.communication_tenant_email_secret_refs t JOIN vault.decrypted_secrets d ON d.id=t.secret_id WHERE t.organization_id=c.organization_id;
 IF v_password IS NULL THEN RAISE EXCEPTION 'SMTP_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 UPDATE platform_private.tenant_smtp_sender_challenges SET state='executing',code_salt=p_salt,code_hash=p_hash,expires_at=clock_timestamp()+interval '15 minutes' WHERE id=p_challenge;
 RETURN jsonb_build_object('version',c.version,'recipient',c.from_email,'config',s.config,'password',v_password);
EXCEPTION WHEN SQLSTATE '42501' THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501';
 WHEN SQLSTATE '40001' THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001';
 WHEN SQLSTATE '22023' THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023';
 WHEN OTHERS THEN RAISE EXCEPTION 'SMTP_INTERNAL';
END $$;

CREATE OR REPLACE FUNCTION tenant_smtp_executor.tenant_smtp_sender_challenge_finish(p_challenge uuid,p_fence uuid,p_actor uuid,p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c platform_private.tenant_smtp_sender_challenges; v_state text;
BEGIN
 SELECT * INTO c FROM platform_private.tenant_smtp_sender_challenges WHERE id=p_challenge;
 IF c.id IS NULL THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c.organization_id::text,0));
 SELECT * INTO c FROM platform_private.tenant_smtp_sender_challenges WHERE id=p_challenge FOR UPDATE;
 IF c.actor_id IS DISTINCT FROM p_actor OR c.fence IS DISTINCT FROM p_fence THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_code IS NULL OR p_code NOT IN ('challenge_sent','challenge_ambiguous','challenge_failed') THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 v_state:=CASE p_code WHEN 'challenge_sent' THEN 'sent' WHEN 'challenge_ambiguous' THEN 'ambiguous' ELSE 'failed' END;
 IF c.state='executing' THEN
  -- Failed: discard hash; ambiguous: keep confirmable (code arrival proves possession), never auto-resend.
  UPDATE platform_private.tenant_smtp_sender_challenges SET state=v_state,
   code_hash=CASE WHEN v_state='failed' THEN NULL ELSE code_hash END, code_salt=CASE WHEN v_state='failed' THEN NULL ELSE code_salt END,
   closed_at=CASE WHEN v_state='failed' THEN clock_timestamp() END WHERE id=p_challenge;
  INSERT INTO public.communication_tenant_email_audit(organization_id,actor_id,version,action) VALUES(c.organization_id,p_actor,c.version,'sender_'||p_code);
 ELSIF c.state IS DISTINCT FROM v_state AND c.state NOT IN ('invalidated','verified','exhausted','expired') THEN
  RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001';
 END IF;
 RETURN jsonb_build_object('code',p_code,'version',c.version,'dispatch_enabled',false);
END $$;

REVOKE ALL ON FUNCTION tenant_smtp_executor.tenant_smtp_sender_challenge_prepare(uuid,uuid,uuid,text,text),tenant_smtp_executor.tenant_smtp_sender_challenge_finish(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION tenant_smtp_executor.tenant_smtp_sender_challenge_prepare(uuid,uuid,uuid,text,text),tenant_smtp_executor.tenant_smtp_sender_challenge_finish(uuid,uuid,uuid,text) TO service_role;

-- Confirmation: same Admin, same tenant/version/from; attempts persisted (no RAISE on mismatch).
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_sender_challenge_confirm(p_challenge uuid,p_version bigint,p_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; c platform_private.tenant_smtp_sender_challenges; s public.communication_tenant_email_settings; v_ok boolean;
BEGIN
 v_org:=platform_private.tenant_smtp_f4_actor_org();
 IF p_challenge IS NULL OR p_version IS NULL OR p_code IS NULL OR p_code !~ '^[0-9]{8}$' THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 SELECT * INTO c FROM platform_private.tenant_smtp_sender_challenges WHERE id=p_challenge AND organization_id=v_org AND actor_id=auth.uid() FOR UPDATE;
 IF c.id IS NULL OR c.state NOT IN ('sent','ambiguous') OR c.code_hash IS NULL THEN RETURN jsonb_build_object('code','SENDER_CHALLENGE_INVALID'); END IF;
 SELECT * INTO s FROM public.communication_tenant_email_settings WHERE organization_id=v_org FOR UPDATE;
 IF s.version IS DISTINCT FROM c.version OR p_version IS DISTINCT FROM c.version OR lower(s.config->>'from_email') IS DISTINCT FROM c.from_email THEN
  UPDATE platform_private.tenant_smtp_sender_challenges SET state='invalidated',code_hash=NULL,code_salt=NULL,closed_at=clock_timestamp() WHERE id=c.id;
  RETURN jsonb_build_object('code','SENDER_CHALLENGE_STALE');
 END IF;
 IF c.expires_at<clock_timestamp() THEN
  UPDATE platform_private.tenant_smtp_sender_challenges SET state='expired',code_hash=NULL,code_salt=NULL,closed_at=clock_timestamp() WHERE id=c.id;
  RETURN jsonb_build_object('code','SENDER_CHALLENGE_EXPIRED');
 END IF;
 v_ok:=encode(sha256(convert_to(c.code_salt||':'||c.id::text||':'||p_code,'UTF8')),'hex')=c.code_hash;
 IF v_ok THEN
  UPDATE platform_private.tenant_smtp_sender_challenges SET state='verified',attempts=attempts+1,code_hash=NULL,code_salt=NULL,closed_at=clock_timestamp() WHERE id=c.id;
  INSERT INTO platform_private.tenant_smtp_sender_verifications(organization_id,version,from_email,challenge_id,verified_by)
  VALUES(v_org,c.version,c.from_email,c.id,auth.uid())
  ON CONFLICT(organization_id,version) DO UPDATE SET from_email=EXCLUDED.from_email,challenge_id=EXCLUDED.challenge_id,verified_by=EXCLUDED.verified_by,verified_at=clock_timestamp(),invalidated_at=NULL;
  INSERT INTO public.communication_tenant_email_audit(organization_id,actor_id,version,action) VALUES(v_org,auth.uid(),c.version,'sender_verified');
  RETURN jsonb_build_object('code','SENDER_VERIFIED');
 END IF;
 IF c.attempts+1>=5 THEN
  UPDATE platform_private.tenant_smtp_sender_challenges SET state='exhausted',attempts=5,code_hash=NULL,code_salt=NULL,closed_at=clock_timestamp() WHERE id=c.id;
  INSERT INTO public.communication_tenant_email_audit(organization_id,actor_id,version,action) VALUES(v_org,auth.uid(),c.version,'sender_challenge_exhausted');
  RETURN jsonb_build_object('code','SENDER_CHALLENGE_EXHAUSTED');
 END IF;
 UPDATE platform_private.tenant_smtp_sender_challenges SET attempts=attempts+1 WHERE id=c.id;
 INSERT INTO public.communication_tenant_email_audit(organization_id,actor_id,version,action) VALUES(v_org,auth.uid(),c.version,'sender_challenge_mismatch');
 RETURN jsonb_build_object('code','SENDER_CHALLENGE_MISMATCH','attempts_left',4-c.attempts);
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_sender_challenge_confirm(uuid,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_smtp_sender_challenge_confirm(uuid,bigint,text) TO authenticated;

-- Activation: preconditions re-proven server-side; deactivation always allowed (safe state).
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_activation_set(p_version bigint,p_active boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; s public.communication_tenant_email_settings; a platform_private.tenant_smtp_activation;
BEGIN
 v_org:=platform_private.tenant_smtp_f4_actor_org();
 IF p_version IS NULL OR p_active IS NULL THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 SELECT * INTO s FROM public.communication_tenant_email_settings WHERE organization_id=v_org FOR UPDATE;
 IF s.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
 SELECT * INTO a FROM platform_private.tenant_smtp_activation WHERE organization_id=v_org FOR UPDATE;
 IF p_active THEN
  IF NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_f4_gate WHERE id AND approved) OR NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_gate WHERE id AND approved)
  OR s.config->>'port'<>'465' OR s.config->>'tls_mode'<>'implicit_tls' THEN RAISE EXCEPTION 'SMTP_UNAVAILABLE' USING ERRCODE='42501'; END IF;
  IF NOT platform_private.tenant_smtp_f4_verified(v_org)
  OR NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_receipts WHERE organization_id=v_org AND version=s.version AND mode='connection' AND code='smtp_connection_ok' AND state='complete')
  OR EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_receipts WHERE organization_id=v_org AND (state<>'complete' OR code='smtp_send_ambiguous'))
  THEN RAISE EXCEPTION 'SMTP_NOT_READY' USING ERRCODE='42501'; END IF;
 END IF;
 IF a.organization_id IS NULL OR a.active IS DISTINCT FROM p_active OR a.version<>s.version THEN
  INSERT INTO platform_private.tenant_smtp_activation(organization_id,active,version,from_email,changed_by,reason)
  VALUES(v_org,p_active,s.version,lower(s.config->>'from_email'),auth.uid(),CASE WHEN p_active THEN 'admin_activated' ELSE 'admin_paused' END)
  ON CONFLICT(organization_id) DO UPDATE SET active=EXCLUDED.active,version=EXCLUDED.version,from_email=EXCLUDED.from_email,changed_by=EXCLUDED.changed_by,reason=EXCLUDED.reason,changed_at=clock_timestamp();
  INSERT INTO public.communication_tenant_email_audit(organization_id,actor_id,version,action) VALUES(v_org,auth.uid(),s.version,CASE WHEN p_active THEN 'tenant_smtp_activated' ELSE 'tenant_smtp_paused' END);
 END IF;
 RETURN platform_private.tenant_smtp_f4_status();
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_activation_set(bigint,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_smtp_activation_set(bigint,boolean) TO authenticated;

-- Any save/rotation (version bump) invalidates verification, open codes and activation.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_f4_invalidate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.version IS DISTINCT FROM OLD.version OR NEW.config IS DISTINCT FROM OLD.config OR NEW.credential_configured IS DISTINCT FROM OLD.credential_configured THEN
  UPDATE platform_private.tenant_smtp_sender_verifications SET invalidated_at=clock_timestamp() WHERE organization_id=NEW.organization_id AND invalidated_at IS NULL;
  UPDATE platform_private.tenant_smtp_sender_challenges SET state='invalidated',code_hash=NULL,code_salt=NULL,closed_at=clock_timestamp()
   WHERE organization_id=NEW.organization_id AND state IN ('claimed','sent','ambiguous');
  UPDATE platform_private.tenant_smtp_activation SET active=false,reason='config_changed',changed_by=auth.uid(),changed_at=clock_timestamp()
   WHERE organization_id=NEW.organization_id AND active;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_f4_invalidate() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS tenant_smtp_f4_invalidate ON public.communication_tenant_email_settings;
CREATE TRIGGER tenant_smtp_f4_invalidate AFTER UPDATE ON public.communication_tenant_email_settings
 FOR EACH ROW EXECUTE FUNCTION platform_private.tenant_smtp_f4_invalidate();

-- Future worker precondition (read-only, no secret). Not wired: NOTIF3 containment kept.
CREATE OR REPLACE FUNCTION tenant_smtp_executor.tenant_smtp_dispatch_ready(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_activation a JOIN public.communication_tenant_email_settings s ON s.organization_id=a.organization_id
  WHERE a.organization_id=p_org AND a.active AND a.version=s.version AND a.from_email=lower(s.config->>'from_email'))
  AND platform_private.tenant_smtp_f4_verified(p_org)
  AND EXISTS(SELECT 1 FROM platform_private.tenant_smtp_f4_gate WHERE id AND approved)
$$;
REVOKE ALL ON FUNCTION tenant_smtp_executor.tenant_smtp_dispatch_ready(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION tenant_smtp_executor.tenant_smtp_dispatch_ready(uuid) TO service_role;

-- Public INVOKER wrappers (PostgREST surface).
CREATE OR REPLACE FUNCTION public.tenant_smtp_f4_status() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.tenant_smtp_f4_status() $$;
CREATE OR REPLACE FUNCTION public.tenant_smtp_sender_challenge_claim(p_version bigint,p_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.tenant_smtp_sender_challenge_claim(p_version,p_key) $$;
CREATE OR REPLACE FUNCTION public.tenant_smtp_sender_challenge_confirm(p_challenge uuid,p_version bigint,p_code text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.tenant_smtp_sender_challenge_confirm(p_challenge,p_version,p_code) $$;
CREATE OR REPLACE FUNCTION public.tenant_smtp_activation_set(p_version bigint,p_active boolean) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.tenant_smtp_activation_set(p_version,p_active) $$;
REVOKE ALL ON FUNCTION public.tenant_smtp_f4_status(),public.tenant_smtp_sender_challenge_claim(bigint,uuid),public.tenant_smtp_sender_challenge_confirm(uuid,bigint,text),public.tenant_smtp_activation_set(bigint,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_smtp_f4_status(),public.tenant_smtp_sender_challenge_claim(bigint,uuid),public.tenant_smtp_sender_challenge_confirm(uuid,bigint,text),public.tenant_smtp_activation_set(bigint,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.tenant_smtp_sender_challenge_prepare(p_challenge uuid,p_fence uuid,p_actor uuid,p_salt text,p_hash text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT tenant_smtp_executor.tenant_smtp_sender_challenge_prepare(p_challenge,p_fence,p_actor,p_salt,p_hash) $$;
CREATE OR REPLACE FUNCTION public.tenant_smtp_sender_challenge_finish(p_challenge uuid,p_fence uuid,p_actor uuid,p_code text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT tenant_smtp_executor.tenant_smtp_sender_challenge_finish(p_challenge,p_fence,p_actor,p_code) $$;
REVOKE ALL ON FUNCTION public.tenant_smtp_sender_challenge_prepare(uuid,uuid,uuid,text,text),public.tenant_smtp_sender_challenge_finish(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_smtp_sender_challenge_prepare(uuid,uuid,uuid,text,text),public.tenant_smtp_sender_challenge_finish(uuid,uuid,uuid,text) TO service_role;
COMMIT;
