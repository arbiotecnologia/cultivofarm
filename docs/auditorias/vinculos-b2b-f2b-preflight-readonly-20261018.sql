-- SELECT-only; provar ref canônico fora do SQL. Não constitui aprovação.
SELECT p.oid::regprocedure signature,pg_get_functiondef(p.oid) body,
 md5(pg_get_functiondef(p.oid)) body_md5,p.proacl,p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
AND p.proname IN ('get_user_partner_id','get_partner_papel','get_b2b_user_role_for_partner','is_valid_b2b_partner_user');
SELECT schemaname,tablename,policyname,roles,cmd,permissive,qual,with_check FROM pg_policies
WHERE coalesce(qual,'')||' '||coalesce(with_check,'') ~ '(get_user_partner_id|get_partner_papel|get_b2b_user_role_for_partner|is_valid_b2b_partner_user)'
ORDER BY schemaname,tablename,policyname;
SELECT p.oid::regprocedure signature,pg_get_functiondef(p.oid) body,p.proacl FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')
AND p.prokind='f' AND p.prosrc ~ '(get_user_partner_id|get_partner_papel|get_b2b_user_role_for_partner|is_valid_b2b_partner_user)';
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal
AND tgrelid IN ('public.partner_users'::regclass,'public.partner_user_clients'::regclass);
SELECT count(*) links,count(*) FILTER(WHERE pu.revoked_at IS NULL) active,
 count(*) FILTER(WHERE pu.tenant_id IS NULL) null_tenant,
 count(*) FILTER(WHERE pu.tenant_id IS DISTINCT FROM pa.commercial_owner_organization_id) divergent,
 count(*) FILTER(WHERE pr.organization_id IS DISTINCT FROM pu.tenant_id) profile_other_org
FROM public.partner_users pu LEFT JOIN public.partner_accounts pa ON pa.id=pu.partner_id
LEFT JOIN public.profiles pr ON pr.user_id=pu.user_id;
