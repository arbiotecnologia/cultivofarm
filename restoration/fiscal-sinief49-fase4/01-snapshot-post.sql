-- =====================================================================
-- Fase SINIEF 4.0 — SNAPSHOT PÓS-MIGRATION (SOMENTE LEITURA)
-- Alvo: verificar aditividade e zero regressão após aplicação de
--       20260807000000_fiscal_sinief_49_scaffolding.sql em staging.
--
-- Este script NÃO altera dado nenhum. Comparar com 00-snapshot-pre.sql.
-- =====================================================================

\echo '== SINIEF 49 :: SNAPSHOT POST =='

-- Guard reforçado.
SELECT
  (SELECT count(*) FROM public._fiscal_staging_marker
     WHERE marker='STAGING' AND project_ref='ikaauvsflpmamgxmkhoq') AS marker_ok;

-- 1) fiscal_invoices — 10 colunas aditivas, TODAS nullable.
WITH esperado(col, tipo) AS (VALUES
  ('direction','text'),
  ('fiscal_operation_type','text'),
  ('fin_nfe','smallint'),
  ('tp_nf_debito','smallint'),
  ('tp_nf_credito','smallint'),
  ('nature_operation','text'),
  ('tax_authority_notes','text'),
  ('legal_basis','text'),
  ('legal_version','text'),
  ('legal_effective_date','date')
)
SELECT e.col, e.tipo,
       c.data_type AS achou_tipo,
       c.is_nullable AS nullable,
       (c.column_name IS NOT NULL) AS presente
FROM esperado e
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name='fiscal_invoices'
 AND c.column_name = e.col
ORDER BY e.col;

-- 2) CHECKs em fiscal_invoices — nomes canônicos.
SELECT conname
FROM pg_constraint
WHERE conrelid='public.fiscal_invoices'::regclass
  AND contype='c'
  AND conname IN (
    'chk_fi_direction','chk_fi_fiscal_operation_type','chk_fi_fin_nfe',
    'chk_fi_tp_nf_debito','chk_fi_tp_nf_credito'
  )
ORDER BY conname;

-- 3) Índices parciais aditivos.
SELECT indexname
FROM pg_indexes
WHERE schemaname='public' AND tablename='fiscal_invoices'
  AND indexname IN ('ix_fi_fiscal_operation_type','ix_fi_direction')
ORDER BY indexname;

-- 4) Três novas tabelas + PKs + FKs + CHECKs esperados.
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN (
    'fiscal_invoice_references',
    'fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  )
ORDER BY table_name;

SELECT conrelid::regclass::text AS tabela, conname, contype,
       pg_get_constraintdef(oid, true) AS def
FROM pg_constraint
WHERE conrelid IN (
   'public.fiscal_invoice_references'::regclass,
   'public.fiscal_invoice_item_references'::regclass,
   'public.fiscal_stock_loss_contexts'::regclass
)
ORDER BY tabela, contype, conname;

-- 5) Índices únicos/relacionamentos.
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN (
    'fiscal_invoice_references',
    'fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  )
ORDER BY tablename, indexname;

-- 6) RLS habilitada nas três novas tabelas.
SELECT c.relname AS tabela, c.relrowsecurity AS rls_on
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN (
    'fiscal_invoice_references',
    'fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  )
ORDER BY tabela;

-- 7) Policies SELECT/INSERT presentes; nenhuma UPDATE/DELETE.
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN (
    'fiscal_invoice_references',
    'fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  )
ORDER BY tablename, policyname;

-- 8) Grants explícitos: authenticated (SELECT,INSERT) e service_role (ALL).
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN (
    'fiscal_invoice_references',
    'fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  )
ORDER BY table_name, grantee, privilege_type;

-- 9) fiscal_events — CHECK atualizado deve conter 13 legados + 7 SINIEF.
SELECT pg_get_constraintdef(c.oid, true) AS def
FROM pg_constraint c
WHERE c.conrelid='public.fiscal_events'::regclass
  AND c.conname='fiscal_events_event_type_check';

-- 10) Contagens permanecem iguais ao snapshot-pre (zero alteração de dados).
SELECT 'fiscal_invoices' AS t, count(*) AS n FROM public.fiscal_invoices
UNION ALL SELECT 'fiscal_invoice_items', count(*) FROM public.fiscal_invoice_items
UNION ALL SELECT 'fiscal_events', count(*) FROM public.fiscal_events
UNION ALL SELECT 'fiscal_invoice_references', count(*) FROM public.fiscal_invoice_references
UNION ALL SELECT 'fiscal_invoice_item_references', count(*) FROM public.fiscal_invoice_item_references
UNION ALL SELECT 'fiscal_stock_loss_contexts', count(*) FROM public.fiscal_stock_loss_contexts
ORDER BY t;

-- 11) Funções preservadas — mesma assinatura do snapshot-pre.
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN (
    'has_role','mask_sensitive_jsonb','rpc_fiscal_event_manual',
    'rpc_fiscal_draft_save','rpc_financial_document_soft_delete'
  )
ORDER BY proname, args;

\echo '== SINIEF 49 :: SNAPSHOT POST FIM =='
