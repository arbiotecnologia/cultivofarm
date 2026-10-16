-- REVIEW ONLY. Prove target swzpzcwiasxmjutrmvkm externally BEFORE execution. Not an auto-applied migration.
-- F4b (rev. after independent review 1cd70701): tenant activation + tenant SMTP lane inside the EXISTING
-- comunicacao_eventos/comunicacao_outbox. Additive successor to F4a (20261016131517). Never replays T1/F2/F3/F4a.
-- Gate tenant_smtp_dispatch_gate is inserted FALSE. Global NOTIF3 containment is preserved:
--  * the global publisher stays suppressed (untouched); the global claim RPC never sees lane rows
--    (status 'processing' + lease NULL); the RESTRICTIVE client policy is untouched;
--  * legacy outbox rows have no lane job row, so they are invisible to the lane.
-- Allowed contract (single, documented): 'solicitacao_atribuida_consultor_v1'
--   source    = public.portal_solicitacoes row, first assignment consultor_atribuido NULL -> X (future only, no backfill),
--               status IN ('pendente','atribuida') (allow-list; schema default 'pendente').
--   tenant    = public.clientes.organization_id of the solicitation; cliente status_cliente='ativo'.
--   recipient = the assigned consultant: active profile of the SAME tenant, role consultor_tecnico/tecnico_agronomo,
--               confirmed auth email, not superadmin.
--   Source + recipient are re-proven at enqueue, at claim (before any IO) and at authorize (after SMTP AUTH,
--   before MAIL FROM). Cancellation, deletion, reassignment, client/tenant change => job cancelled + audited.
--   Template/payload = fixed server text; payload limited to numero (sanitized charset), tipo_demanda, urgencia.
BEGIN;
DO $$ BEGIN
 IF to_regclass('platform_private.tenant_smtp_f4_gate') IS NULL
 OR to_regclass('platform_private.tenant_smtp_activation') IS NULL
 OR to_regprocedure('platform_private.tenant_smtp_f4_verified(uuid)') IS NULL
 OR to_regprocedure('tenant_smtp_executor.tenant_smtp_dispatch_ready(uuid)') IS NULL
 OR to_regclass('platform_private.tenant_smtp_test_insert_tickets') IS NULL
 OR to_regclass('public.comunicacao_outbox') IS NULL OR to_regclass('public.portal_solicitacoes') IS NULL
 OR has_schema_privilege('service_role','platform_private','USAGE') THEN
  RAISE EXCEPTION 'SMTP_F4B_PREFLIGHT_FAILED';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS platform_private.tenant_smtp_dispatch_gate(id boolean PRIMARY KEY DEFAULT true CHECK(id),approved boolean NOT NULL DEFAULT false);
REVOKE ALL ON platform_private.tenant_smtp_dispatch_gate FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.tenant_smtp_dispatch_gate ENABLE ROW LEVEL SECURITY;
INSERT INTO platform_private.tenant_smtp_dispatch_gate VALUES(true,false) ON CONFLICT DO NOTHING;
-- Lane heartbeat: written only by the executor claim. UI readiness requires a recent real lane run.
CREATE TABLE IF NOT EXISTS platform_private.tenant_smtp_lane_heartbeat(id boolean PRIMARY KEY DEFAULT true CHECK(id),worker text NOT NULL,seen_at timestamptz NOT NULL);
REVOKE ALL ON platform_private.tenant_smtp_lane_heartbeat FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.tenant_smtp_lane_heartbeat ENABLE ROW LEVEL SECURITY;

