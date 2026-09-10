-- =====================================================================
-- PROMOÇÃO CULTIVOFARM — PÓS-CHECKS SOMENTE LEITURA (pacote concatenado)
-- Alvo obrigatório: swzpzcwiasxmjutrmvkm
--
-- Complementa 04-postchecks.sql; não o substitui.
-- Nenhum comando altera dados ou schema. Uso:
--   psql "$CULTIVOFARM_DSN" -v ON_ERROR_STOP=1 -f 24-postchecks-readonly.sql
-- =====================================================================
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_setting('promocao.target_ref', true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN
    RAISE EXCEPTION 'ABORT P0: promocao.target_ref ausente ou diferente de swzpzcwiasxmjutrmvkm';
  END IF;
END $$;

-- P1 — inventário estrutural criado.
SELECT 'P1_inventario' AS check, c.relkind, count(*) AS total
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','i')
 GROUP BY c.relkind ORDER BY c.relkind;

-- P2 — toda tabela public com RLS habilitada (gate bloqueante).
SELECT 'P2_tabelas_sem_rls' AS check, coalesce(string_agg(c.relname, ','), '(nenhuma)') AS valor
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

-- P3 — toda tabela com RLS possui ao menos uma policy.
SELECT 'P3_rls_sem_policy' AS check, coalesce(string_agg(t.relname, ','), '(nenhuma)') AS valor
  FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
  LEFT JOIN pg_policy p ON p.polrelid = t.oid
 WHERE n.nspname = 'public' AND t.relkind = 'r' AND t.relrowsecurity AND p.oid IS NULL;

-- P4 — SECURITY DEFINER sem search_path fixado.
SELECT 'P4_secdef_sem_search_path' AS check,
       coalesce(string_agg(p.proname, ','), '(nenhuma)') AS valor
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef
   AND (p.proconfig IS NULL OR NOT EXISTS (
         SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'));

-- P5 — views devem ser security_invoker.
SELECT 'P5_views_sem_invoker' AS check,
       coalesce(string_agg(c.relname, ','), '(nenhuma)') AS valor
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'v'
   AND coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                  WHERE option_name = 'security_invoker'), 'false') <> 'true';

-- P6 — nenhum dado de negócio migrado: amostra de contagem total.
SELECT 'P6_linhas_estimadas' AS check, coalesce(sum(c.reltuples)::bigint, 0) AS valor
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r';

-- P7 — Auth e Storage permanecem vazios nesta etapa.
SELECT 'P7_auth_users' AS check, count(*) AS valor FROM auth.users;
SELECT 'P7_storage_buckets' AS check, count(*) AS valor FROM storage.buckets;

-- P8 — cron: nenhum job ativo logo após a promoção estrutural.
SELECT 'P8_cron_ativos' AS check, count(*) AS valor
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'cron' AND c.relname = 'job';

-- P9 — ledger registra exatamente a versão baseline do pacote.
SELECT 'P9_ledger' AS check, count(*) AS total, coalesce(max(version),'(vazio)') AS latest
  FROM supabase_migrations.schema_migrations;

-- CRITÉRIO DE ACEITE: P2, P3, P4, P5 = '(nenhuma)'; P6 ≈ 0; P7 = 0; P8 = 0.
-- Qualquer violação exige ROLLBACK conforme 05-rollback.md.
