-- =====================================================================
-- Fase SINIEF 4.0.1 — SNAPSHOT PRÉ-MIGRATION (SOMENTE LEITURA + FAIL-FAST)
-- Alvo canônico: 20260807000000_fiscal_sinief_49_scaffolding.sql
-- Ref permitido:  ikaauvsflpmamgxmkhoq (staging AR-Bio-TEMP)
-- Ref proibido:   navfzbwgwzruipouyfnk (produção)
--
-- Este script NÃO altera dado. Se qualquer guard falhar, ele aborta ANTES
-- de qualquer consulta descritiva.
--
-- Execução esperada (fora deste sandbox):
--   psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -A -F '|' \
--     -f restoration/fiscal-sinief49-fase4/00-snapshot-pre.sql \
--     > restoration/fiscal-sinief49-fase4/snapshot-pre.txt
-- =====================================================================

\echo '== SINIEF 49 :: SNAPSHOT PRE =='
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- GUARD FAIL-FAST OBRIGATÓRIO — roda ANTES de qualquer SELECT descritivo.
-- Ausência, duplicidade ou project_ref ≠ ikaauvsflpmamgxmkhoq → EXCEPTION.
-- Presença de qualquer traço do ref de produção navfzbwgwzruipouyfnk →
-- EXCEPTION.
-- ---------------------------------------------------------------------
DO $guard$
DECLARE
  v_count       integer;
  v_project_ref text;
  v_prod_ref    constant text := 'navfzbwgwzruipouyfnk';
  v_expected    constant text := 'ikaauvsflpmamgxmkhoq';
BEGIN
  SELECT count(*) INTO v_count FROM public._fiscal_staging_marker;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ABORT[snapshot-pre]: marker _fiscal_staging_marker ausente';
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'ABORT[snapshot-pre]: marker _fiscal_staging_marker duplicado (% linhas)', v_count;
  END IF;

  SELECT project_ref INTO v_project_ref
    FROM public._fiscal_staging_marker
   WHERE marker = 'STAGING';

  IF v_project_ref IS NULL THEN
    RAISE EXCEPTION 'ABORT[snapshot-pre]: marker sem linha marker=STAGING';
  END IF;
  IF v_project_ref = v_prod_ref THEN
    RAISE EXCEPTION 'ABORT[snapshot-pre]: project_ref aponta PRODUÇÃO (%). Execução proibida.', v_prod_ref;
  END IF;
  IF v_project_ref <> v_expected THEN
    RAISE EXCEPTION 'ABORT[snapshot-pre]: project_ref=% ≠ esperado=%', v_project_ref, v_expected;
  END IF;

  -- Sanidade extra: nenhuma linha residual apontando produção.
  IF EXISTS (SELECT 1 FROM public._fiscal_staging_marker WHERE project_ref = v_prod_ref) THEN
    RAISE EXCEPTION 'ABORT[snapshot-pre]: marker contém ref de produção';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------
-- Evidência estruturada (chave|valor) para diff pré/pós.
-- ---------------------------------------------------------------------
SELECT 'meta.staging_ref' AS k, project_ref AS v
  FROM public._fiscal_staging_marker WHERE marker='STAGING';

-- 1) fiscal_invoices — colunas aditivas SINIEF (esperado pré: 0 linhas).
SELECT 'pre.fi_new_columns' AS k,
       column_name || ':' || data_type || ':' || is_nullable AS v
FROM information_schema.columns
WHERE table_schema='public' AND table_name='fiscal_invoices'
  AND column_name IN (
    'direction','fiscal_operation_type','fin_nfe','tp_nf_debito',
    'tp_nf_credito','nature_operation','tax_authority_notes',
    'legal_basis','legal_version','legal_effective_date'
  )
ORDER BY column_name;

-- 2) Tabelas novas (esperado pré: 0 linhas).
SELECT 'pre.new_tables' AS k, table_name AS v
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN (
    'fiscal_invoice_references','fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  )
ORDER BY table_name;

-- 3) fiscal_events — CHECK atual (13 valores legados).
SELECT 'pre.fiscal_events_check' AS k,
       pg_get_constraintdef(oid, true) AS v
FROM pg_constraint
WHERE conrelid = 'public.fiscal_events'::regclass
  AND contype = 'c'
  AND conname = 'fiscal_events_event_type_check';

-- 4) Contagens baseline (zero-alteração de dados).
SELECT 'pre.count.' || t AS k, n::text AS v
FROM (
  SELECT 'fiscal_invoices' AS t, count(*) AS n FROM public.fiscal_invoices
  UNION ALL SELECT 'fiscal_invoice_items', count(*) FROM public.fiscal_invoice_items
  UNION ALL SELECT 'fiscal_events', count(*) FROM public.fiscal_events
) s ORDER BY t;

-- 5) Assinatura estrutural fiscal_invoices (baseline).
SELECT 'pre.fi_col_signature' AS k,
       md5(string_agg(column_name||':'||data_type||':'||is_nullable,',' ORDER BY ordinal_position)) AS v
FROM information_schema.columns
WHERE table_schema='public' AND table_name='fiscal_invoices';

-- 6) Policies/grants existentes — devem permanecer inalterados no pós.
SELECT 'pre.policy.'||tablename AS k, policyname||':'||cmd AS v
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('fiscal_invoices','fiscal_invoice_items','fiscal_events')
ORDER BY tablename, policyname;

SELECT 'pre.grant.'||table_name AS k, grantee||':'||privilege_type AS v
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('fiscal_invoices','fiscal_invoice_items','fiscal_events')
ORDER BY table_name, grantee, privilege_type;

-- 7) Funções preservadas.
SELECT 'pre.fn.'||proname AS k, pg_get_function_identity_arguments(oid) AS v
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'has_role','mask_sensitive_jsonb','rpc_fiscal_event_manual',
    'rpc_fiscal_draft_save','rpc_financial_document_soft_delete'
  )
ORDER BY proname;

\echo '== SINIEF 49 :: SNAPSHOT PRE FIM =='
