-- Read-only; canonical ref swzpzcwiasxmjutrmvkm must be validated by the executor.
SELECT p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) definition_md5,p.prosecdef,p.proconfig,p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname='admin_edit_user_profile_v1') OR
(n.nspname='platform_private' AND p.proname IN ('tenant_admin_user_links','platform_actor_access_ready','is_tenant_admin_for_user')) OR
(n.nspname='cf_user_guards_v1' AND p.proname IN ('acquire_gate','touch_related_profiles','advance_stamp'));
SELECT table_schema,table_name,column_name,data_type,is_nullable FROM information_schema.columns
WHERE table_schema IN ('public','cf_user_guards_v1') AND table_name IN ('profiles','user_roles','user_clientes','partner_users','state') ORDER BY table_name,ordinal_position;
SELECT tgrelid::regclass, tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass);
SELECT schemaname,tablename,policyname,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','user_roles','user_clientes','partner_users');
