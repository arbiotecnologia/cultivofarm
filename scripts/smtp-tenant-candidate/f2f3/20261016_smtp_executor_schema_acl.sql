-- REVIEW ONLY: additive successor to smtp_tenant_controlled_diagnostics_closed.
-- Auditor must prove swzpzcwiasxmjutrmvkm before applying; never replay foundation.
BEGIN;
DO $$ BEGIN
 IF to_regclass('platform_private.tenant_smtp_test_gate') IS NULL
 OR EXISTS(SELECT 1 FROM platform_private.tenant_smtp_test_gate WHERE approved)
 OR has_schema_privilege('service_role','platform_private','USAGE') THEN
  RAISE EXCEPTION 'SMTP_ACL_PREFLIGHT_FAILED';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='tenant_smtp_executor' AND nspowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN
  RAISE EXCEPTION 'SMTP_ACL_PREFLIGHT_FAILED';
 END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS tenant_smtp_executor;
REVOKE ALL ON SCHEMA tenant_smtp_executor FROM PUBLIC,anon,authenticated,service_role;
-- Only this dedicated schema becomes reachable; platform_private remains untouched.
GRANT USAGE ON SCHEMA tenant_smtp_executor TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tenant_smtp_executor REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
DO $$
DECLARE signature text; source_oid oid; target_oid oid;
BEGIN
 FOREACH signature IN ARRAY ARRAY['tenant_smtp_test_prepare(uuid,uuid,uuid)','tenant_smtp_test_finish(uuid,uuid,uuid,text)'] LOOP
  source_oid:=to_regprocedure('platform_private.'||signature);
  target_oid:=to_regprocedure('tenant_smtp_executor.'||signature);
  IF source_oid IS NOT NULL AND target_oid IS NULL THEN
   EXECUTE 'ALTER FUNCTION platform_private.'||signature||' SET SCHEMA tenant_smtp_executor';
  ELSIF source_oid IS NOT NULL OR target_oid IS NULL THEN
   RAISE EXCEPTION 'SMTP_ACL_PREFLIGHT_FAILED';
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='tenant_smtp_executor'::regnamespace)<>2
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='tenant_smtp_executor'::regnamespace
  AND (NOT prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[])) THEN
  RAISE EXCEPTION 'SMTP_ACL_PREFLIGHT_FAILED';
 END IF;
END $$;
-- Move preserves bodies/OIDs/owners and all actor/job/fence/CAS/Vault guards.
REVOKE ALL ON FUNCTION tenant_smtp_executor.tenant_smtp_test_prepare(uuid,uuid,uuid),tenant_smtp_executor.tenant_smtp_test_finish(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION tenant_smtp_executor.tenant_smtp_test_prepare(uuid,uuid,uuid),tenant_smtp_executor.tenant_smtp_test_finish(uuid,uuid,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.tenant_smtp_test_prepare(p_job uuid,p_fence uuid,p_actor uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT tenant_smtp_executor.tenant_smtp_test_prepare(p_job,p_fence,p_actor) $$;
CREATE OR REPLACE FUNCTION public.tenant_smtp_test_finish(p_job uuid,p_fence uuid,p_actor uuid,p_code text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT tenant_smtp_executor.tenant_smtp_test_finish(p_job,p_fence,p_actor,p_code) $$;
REVOKE ALL ON FUNCTION public.tenant_smtp_test_prepare(uuid,uuid,uuid),public.tenant_smtp_test_finish(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_smtp_test_prepare(uuid,uuid,uuid),public.tenant_smtp_test_finish(uuid,uuid,uuid,text) TO service_role;
COMMIT;