-- =====================================================================
-- Fase SINIEF 4.0.1 — SNAPSHOT PÓS-MIGRATION (SOMENTE LEITURA + FAIL-FAST)
-- Verifica aditividade, RLS, grants, event_types e zero-alteração de dados.
-- Comparar com 00-snapshot-pre.sql via `diff -u`.
-- =====================================================================

\echo '== SINIEF 49 :: SNAPSHOT POST =='
\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- GUARD FAIL-FAST — mesma checagem do snapshot-pre.
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
    RAISE EXCEPTION 'ABORT[snapshot-post]: marker ausente';
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'ABORT[snapshot-post]: marker duplicado (% linhas)', v_count;
  END IF;
  SELECT project_ref INTO v_project_ref
    FROM public._fiscal_staging_marker WHERE marker='STAGING';
  IF v_project_ref IS NULL THEN
    RAISE EXCEPTION 'ABORT[snapshot-post]: marker sem linha marker=STAGING';
  END IF;
  IF v_project_ref = v_prod_ref THEN
    RAISE EXCEPTION 'ABORT[snapshot-post]: project_ref aponta PRODUÇÃO';
  END IF;
  IF v_project_ref <> v_expected THEN
    RAISE EXCEPTION 'ABORT[snapshot-post]: project_ref=% ≠ %', v_project_ref, v_expected;
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------
-- ASSERTS FAIL-FAST DA MIGRATION SINIEF 49/2025
-- Qualquer coluna/tabela/FK/check/RLS/policy/grant/event_type faltando →
-- RAISE EXCEPTION antes de emitir a evidência.
-- ---------------------------------------------------------------------
DO $asserts$
DECLARE
  v_expected_cols constant text[] := ARRAY[
    'direction','fiscal_operation_type','fin_nfe','tp_nf_debito',
    'tp_nf_credito','nature_operation','tax_authority_notes',
    'legal_basis','legal_version','legal_effective_date'
  ];
  v_expected_tables constant text[] := ARRAY[
    'fiscal_invoice_references','fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  ];
  v_expected_checks constant text[] := ARRAY[
    'chk_fi_direction','chk_fi_fiscal_operation_type','chk_fi_fin_nfe',
    'chk_fi_tp_nf_debito','chk_fi_tp_nf_credito'
  ];
  v_expected_event_types constant text[] := ARRAY[
    -- 13 legados
    'CREATED','MANUAL_UPDATED','DOCUMENT_ATTACHED','VALIDATION_REQUESTED',
    'VALIDATION_FAILED','READY_FOR_FUTURE_INTEGRATION',
    'RECONCILIATION_REQUIRED','RECONCILIATION_COMPLETED',
    'DOCUMENT_CANCELED_FINANCIAL_REVIEW_REQUIRED','TOTAL_MISMATCH',
    'CUSTOMER_MISMATCH','SOURCE_MISMATCH','REPLACEMENT_REQUIRED',
    -- 7 novos SINIEF
    'SINIEF_ADVANCE_PAYMENT_ISSUED','SINIEF_EFFECTIVE_SALE_ISSUED',
    'SINIEF_STOCK_LOSS_ISSUED','SINIEF_VALUE_QUANTITY_REDUCTION_ISSUED',
    'SINIEF_DELIVERY_REFUSAL_TOTAL_ISSUED',
    'SINIEF_DELIVERY_REFUSAL_PARTIAL_ISSUED',
    'SINIEF_RECIPIENT_NOT_FOUND_ISSUED'
  ];
  v_col text; v_tbl text; v_chk text; v_evt text;
  v_def text;
  v_rls_on boolean;
  v_grants int; v_pol int;
BEGIN
  -- 1) 10 colunas aditivas, todas NULLABLE.
  FOREACH v_col IN ARRAY v_expected_cols LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='fiscal_invoices'
         AND column_name=v_col AND is_nullable='YES'
    ) THEN
      RAISE EXCEPTION 'ABORT[post]: coluna fiscal_invoices.% ausente ou NOT NULL', v_col;
    END IF;
  END LOOP;

  -- 2) CHECKs restritivos.
  FOREACH v_chk IN ARRAY v_expected_checks LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid='public.fiscal_invoices'::regclass
         AND contype='c' AND conname=v_chk
    ) THEN
      RAISE EXCEPTION 'ABORT[post]: CHECK % ausente em fiscal_invoices', v_chk;
    END IF;
  END LOOP;

  -- 3) Três novas tabelas + RLS + policy SELECT/INSERT + zero UPDATE/DELETE.
  FOREACH v_tbl IN ARRAY v_expected_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema='public' AND table_name=v_tbl
    ) THEN
      RAISE EXCEPTION 'ABORT[post]: tabela public.% ausente', v_tbl;
    END IF;

    SELECT relrowsecurity INTO v_rls_on FROM pg_class c
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=v_tbl;
    IF NOT COALESCE(v_rls_on,false) THEN
      RAISE EXCEPTION 'ABORT[post]: RLS desativada em %', v_tbl;
    END IF;

    SELECT count(*) INTO v_pol FROM pg_policies
     WHERE schemaname='public' AND tablename=v_tbl AND cmd='SELECT';
    IF v_pol = 0 THEN RAISE EXCEPTION 'ABORT[post]: sem policy SELECT em %', v_tbl; END IF;

    SELECT count(*) INTO v_pol FROM pg_policies
     WHERE schemaname='public' AND tablename=v_tbl AND cmd='INSERT';
    IF v_pol = 0 THEN RAISE EXCEPTION 'ABORT[post]: sem policy INSERT em %', v_tbl; END IF;

    SELECT count(*) INTO v_pol FROM pg_policies
     WHERE schemaname='public' AND tablename=v_tbl AND cmd IN ('UPDATE','DELETE','ALL');
    IF v_pol > 0 THEN
      RAISE EXCEPTION 'ABORT[post]: policy UPDATE/DELETE/ALL detectada em % (esperado imutabilidade)', v_tbl;
    END IF;

    -- Grants exigidos: authenticated SELECT+INSERT, service_role ALL.
    SELECT count(*) INTO v_grants FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name=v_tbl AND grantee='authenticated'
       AND privilege_type IN ('SELECT','INSERT');
    IF v_grants < 2 THEN
      RAISE EXCEPTION 'ABORT[post]: grants authenticated SELECT/INSERT ausentes em %', v_tbl;
    END IF;
    SELECT count(*) INTO v_grants FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name=v_tbl AND grantee='service_role';
    IF v_grants = 0 THEN
      RAISE EXCEPTION 'ABORT[post]: grants service_role ausentes em %', v_tbl;
    END IF;

    -- FK obrigatória para fiscal_invoices ou fiscal_invoice_items.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid=('public.'||v_tbl)::regclass AND contype='f'
    ) THEN
      RAISE EXCEPTION 'ABORT[post]: nenhuma FK em %', v_tbl;
    END IF;
  END LOOP;

  -- 4) fiscal_events — CHECK contém os 13 legados + 7 novos.
  SELECT pg_get_constraintdef(oid,true) INTO v_def
    FROM pg_constraint
   WHERE conrelid='public.fiscal_events'::regclass
     AND conname='fiscal_events_event_type_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'ABORT[post]: fiscal_events_event_type_check ausente';
  END IF;
  FOREACH v_evt IN ARRAY v_expected_event_types LOOP
    IF position('''' || v_evt || '''' IN v_def) = 0 THEN
      RAISE EXCEPTION 'ABORT[post]: event_type % ausente do CHECK fiscal_events', v_evt;
    END IF;
  END LOOP;

  -- 5) Zero-alteração: nenhuma linha nova nas tabelas legadas por conta da migration.
  --    (comparação real fica com o diff snapshot-pre.txt × snapshot-post.txt)

  RAISE NOTICE '[post] TODOS ASSERTS OK';
