-- Read-only assertions. Executor FIRST verifies external ref swzpzcwiasxmjutrmvkm outside SQL.
DO $pre$
DECLARE r record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.alertas_agronomicos'::regclass AND relrowsecurity AND NOT relforcerowsecurity AND relowner='postgres'::regrole) THEN
  RAISE EXCEPTION 'write_closure_table_baseline_mismatch' USING ERRCODE='55000';
 END IF;
 IF (SELECT md5(string_agg(polname||':'||polcmd::text||':'||polpermissive::text||':'||polroles::text||':'||coalesce(pg_get_expr(polqual,polrelid),'')||':'||coalesce(pg_get_expr(polwithcheck,polrelid),''),E'\n' ORDER BY polname)) FROM pg_policy WHERE polrelid='public.alertas_agronomicos'::regclass)<>'826292c397fd1dea1f07a23e37b56a04' THEN
  RAISE EXCEPTION 'write_closure_policy_baseline_mismatch' USING ERRCODE='55000';
 END IF;
 FOR r IN SELECT * FROM (VALUES
 ('public.rpc_criar_alerta_climatico_v1(uuid,uuid,public.tipo_alerta,public.nivel_risco,text)','b675f863360f50d58cd5358451284eff'),
 ('public.rpc_atualizar_status_alerta_agronomico_v1(uuid,public.status_alerta,timestamptz)','f2769829ce82c765326079a498eed0f7'),
 ('public.rpc_reprogramar_monitoramento_v1(uuid,date,timestamptz)','849f31fc39e98a115cb9b317801d698e'),
 ('platform_private.link_alert_origin_core(uuid,uuid,timestamptz,integer,uuid)','c0da2db32df6d5161c5c1d4dee84b495'),
 ('platform_private.reschedule_monitoring_core(uuid,date,timestamptz,integer,uuid)','3c31ce9dbf3ee2e23d82b43b07a70a5c')
 ) v(signature,hash) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(r.signature) AND prosecdef AND proowner='postgres'::regrole AND md5(pg_get_functiondef(oid))=r.hash
   AND proacl::text='{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' AND 'search_path=""'=ANY(proconfig))
   OR has_function_privilege('anon',r.signature,'EXECUTE') THEN
   RAISE EXCEPTION 'write_closure_function_baseline_mismatch: %',r.signature USING ERRCODE='55000';
  END IF;
 END LOOP;
 IF md5(pg_get_functiondef('platform_private.guard_alert_origin_sync()'::regprocedure))<>'c7e11bafbdf60e08495c68dfc9f9b12f'
 OR md5(pg_get_functiondef('platform_private.guard_visit_plan_preservation()'::regprocedure))<>'618797b75f8c6b962dc70c0841c84de1'
 OR md5(pg_get_functiondef('cf_user_guards_v1.acquire_gate()'::regprocedure))<>'b0dd9a14d5fd799a40df0975baf4c5a6'
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role' AND rolbypassrls)
 OR NOT has_table_privilege('service_role','public.alertas_agronomicos','UPDATE') THEN
  RAISE EXCEPTION 'write_closure_dependency_mismatch' USING ERRCODE='55000';
 END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.alertas_agronomicos'::regclass AND NOT tgisinternal)<>1
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.alertas_agronomicos'::regclass AND tgname='trg_alert_origin_sync' AND tgenabled='O' AND tgfoid='platform_private.guard_alert_origin_sync()'::regprocedure)
 OR (SELECT count(*) FROM pg_trigger WHERE tgrelid IN ('public.profiles'::regclass,'public.user_roles'::regclass) AND tgname='a00_cf_user_gate' AND tgenabled='O' AND tgfoid='cf_user_guards_v1.acquire_gate()'::regprocedure)<>2 THEN
  RAISE EXCEPTION 'write_closure_trigger_mismatch' USING ERRCODE='55000';
 END IF;
 -- Unexpected writers require a new review; no delete RPC is authorized here.
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','platform_private')
 AND p.prosrc ~* '(insert[[:space:]]+into|update|delete[[:space:]]+from)[[:space:]]+(public\.)?alertas_agronomicos'
 AND p.oid NOT IN ('public.rpc_criar_alerta_climatico_v1(uuid,uuid,public.tipo_alerta,public.nivel_risco,text)'::regprocedure,
 'public.rpc_atualizar_status_alerta_agronomico_v1(uuid,public.status_alerta,timestamptz)'::regprocedure,
 'public.rpc_reprogramar_monitoramento_v1(uuid,date,timestamptz)'::regprocedure,
 'platform_private.link_alert_origin_core(uuid,uuid,timestamptz,integer,uuid)'::regprocedure,
 'platform_private.reschedule_monitoring_core(uuid,date,timestamptz,integer,uuid)'::regprocedure)) THEN
  RAISE EXCEPTION 'write_closure_unreviewed_writer' USING ERRCODE='55000';
 END IF;
END;
$pre$;
