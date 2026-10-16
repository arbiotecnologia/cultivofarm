-- READ ONLY; auditor proves external ref swzpzcwiasxmjutrmvkm first.
BEGIN READ ONLY;
SELECT version,name FROM supabase_migrations.schema_migrations WHERE version='20261016002102';
SELECT p.oid::regprocedure,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid IN
(to_regprocedure('platform_private.notification_outbox_closed()'),to_regprocedure('platform_private.tenant_email_actor_org()'));
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid IN ('public.comunicacao_outbox'::regclass,'public.comunicacao_eventos'::regclass) AND NOT tgisinternal;
SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('comunicacao_eventos','comunicacao_outbox','communication_tenant_email_audit');
SELECT schemaname,tablename,policyname,roles,qual,with_check FROM pg_policies WHERE tablename IN ('comunicacao_outbox','comunicacao_eventos');
SELECT name,setting FROM pg_settings WHERE name IN ('log_statement','log_parameter_max_length','log_parameter_max_length_on_error','pgaudit.log_parameter');
SELECT has_schema_privilege('service_role','platform_private','USAGE') AS service_private_usage;
SELECT n.nspname,p.oid::regprocedure,p.prosecdef,p.proconfig,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='platform_private' AND p.proname IN ('tenant_smtp_test_prepare','tenant_smtp_test_finish')) OR n.nspname='tenant_smtp_executor';
SELECT approved FROM platform_private.tenant_smtp_test_gate WHERE id=true;
COMMIT;
-- Compare actual full trigger/constraints/ACL with candidate assumptions before application.
