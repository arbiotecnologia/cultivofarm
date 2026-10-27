-- Read-only; failure means NO-GO. Tenant/SELECT fingerprint excludes ONLY the 3 new policies.
DO $post$
BEGIN
 IF (SELECT count(*) FROM pg_policy WHERE polrelid='public.alertas_agronomicos'::regclass AND NOT polpermissive
 AND polroles=ARRAY['authenticated'::regrole::oid] AND (
 (polname='monitoring_authenticated_insert_closed' AND polcmd='a' AND polqual IS NULL AND pg_get_expr(polwithcheck,polrelid)='false') OR
 (polname='monitoring_authenticated_update_closed' AND polcmd='w' AND pg_get_expr(polqual,polrelid)='false' AND pg_get_expr(polwithcheck,polrelid)='false') OR
 (polname='monitoring_authenticated_delete_closed' AND polcmd='d' AND pg_get_expr(polqual,polrelid)='false' AND polwithcheck IS NULL)))<>3 THEN
  RAISE EXCEPTION 'write_closure_post_policy_failed' USING ERRCODE='55000';
 END IF;
 IF (SELECT md5(string_agg(polname||':'||polcmd::text||':'||polpermissive::text||':'||polroles::text||':'||coalesce(pg_get_expr(polqual,polrelid),'')||':'||coalesce(pg_get_expr(polwithcheck,polrelid),''),E'\n' ORDER BY polname)) FROM pg_policy WHERE polrelid='public.alertas_agronomicos'::regclass AND polname NOT IN ('monitoring_authenticated_insert_closed','monitoring_authenticated_update_closed','monitoring_authenticated_delete_closed'))<>'826292c397fd1dea1f07a23e37b56a04' THEN
  RAISE EXCEPTION 'write_closure_select_tenant_changed' USING ERRCODE='55000';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.alertas_agronomicos'::regclass AND relrowsecurity AND NOT relforcerowsecurity AND relowner='postgres'::regrole)
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
 OR NOT has_table_privilege('service_role','public.alertas_agronomicos','UPDATE') THEN
  RAISE EXCEPTION 'write_closure_post_dependency_failed' USING ERRCODE='55000';
 END IF;
END;
$post$;
-- New function hashes are checked by candidate's metadata postcondition and recorded in expected-functions.tsv.
