-- Read-only; failure means NO-GO. Tenant/SELECT fingerprint excludes ONLY the 3 new policies.
DO $post$
DECLARE r record;
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
 FOR r IN SELECT * FROM (VALUES
 ('public.rpc_criar_alerta_climatico_v1(uuid,uuid,public.tipo_alerta,public.nivel_risco,text)','be3fa0742fddc5f3d212e7ed53048910'),
 ('public.rpc_atualizar_status_alerta_agronomico_v1(uuid,public.status_alerta,timestamptz)','8e6d0982d4eb9b599c703d3f715dd806'),
 ('public.rpc_reprogramar_monitoramento_v1(uuid,date,timestamptz)','1bf4ebfecb645e4a0d131510122ac407'),
 ('platform_private.link_alert_origin_core(uuid,uuid,timestamptz,integer,uuid)','c0da2db32df6d5161c5c1d4dee84b495'),
 ('platform_private.reschedule_monitoring_core(uuid,date,timestamptz,integer,uuid)','3c31ce9dbf3ee2e23d82b43b07a70a5c')
 ) v(signature,hash) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(r.signature) AND prosecdef AND proowner='postgres'::regrole
   AND md5(pg_get_functiondef(oid))=r.hash AND 'search_path=""'=ANY(proconfig)
   AND proacl::text='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
   OR has_function_privilege('anon',r.signature,'EXECUTE') THEN
   RAISE EXCEPTION 'write_closure_post_function_failed: %',r.signature USING ERRCODE='55000';
  END IF;
 END LOOP;
 IF md5(pg_get_functiondef('platform_private.guard_alert_origin_sync()'::regprocedure))<>'c7e11bafbdf60e08495c68dfc9f9b12f'
 OR md5(pg_get_functiondef('platform_private.guard_visit_plan_preservation()'::regprocedure))<>'618797b75f8c6b962dc70c0841c84de1' THEN
  RAISE EXCEPTION 'write_closure_post_guard_failed' USING ERRCODE='55000';
 END IF;
END;
$post$;
