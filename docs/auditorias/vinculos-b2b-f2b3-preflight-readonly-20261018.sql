-- SOMENTE SELECT. Executar manualmente apenas após comprovar ref swzpzcwiasxmjutrmvkm.
-- current_database()='postgres' NÃO identifica projeto Supabase.
SELECT 'F2B3_BASELINE' AS scope,
 (SELECT count(*) FROM public.partner_user_clients) AS puc_rows,
 (SELECT count(*) FROM public.partner_technician_clients) AS ptc_rows;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,
 md5(pg_get_functiondef(p.oid)) AS definition_md5,
 pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,p.proacl::text,
 pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.prosrc ~ '\mpartner_technician_clients\M|\mpartner_user_clients\M'
 OR (n.nspname='public' AND p.proname IN ('validate_partner_user_client_fn',
 'assign_b2b_user_client_secure','unassign_b2b_user_client_secure'))
ORDER BY n.nspname,p.proname,args;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE tablename IN ('partner_user_clients','partner_technician_clients')
 OR (coalesce(qual,'')||coalesce(with_check,'')) ~ '\mpartner_technician_clients\M|\mpartner_user_clients\M'
ORDER BY schemaname,tablename,policyname;
SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients')
 AND NOT t.tgisinternal ORDER BY c.relname,t.tgname;
SELECT c.relname,k.conname,pg_get_constraintdef(k.oid)
FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients')
ORDER BY c.relname,k.conname;
SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('partner_user_clients','partner_technician_clients')
ORDER BY table_name,ordinal_position;
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients');
SELECT tablename,indexname,indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename IN ('partner_user_clients','partner_technician_clients')
ORDER BY tablename,indexname;
-- Retornar contagens/digests ao relatório, nunca identidades/PII.