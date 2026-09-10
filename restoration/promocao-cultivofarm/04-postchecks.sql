-- ============================================================================
-- PROMOÇÃO CULTIVOFARM — PÓS-CHECKS DE ACEITE
-- Alvo: swzpzcwiasxmjutrmvkm. Executar após cada onda e ao final.
-- Somente leitura. Compare a saída com 00-inventario-esperado/ (staging).
-- ============================================================================

SET default_transaction_read_only = on;

-- 1. Paridade estrutural — números globais
SELECT 'tabelas'  AS objeto, count(*) FROM pg_tables WHERE schemaname='public'
UNION ALL SELECT 'views', count(*) FROM pg_views WHERE schemaname='public'
UNION ALL SELECT 'matviews', count(*) FROM pg_matviews WHERE schemaname='public'
UNION ALL SELECT 'funcoes', count(*) FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
UNION ALL SELECT 'funcoes_secdef', count(*) FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef
UNION ALL SELECT 'triggers', count(*) FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE NOT t.tgisinternal AND n.nspname='public'
UNION ALL SELECT 'indices', count(*) FROM pg_indexes WHERE schemaname='public'
UNION ALL SELECT 'policies', count(*) FROM pg_policies WHERE schemaname='public'
UNION ALL SELECT 'fks', count(*) FROM pg_constraint c
  JOIN pg_namespace n ON n.oid=c.connamespace
  WHERE n.nspname='public' AND c.contype='f'
UNION ALL SELECT 'enums', count(DISTINCT t.typname) FROM pg_type t
  JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='public' AND t.typtype='e';

-- 2. GATE: 100% das tabelas public com RLS habilitada
SELECT c.relname AS tabela_sem_rls
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
ORDER BY 1;

-- 3. GATE: nenhuma tabela com RLS e zero policies (acesso morto silencioso)
SELECT c.relname AS tabela_rls_sem_policy
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname='public' AND p.tablename=c.relname)
ORDER BY 1;

-- 4. GATE: nenhuma tabela public sem GRANT para authenticated ou service_role
SELECT c.relname AS tabela_sem_grant
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants g
    WHERE g.table_schema='public' AND g.table_name=c.relname
      AND g.grantee IN ('authenticated','service_role'))
ORDER BY 1;

-- 5. GATE: SECURITY DEFINER sem search_path fixo
SELECT p.oid::regprocedure AS assinatura_sem_search_path
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND (p.proconfig IS NULL
       OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) o WHERE o LIKE 'search_path=%'))
ORDER BY 1;

-- 6. GATE: views sem security_invoker
SELECT c.relname AS view_sem_security_invoker
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v'
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(c.reloptions,'{}')) o
                  WHERE o = 'security_invoker=true')
ORDER BY 1;

-- 7. GATE: nenhum dado de negócio migrado
SELECT relname, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname='public' AND n_live_tup > 0
ORDER BY n_live_tup DESC;

-- 8. GATE: Auth vazio nesta etapa (admin@arbio.com só na etapa posterior)
SELECT count(*) AS auth_users FROM auth.users;
SELECT email FROM auth.users ORDER BY created_at;

-- 9. GATE: jobs de cron criados desabilitados
SELECT jobid, jobname, schedule, active
FROM cron.job ORDER BY jobname;

-- 10. Ledger: apenas a(s) versão(ões) do baseline
SELECT version FROM supabase_migrations.schema_migrations ORDER BY 1;

-- 11. Hash de corpo das funções, para diff contra o staging
SELECT p.oid::regprocedure AS assinatura, md5(pg_get_functiondef(p.oid)) AS hash_corpo
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' ORDER BY 1;

-- FIM — nenhuma escrita foi emitida por este arquivo.