-- Lane job ledger: the ONLY proof of tenant/source/recipient for an outbox row. No secret columns.
CREATE TABLE IF NOT EXISTS platform_private.tenant_smtp_dispatch_jobs(
 outbox_id uuid PRIMARY KEY REFERENCES public.comunicacao_outbox(id),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 contract text NOT NULL CHECK(contract IN ('solicitacao_atribuida_consultor_v1')),
 source_id uuid NOT NULL, cliente_id uuid NOT NULL, recipient_user_id uuid NOT NULL, version bigint NOT NULL, activated_by uuid,
 state text NOT NULL CHECK(state IN ('queued','executing','authorized','sent','failed','ambiguous','cancelled','lease_expired')),
 fence uuid, worker text CHECK(worker IS NULL OR length(worker) BETWEEN 1 AND 80), lease_expires_at timestamptz,
 result_code text CHECK(result_code IS NULL OR result_code ~ '^[a-z_]{1,60}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), started_at timestamptz, authorized_at timestamptz, finished_at timestamptz,
 UNIQUE(contract,source_id,recipient_user_id)
);
REVOKE ALL ON platform_private.tenant_smtp_dispatch_jobs FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.tenant_smtp_dispatch_jobs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS tenant_smtp_dispatch_jobs_queue ON platform_private.tenant_smtp_dispatch_jobs(state,created_at);
CREATE INDEX IF NOT EXISTS tenant_smtp_dispatch_jobs_org ON platform_private.tenant_smtp_dispatch_jobs(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS platform_private.tenant_smtp_dispatch_insert_tickets(outbox_id uuid PRIMARY KEY,tx bigint NOT NULL,organization_id uuid NOT NULL,recipient_user_id uuid NOT NULL,source_id uuid NOT NULL);
REVOKE ALL ON platform_private.tenant_smtp_dispatch_insert_tickets FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.tenant_smtp_dispatch_insert_tickets ENABLE ROW LEVEL SECURITY;
-- Lane audit: binds every event to outbox/source/recipient; actor = who caused it (NULL = executor), activated_by = admin
-- who activated the tenant when the job was enqueued. Never stores payload, address, subject, body or credentials.
CREATE TABLE IF NOT EXISTS platform_private.tenant_smtp_lane_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL, outbox_id uuid NOT NULL, source_id uuid NOT NULL,
 recipient_user_id uuid NOT NULL, actor_id uuid, activated_by uuid,
 event text NOT NULL CHECK(event ~ '^(enqueued|claimed|authorized|withheld|cancelled|reconciled|sent|failed|ambiguous|late_finish)$'),
 result_code text CHECK(result_code IS NULL OR result_code ~ '^[a-z_]{1,60}$'), created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON platform_private.tenant_smtp_lane_audit FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.tenant_smtp_lane_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_lane_log(p_job platform_private.tenant_smtp_dispatch_jobs,p_event text,p_code text,p_actor uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO platform_private.tenant_smtp_lane_audit(organization_id,outbox_id,source_id,recipient_user_id,actor_id,activated_by,event,result_code)
 VALUES(p_job.organization_id,p_job.outbox_id,p_job.source_id,p_job.recipient_user_id,p_actor,p_job.activated_by,p_event,p_code)
$$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_lane_log(platform_private.tenant_smtp_dispatch_jobs,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Recipient proof (enqueue, claim, authorize). Never trusts payload.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_lane_recipient(p_org uuid,p_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT lower(u.email) FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id JOIN auth.users u ON u.id=p.user_id
 WHERE p.user_id=p_user AND p.organization_id=p_org AND p.ativo IS TRUE AND o.ativo IS TRUE
 AND u.email_confirmed_at IS NOT NULL AND u.email ~ '^[^@\s<>"]{1,64}@[^@\s<>"]{1,190}$'
 AND NOT public.is_platform_superadmin(p_user)
 AND (public.has_role(p_user,'consultor_tecnico'::public.app_role) OR public.has_role(p_user,'tecnico_agronomo'::public.app_role))
$$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_lane_recipient(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Source proof: NULL = still eligible; otherwise a sanitized reason. Reads the CURRENT source row.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_lane_source_reason(p_source uuid,p_cliente uuid,p_org uuid,p_recipient uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s record; c record;
BEGIN
 SELECT id,cliente_id,consultor_atribuido,status::text AS status INTO s FROM public.portal_solicitacoes WHERE id=p_source;
 IF NOT FOUND THEN RETURN 'source_missing'; END IF;
 IF s.cliente_id IS DISTINCT FROM p_cliente THEN RETURN 'source_client_changed'; END IF;
 IF s.consultor_atribuido IS NULL THEN RETURN 'source_unassigned'; END IF;
 IF s.consultor_atribuido IS DISTINCT FROM p_recipient THEN RETURN 'source_reassigned'; END IF;
 IF s.status IS NULL OR s.status NOT IN ('pendente','atribuida') THEN RETURN 'source_state_ineligible'; END IF;
 SELECT organization_id,status_cliente::text AS st INTO c FROM public.clientes WHERE id=p_cliente;
 IF NOT FOUND OR c.organization_id IS DISTINCT FROM p_org THEN RETURN 'client_tenant_changed'; END IF;
 IF c.st IS DISTINCT FROM 'ativo' THEN RETURN 'client_ineligible'; END IF;
 IF platform_private.tenant_smtp_lane_recipient(p_org,p_recipient) IS NULL THEN RETURN 'recipient_unproven'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_lane_source_reason(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- SQL readiness (gates + activation + verified + version). Does NOT prove a lane worker exists.
CREATE OR REPLACE FUNCTION tenant_smtp_executor.tenant_smtp_dispatch_ready(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_gate WHERE id AND approved)
 AND EXISTS(SELECT 1 FROM platform_private.tenant_smtp_f4_gate WHERE id AND approved)
 AND EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_gate WHERE id AND approved)
 AND platform_private.tenant_smtp_f4_verified(p_org)
 AND EXISTS(SELECT 1 FROM platform_private.tenant_smtp_activation a JOIN public.communication_tenant_email_settings s ON s.organization_id=a.organization_id
  JOIN public.organizations o ON o.id=a.organization_id
  WHERE a.organization_id=p_org AND a.active AND o.ativo IS TRUE AND a.version=s.version AND a.from_email=lower(s.config->>'from_email')
  AND s.credential_configured AND s.config->>'port'='465' AND s.config->>'tls_mode'='implicit_tls')
$$;
REVOKE ALL ON FUNCTION tenant_smtp_executor.tenant_smtp_dispatch_ready(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION tenant_smtp_executor.tenant_smtp_dispatch_ready(uuid) TO service_role;
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_lane_ready(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT tenant_smtp_executor.tenant_smtp_dispatch_ready(p_org) $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_lane_ready(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Cancel one job (any non-terminal state that has not been authorized for DATA) with audit.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_lane_cancel(p_job platform_private.tenant_smtp_dispatch_jobs,p_reason text,p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE platform_private.tenant_smtp_dispatch_jobs SET state='cancelled',result_code=p_reason,finished_at=clock_timestamp(),lease_expires_at=NULL
  WHERE outbox_id=p_job.outbox_id AND state IN ('queued','executing');
 IF FOUND THEN
  UPDATE public.comunicacao_outbox SET status='cancelled',error_code=left('tenant_smtp_'||p_reason,80),locked_by=NULL WHERE id=p_job.outbox_id;
  PERFORM platform_private.tenant_smtp_lane_log(p_job,'cancelled',p_reason,p_actor);
 END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_lane_cancel(platform_private.tenant_smtp_dispatch_jobs,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Cancel queued jobs of a tenant: pause/config change never leaves a burst for later. Executing jobs are stopped at authorize.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_lane_cancel_queued(p_org uuid,p_reason text,p_actor uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j platform_private.tenant_smtp_dispatch_jobs; n int:=0;
BEGIN
 FOR j IN SELECT * FROM platform_private.tenant_smtp_dispatch_jobs WHERE organization_id=p_org AND state='queued' FOR UPDATE LOOP
  PERFORM platform_private.tenant_smtp_lane_cancel(j,p_reason,p_actor); n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_lane_cancel_queued(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Status: real activation; dispatch_enabled = SQL readiness AND a lane worker run seen in the last 10 minutes.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_f4_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; s public.communication_tenant_email_settings; c platform_private.tenant_smtp_sender_challenges; v_verified boolean; v_active boolean;
BEGIN
 v_org:=platform_private.tenant_smtp_f4_actor_org();
 SELECT * INTO s FROM public.communication_tenant_email_settings WHERE organization_id=v_org;
 v_verified:=platform_private.tenant_smtp_f4_verified(v_org);
 v_active:=EXISTS(SELECT 1 FROM platform_private.tenant_smtp_activation a WHERE a.organization_id=v_org AND a.active AND a.version=s.version);
 SELECT * INTO c FROM platform_private.tenant_smtp_sender_challenges WHERE organization_id=v_org AND actor_id=auth.uid() AND version=s.version ORDER BY created_at DESC LIMIT 1;
 RETURN jsonb_build_object('version',coalesce(s.version,0),'sender_verified',v_verified,
  'active',v_active,'dispatch_enabled',coalesce(platform_private.tenant_smtp_lane_ready(v_org),false)
   AND EXISTS(SELECT 1 FROM platform_private.tenant_smtp_lane_heartbeat WHERE id AND seen_at>clock_timestamp()-interval '10 minutes'),
  'challenge',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,
   'state',CASE WHEN c.state IN ('sent','ambiguous') AND c.expires_at<clock_timestamp() THEN 'expired' ELSE c.state END,
   'expires_at',c.expires_at,'attempts_left',5-c.attempts) END);
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_f4_status() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_smtp_f4_status() TO authenticated;

-- Activation/pause by the tenant's own Admin. Preconditions all server-side, under the tenant lock.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_activation_set(p_version bigint,p_active boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; s public.communication_tenant_email_settings; a platform_private.tenant_smtp_activation;
BEGIN
 v_org:=platform_private.tenant_smtp_f4_actor_org();
 IF p_version IS NULL OR p_active IS NULL OR p_version<1 THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 IF platform_private.tenant_smtp_f4_actor_org() IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.communication_tenant_email_settings WHERE organization_id=v_org FOR UPDATE;
 IF s.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
 SELECT * INTO a FROM platform_private.tenant_smtp_activation WHERE organization_id=v_org FOR UPDATE;
 IF p_active THEN
  IF NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_gate WHERE id AND approved)
  OR NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_f4_gate WHERE id AND approved)
  OR NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_gate WHERE id AND approved) THEN RAISE EXCEPTION 'SMTP_OPERATIONAL_NOT_READY' USING ERRCODE='42501'; END IF;
  IF NOT platform_private.tenant_smtp_f4_verified(v_org) OR s.config->>'port'<>'465' OR s.config->>'tls_mode'<>'implicit_tls' OR NOT s.credential_configured
  THEN RAISE EXCEPTION 'SMTP_NOT_READY' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_receipts WHERE organization_id=v_org AND mode='connection' AND version=s.version
   AND code='smtp_connection_ok' AND completed_at>clock_timestamp()-interval '10 minutes') THEN RAISE EXCEPTION 'SMTP_NOT_READY' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_receipts WHERE organization_id=v_org AND state<>'complete')
  OR EXISTS(SELECT 1 FROM platform_private.tenant_smtp_sender_challenges WHERE organization_id=v_org AND state IN ('claimed','executing'))
  OR EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_jobs WHERE organization_id=v_org AND state IN ('executing','authorized')) THEN RAISE EXCEPTION 'SMTP_BUSY' USING ERRCODE='40001'; END IF;
  IF a.organization_id IS NULL OR NOT a.active OR a.version<>s.version THEN
   INSERT INTO platform_private.tenant_smtp_activation(organization_id,active,version,from_email,changed_by,reason)
    VALUES(v_org,true,s.version,lower(s.config->>'from_email'),auth.uid(),'admin_activated')
    ON CONFLICT(organization_id) DO UPDATE SET active=true,version=EXCLUDED.version,from_email=EXCLUDED.from_email,changed_by=EXCLUDED.changed_by,reason=EXCLUDED.reason,changed_at=clock_timestamp();
   INSERT INTO public.communication_tenant_email_audit(organization_id,actor_id,version,action) VALUES(v_org,auth.uid(),s.version,'tenant_smtp_activated');
  END IF;
 ELSE
  IF a.organization_id IS NOT NULL AND a.active THEN
   UPDATE platform_private.tenant_smtp_activation SET active=false,version=s.version,from_email=lower(s.config->>'from_email'),changed_by=auth.uid(),reason='admin_paused',changed_at=clock_timestamp() WHERE organization_id=v_org;
   INSERT INTO public.communication_tenant_email_audit(organization_id,actor_id,version,action) VALUES(v_org,auth.uid(),s.version,'tenant_smtp_paused');
  END IF;
  PERFORM platform_private.tenant_smtp_lane_cancel_queued(v_org,'tenant_paused',auth.uid());
 END IF;
 RETURN platform_private.tenant_smtp_f4_status();
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_activation_set(bigint,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_smtp_activation_set(bigint,boolean) TO authenticated;

-- Config change (F4a trigger) also cancels queued lane jobs; executing jobs are stopped at authorize.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_f4_invalidate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.version IS DISTINCT FROM OLD.version OR NEW.config IS DISTINCT FROM OLD.config OR NEW.credential_configured IS DISTINCT FROM OLD.credential_configured THEN
  UPDATE platform_private.tenant_smtp_sender_verifications SET invalidated_at=clock_timestamp() WHERE organization_id=NEW.organization_id AND invalidated_at IS NULL;
  UPDATE platform_private.tenant_smtp_sender_challenges SET state='invalidated',code_hash=NULL,code_salt=NULL,closed_at=clock_timestamp()
   WHERE organization_id=NEW.organization_id AND state IN ('claimed','executing','sent','ambiguous');
  UPDATE platform_private.tenant_smtp_activation SET active=false,reason='config_changed',changed_by=auth.uid(),changed_at=clock_timestamp()
   WHERE organization_id=NEW.organization_id AND active;
  PERFORM platform_private.tenant_smtp_lane_cancel_queued(NEW.organization_id,'config_changed',auth.uid());
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_f4_invalidate() FROM PUBLIC,anon,authenticated,service_role;

-- Outbox insert containment: F2/F3 diagnostic branch kept VERBATIM; one additional lane branch bound to a same-tx ticket.
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
 IF NEW.template_chave='solicitacao_atribuida_consultor_v1' AND NEW.status='processing' AND NEW.max_attempts=1 AND NEW.lease_expires_at IS NULL
 AND NEW.attempts=0 AND NEW.canal='email' AND NEW.recipient_cliente_id IS NULL AND NEW.recipient_hash IS NULL AND NEW.locked_by='tenant_smtp_lane'
 AND EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_insert_tickets t
 JOIN public.comunicacao_eventos e ON e.id=NEW.event_id
 WHERE t.outbox_id=NEW.id AND t.tx=txid_current() AND NEW.recipient_user_id=t.recipient_user_id
 AND platform_private.tenant_smtp_lane_recipient(t.organization_id,t.recipient_user_id) IS NOT NULL
 AND e.source_type='portal_solicitacoes' AND e.source_id=t.source_id
 AND e.event_key='tenant.smtp.solicitacao_atribuida' AND e.status='processed') THEN RETURN NEW; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION platform_private.notification_outbox_closed() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.notification_outbox_closed() TO service_role;

-- Source trigger (future events only). Never raises into the business UPDATE.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_lane_enqueue_solicitacao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid; v_out uuid:=gen_random_uuid(); v_ev uuid:=gen_random_uuid(); v_num text; v_ver bigint; v_idem text; v_by uuid; j platform_private.tenant_smtp_dispatch_jobs;
BEGIN
 IF OLD.consultor_atribuido IS NOT NULL OR NEW.consultor_atribuido IS NULL THEN RETURN NULL; END IF;
 BEGIN
  SELECT c.organization_id INTO v_org FROM public.clientes c WHERE c.id=NEW.cliente_id;
  IF v_org IS NULL OR NOT platform_private.tenant_smtp_lane_ready(v_org) THEN RETURN NULL; END IF;
  IF platform_private.tenant_smtp_lane_source_reason(NEW.id,NEW.cliente_id,v_org,NEW.consultor_atribuido) IS NOT NULL THEN RETURN NULL; END IF;
  -- Per-tenant enqueue serialization so the 50/hour quota holds under concurrent business updates.
  PERFORM pg_advisory_xact_lock(hashtextextended('tenant_smtp_lane_enqueue:'||v_org::text,0));
  IF (SELECT count(*) FROM platform_private.tenant_smtp_dispatch_jobs WHERE organization_id=v_org AND created_at>clock_timestamp()-interval '1 hour')>=50 THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_jobs WHERE contract='solicitacao_atribuida_consultor_v1' AND source_id=NEW.id AND recipient_user_id=NEW.consultor_atribuido) THEN RETURN NULL; END IF;
  v_num:=left(regexp_replace(coalesce(NEW.numero_solicitacao::text,''),'[^A-Za-z0-9/._-]','','g'),40);
  SELECT version INTO v_ver FROM public.communication_tenant_email_settings WHERE organization_id=v_org;
  SELECT changed_by INTO v_by FROM platform_private.tenant_smtp_activation WHERE organization_id=v_org AND active;
  v_idem:='tsmtp:sa:'||NEW.id::text||':'||NEW.consultor_atribuido::text;
  INSERT INTO public.comunicacao_eventos(id,event_key,source_type,source_id,payload,occurred_at,created_by,idempotency_key,status,processed_at,outbox_enqueued,outbox_skipped)
   VALUES(v_ev,'tenant.smtp.solicitacao_atribuida','portal_solicitacoes',NEW.id,jsonb_build_object('contract','solicitacao_atribuida_consultor_v1'),clock_timestamp(),auth.uid(),v_idem,'processed',clock_timestamp(),1,0);
  INSERT INTO platform_private.tenant_smtp_dispatch_insert_tickets VALUES(v_out,txid_current(),v_org,NEW.consultor_atribuido,NEW.id);
  INSERT INTO public.comunicacao_outbox(id,event_id,template_chave,template_versao,template_snapshot,canal,recipient_user_id,payload_snapshot,status,attempts,max_attempts,locked_by,idempotency_key)
   VALUES(v_out,v_ev,'solicitacao_atribuida_consultor_v1',1,jsonb_build_object('canal','email','contract','solicitacao_atribuida_consultor_v1'),'email',NEW.consultor_atribuido,
    jsonb_strip_nulls(jsonb_build_object('numero',nullif(v_num,''),'tipo_demanda',left(NEW.tipo_demanda::text,40),'urgencia',left(NEW.urgencia::text,20))),
    'processing',0,1,'tenant_smtp_lane',v_idem);
  DELETE FROM platform_private.tenant_smtp_dispatch_insert_tickets WHERE outbox_id=v_out;
  IF NOT EXISTS(SELECT 1 FROM public.comunicacao_outbox WHERE id=v_out) THEN RAISE EXCEPTION 'lane_insert_contained'; END IF;
  INSERT INTO platform_private.tenant_smtp_dispatch_jobs(outbox_id,organization_id,contract,source_id,cliente_id,recipient_user_id,version,activated_by,state)
   VALUES(v_out,v_org,'solicitacao_atribuida_consultor_v1',NEW.id,NEW.cliente_id,NEW.consultor_atribuido,v_ver,v_by,'queued') RETURNING * INTO j;
  PERFORM platform_private.tenant_smtp_lane_log(j,'enqueued',NULL,auth.uid());
 EXCEPTION WHEN OTHERS THEN RETURN NULL; -- subtransaction rolled back: no partial event/outbox/job; business update unaffected
 END;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_lane_enqueue_solicitacao() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS tenant_smtp_lane_solicitacao_atribuida ON public.portal_solicitacoes;
CREATE TRIGGER tenant_smtp_lane_solicitacao_atribuida AFTER UPDATE OF consultor_atribuido ON public.portal_solicitacoes
 FOR EACH ROW EXECUTE FUNCTION platform_private.tenant_smtp_lane_enqueue_solicitacao();

-- Executor claim: returns at most one job. Reconciles expired leases (never re-sent), scans up to 25 queued jobs,
-- skips busy/over-quota tenants (fairness) and cancels jobs whose source/recipient/tenant is no longer proven — all BEFORE IO.
CREATE OR REPLACE FUNCTION tenant_smtp_executor.tenant_smtp_lane_claim(p_worker text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j platform_private.tenant_smtp_dispatch_jobs; s public.communication_tenant_email_settings; v_email text; v_password text; v_fence uuid;
 o public.comunicacao_outbox; v_num text; v_body text; v_reason text; v_skip uuid[]:='{}';
BEGIN
 IF p_worker IS NULL OR p_worker !~ '^[A-Za-z0-9._-]{1,80}$' THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 FOR j IN SELECT * FROM platform_private.tenant_smtp_dispatch_jobs WHERE state IN ('executing','authorized') AND lease_expires_at<clock_timestamp() FOR UPDATE SKIP LOCKED LOOP
  IF j.state='executing' THEN -- never authorized for MAIL/DATA: no message could have been sent
   UPDATE platform_private.tenant_smtp_dispatch_jobs SET state='failed',result_code='lease_expired_before_auth',finished_at=clock_timestamp() WHERE outbox_id=j.outbox_id;
   UPDATE public.comunicacao_outbox SET status='failed',error_code='tenant_smtp_lease_expired_before_auth',locked_by=NULL WHERE id=j.outbox_id;
   PERFORM platform_private.tenant_smtp_lane_log(j,'reconciled','lease_expired_before_auth',NULL);
  ELSE
   UPDATE platform_private.tenant_smtp_dispatch_jobs SET state='lease_expired',result_code='lease_expired_after_auth',finished_at=clock_timestamp() WHERE outbox_id=j.outbox_id;
   UPDATE public.comunicacao_outbox SET status='dead_letter',error_code='tenant_smtp_lease_expired',locked_by=NULL WHERE id=j.outbox_id;
   PERFORM platform_private.tenant_smtp_lane_log(j,'reconciled','lease_expired_after_auth',NULL);
  END IF;
 END LOOP;
 FOR j IN SELECT * FROM platform_private.tenant_smtp_dispatch_jobs WHERE state='queued' AND created_at<clock_timestamp()-interval '24 hours' FOR UPDATE SKIP LOCKED LOOP
  PERFORM platform_private.tenant_smtp_lane_cancel(j,'stale_queue',NULL);
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM platform_private.tenant_smtp_dispatch_gate WHERE id AND approved) THEN RETURN NULL; END IF;
 INSERT INTO platform_private.tenant_smtp_lane_heartbeat VALUES(true,p_worker,clock_timestamp()) ON CONFLICT(id) DO UPDATE SET worker=EXCLUDED.worker,seen_at=EXCLUDED.seen_at;
 FOR j IN SELECT * FROM platform_private.tenant_smtp_dispatch_jobs WHERE state='queued' ORDER BY created_at LIMIT 25 FOR UPDATE SKIP LOCKED LOOP
  CONTINUE WHEN j.organization_id = ANY(v_skip);
  IF NOT pg_try_advisory_xact_lock(hashtextextended(j.organization_id::text,0)) THEN v_skip:=v_skip||j.organization_id; CONTINUE; END IF;
  SELECT * INTO s FROM public.communication_tenant_email_settings WHERE organization_id=j.organization_id FOR SHARE;
  IF NOT tenant_smtp_executor.tenant_smtp_dispatch_ready(j.organization_id) OR s.version IS DISTINCT FROM j.version THEN
   PERFORM platform_private.tenant_smtp_lane_cancel(j,'tenant_not_ready',NULL); CONTINUE;
  END IF;
  v_reason:=platform_private.tenant_smtp_lane_source_reason(j.source_id,j.cliente_id,j.organization_id,j.recipient_user_id);
  IF v_reason IS NOT NULL THEN PERFORM platform_private.tenant_smtp_lane_cancel(j,v_reason,NULL); CONTINUE; END IF;
  -- Per-tenant send quota (20/hour). Over quota: skip this tenant, keep scanning others.
  IF (SELECT count(*) FROM platform_private.tenant_smtp_dispatch_jobs WHERE organization_id=j.organization_id
   AND state IN ('executing','authorized','sent','ambiguous','lease_expired') AND started_at>clock_timestamp()-interval '1 hour')>=20 THEN
   v_skip:=v_skip||j.organization_id; CONTINUE;
  END IF;
  SELECT * INTO o FROM public.comunicacao_outbox WHERE id=j.outbox_id FOR UPDATE;
  IF o.recipient_user_id IS DISTINCT FROM j.recipient_user_id OR o.status<>'processing' OR o.template_chave<>j.contract OR o.attempts<>0 THEN
   PERFORM platform_private.tenant_smtp_lane_cancel(j,'outbox_mismatch',NULL); CONTINUE;
  END IF;
  v_email:=platform_private.tenant_smtp_lane_recipient(j.organization_id,j.recipient_user_id);
  SELECT d.decrypted_secret INTO v_password FROM platform_private.communication_tenant_email_secret_refs t JOIN vault.decrypted_secrets d ON d.id=t.secret_id WHERE t.organization_id=j.organization_id;
  IF v_password IS NULL OR v_email IS NULL THEN v_skip:=v_skip||j.organization_id; CONTINUE; END IF;
  v_fence:=gen_random_uuid();
  UPDATE platform_private.tenant_smtp_dispatch_jobs SET state='executing',fence=v_fence,worker=p_worker,lease_expires_at=clock_timestamp()+interval '45 seconds',started_at=clock_timestamp() WHERE outbox_id=j.outbox_id;
  UPDATE public.comunicacao_outbox SET attempts=1,locked_at=clock_timestamp() WHERE id=j.outbox_id;
  PERFORM platform_private.tenant_smtp_lane_log(j,'claimed',NULL,NULL);
  v_num:=coalesce(o.payload_snapshot->>'numero','');
  v_body:='Uma solicitação técnica foi atribuída a você'||CASE WHEN v_num<>'' THEN ' (nº '||v_num||')' ELSE '' END||'.'||chr(10)||
   'Tipo: '||coalesce(o.payload_snapshot->>'tipo_demanda','-')||chr(10)||'Urgência: '||coalesce(o.payload_snapshot->>'urgencia','-')||chr(10)||
   'Acesse o painel Cultivo Farm para ver os detalhes. Esta mensagem é automática.';
  RETURN jsonb_build_object('outbox_id',j.outbox_id,'fence',v_fence,'version',j.version,'recipient',v_email,
   'subject',left('Nova solicitação atribuída'||CASE WHEN v_num<>'' THEN ' — nº '||v_num ELSE '' END,200),'text',v_body,
   'config',s.config,'password',v_password);
 END LOOP;
 RETURN NULL;
EXCEPTION WHEN SQLSTATE '22023' THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023';
 WHEN OTHERS THEN RAISE EXCEPTION 'SMTP_INTERNAL';
END $$;
REVOKE ALL ON FUNCTION tenant_smtp_executor.tenant_smtp_lane_claim(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION tenant_smtp_executor.tenant_smtp_lane_claim(text) TO service_role;

-- Authorize: called after SMTP AUTH and BEFORE MAIL FROM. Re-proves fence/lease/version/gates/activation/source/recipient.
-- Refusal cancels the job with audit (no secret returned). Residual race: changes committed after this call and before
-- DATA completes (milliseconds, same SMTP session) are not observed; no resend ever follows.
CREATE OR REPLACE FUNCTION tenant_smtp_executor.tenant_smtp_lane_authorize(p_outbox uuid,p_fence uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j platform_private.tenant_smtp_dispatch_jobs; s public.communication_tenant_email_settings; v_reason text;
BEGIN
 IF p_outbox IS NULL OR p_fence IS NULL THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO j FROM platform_private.tenant_smtp_dispatch_jobs WHERE outbox_id=p_outbox FOR UPDATE;
 IF NOT FOUND OR j.fence IS DISTINCT FROM p_fence THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
 IF j.state<>'executing' OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() THEN
  RETURN jsonb_build_object('ok',false,'reason','lease_lost');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(j.organization_id::text,0));
 SELECT * INTO s FROM public.communication_tenant_email_settings WHERE organization_id=j.organization_id FOR SHARE;
 IF NOT tenant_smtp_executor.tenant_smtp_dispatch_ready(j.organization_id) OR s.version IS DISTINCT FROM j.version THEN v_reason:='tenant_not_ready';
 ELSE v_reason:=platform_private.tenant_smtp_lane_source_reason(j.source_id,j.cliente_id,j.organization_id,j.recipient_user_id); END IF;
 IF v_reason IS NOT NULL THEN
  PERFORM platform_private.tenant_smtp_lane_cancel(j,v_reason,NULL);
  PERFORM platform_private.tenant_smtp_lane_log(j,'withheld',v_reason,NULL);
  RETURN jsonb_build_object('ok',false,'reason',v_reason);
 END IF;
 UPDATE platform_private.tenant_smtp_dispatch_jobs SET state='authorized',authorized_at=clock_timestamp(),lease_expires_at=clock_timestamp()+interval '30 seconds' WHERE outbox_id=p_outbox;
 PERFORM platform_private.tenant_smtp_lane_log(j,'authorized',NULL,NULL);
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION tenant_smtp_executor.tenant_smtp_lane_authorize(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION tenant_smtp_executor.tenant_smtp_lane_authorize(uuid,uuid) TO service_role;

-- Finish: fence CAS, explicit outcomes only. No retry state exists.
--  executing (never authorized) -> only 'failed'; authorized -> sent | failed (definitive) | ambiguous (dead_letter).
--  Same terminal outcome replays idempotently; a different outcome conflicts; lease_expired is final (late result audited, lost=true).
CREATE OR REPLACE FUNCTION tenant_smtp_executor.tenant_smtp_lane_finish(p_outbox uuid,p_fence uuid,p_outcome text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j platform_private.tenant_smtp_dispatch_jobs;
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('sent','failed','ambiguous') OR p_outbox IS NULL OR p_fence IS NULL THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO j FROM platform_private.tenant_smtp_dispatch_jobs WHERE outbox_id=p_outbox FOR UPDATE;
 IF NOT FOUND OR j.fence IS DISTINCT FROM p_fence THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
 IF j.state='lease_expired' THEN
  PERFORM platform_private.tenant_smtp_lane_log(j,'late_finish','late_'||p_outcome,NULL);
  RETURN jsonb_build_object('state','lease_expired','replay',true,'lost',true);
 END IF;
 IF j.state IN ('sent','failed','ambiguous','cancelled') THEN
  IF j.state=p_outcome THEN RETURN jsonb_build_object('state',j.state,'replay',true,'lost',false); END IF;
  RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001';
 END IF;
 IF j.state='executing' AND p_outcome<>'failed' THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
 UPDATE platform_private.tenant_smtp_dispatch_jobs SET state=p_outcome,result_code='smtp_'||p_outcome,finished_at=clock_timestamp(),lease_expires_at=NULL WHERE outbox_id=p_outbox;
 UPDATE public.comunicacao_outbox SET status=(CASE p_outcome WHEN 'sent' THEN 'sent' WHEN 'failed' THEN 'failed' ELSE 'dead_letter' END)::public.comunicacao_outbox_status,
  sent_at=CASE WHEN p_outcome='sent' THEN clock_timestamp() END,error_code=CASE WHEN p_outcome='sent' THEN NULL ELSE 'tenant_smtp_'||p_outcome END,locked_by=NULL
  WHERE id=p_outbox;
 PERFORM platform_private.tenant_smtp_lane_log(j,p_outcome,NULL,NULL);
 RETURN jsonb_build_object('state',p_outcome,'replay',false,'lost',false);
END $$;
REVOKE ALL ON FUNCTION tenant_smtp_executor.tenant_smtp_lane_finish(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION tenant_smtp_executor.tenant_smtp_lane_finish(uuid,uuid,text) TO service_role;

-- Public INVOKER wrappers, service_role only.
CREATE OR REPLACE FUNCTION public.tenant_smtp_lane_claim(p_worker text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT tenant_smtp_executor.tenant_smtp_lane_claim(p_worker) $$;
CREATE OR REPLACE FUNCTION public.tenant_smtp_lane_authorize(p_outbox uuid,p_fence uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT tenant_smtp_executor.tenant_smtp_lane_authorize(p_outbox,p_fence) $$;
CREATE OR REPLACE FUNCTION public.tenant_smtp_lane_finish(p_outbox uuid,p_fence uuid,p_outcome text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT tenant_smtp_executor.tenant_smtp_lane_finish(p_outbox,p_fence,p_outcome) $$;
REVOKE ALL ON FUNCTION public.tenant_smtp_lane_claim(text),public.tenant_smtp_lane_authorize(uuid,uuid),public.tenant_smtp_lane_finish(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_smtp_lane_claim(text),public.tenant_smtp_lane_authorize(uuid,uuid),public.tenant_smtp_lane_finish(uuid,uuid,text) TO service_role;
COMMIT;
