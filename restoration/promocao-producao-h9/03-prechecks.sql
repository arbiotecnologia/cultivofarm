-- ============================================================================
-- P0 — PRECHECKS DE PROMOÇÃO H9 (SOMENTE LEITURA)
-- Nenhum comando aqui escreve. Não há DDL, DML, GRANT, SET persistente,
-- criação de objeto temporário ou chamada de função com efeito colateral.
-- Executar com um papel de leitura, na janela aprovada, contra o alvo declarado.
-- NÃO executar durante a P0.
-- ============================================================================
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- BLOCO A — Identidade do alvo e confirmação do delta de 192 versões
-- ---------------------------------------------------------------------------
-- A1. Identidade do banco (registrar na evidência; abortar se inesperado).
SELECT current_database() AS db, version() AS pg_version, now() AT TIME ZONE 'UTC' AS ts_utc;

-- A2. Ledger do alvo: total e última versão.
SELECT count(*) AS total_versoes, max(version) AS ultima_versao
FROM supabase_migrations.schema_migrations;

-- A3. Lista completa do ledger do alvo (exportar para diff com o manifesto).
SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;

-- A4. Confirmação de que nenhuma versão existe só no alvo (esperado: 0 linhas
--     quando comparado ao ledger de homologação, fora do banco).
--     Comparação feita offline entre A3 do alvo e A3 da homologação.

-- ---------------------------------------------------------------------------
-- BLOCO B — Fingerprint estrutural (comparar com o baseline do dossiê)
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.tables
     WHERE table_schema IN ('public','storage')) AS tabelas,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema IN ('public','storage')) AS colunas,
  (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
     WHERE n.nspname='public') AS constraints,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public') AS funcoes,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef) AS funcoes_secdef,
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public') AS indices,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS policies,
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND NOT t.tgisinternal) AS triggers,
  (SELECT count(*) FROM pg_extension) AS extensoes;

-- ---------------------------------------------------------------------------
-- BLOCO C — Segurança de base (pré-condição de qualquer onda)
-- ---------------------------------------------------------------------------
-- C1. Tabelas public sem RLS habilitada.
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
ORDER BY 1;

-- C2. Tabelas com RLS mas sem nenhuma policy.
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname='public' AND p.tablename=c.relname)
ORDER BY 1;

-- C3. SECURITY DEFINER sem search_path fixado.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) cfg
                  WHERE cfg LIKE 'search_path=%')
ORDER BY 1;

-- C4. EXECUTE concedido a anon em funções SECURITY DEFINER.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY 1;

-- C5. Views SECURITY DEFINER (os 2 ERROR do advisor de produção).
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='v'
  AND 'security_invoker=on' <> ALL (coalesce(c.reloptions, '{}'))
ORDER BY 1;

-- C6. Policies abertas a PUBLIC.
SELECT tablename, policyname, roles
FROM pg_policies
WHERE schemaname='public' AND roles::text[] @> ARRAY['public']
ORDER BY 1,2;

-- ---------------------------------------------------------------------------
-- BLOCO D — Artefatos que NÃO podem existir no alvo
-- ---------------------------------------------------------------------------
SELECT c.relname AS artefato_staging_only
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN (
  '_f42_harness_fixtures','_fiscal_staging_marker','_motor_b2b_pre_phase1_snapshot',
  'estoque_movimentacoes_orfaos_backup','fiscal_environment_marker','hml_fixture_registry')
ORDER BY 1;   -- esperado: 0 linhas

-- ---------------------------------------------------------------------------
-- BLOCO E — Integrações externas: têm de estar DESLIGADAS
-- ---------------------------------------------------------------------------
-- E1. Jobs agendados.
SELECT jobid, schedule, jobname, active FROM cron.job ORDER BY jobid;

-- E2. Flags de entrega de comunicação (fail-closed obrigatório).
SELECT chave, valor FROM public.financial_settings
WHERE chave ILIKE '%delivery%' OR chave ILIKE '%webhook%' ORDER BY 1;

-- E3. Ambiente fiscal: produção só após gate fiscal próprio.
SELECT id, cnpj, configuration_status, is_active FROM public.company_fiscal_settings;

-- ---------------------------------------------------------------------------
-- BLOCO F — Locks, transações longas e saúde antes da janela
-- ---------------------------------------------------------------------------
SELECT pid, state, wait_event_type, wait_event,
       now()-xact_start AS idade_transacao, left(query,120) AS query
FROM pg_stat_activity
WHERE datname = current_database() AND state <> 'idle'
ORDER BY xact_start NULLS LAST;

SELECT relation::regclass AS objeto, mode, granted
FROM pg_locks WHERE relation IS NOT NULL AND NOT granted;

-- ---------------------------------------------------------------------------
-- BLOCO G — Volumetria das tabelas que receberão coluna/índice/backfill
-- ---------------------------------------------------------------------------
SELECT relname, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname='public'
ORDER BY n_live_tup DESC
LIMIT 40;

-- FIM. Nenhuma escrita foi executada.
