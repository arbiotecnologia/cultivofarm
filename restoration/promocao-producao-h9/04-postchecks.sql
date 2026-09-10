-- ============================================================================
-- P0 — POSTCHECKS DE PROMOÇÃO H9 (SOMENTE LEITURA)
-- Executar após CADA onda. Nenhum comando escreve.
-- Critério: qualquer linha em consulta marcada "esperado: 0 linhas" => ABORT.
-- NÃO executar durante a P0.
-- ============================================================================
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- 1. Ledger: versões da onda presentes e na ordem esperada
-- ---------------------------------------------------------------------------
SELECT count(*) AS total_versoes, max(version) AS ultima_versao
FROM supabase_migrations.schema_migrations;

-- Substituir a lista pela coluna `version` das linhas da onda em
-- 01-manifesto-migrations.csv. Esperado: uma linha por versão da onda.
-- SELECT version FROM supabase_migrations.schema_migrations
--  WHERE version IN (...) ORDER BY version;

-- ---------------------------------------------------------------------------
-- 2. Nenhuma versão em quarentena entrou no alvo
--    (59 repo-only BLOQUEADA_PERMANENTE; as 20 de backend estranho começam com 20260812)
-- ---------------------------------------------------------------------------
SELECT version FROM supabase_migrations.schema_migrations
WHERE version LIKE '20260812%'
ORDER BY 1;   -- esperado: 0 linhas

-- ---------------------------------------------------------------------------
-- 3. Nenhum artefato de homologação foi criado
-- ---------------------------------------------------------------------------
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN (
  '_f42_harness_fixtures','_fiscal_staging_marker','_motor_b2b_pre_phase1_snapshot',
  'estoque_movimentacoes_orfaos_backup','fiscal_environment_marker','hml_fixture_registry')
ORDER BY 1;   -- esperado: 0 linhas

-- ---------------------------------------------------------------------------
-- 4. Segurança não regrediu
-- ---------------------------------------------------------------------------
-- 4a. Tabela nova sem RLS.
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
ORDER BY 1;

-- 4b. Tabela com RLS e sem policy.
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname)
ORDER BY 1;

-- 4c. Tabela sem GRANT para authenticated (Data API inacessível).
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND NOT has_table_privilege('authenticated', c.oid, 'SELECT')
  AND NOT has_table_privilege('anon', c.oid, 'SELECT')
ORDER BY 1;

-- 4d. SECURITY DEFINER sem search_path.  Esperado: 0 linhas.
SELECT p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
ORDER BY 1;

-- 4e. SECURITY DEFINER executável por anon.  Não pode aumentar em relação ao precheck C4.
SELECT p.proname, pg_get_function_identity_arguments(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY 1;

-- 4f. Views sem security_invoker.  Alvo: reduzir para 0 (os 2 ERROR do advisor).
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v'
  AND 'security_invoker=on' <> ALL (coalesce(c.reloptions,'{}'))
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- 5. Integridade estrutural
-- ---------------------------------------------------------------------------
-- 5a. Constraints/FKs não validadas.  Esperado: 0 linhas.
SELECT conrelid::regclass AS tabela, conname
FROM pg_constraint WHERE NOT convalidated ORDER BY 1,2;

-- 5b. Índices inválidos.  Esperado: 0 linhas.
SELECT c.relname AS indice
FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT i.indisvalid ORDER BY 1;

-- 5c. Funções com corpo inválido / dependências quebradas: recompilação lógica.
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND pg_get_functiondef(p.oid) IS NULL ORDER BY 1;

-- ---------------------------------------------------------------------------
-- 6. Nenhum evento externo disparado durante a onda
-- ---------------------------------------------------------------------------
SELECT count(*) AS eventos_comunicacao_recentes
FROM public.comunicacao_eventos WHERE created_at > now() - interval '2 hours';
-- esperado: 0

SELECT jobid, jobname, active FROM cron.job ORDER BY jobid;
-- toda entrega externa deve permanecer inativa

-- ---------------------------------------------------------------------------
-- 7. Resíduo de dados: nenhuma massa de homologação
-- ---------------------------------------------------------------------------
SELECT 'clientes' AS tabela, count(*) FROM public.clientes
 WHERE nome ILIKE 'H6B-%' OR nome ILIKE '%HOMOLOG%' OR nome ILIKE 'H9GM%'
UNION ALL
SELECT 'partner_accounts', count(*) FROM public.partner_accounts WHERE codigo ILIKE 'HML-B2B-%';
-- esperado: 0 em todas as linhas

-- FIM. Nenhuma escrita foi executada.
