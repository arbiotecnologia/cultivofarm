-- REVIEW ONLY: closed rollback of dedicated executor; no data/secret deletion.
-- Run BEFORE legacy rollback.sql, only on proven canonical target.
BEGIN;
UPDATE platform_private.tenant_smtp_test_gate SET approved=false WHERE id=true;
REVOKE ALL ON FUNCTION public.tenant_smtp_test_prepare(uuid,uuid,uuid),public.tenant_smtp_test_finish(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE signature text; BEGIN
 FOREACH signature IN ARRAY ARRAY['tenant_smtp_test_prepare(uuid,uuid,uuid)','tenant_smtp_test_finish(uuid,uuid,uuid,text)'] LOOP
  IF to_regprocedure('tenant_smtp_executor.'||signature) IS NOT NULL THEN
   IF to_regprocedure('platform_private.'||signature) IS NOT NULL THEN RAISE EXCEPTION 'SMTP_ACL_PREFLIGHT_FAILED'; END IF;
   EXECUTE 'REVOKE ALL ON FUNCTION tenant_smtp_executor.'||signature||' FROM PUBLIC,anon,authenticated,service_role';
   EXECUTE 'ALTER FUNCTION tenant_smtp_executor.'||signature||' SET SCHEMA platform_private';
  END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.tenant_smtp_test_prepare(p_job uuid,p_fence uuid,p_actor uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.tenant_smtp_test_prepare(p_job,p_fence,p_actor) $$;
CREATE OR REPLACE FUNCTION public.tenant_smtp_test_finish(p_job uuid,p_fence uuid,p_actor uuid,p_code text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.tenant_smtp_test_finish(p_job,p_fence,p_actor,p_code) $$;
REVOKE ALL ON SCHEMA tenant_smtp_executor FROM PUBLIC,anon,authenticated,service_role;
-- Keep empty schema/history; never grant platform_private USAGE.
COMMIT;