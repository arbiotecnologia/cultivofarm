-- READ ONLY. Executor must first prove canonical ref swzpzcwiasxmjutrmvkm.
SELECT p.oid::regprocedure,md5(pg_get_functiondef(p.oid)),p.proowner::regrole,p.proacl,p.proconfig
FROM pg_proc p WHERE p.oid IN ('platform_private.save_visit_monitoring_plan_core(uuid,integer,jsonb,uuid)'::regprocedure,'public.enforce_visit_immutability()'::regprocedure);
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.registros_consultor'::regclass AND NOT tgisinternal;
SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE tablename='registros_consultor';