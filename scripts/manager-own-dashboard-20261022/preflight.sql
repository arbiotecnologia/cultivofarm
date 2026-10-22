-- READ ONLY. Run only on the canonical external project swzpzcwiasxmjutrmvkm,
-- after destination verification; this file does not itself prove the project ref.
SELECT n.nspname AS schema, p.proname, p.oid::regprocedure::text AS signature,
 pg_get_userbyid(p.proowner) AS owner, p.proacl, p.prosecdef, p.provolatile,
 p.proconfig, md5(pg_get_functiondef(p.oid)) AS definition_md5,
 pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','platform_private') AND p.proname IN (
 'get_my_commercial_orders_projection','b2b_commercial_own_orders','b2b_commercial_context',
 'get_my_commercial_partner_projection','rpc_portal_partner_financial','rpc_partner_dashboard',
 'rpc_b2b_financial_kpis','get_my_available_portal_contexts','set_my_context_preference',
 'b2b_actor_scope','assert_b2b_partner_scope','is_valid_b2b_partner_user')
ORDER BY n.nspname,p.proname,p.oid;

SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('partner_orders','partner_order_items',
 'partner_accounts','partner_users','partner_order_financial_links','accounts_receivable',
 'accounts_receivable_installments','financial_documents','partner_simulations','partner_simulation_items',
 'partner_technician_clients','partner_user_clients','partner_clients','entregas','ordens_servico')
ORDER BY tablename,policyname;

SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name IN ('partner_orders','partner_order_financial_links',
 'accounts_receivable','accounts_receivable_installments','financial_documents','partner_users')
ORDER BY table_name,grantee,privilege_type;