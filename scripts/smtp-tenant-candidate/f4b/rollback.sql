-- NON-DESTRUCTIVE rollback of F4b. Preserves jobs/outbox/audit history, Vault and settings.
BEGIN;
UPDATE platform_private.tenant_smtp_dispatch_gate SET approved=false;
UPDATE platform_private.tenant_smtp_activation SET active=false,reason='f4b_rollback',changed_at=clock_timestamp() WHERE active;
WITH c AS (UPDATE platform_private.tenant_smtp_dispatch_jobs SET state='cancelled',result_code='f4b_rollback',finished_at=clock_timestamp() WHERE state='queued' RETURNING outbox_id)
UPDATE public.comunicacao_outbox o SET status='cancelled',error_code='f4b_rollback',locked_by=NULL FROM c WHERE o.id=c.outbox_id;
DROP TRIGGER IF EXISTS tenant_smtp_lane_solicitacao_atribuida ON public.portal_solicitacoes;
REVOKE EXECUTE ON FUNCTION public.tenant_smtp_lane_claim(text),public.tenant_smtp_lane_finish(uuid,uuid,text) FROM service_role;
REVOKE EXECUTE ON FUNCTION tenant_smtp_executor.tenant_smtp_lane_claim(text),tenant_smtp_executor.tenant_smtp_lane_finish(uuid,uuid,text) FROM service_role;
-- Restore F4a readiness (constant false) and the diagnostic-only outbox containment.
CREATE OR REPLACE FUNCTION tenant_smtp_executor.tenant_smtp_dispatch_ready(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT false $$;
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
-- Activation reverts to pause-only.
CREATE OR REPLACE FUNCTION platform_private.tenant_smtp_lane_ready(p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT false $$;
COMMIT;
