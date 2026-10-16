-- REVIEW ONLY. Non-destructive: keeps tables/history/audit/Vault/settings; closes surface.
BEGIN;
UPDATE platform_private.tenant_smtp_f4_gate SET approved=false WHERE id;
UPDATE platform_private.tenant_smtp_activation SET active=false,reason='rollback',changed_at=clock_timestamp() WHERE active;
UPDATE platform_private.tenant_smtp_sender_challenges SET state='invalidated',code_hash=NULL,code_salt=NULL,closed_at=clock_timestamp() WHERE state IN ('claimed','executing','sent','ambiguous');
REVOKE ALL ON FUNCTION public.tenant_smtp_f4_status(),public.tenant_smtp_sender_challenge_claim(bigint,uuid),public.tenant_smtp_sender_challenge_confirm(uuid,bigint,text),public.tenant_smtp_activation_set(bigint,boolean) FROM authenticated;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_f4_status(),platform_private.tenant_smtp_sender_challenge_claim(bigint,uuid),platform_private.tenant_smtp_sender_challenge_confirm(uuid,bigint,text),platform_private.tenant_smtp_activation_set(bigint,boolean) FROM authenticated;
REVOKE ALL ON FUNCTION public.tenant_smtp_sender_challenge_prepare(uuid,uuid,uuid,text,text),public.tenant_smtp_sender_challenge_finish(uuid,uuid,uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION tenant_smtp_executor.tenant_smtp_sender_challenge_prepare(uuid,uuid,uuid,text,text),tenant_smtp_executor.tenant_smtp_sender_challenge_finish(uuid,uuid,uuid,text),tenant_smtp_executor.tenant_smtp_dispatch_ready(uuid) FROM service_role;
-- Invalidation trigger is kept: it only ever moves state toward safe.
COMMIT;
