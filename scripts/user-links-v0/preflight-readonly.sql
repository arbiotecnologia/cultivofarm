-- Read-only. Ref canônico comprovado fora do SQL, não pelo nome postgres.
SELECT p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition,p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('has_active_user_cliente_access','get_cliente_ids_for_user','fn_authz_uid_scope_ok','sync_user_cliente_principal','enforce_cliente_id_for_produtor');
SELECT * FROM pg_policies WHERE schemaname='public' AND tablename IN
('commercial_campaigns','commercial_campaign_clientes','commercial_campaign_products','commercial_campaign_partners','user_clientes','clientes','visitas_checkin','registros_consultor');
SELECT n.nspname,c.relname,c.relacl,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('commercial_campaigns','commercial_campaign_clientes','commercial_campaign_products','commercial_campaign_partners','user_clientes','clientes');
SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE NOT t.tgisinternal AND c.oid IN ('public.user_clientes'::regclass,'public.profiles'::regclass,'public.user_roles'::regclass) ORDER BY c.relname,t.tgname;
SELECT (SELECT reviewed FROM platform_private.user_edit_f2_gate WHERE singleton) common_gate,
       (SELECT count(*) FROM platform_private.user_edit_f2_audit) common_audit;