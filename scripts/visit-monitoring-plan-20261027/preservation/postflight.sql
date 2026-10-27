-- READ ONLY. Never restores or adopts a receipt as the current plan.
SELECT p.oid::regprocedure,md5(pg_get_functiondef(p.oid)),p.proowner::regrole,p.proacl,p.proconfig
FROM pg_proc p WHERE p.proname IN ('save_visit_monitoring_plan_core','guard_visit_plan_preservation');
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.registros_consultor'::regclass AND tgname='trg_visit_plan_preservation';
SELECT has_table_privilege('authenticated','platform_private.visit_plan_write_tickets','INSERT') AS must_be_false;