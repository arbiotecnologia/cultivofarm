-- REVIEW ONLY. Prove target swzpzcwiasxmjutrmvkm externally BEFORE execution.
-- Additive delta; NEVER reapply T1. Gate false; preserves global containment.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('platform_private.tenant_email_actor_org()') IS NULL
 OR to_regprocedure('platform_private.notification_outbox_closed()') IS NULL
 OR to_regclass('public.comunicacao_outbox') IS NULL THEN RAISE EXCEPTION 'SMTP_UNAVAILABLE'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS platform_private.tenant_smtp_test_gate(id boolean PRIMARY KEY DEFAULT true,approved boolean NOT NULL DEFAULT false);
REVOKE ALL ON platform_private.tenant_smtp_test_gate FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.tenant_smtp_test_gate ENABLE ROW LEVEL SECURITY;
INSERT INTO platform_private.tenant_smtp_test_gate VALUES(true,false) ON CONFLICT DO NOTHING;
-- Receipts/authority ONLY: all actual jobs remain in existing comunicacao_outbox.
CREATE TABLE IF NOT EXISTS platform_private.tenant_smtp_test_receipts(
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations(id), actor_id uuid NOT NULL,
 version bigint NOT NULL, actor_iat bigint NOT NULL, mode text NOT NULL CHECK(mode IN ('connection','send')), request_key uuid NOT NULL,
 fence uuid NOT NULL, outbox_id uuid NOT NULL UNIQUE REFERENCES public.comunicacao_outbox(id),
 state text NOT NULL CHECK(state IN ('claimed','executing','complete')), code text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz,
 UNIQUE(organization_id,actor_id,request_key)
);
REVOKE ALL ON platform_private.tenant_smtp_test_receipts FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.tenant_smtp_test_receipts ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS platform_private.tenant_smtp_test_insert_tickets(outbox_id uuid PRIMARY KEY,tx bigint NOT NULL,actor_id uuid NOT NULL,organization_id uuid NOT NULL);
REVOKE ALL ON platform_private.tenant_smtp_test_insert_tickets FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.tenant_smtp_test_insert_tickets ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_test_actor(p_actor uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid;
BEGIN
 IF p_actor IS NULL OR public.is_platform_superadmin(p_actor) OR public.has_role(p_actor,'administrador') IS DISTINCT FROM true
 OR platform_private.platform_actor_access_ready(p_actor) IS DISTINCT FROM true THEN RETURN NULL; END IF;
 SELECT p.organization_id INTO v_org FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id
 JOIN auth.users u ON u.id=p.user_id WHERE p.user_id=p_actor AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE
 AND o.ativo IS TRUE AND u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL;
 RETURN v_org;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_test_actor(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_test_context() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_version bigint;
BEGIN
 v_org:=platform_private.tenant_email_actor_org();
 IF v_org IS NULL OR platform_private.tenant_smtp_test_actor(auth.uid()) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT version INTO v_version FROM public.communication_tenant_email_settings WHERE organization_id=v_org;
 RETURN jsonb_build_object('actor',auth.uid(),'organization',v_org,'version',v_version);
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_test_context() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_smtp_test_context() TO authenticated;
CREATE OR REPLACE FUNCTION public.tenant_smtp_test_context() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.tenant_smtp_test_context() $$;
REVOKE ALL ON FUNCTION public.tenant_smtp_test_context() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_smtp_test_context() TO authenticated;
-- Preserve NULL for every legacy/unproven insert. No GUC authorization.
CREATE OR REPLACE FUNCTION platform_private.notification_outbox_closed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.template_chave='tenant_smtp_diagnostic_v1' AND NEW.status='processing' AND NEW.max_attempts=1 AND NEW.lease_expires_at IS NULL
 AND NEW.attempts=1 AND NEW.canal='email' AND NEW.recipient_cliente_id IS NULL AND NEW.recipient_hash IS NULL
 AND EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_insert_tickets t
 JOIN public.comunicacao_eventos e ON e.id=NEW.event_id
 WHERE t.outbox_id=NEW.id AND t.tx=txid_current() AND NEW.recipient_user_id=t.actor_id
 AND platform_private.tenant_smtp_test_actor(t.actor_id)=t.organization_id
 AND e.source_type='tenant_smtp_diagnostic_v1' AND e.source_id=t.organization_id AND e.created_by=t.actor_id
 AND e.event_key='tenant.smtp.diagnostic' AND e.status='processed') THEN RETURN NEW; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION platform_private.notification_outbox_closed() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.notification_outbox_closed() TO service_role;
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_test_claim(p_mode text,p_version bigint,p_key uuid,p_confirm boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; r platform_private.tenant_smtp_test_receipts; s public.communication_tenant_email_settings;
 v_id uuid:=gen_random_uuid(); v_out uuid:=gen_random_uuid(); v_event uuid:=gen_random_uuid(); v_fence uuid:=gen_random_uuid(); v_key text;
BEGIN
 v_org:=platform_private.tenant_email_actor_org();
 IF v_org IS NULL OR platform_private.tenant_smtp_test_actor(auth.uid()) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('connection','send') OR p_version IS NULL OR p_version<1 OR p_version>9007199254740991 OR p_key IS NULL
 OR (p_mode='send' AND p_confirm IS DISTINCT FROM true) THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 IF platform_private.tenant_email_actor_org() IS DISTINCT FROM v_org OR platform_private.tenant_smtp_test_actor(auth.uid()) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.communication_tenant_email_settings WHERE organization_id=v_org FOR UPDATE;
 IF s.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_gate WHERE approved AND id)
 OR s.config->>'port'<>'465' OR s.config->>'tls_mode'<>'implicit_tls' OR NOT s.credential_configured THEN RAISE EXCEPTION 'SMTP_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM platform_private.tenant_smtp_test_receipts WHERE organization_id=v_org AND actor_id=auth.uid() AND request_key=p_key;
 IF FOUND THEN
  IF r.version<>p_version OR r.mode<>p_mode THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('replay',true,'code',coalesce(r.code,'SMTP_BUSY'),'version',r.version,'mode',r.mode,'dispatch_enabled',false,'sender_verified',false);
 END IF;
 -- Any abandoned/uncertain send blocks ALL future sends, even after version rotation.
 IF EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_receipts WHERE organization_id=v_org AND
 (state<>'complete' OR (p_mode='send' AND mode='send' AND code='smtp_send_ambiguous'))) THEN RAISE EXCEPTION 'SMTP_BUSY' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_receipts WHERE organization_id=v_org AND created_at>clock_timestamp()-interval '60 seconds') THEN RAISE EXCEPTION 'SMTP_COOLDOWN' USING ERRCODE='40001'; END IF;
 IF p_mode='send' AND NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_receipts WHERE organization_id=v_org AND actor_id=auth.uid()
 AND version=p_version AND mode='connection' AND code='smtp_connection_ok' AND state='complete' AND completed_at>clock_timestamp()-interval '5 minutes') THEN RAISE EXCEPTION 'SMTP_NOT_READY' USING ERRCODE='42501'; END IF;
 v_key:='tenant-smtp:'||v_org||':'||auth.uid()||':'||p_key;
 INSERT INTO public.comunicacao_eventos(id,event_key,source_type,source_id,created_by,idempotency_key,status,processed_at,payload)
 VALUES(v_event,'tenant.smtp.diagnostic','tenant_smtp_diagnostic_v1',v_org,auth.uid(),v_key,'processed',clock_timestamp(),'{}');
 INSERT INTO platform_private.tenant_smtp_test_insert_tickets VALUES(v_out,txid_current(),auth.uid(),v_org);
 INSERT INTO public.comunicacao_outbox(id,event_id,template_chave,template_versao,template_snapshot,canal,recipient_user_id,status,attempts,max_attempts,locked_by,lease_expires_at,idempotency_key)
 VALUES(v_out,v_event,'tenant_smtp_diagnostic_v1',1,'{}','email',auth.uid(),'processing',1,1,'tenant-smtp-test',NULL,v_key);
 IF NOT EXISTS(SELECT 1 FROM public.comunicacao_outbox WHERE id=v_out) THEN RAISE EXCEPTION 'SMTP_UNAVAILABLE'; END IF;
 DELETE FROM platform_private.tenant_smtp_test_insert_tickets WHERE outbox_id=v_out;
 INSERT INTO platform_private.tenant_smtp_test_receipts(id,organization_id,actor_id,version,actor_iat,mode,request_key,fence,outbox_id,state)
 VALUES(v_id,v_org,auth.uid(),p_version,coalesce((auth.jwt()->>'iat')::bigint,0),p_mode,p_key,v_fence,v_out,'claimed');
 INSERT INTO public.communication_tenant_email_audit(organization_id,actor_id,version,action) VALUES(v_org,auth.uid(),p_version,'smtp_test_'||p_mode||'_claimed');
 RETURN jsonb_build_object('replay',false,'job_id',v_id,'fence',v_fence);
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_test_claim(text,bigint,uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_smtp_test_claim(text,bigint,uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.tenant_smtp_test_claim(p_mode text,p_version bigint,p_key uuid,p_confirm boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.tenant_smtp_test_claim(p_mode,p_version,p_key,p_confirm) $$;
REVOKE ALL ON FUNCTION public.tenant_smtp_test_claim(text,bigint,uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_smtp_test_claim(text,bigint,uuid,boolean) TO authenticated;
-- This is NOT a password RPC for clients. Requires an unconsumed authorized job/fence.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_test_prepare(p_job uuid,p_fence uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r platform_private.tenant_smtp_test_receipts; s public.communication_tenant_email_settings; v_org uuid; v_password text; v_email text;
BEGIN
 SELECT organization_id INTO v_org FROM platform_private.tenant_smtp_test_receipts WHERE id=p_job;
 IF v_org IS NULL THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 SELECT * INTO r FROM platform_private.tenant_smtp_test_receipts WHERE id=p_job FOR UPDATE;
 IF r.actor_id IS DISTINCT FROM p_actor OR r.fence IS DISTINCT FROM p_fence OR r.state<>'claimed'
 OR platform_private.tenant_smtp_test_actor(p_actor) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Service JWT cannot substitute actor iat. Preserve claim's actual invitation fence.
 IF r.actor_iat<=0 OR EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_actor
 AND (i.access_operation_status='processing' OR (i.access_valid_after IS NOT NULL AND to_timestamp(r.actor_iat)<=i.access_valid_after))) THEN
 RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.communication_tenant_email_settings WHERE organization_id=v_org FOR UPDATE;
 IF s.version IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_gate WHERE approved AND id) OR s.config->>'port'<>'465'
 OR s.config->>'tls_mode'<>'implicit_tls' OR r.created_at<clock_timestamp()-interval '30 seconds' THEN RAISE EXCEPTION 'SMTP_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 IF r.mode='send' AND NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_receipts WHERE organization_id=v_org AND actor_id=p_actor
 AND mode='connection' AND version=r.version AND code='smtp_connection_ok' AND completed_at>clock_timestamp()-interval '5 minutes') THEN RAISE EXCEPTION 'SMTP_NOT_READY' USING ERRCODE='42501'; END IF;
 SELECT email INTO v_email FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL;
 SELECT d.decrypted_secret INTO v_password FROM platform_private.communication_tenant_email_secret_refs t JOIN vault.decrypted_secrets d ON d.id=t.secret_id WHERE t.organization_id=v_org;
 IF v_password IS NULL OR v_email IS NULL THEN RAISE EXCEPTION 'SMTP_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 UPDATE platform_private.tenant_smtp_test_receipts SET state='executing' WHERE id=p_job;
 RETURN jsonb_build_object('mode',r.mode,'version',r.version,'recipient',v_email,'config',s.config,'password',v_password);
EXCEPTION WHEN SQLSTATE '42501' THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501';
 WHEN SQLSTATE '40001' THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001';
 WHEN OTHERS THEN RAISE EXCEPTION 'SMTP_INTERNAL';
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_test_prepare(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.tenant_smtp_test_prepare(uuid,uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.tenant_smtp_test_prepare(p_job uuid,p_fence uuid,p_actor uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.tenant_smtp_test_prepare(p_job,p_fence,p_actor) $$;
REVOKE ALL ON FUNCTION public.tenant_smtp_test_prepare(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_smtp_test_prepare(uuid,uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_test_finish(p_job uuid,p_fence uuid,p_actor uuid,p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r platform_private.tenant_smtp_test_receipts; v_org uuid;
BEGIN
 SELECT organization_id INTO v_org FROM platform_private.tenant_smtp_test_receipts WHERE id=p_job;
 IF v_org IS NULL THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 SELECT * INTO r FROM platform_private.tenant_smtp_test_receipts WHERE id=p_job FOR UPDATE;
 IF r.actor_id IS DISTINCT FROM p_actor OR r.fence IS DISTINCT FROM p_fence OR r.state NOT IN ('executing','complete')
 THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_code IS NULL OR p_code NOT IN ('smtp_connection_ok','smtp_send_accepted','smtp_send_ambiguous','smtp_test_failed')
 OR (r.mode='connection' AND p_code IN ('smtp_send_accepted','smtp_send_ambiguous')) OR (r.mode='send' AND p_code='smtp_connection_ok') THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 IF r.state='complete' AND r.code<>p_code THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
 IF r.state<>'complete' THEN
 UPDATE platform_private.tenant_smtp_test_receipts SET state='complete',code=p_code,completed_at=clock_timestamp() WHERE id=p_job;
 UPDATE public.comunicacao_outbox SET status=CASE WHEN p_code='smtp_send_accepted' THEN 'sent'::public.comunicacao_outbox_status ELSE 'dead_letter'::public.comunicacao_outbox_status END,
 error_code=p_code,error_message=NULL,lease_expires_at=NULL,locked_by=NULL WHERE id=r.outbox_id;
 INSERT INTO public.communication_tenant_email_audit(organization_id,actor_id,version,action) VALUES(v_org,p_actor,r.version,p_code);
 END IF;
 -- Record results even if actor revoked after socket; never return result to revoked actor.
 RETURN jsonb_build_object('code',p_code,'version',r.version,'mode',r.mode,'dispatch_enabled',false,'sender_verified',false);
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_test_finish(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.tenant_smtp_test_finish(uuid,uuid,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.tenant_smtp_test_finish(p_job uuid,p_fence uuid,p_actor uuid,p_code text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.tenant_smtp_test_finish(p_job,p_fence,p_actor,p_code) $$;
REVOKE ALL ON FUNCTION public.tenant_smtp_test_finish(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_smtp_test_finish(uuid,uuid,uuid,text) TO service_role;
COMMIT;
