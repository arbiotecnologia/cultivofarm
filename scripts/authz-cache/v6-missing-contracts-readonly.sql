-- CANDIDATO READ-ONLY, não executado. Ref canônico deve ser comprovado externamente.
-- Retorna catálogo/definições, nunca dados de usuários/JWT/secrets.
WITH required(signature) AS (VALUES
 ('public.is_platform_superadmin(uuid)'),
 ('cf_user_guards_v1.require_admin()'),
 ('public.guard_profile_sensitive_fields()'),
 ('public.guard_profile_senha_provisoria()'),
 ('public.guard_profile_senha_ticket()'),
 ('public.guard_profile_tenant_fields()'),
 ('public.h15_profile_organization_guard()'),
 ('public.guard_superadmin_role_assignment()'),
 ('public.enforce_cliente_id_for_produtor()'),
 ('public.update_updated_at_column()'),
 ('platform_private.has_ticket(text,uuid)'),
 ('storage.allow_only_operation(text)'),
 ('storage.allow_any_operation(text[])')
)
SELECT r.signature, p.oid IS NOT NULL AS present, pg_get_functiondef(p.oid) AS definition,
 md5(pg_get_functiondef(p.oid)) AS definition_md5,
 p.provolatile,p.prosecdef,p.proconfig,p.proacl,p.proowner::regrole AS owner
FROM required r LEFT JOIN pg_proc p ON p.oid=to_regprocedure(r.signature);

WITH dependencies(relation) AS (VALUES
 ('public.profiles'),('public.user_roles'),('public.user_clientes'),('public.partner_users'),
 ('public.clientes'),('public.organizations'),('public.partner_accounts'),
 ('public.organization_subscriptions'),('public.organization_feature_overrides'),
 ('public.saas_plan_versions'),('public.saas_plan_version_features'),
 ('public.saas_features'),('public.saas_modules'),('public.platform_org_admin_invites')
)
SELECT d.relation,c.relrowsecurity,c.relforcerowsecurity,c.relowner::regrole,
 t.tgname,t.tgtype,t.tgenabled,t.tgqual,t.tgnargs,t.tgfoid::regprocedure,
 pg_get_triggerdef(t.oid) AS trigger_definition,
 pg_get_functiondef(t.tgfoid) AS trigger_body,
 md5(pg_get_functiondef(t.tgfoid)) AS body_md5
FROM dependencies d LEFT JOIN pg_class c ON c.oid=to_regclass(d.relation)
LEFT JOIN pg_trigger t ON t.tgrelid=c.oid AND NOT t.tgisinternal
ORDER BY d.relation,t.tgname;

SELECT c.table_name,c.column_name,c.udt_name,c.is_nullable,c.column_default
FROM information_schema.columns c
WHERE c.table_schema='public' AND c.table_name IN
 ('profiles','user_roles','user_clientes','partner_users','clientes','organizations',
 'partner_accounts','organization_subscriptions','organization_feature_overrides',
 'saas_plan_versions','saas_plan_version_features','saas_features','saas_modules',
 'platform_org_admin_invites') ORDER BY c.table_name,c.ordinal_position;

SELECT conrelid::regclass,confrelid::regclass,pg_get_constraintdef(oid)
FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype IN ('f','p','u');
SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('user_clientes','profiles','partner_users',
 'organization_subscriptions','organization_feature_overrides','saas_plan_version_features');
-- Runtime writers invoking these relations still require their full RPC/core bodies,
-- ordered SQL locks and dynamic SQL inspection. pg_depend is NOT complete closure.