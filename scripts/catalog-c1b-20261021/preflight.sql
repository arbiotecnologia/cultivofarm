-- psql -X -v ON_ERROR_STOP=1 -v canonical_ref=swzpzcwiasxmjutrmvkm -f preflight.sql
-- Read-only. Run with approved operator access; outputs no Auth credentials.
SELECT :'canonical_ref' = 'swzpzcwiasxmjutrmvkm' AS canonical_ref_ok;
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
