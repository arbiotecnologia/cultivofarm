-- REVIEW ONLY. Prove canonical ref before execution. Preserve all history/Vault/settings.
BEGIN;
UPDATE platform_private.tenant_smtp_test_gate SET approved=false WHERE id=true;
REVOKE ALL ON FUNCTION public.tenant_smtp_test_context(),platform_private.tenant_smtp_test_context() FROM authenticated;
REVOKE ALL ON FUNCTION public.tenant_smtp_test_claim(text,bigint,uuid,boolean),platform_private.tenant_smtp_test_claim(text,bigint,uuid,boolean) FROM authenticated;
REVOKE ALL ON FUNCTION public.tenant_smtp_test_prepare(uuid,uuid,uuid),public.tenant_smtp_test_finish(uuid,uuid,uuid,text) FROM service_role;
REVOKE ALL ON FUNCTION platform_private.tenant_smtp_test_prepare(uuid,uuid,uuid),platform_private.tenant_smtp_test_finish(uuid,uuid,uuid,text) FROM service_role;
CREATE OR REPLACE FUNCTION platform_private.notification_outbox_closed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN RETURN NULL; END $$;
REVOKE ALL ON FUNCTION platform_private.notification_outbox_closed() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.notification_outbox_closed() TO service_role;
COMMIT;
