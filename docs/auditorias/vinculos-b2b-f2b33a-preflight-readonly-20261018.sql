-- SOMENTE SELECT. Destino externo deve ser comprovado: swzpzcwiasxmjutrmvkm.
-- Literal/current_database/GUC não comprovam o endpoint. Exportar em snapshot READ ONLY.
SELECT 'F2B33A' AS phase,
 (SELECT count(*) FROM public.partner_user_clients) AS puc_rows,
 (SELECT count(*) FROM public.partner_technician_clients) AS ptc_rows;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,
 pg_get_function_result(p.oid) AS result,pg_get_userbyid(p.proowner) AS owner,
 p.prosecdef,p.proconfig,p.proacl::text,md5(pg_get_functiondef(p.oid)) AS md5,
 pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN ('assign_b2b_user_client_secure',
 'unassign_b2b_user_client_secure','validate_partner_user_client_fn','sync_puc_to_ptc_fn',
 'can_user_access_cliente','get_user_partner_id','get_partner_papel','h15_actor_organization'))
 OR (n.nspname='platform_private' AND p.proname IN ('b2b_commercial_context',
 'b2b_actor_scope','b2b_phase1_partner_visible','issue_ticket','has_ticket'))
 OR n.nspname='cf_user_guards_v1'
 OR p.prosrc ~ '\m(partner_user_clients|partner_technician_clients|issue_ticket|has_ticket)\M'
ORDER BY n.nspname,p.proname,args;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
FROM pg_policies WHERE tablename IN ('partner_user_clients','partner_technician_clients',
 'authz_tickets','partner_audit_logs')
 OR (coalesce(qual,'')||coalesce(with_check,'')) ~
 '\m(get_user_partner_id|get_partner_papel|get_b2b_user_role_for_partner|is_valid_b2b_partner_user)\M'
ORDER BY schemaname,tablename,policyname;
SELECT n.nspname,c.relname,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,
 pg_get_userbyid(c.relowner) AS owner
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='public' AND c.relname IN ('partner_user_clients',
 'partner_technician_clients','partner_audit_logs'))
 OR (n.nspname='platform_private' AND c.relname='authz_tickets');
SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('partner_user_clients',
 'partner_technician_clients','partner_users','profiles','user_roles') AND NOT t.tgisinternal
ORDER BY c.relname,t.tgname;
-- Completar manifesto ampliado B3.2: rowshape/ACL coluna/FKs/índices/dependências dinâmicas.
-- Nenhuma identidade, email ou receipt operacional é exportado neste recorte.