-- READ ONLY; auditor proves external ref swzpzcwiasxmjutrmvkm first.
BEGIN READ ONLY;
SELECT version,name FROM supabase_migrations.schema_migrations WHERE version='20261016002102';
SELECT p.oid::regprocedure,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid IN
(to_regprocedure('platform_private.notification_outbox_closed()'),to_regprocedure('platform_private.tenant_email_actor_org()'));
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid IN ('public.comunicacao_outbox'::regclass,'public.comunicacao_eventos'::regclass) AND NOT tgisinternal;
SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('comunicacao_eventos','comunicacao_outbox','communication_tenant_email_audit');
SELECT schemaname,tablename,policyname,roles,qual,with_check FROM pg_policies WHERE tablename IN ('comunicacao_outbox','comunicacao_eventos');
SELECT name,setting FROM pg_settings WHERE name IN ('log_statement','log_parameter_max_length','log_parameter_max_length_on_error','pgaudit.log_parameter');
COMMIT;
-- Compare actual full trigger/constraints/ACL with candidate assumptions before application.
