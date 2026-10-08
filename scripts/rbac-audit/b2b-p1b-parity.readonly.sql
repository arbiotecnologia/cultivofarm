-- P1B: executar SELECT separadamente em cada destino comprovado.
-- Sem dados de negócio, segredos, rebind ou metadata Storage.
-- Comparar arrays completos, não somente MD5. Ref homolog autorizado: vrlcdwmlytukrjezrrnf.
WITH tableset(name) AS (VALUES
 ('organizations'),('partner_accounts'),('clientes'),('partner_users'),
 ('partner_clients'),('partner_user_clients'),('partner_orders'),('partner_order_items'),
 ('partner_order_financial_links'),('accounts_receivable'),('accounts_receivable_installments'),
 ('production_planning'),('production_order_link'),('ordens_servico'),('entregas'),
 ('fiscal_invoices'),('fiscal_invoice_items'),('fiscal_events'),('company_fiscal_settings')),
snapshots(category,items) AS (
 SELECT 'migrations',coalesce(jsonb_agg(jsonb_build_object('version',version,'name',name,
    'hash',md5(array_to_string(statements,E'\n'))) ORDER BY version),'[]'::jsonb)
 FROM supabase_migrations.schema_migrations
 UNION ALL
 SELECT 'columns',coalesce(jsonb_agg(to_jsonb(c) ORDER BY table_name,ordinal_position),'[]'::jsonb)
 FROM (SELECT table_name,column_name,ordinal_position,udt_name,is_nullable,column_default
 FROM information_schema.columns WHERE table_schema='public' AND table_name IN (SELECT name FROM tableset)) c
 UNION ALL
 SELECT 'rls',coalesce(jsonb_agg(jsonb_build_object('name',t.name,'exists',c.oid IS NOT NULL,
    'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity) ORDER BY t.name),'[]'::jsonb)
 FROM tableset t LEFT JOIN pg_class c ON c.relname=t.name AND c.relnamespace='public'::regnamespace
 UNION ALL
 SELECT 'policies',coalesce(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname),'[]'::jsonb)
 FROM pg_policies p WHERE schemaname='public' AND tablename IN (SELECT name FROM tableset)
 UNION ALL
 SELECT 'constraints',coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,
    'definition',pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname),'[]'::jsonb)
 FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
 WHERE c.relnamespace='public'::regnamespace AND c.relname IN (SELECT name FROM tableset)
 UNION ALL
 SELECT 'table_grants',coalesce(jsonb_agg(to_jsonb(g) ORDER BY table_name,grantee,privilege_type),'[]'::jsonb)
 FROM information_schema.role_table_grants g WHERE table_schema='public' AND table_name IN (SELECT name FROM tableset)
 UNION ALL
 SELECT 'rpc_and_acl',coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
   'args',pg_get_function_identity_arguments(p.oid),'definition_hash',md5(pg_get_functiondef(p.oid)),
   'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text,
   'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
   'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE')) ORDER BY n.nspname,p.proname,p.oid),'[]'::jsonb)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','platform_private') AND p.prokind='f'
   AND (p.proname ILIKE '%b2b%' OR p.proname ILIKE '%partner%'
     OR p.proname ILIKE '%fiscal%' OR p.proname ILIKE '%h15%')
)
SELECT category,md5(items::text) fingerprint,items FROM snapshots ORDER BY category;