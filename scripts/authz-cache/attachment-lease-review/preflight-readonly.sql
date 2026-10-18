-- SELECT-only; auditor MUST establish canonical project swzpzcwiasxmjutrmvkm
-- in the connector before execution. This script does not establish its own
-- destination. Never use an unproven binding or a prohibited project.
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id;
SELECT c.relname,c.relacl,c.relrowsecurity,c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='storage' AND c.relname='objects';
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE (schemaname='storage' AND tablename='objects') OR
 (schemaname='public' AND tablename IN ('partner_order_message_attachments',
 'partner_order_messages','partner_orders','cliente_documentos','aplicacao_evidencias',
 'entrega_documentos','entrega_termos','financial_receipts','financial_report_exports','fiscal_xml_runs'))
ORDER BY schemaname,tablename,policyname;
SELECT n.nspname,p.oid::regprocedure AS signature,p.proacl,p.proowner::regrole,
 p.proconfig,p.provolatile,p.prosecdef,md5(pg_get_functiondef(p.oid)) AS md5,
 pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='storage' AND p.proname IN ('operation','allow_any_operation','foldername')) OR
 (n.nspname='public' AND p.proname IN ('cliente_storage_object_permitted',
 'financial_storage_object_permitted','storage1_delivery_allowed',
 'storage1_application_allowed','storage1_consultor_allowed',
 'aplicacao_storage_path_permitido','h15_actor_organization','can_user_access_cliente',
 'can_user_access_aplicacao','can_user_access_arquivo', 'h15_service_actor_run_access',
 'get_user_partner_id','rpc_partner_message_counters','admin_edit_user_profile_v1'))
ORDER BY n.nspname,signature;
-- Explicitly inventory historical reverse-order writer against current body;
-- reproduction local is not evidence of the same code in production today.
SELECT t.tgrelid::regclass,t.tgname,t.tgtype,t.tgenabled,pg_get_triggerdef(t.oid),
 md5(pg_get_triggerdef(t.oid)),t.tgfoid::regprocedure,md5(pg_get_functiondef(t.tgfoid))
FROM pg_trigger t WHERE NOT t.tgisinternal AND t.tgrelid IN
 ('public.profiles'::regclass,'public.user_roles'::regclass,'public.partner_users'::regclass,
 'public.organizations'::regclass,'public.partner_accounts'::regclass)
ORDER BY t.tgrelid::regclass::text,t.tgname;
-- Edge deployed source/operation HTTP cannot be proven by this SQL inventory.