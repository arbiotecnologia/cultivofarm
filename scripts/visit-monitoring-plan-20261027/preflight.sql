BEGIN READ ONLY;
SELECT current_database(), current_user;
SELECT p.oid::regprocedure, md5(pg_get_functiondef(p.oid)),p.proowner::regrole,p.proacl,p.prosecdef,p.proconfig
FROM pg_proc p WHERE p.oid IN (
 'public._visita_lock_and_check(uuid,integer,boolean)'::regprocedure,
 'public.can_manage_technical_visit(uuid,uuid)'::regprocedure,
 'platform_private.monitoring_refs_in_actor_tenant(uuid,uuid,uuid)'::regprocedure,
 'public.rpc_reprogramar_monitoramento_v1(uuid,date,timestamptz)'::regprocedure,
 'public.rpc_ativar_monitoramento_visita(uuid,integer,text,date)'::regprocedure);
SELECT t.tgname, pg_get_triggerdef(t.oid),md5(pg_get_functiondef(t.tgfoid)) FROM pg_trigger t
WHERE t.tgrelid='public.registros_consultor'::regclass AND NOT t.tgisinternal;
SELECT * FROM pg_policies WHERE tablename IN ('monitoramento_avisos','visitas_logs');
SELECT indexname,indexdef FROM pg_indexes WHERE tablename IN ('monitoramento_avisos','visitas_logs');
SELECT to_regprocedure('public.rpc_salvar_plano_monitoramento_visita_v1(uuid,integer,jsonb,uuid)'),
 to_regclass('platform_private.visit_monitoring_plan_receipts');
ROLLBACK;
