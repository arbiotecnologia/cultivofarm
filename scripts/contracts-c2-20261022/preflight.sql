-- SOMENTE LEITURA. Executar exclusivamente no projeto swzpzcwiasxmjutrmvkm.
-- Cliente executor DEVE conferir URL/ref antes da conexão; SQL não identifica project ref.
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,
 md5(pg_get_functiondef(p.oid)) AS md5,p.proacl::text AS acl,pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prokind='f' AND (n.nspname='cf_user_guards_v1' OR p.proname IN
 ('b2b_actor_scope','is_valid_b2b_partner_user','b2b_assignment_identity_coherent','b2b_commercial_context',
 'get_my_available_portal_contexts','link_partner_user','set_partner_user_papel','set_my_context_preference',
 'admin_edit_user_profile_v1','external_provisioning_scope','b2b_claim_provisioning','b2b_finish_provisioning'))
ORDER BY 1,2,3;
SELECT c.relname,conname,pg_get_constraintdef(co.oid) AS definition FROM pg_constraint co
JOIN pg_class c ON c.oid=co.conrelid WHERE co.conrelid IN
 ('public.partner_users'::regclass,'public.user_roles'::regclass,'public.partner_audit_logs'::regclass);
SELECT tgrelid::regclass,tgname,pg_get_triggerdef(oid),md5(pg_get_functiondef(tgfoid))
FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN
 ('public.profiles'::regclass,'public.user_roles'::regclass,'public.partner_users'::regclass,'public.user_clientes'::regclass);
SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('partner_users','user_roles','partner_audit_logs');
SELECT count(*) AS explicit_partner_organizations FROM public.organizations WHERE partner_account_id IS NOT NULL;
SELECT count(*) AS existing_c2_receipts FROM public.partner_audit_logs WHERE acao='c2_partner_lifecycle';
-- Exact applied scope MUST remain unchanged.
SELECT 1 / CASE WHEN md5(pg_get_functiondef('platform_private.b2b_actor_scope(uuid)'::regprocedure))=
 'c3f2997746f24bc2efd15db5c0ccc862' THEN 1 ELSE 0 END AS applied_scope_unchanged;