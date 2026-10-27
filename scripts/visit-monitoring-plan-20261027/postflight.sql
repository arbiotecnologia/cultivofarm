BEGIN READ ONLY;
SELECT p.oid::regprocedure,md5(pg_get_functiondef(p.oid)),p.prosecdef,p.proconfig,p.proacl
FROM pg_proc p WHERE p.proname IN ('rpc_salvar_plano_monitoramento_visita_v1','save_visit_monitoring_plan_core');
SELECT has_table_privilege('authenticated','platform_private.visit_monitoring_plan_receipts','INSERT') AS must_be_false,
 has_function_privilege('anon','public.rpc_salvar_plano_monitoramento_visita_v1(uuid,integer,jsonb,uuid)','EXECUTE') AS must_be_false;
ROLLBACK;
