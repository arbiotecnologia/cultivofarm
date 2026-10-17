-- CANDIDATO READ-ONLY, NÃO EXECUTADO HOSTED. Executor deve comprovar ref canônico.
-- Evidência de catálogo, não aprovação automática. Revisar todos os rows/results.
WITH dependencies AS (
 SELECT unnest(ARRAY['auth.users','public.profiles','public.user_roles','public.user_clientes','public.partner_users',
 'public.organizations','public.partner_accounts','public.clientes','public.organization_subscriptions',
 'public.organization_feature_overrides','public.saas_plan_versions','public.saas_plan_version_features',
 'public.saas_features','public.saas_modules']) AS relation
)
SELECT d.relation, c.relowner::regrole AS owner, c.relrowsecurity, c.relforcerowsecurity,
 t.tgname,t.tgenabled,t.tgtype,t.tgfoid::regprocedure,pg_get_triggerdef(t.oid) AS definition,
 md5(pg_get_functiondef(t.tgfoid)) AS function_md5
FROM dependencies d LEFT JOIN pg_class c ON c.oid=to_regclass(d.relation)
LEFT JOIN pg_trigger t ON t.tgrelid=c.oid AND NOT t.tgisinternal
ORDER BY d.relation,t.tgname;
SELECT conrelid::regclass AS child,confrelid::regclass AS parent,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE contype='f' AND (conrelid IN (
 'public.profiles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass)
 OR confrelid IN ('auth.users'::regclass,'public.organizations'::regclass,'public.clientes'::regclass,'public.partner_accounts'::regclass));
SELECT singleton,revision::text FROM cf_user_guards_v1.state;
SELECT p.oid::regprocedure,md5(pg_get_functiondef(p.oid)),p.provolatile,p.prosecdef,p.proconfig,p.proacl
FROM pg_proc p WHERE p.oid IN (
 'cf_user_guards_v1.acquire_gate()'::regprocedure,
 'platform_private.entitlements_for_user(uuid)'::regprocedure,
 'public.get_cliente_ids_for_user(uuid)'::regprocedure,
 'platform_private.producer_commercial_client_scope(uuid)'::regprocedure,
 'platform_private.b2b_commercial_context()'::regprocedure);