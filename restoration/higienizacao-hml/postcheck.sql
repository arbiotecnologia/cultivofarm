-- =====================================================================
-- POSTCHECK — HIGIENIZAÇÃO DE OBJETOS SINTÉTICOS HML
-- Fail-closed. Somente leitura. Exit != 0 em qualquer falha.
-- =====================================================================
\set ON_ERROR_STOP on

DO $post$
DECLARE
  v_marker text;
  v_ref text;
  v_n bigint;
  v_fail text[] := '{}';
BEGIN
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker LIMIT 1;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'POSTCHECK_ABORT: ambiente nao autorizado (%/%)', v_marker, v_ref;
  END IF;

  -- 1) objetos sintéticos removidos
  IF to_regclass('public.hml_b2b_e2e_evidence') IS NOT NULL THEN v_fail := v_fail || 'hml_b2b_e2e_evidence presente'; END IF;
  IF to_regclass('public.hml_fixture_registry') IS NOT NULL THEN v_fail := v_fail || 'hml_fixture_registry presente'; END IF;
  IF to_regclass('public._fiscal_hml_context')  IS NOT NULL THEN v_fail := v_fail || '_fiscal_hml_context presente'; END IF;
  IF to_regclass('public._fiscal_hml_inventory') IS NOT NULL THEN v_fail := v_fail || '_fiscal_hml_inventory presente'; END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('rpc_hml_fiscal_emit_mock','hml_fixture_registry_touch');
  IF v_n > 0 THEN v_fail := v_fail || ('funcoes hml remanescentes: '||v_n); END IF;

  SELECT count(*) INTO v_n FROM pg_class WHERE relname='ux_fi_one_mock_per_receivable';
  IF v_n > 0 THEN v_fail := v_fail || 'indice ux_fi_one_mock_per_receivable presente'; END IF;

  -- 2) infraestrutura preservada
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN v_fail := v_fail || '_fiscal_staging_marker AUSENTE (regressao)'; END IF;
  IF to_regclass('public._motor_b2b_pre_phase1_snapshot') IS NULL THEN v_fail := v_fail || '_motor_b2b_pre_phase1_snapshot AUSENTE (regressao)'; END IF;

  -- 3) fiscal real preservado / nenhum documento mock
  SELECT count(*) INTO v_n FROM public.fiscal_invoices WHERE provider='mock_homologation';
  IF v_n > 0 THEN v_fail := v_fail || ('notas mock_homologation: '||v_n); END IF;

  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_associate_microorganism_fiscal_product';
  IF v_n <> 1 THEN v_fail := v_fail || 'RPC fiscal canonica de microrganismo ausente (Classe D)'; END IF;

  IF to_regclass('public.fiscal_invoices') IS NULL OR to_regclass('public.fiscal_invoice_items') IS NULL THEN
    v_fail := v_fail || 'tabelas fiscais canonicas ausentes';
  END IF;

  -- 4) ledger sem duplicidades
  SELECT count(*) INTO v_n FROM (
    SELECT version FROM supabase_migrations.schema_migrations GROUP BY version HAVING count(*)>1
  ) d;
  IF v_n > 0 THEN v_fail := v_fail || ('versoes duplicadas no ledger: '||v_n); END IF;

  IF array_length(v_fail,1) IS NOT NULL THEN
    RAISE EXCEPTION 'POSTCHECK_FAIL: %', array_to_string(v_fail, ' | ');
  END IF;

  RAISE NOTICE 'POSTCHECK_HIGIENIZACAO_HML_PASS';
END
$post$;
