-- psql -X -v ON_ERROR_STOP=1 -v canonical_ref=swzpzcwiasxmjutrmvkm -f preflight.sql
-- Read-only. Run with approved operator access; outputs no Auth credentials.
SELECT :'canonical_ref' = 'swzpzcwiasxmjutrmvkm' AS canonical_ref_ok;
-- Caller-supplied ref alone is NOT target proof. Approved operator must attest
-- dashboard/connection target before any later write; this file only reads.
SELECT current_database(), current_user;
SELECT p.oid::regprocedure AS signature, pg_get_functiondef(p.oid) AS definition,
 p.proacl, p.proowner::regrole, p.proconfig, md5(pg_get_functiondef(p.oid)) AS md5,
 pg_get_function_result(p.oid) AS result,
 (SELECT jsonb_agg(pg_describe_object(d.classid,d.objid,d.objsubid)) FROM pg_depend d
  WHERE d.refclassid='pg_proc'::regclass AND d.refobjid=p.oid) AS dependents
FROM pg_proc p WHERE p.oid IN ('public.get_partner_catalog_secure(uuid)'::regprocedure,'public.get_partner_catalog_tecnico_secure()'::regprocedure);
SELECT pa.id partner_id, pa.commercial_owner_organization_id, o.id partner_organization_id,
 ow.ativo owner_active,ow.status owner_status,
 (SELECT count(*) FROM public.catalog_tenant_visibility v WHERE v.organization_id=pa.commercial_owner_organization_id AND v.hidden) owner_hidden,
 (SELECT count(*) FROM public.catalog_tenant_visibility v WHERE v.organization_id=o.id AND v.hidden) partner_hidden
FROM public.partner_accounts pa LEFT JOIN public.organizations o ON o.partner_account_id=pa.id
LEFT JOIN public.organizations ow ON ow.id=pa.commercial_owner_organization_id WHERE pa.ativo AND pa.deleted_at IS NULL;
SELECT n.nspname,p.proname,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname,p.proname) IN (('platform_private','catalog_tenant_actor'),('platform_private','b2b_actor_scope'),('public','is_valid_b2b_partner_user'));
SELECT organization_id,entity_type,count(*) FILTER(WHERE hidden) hidden FROM public.catalog_tenant_visibility GROUP BY organization_id,entity_type;
SELECT p.oid::regprocedure,p.proacl,p.proowner::regrole,p.proconfig,
 md5(pg_get_functiondef(p.oid)),pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname,p.proname) IN (('platform_private','h15_actor_organization'),
 ('platform_private','platform_actor_access_ready'),('public','fn_resolve_commercial_price'),
 ('public','fn_b2b_resolve_base_unit_price'));
SELECT table_name,column_name,data_type,udt_name,is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('catalog_tenant_visibility','organization_subscriptions',
 'organization_feature_overrides','partner_accounts','produtos','microrganismos',
 'product_technical_profiles','microorganism_technical_profiles','catalog_technical_sources',
 'product_target_recommendations','microorganism_targets','catalogo_volumes','envase','lotes') ORDER BY table_name,ordinal_position;
SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public'
AND tablename IN ('catalog_tenant_visibility','produtos','microrganismos','partner_accounts','partner_users','organization_subscriptions',
 'product_technical_profiles','microorganism_technical_profiles','catalog_technical_sources','product_target_recommendations',
 'microorganism_targets','catalogo_volumes','envase','lotes');
SELECT organization_id,to_jsonb(s)-'id' subscription_snapshot FROM public.organization_subscriptions s;
SELECT organization_id,to_jsonb(o)-'id' override_snapshot FROM public.organization_feature_overrides o;
SELECT c.oid::regclass,c.relrowsecurity,c.relforcerowsecurity,c.relacl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('catalog_tenant_visibility','produtos','microrganismos','partner_accounts','partner_users');
