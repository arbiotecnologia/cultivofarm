-- F2-B1 2026-10-18 | SOMENTE REVISÃO. Nada executado hosted.
-- Ref obrigatório swzpzcwiasxmjutrmvkm; confirmar externamente, não por GUC/database.
-- SELECT-only. Auditor exporta íntegra sem PII; confirmar ref fora do SQL.
SELECT n.nspname,p.oid::regprocedure signature,p.proacl,p.proowner::regrole,p.prosecdef,p.provolatile,p.proconfig,md5(pg_get_functiondef(p.oid)) digest,pg_get_functiondef(p.oid) ddl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND (p.prosrc ~ '\mpartner_users\M' OR p.proname IN ('validate_partner_user_client_fn','sync_puc_to_ptc_fn','b2b_phase1_partner_visible','b2b_commercial_partner_projection','cliente_storage_object_permitted','can_user_access_cliente','b2b_partner_logo_write_allowed','assign_b2b_user_client_secure')) ORDER BY 1,2;
SELECT schemaname,tablename,policyname,roles,cmd,permissive,qual,with_check FROM pg_policies
WHERE schemaname='storage' OR coalesce(qual,'')||coalesce(with_check,'') ~ '(partner_users|get_user_partner_id|get_partner_papel|get_b2b_user_role_for_partner|is_valid_b2b_partner_user)' OR tablename IN ('partner_user_clients','partner_technician_clients');
SELECT c.oid::regclass relation,c.relacl,c.relrowsecurity,c.relforcerowsecurity,t.tgname,pg_get_triggerdef(t.oid) ddl
FROM pg_class c LEFT JOIN pg_trigger t ON t.tgrelid=c.oid AND NOT t.tgisinternal WHERE c.oid IN ('public.partner_users'::regclass,'public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass);
SELECT (SELECT count(*) FROM public.partner_users WHERE revoked_at IS NULL) unrevoked,(SELECT count(*) FROM public.partner_user_clients WHERE active) active_puc,(SELECT count(*) FROM public.partner_technician_clients WHERE active) active_ptc;