END
$asserts$;

-- ---------------------------------------------------------------------
-- Evidência estruturada (chave|valor) — igual formato ao pre para diff.
-- ---------------------------------------------------------------------
SELECT 'meta.staging_ref' AS k, project_ref AS v
  FROM public._fiscal_staging_marker WHERE marker='STAGING';

SELECT 'post.fi_new_columns' AS k,
       column_name||':'||data_type||':'||is_nullable AS v
FROM information_schema.columns
WHERE table_schema='public' AND table_name='fiscal_invoices'
  AND column_name IN (
    'direction','fiscal_operation_type','fin_nfe','tp_nf_debito',
    'tp_nf_credito','nature_operation','tax_authority_notes',
    'legal_basis','legal_version','legal_effective_date'
  )
ORDER BY column_name;

SELECT 'post.new_tables' AS k, table_name AS v
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN (
    'fiscal_invoice_references','fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  )
ORDER BY table_name;

SELECT 'post.fiscal_events_check' AS k,
       pg_get_constraintdef(oid,true) AS v
FROM pg_constraint
WHERE conrelid='public.fiscal_events'::regclass
  AND conname='fiscal_events_event_type_check';

SELECT 'post.count.'||t AS k, n::text AS v
FROM (
  SELECT 'fiscal_invoices' AS t, count(*) AS n FROM public.fiscal_invoices
  UNION ALL SELECT 'fiscal_invoice_items', count(*) FROM public.fiscal_invoice_items
  UNION ALL SELECT 'fiscal_events', count(*) FROM public.fiscal_events
  UNION ALL SELECT 'fiscal_invoice_references', count(*) FROM public.fiscal_invoice_references
  UNION ALL SELECT 'fiscal_invoice_item_references', count(*) FROM public.fiscal_invoice_item_references
  UNION ALL SELECT 'fiscal_stock_loss_contexts', count(*) FROM public.fiscal_stock_loss_contexts
) s ORDER BY t;

SELECT 'post.fi_col_signature' AS k,
       md5(string_agg(column_name||':'||data_type||':'||is_nullable,',' ORDER BY ordinal_position)) AS v
FROM information_schema.columns
WHERE table_schema='public' AND table_name='fiscal_invoices';

SELECT 'post.policy.'||tablename AS k, policyname||':'||cmd AS v
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN (
    'fiscal_invoices','fiscal_invoice_items','fiscal_events',
    'fiscal_invoice_references','fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  )
ORDER BY tablename, policyname;

SELECT 'post.grant.'||table_name AS k, grantee||':'||privilege_type AS v
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN (
    'fiscal_invoices','fiscal_invoice_items','fiscal_events',
    'fiscal_invoice_references','fiscal_invoice_item_references',
    'fiscal_stock_loss_contexts'
  )
ORDER BY table_name, grantee, privilege_type;

SELECT 'post.fn.'||proname AS k, pg_get_function_identity_arguments(oid) AS v
FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN (
    'has_role','mask_sensitive_jsonb','rpc_fiscal_event_manual',
    'rpc_fiscal_draft_save','rpc_financial_document_soft_delete'
  )
ORDER BY proname;

\echo '== SINIEF 49 :: SNAPSHOT POST FIM =='
