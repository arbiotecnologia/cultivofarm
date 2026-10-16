-- READ ONLY. Auditor first proves external target swzpzcwiasxmjutrmvkm.
-- An SQL connection alone cannot prove the Supabase project ref. Never run on an unproven target.
-- No credentials, claims, secret references or stored config values are selected.
BEGIN READ ONLY;
SELECT version,name FROM supabase_migrations.schema_migrations WHERE version='20261016002102';
SELECT approved AS draft_review_gate FROM platform_private.communication_tenant_email_review_gate WHERE id=true;
SELECT 'settings' AS object,count(*) FROM public.communication_tenant_email_settings
UNION ALL SELECT 'audit',count(*) FROM public.communication_tenant_email_audit
UNION ALL SELECT 'refs',count(*) FROM platform_private.communication_tenant_email_secret_refs;
SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,
 has_table_privilege('authenticated',c.oid,'SELECT') AS auth_read,
 has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') AS auth_any_write,
 has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anon_any
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='public' AND c.relname IN ('communication_tenant_email_settings','communication_tenant_email_audit'))
OR (n.nspname='platform_private' AND c.relname IN ('communication_tenant_email_secret_refs','communication_tenant_email_review_gate'));
SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,
 pg_get_userbyid(p.proowner) AS owner,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
 EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','platform_private') AND p.proname LIKE 'tenant_email_%';
SELECT schemaname,tablename,policyname,roles,cmd,permissive,qual,with_check
FROM pg_policies WHERE tablename IN ('communication_tenant_email_settings','communication_tenant_email_audit');
SELECT n.nspname,c.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE a.attnum>0 AND NOT a.attisdropped AND n.nspname IN ('public','platform_private')
AND c.relname IN ('communication_tenant_email_settings','communication_tenant_email_audit','communication_tenant_email_secret_refs','communication_tenant_email_review_gate');
SELECT p.oid::regprocedure AS identity,p.pronargdefaults,
 has_function_privilege('postgres',p.oid,'EXECUTE') AS executor_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_execute
FROM pg_proc p WHERE p.oid IN (to_regprocedure('vault.create_secret(text,text,text,uuid)'),to_regprocedure('vault.update_secret(uuid,text,text,text,uuid)'));
SELECT name,setting FROM pg_settings WHERE name IN ('log_statement','log_min_error_statement','log_parameter_max_length','log_parameter_max_length_on_error','log_min_duration_statement','log_min_duration_sample','pgaudit.log','pgaudit.log_parameter');
COMMIT;