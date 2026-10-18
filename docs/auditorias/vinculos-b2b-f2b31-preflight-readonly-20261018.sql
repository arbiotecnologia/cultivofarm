-- B3.1 READ-ONLY; ref deve ser comprovado no painel/endpoint antes de qualquer execução.
-- current_database(), literal de ref e GUC não comprovam destino nem autorizam ator.
WITH manifest AS (
 SELECT 'function:'||p.oid::regprocedure::text AS key,
 pg_get_functiondef(p.oid)||'|'||pg_get_userbyid(p.proowner)||'|'||coalesce(p.proacl::text,'NULL') AS value
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prokind='f' AND (p.prosrc ~ '\mpartner_technician_clients\M|\mpartner_user_clients\M'
 OR (n.nspname='public' AND p.proname IN ('validate_partner_user_client_fn','assign_b2b_user_client_secure',
 'unassign_b2b_user_client_secure','get_b2b_partner_clients_for_assignment_secure'))
 OR (n.nspname='platform_private' AND p.proname='b2b_commercial_context'))
 UNION ALL SELECT 'policy:'||schemaname||'.'||tablename||'.'||policyname,
 permissive||'|'||roles::text||'|'||cmd||'|'||coalesce(qual,'NULL')||'|'||coalesce(with_check,'NULL')
 FROM pg_policies WHERE tablename IN ('partner_user_clients','partner_technician_clients')
 OR (coalesce(qual,'')||coalesce(with_check,'')) ~ '\m(get_user_partner_id|get_partner_papel|get_b2b_user_role_for_partner|is_valid_b2b_partner_user|partner_user_clients|partner_technician_clients)\M'
 UNION ALL SELECT 'trigger:'||c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients') AND NOT t.tgisinternal
 UNION ALL SELECT 'constraint:'||c.relname||'.'||k.conname,pg_get_constraintdef(k.oid)
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients')
 UNION ALL SELECT 'table:'||c.relname,c.relrowsecurity::text||'|'||c.relforcerowsecurity::text||'|'||coalesce(c.relacl::text,'NULL')
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('partner_user_clients','partner_technician_clients')
)
SELECT md5(string_agg(key||'='||value,E'\n' ORDER BY key)),count(*) FROM manifest;
SELECT (SELECT count(*) FROM public.partner_user_clients) AS puc_rows,
 (SELECT count(*) FROM public.partner_technician_clients) AS ptc_rows;
SELECT table_name,column_name,udt_name,is_nullable,column_default FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('partner_user_clients','partner_technician_clients') ORDER BY table_name,ordinal_position;
SELECT conrelid::regclass::text,conname,pg_get_constraintdef(oid) FROM pg_constraint
 WHERE contype='f' AND confrelid IN ('public.partner_user_clients'::regclass,'public.partner_technician_clients'::regclass);
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
 WHERE (coalesce(qual,'')||coalesce(with_check,'')) ~ '\m(get_user_partner_id|get_partner_papel|get_b2b_user_role_for_partner|is_valid_b2b_partner_user)\M'
 ORDER BY schemaname,tablename,policyname;
