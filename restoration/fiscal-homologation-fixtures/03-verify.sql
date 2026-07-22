-- ============================================================================
-- Fase Fiscal 3.17.1 — 03-verify.sql
-- ----------------------------------------------------------------------------
-- Provas de integridade das fixtures inventariadas. Aborta se qualquer
-- invariante falhar.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_marker_ref  text;
  v_session_ref text;
  v_bad_env     integer;
  v_bad_status  integer;
  v_inv_missing integer;
  v_no_items    integer;
  v_no_snap     integer;
  v_bad_orig    integer;
  v_prod_on     integer;
BEGIN
  -- Guarda idêntico ao preflight/seed.
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: marker STAGING ausente.';
  END IF;
  SELECT project_ref INTO v_marker_ref
    FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  BEGIN
    v_session_ref := current_setting('app.fiscal_test_project_ref', true);
  EXCEPTION WHEN OTHERS THEN v_session_ref := NULL; END;
  IF v_marker_ref IS NULL OR v_session_ref IS NULL OR v_marker_ref <> v_session_ref THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: project_ref divergente.';
  END IF;

  IF to_regclass('public._fiscal_hml_inventory') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: inventário ausente. Rode o seed antes.';
  END IF;

  -- Nenhum registro produtivo escapou.
  SELECT count(*) INTO v_prod_on
    FROM public.company_fiscal_settings WHERE production_enabled = true;
  IF v_prod_on > 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: production_enabled=true detectado.';
  END IF;

  -- Todos os invoices inventariados estão em HOMOLOGATION.
  SELECT count(*) INTO v_bad_env
    FROM public.fiscal_invoices fi
    JOIN public._fiscal_hml_inventory inv
      ON inv.kind='FISCAL_INVOICE' AND inv.object_id = fi.id
   WHERE fi.environment <> 'HOMOLOGATION';
  IF v_bad_env > 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: % rascunhos fora de HOMOLOGATION.', v_bad_env;
  END IF;

  -- Status proibidos.
  SELECT count(*) INTO v_bad_status
    FROM public.fiscal_invoices fi
    JOIN public._fiscal_hml_inventory inv
      ON inv.kind='FISCAL_INVOICE' AND inv.object_id = fi.id
   WHERE fi.status IN ('AUTHORIZED','ISSUED','TRANSMITTED')
      OR fi.normalized_status IN ('AUTHORIZED','ISSUED','QUEUED','PROCESSING');
  IF v_bad_status > 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: % rascunhos com status proibido.', v_bad_status;
  END IF;

  -- document_origin obrigatório MANUAL_RECORD nas fixtures.
  SELECT count(*) INTO v_bad_orig
    FROM public.fiscal_invoices fi
    JOIN public._fiscal_hml_inventory inv
      ON inv.kind='FISCAL_INVOICE' AND inv.object_id = fi.id
   WHERE fi.document_origin <> 'MANUAL_RECORD';
  IF v_bad_orig > 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: % rascunhos com document_origin inválido.', v_bad_orig;
  END IF;

  -- Fixtures esperadas presentes.
  SELECT count(*) INTO v_inv_missing
    FROM public._fiscal_hml_inventory
   WHERE kind='FISCAL_INVOICE'
     AND label IN ('FISCAL_HML_NFE_OK','FISCAL_HML_NFSE_OK','FISCAL_HML_NFE_INCOMPLETO');
  IF v_inv_missing < 3 THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: rascunhos inventariados esperados ausentes (%/3).', v_inv_missing;
  END IF;

  -- Itens presentes nos rascunhos válidos.
  SELECT count(*) INTO v_no_items
    FROM public._fiscal_hml_inventory inv
   WHERE inv.kind='FISCAL_INVOICE'
     AND inv.label IN ('FISCAL_HML_NFE_OK','FISCAL_HML_NFSE_OK')
     AND NOT EXISTS (
       SELECT 1 FROM public.fiscal_invoice_items it
        WHERE it.fiscal_invoice_id = inv.object_id
     );
  IF v_no_items > 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: % rascunhos válidos sem itens.', v_no_items;
  END IF;

  -- Snapshots presentes.
  SELECT count(*) INTO v_no_snap
    FROM public.fiscal_invoices fi
    JOIN public._fiscal_hml_inventory inv
      ON inv.kind='FISCAL_INVOICE' AND inv.object_id = fi.id
   WHERE inv.label IN ('FISCAL_HML_NFE_OK','FISCAL_HML_NFSE_OK')
     AND (fi.fiscal_profile_snapshot = '{}'::jsonb OR fi.fiscal_profile_snapshot IS NULL);
  IF v_no_snap > 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: % rascunhos válidos sem snapshot.', v_no_snap;
  END IF;

  RAISE NOTICE 'FISCAL_HML verify OK.';
END $$;

COMMIT;
