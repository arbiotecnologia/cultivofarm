-- =====================================================================
-- Fase SINIEF 4.0 — SNAPSHOT PRÉ-MIGRATION (SOMENTE LEITURA)
-- Alvo canônico: 20260807000000_fiscal_sinief_49_scaffolding.sql
-- Ref permitido:  ikaauvsflpmamgxmkhoq (staging AR-Bio-TEMP)
-- Ref proibido:   navfzbwgwzruipouyfnk (produção)
--
-- Este script NÃO altera dado nenhum. Ele emite tabelas de referência
-- que serão comparadas com 01-snapshot-post.sql após a aplicação.
--
-- Execução esperada (fora deste sandbox):
--   FISCAL_TEST_ENV=STAGING \
--   FISCAL_TEST_PROJECT_REF=ikaauvsflpmamgxmkhoq \
--   psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -A -F '|' \
--     -f restoration/fiscal-sinief49-fase4/00-snapshot-pre.sql \
--     > restoration/fiscal-sinief49-fase4/snapshot-pre.txt
-- =====================================================================

\echo '== SINIEF 49 :: SNAPSHOT PRE =='

-- Guard: marker obrigatório.
SELECT
  (SELECT count(*) FROM public._fiscal_staging_marker
     WHERE marker = 'STAGING' AND project_ref = 'ikaauvsflpmamgxmkhoq') AS marker_ok;

-- 1) fiscal_invoices — presença das colunas aditivas SINIEF (esperado: 0 antes).
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='fiscal_invoices'
  AND column_name IN (
    'direction','fiscal_operation_type','fin_nfe','tp_nf_debito',
    'tp_nf_credito','nature_operation','tax_authority_notes',
    'legal_basis','legal_version','legal_effective_date'
  )
ORDER BY column_name;

-- 2) Tabelas novas — esperado: 0 antes.
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN (
    'fiscal_invoice_references',
    'fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  )
ORDER BY table_name;

-- 3) fiscal_events — CHECK atual + valores atualmente aceitos.
SELECT conname, pg_get_constraintdef(oid, true) AS def
FROM pg_constraint
WHERE conrelid = 'public.fiscal_events'::regclass
  AND contype = 'c'
ORDER BY conname;

-- 4) Contagem de linhas das tabelas fiscais alvo (baseline p/ zero-alteração).
SELECT 'fiscal_invoices' AS t, count(*) AS n FROM public.fiscal_invoices
UNION ALL SELECT 'fiscal_invoice_items', count(*) FROM public.fiscal_invoice_items
UNION ALL SELECT 'fiscal_events', count(*) FROM public.fiscal_events
ORDER BY t;

-- 5) Snapshot hash sanitizado das colunas críticas atuais (baseline).
SELECT md5(string_agg(column_name || ':' || data_type || ':' || is_nullable, ','
                      ORDER BY ordinal_position)) AS fiscal_invoices_col_hash
FROM information_schema.columns
WHERE table_schema='public' AND table_name='fiscal_invoices';

-- 6) Policies/grants existentes em fiscal_invoices/items/events — devem
--    permanecer inalterados após a migration.
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('fiscal_invoices','fiscal_invoice_items','fiscal_events')
ORDER BY tablename, policyname;

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('fiscal_invoices','fiscal_invoice_items','fiscal_events')
ORDER BY table_name, grantee, privilege_type;

-- 7) Funções/policies preservadas: assinaturas conhecidas.
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'has_role','mask_sensitive_jsonb','rpc_fiscal_event_manual',
    'rpc_fiscal_draft_save','rpc_financial_document_soft_delete'
  )
ORDER BY proname, args;

\echo '== SINIEF 49 :: SNAPSHOT PRE FIM =='
