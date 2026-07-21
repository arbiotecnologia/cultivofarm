-- Fase Fiscal 3.0.2-C — 04-verify.sql
-- Invariantes pós-migrations, usando UUID e IS DISTINCT FROM.
\set ON_ERROR_STOP on
SET search_path = public;

-- Guard novamente — nunca confiar apenas no chamador.
DO $$
DECLARE v_marker text;
BEGIN
  SELECT marker INTO v_marker FROM public._fiscal_staging_marker LIMIT 1;
  IF v_marker IS DISTINCT FROM 'STAGING' THEN
    RAISE EXCEPTION 'ABORT verify: marker ausente/inválido';
  END IF;
END $$;

-- --------------------------------------------------------------------
-- 1. Contagens: nada perdido.
-- --------------------------------------------------------------------
DO $$
DECLARE b record; n_total int; n_issued int; n_canceled int; n_pending int; n_error int; n_with_key int;
BEGIN
  SELECT * INTO b FROM fiscal_backfill_audit.baseline_counts;
  SELECT count(*),
         count(*) FILTER (WHERE status='ISSUED'),
         count(*) FILTER (WHERE status='CANCELED'),
         count(*) FILTER (WHERE status='PENDING'),
         count(*) FILTER (WHERE status='ERROR'),
         count(*) FILTER (WHERE access_key IS NOT NULL)
    INTO n_total, n_issued, n_canceled, n_pending, n_error, n_with_key
  FROM public.fiscal_invoices;
  IF n_total < b.invoices_total THEN
    RAISE EXCEPTION 'PERDA: invoices caiu de % para %', b.invoices_total, n_total; END IF;
  IF n_issued IS DISTINCT FROM b.invoices_issued THEN
    RAISE EXCEPTION 'DIVERGE ISSUED: baseline=% agora=%', b.invoices_issued, n_issued; END IF;
  IF n_canceled IS DISTINCT FROM b.invoices_canceled THEN
    RAISE EXCEPTION 'DIVERGE CANCELED: baseline=% agora=%', b.invoices_canceled, n_canceled; END IF;
  IF n_pending IS DISTINCT FROM b.invoices_pending THEN
    RAISE EXCEPTION 'DIVERGE PENDING: baseline=% agora=%', b.invoices_pending, n_pending; END IF;
  IF n_error IS DISTINCT FROM b.invoices_error THEN
    RAISE EXCEPTION 'DIVERGE ERROR: baseline=% agora=%', b.invoices_error, n_error; END IF;
  IF n_with_key IS DISTINCT FROM b.invoices_with_key THEN
    RAISE EXCEPTION 'ANEXOS: access_key baseline=% agora=%', b.invoices_with_key, n_with_key; END IF;
  RAISE NOTICE 'OK contagens preservadas';
END $$;

-- --------------------------------------------------------------------
-- 2. Preservação por UUID: status legado + vínculos + access_key.
-- --------------------------------------------------------------------
DO $$
DECLARE r record; cur record;
BEGIN
  FOR r IN SELECT * FROM fiscal_backfill_audit.baseline_invoices LOOP
    SELECT id, status, invoice_type, series, invoice_number, access_key, receivable_id, delivery_id
      INTO cur FROM public.fiscal_invoices WHERE id = r.id;
    IF cur IS NULL THEN
      RAISE EXCEPTION 'INVOICE PERDIDA: %', r.id; END IF;
    IF cur.status IS DISTINCT FROM r.status THEN
      RAISE EXCEPTION 'STATUS ALTERADO %: era % agora %', r.id, r.status, cur.status; END IF;
    IF cur.invoice_type IS DISTINCT FROM r.invoice_type THEN
      RAISE EXCEPTION 'INVOICE_TYPE ALTERADO %', r.id; END IF;
    IF cur.access_key IS DISTINCT FROM r.access_key THEN
      RAISE EXCEPTION 'ACCESS_KEY ALTERADA %', r.id; END IF;
    IF cur.receivable_id IS DISTINCT FROM r.receivable_id THEN
      RAISE EXCEPTION 'RECEIVABLE_ID ALTERADO %', r.id; END IF;
    IF cur.delivery_id IS DISTINCT FROM r.delivery_id THEN
      RAISE EXCEPTION 'DELIVERY_ID ALTERADO %', r.id; END IF;
  END LOOP;
END $$;

-- --------------------------------------------------------------------
-- 3. Órfãos.
-- --------------------------------------------------------------------
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.product_fiscal_profiles p
    WHERE NOT EXISTS (SELECT 1 FROM public.produtos x WHERE x.id = p.product_id);
  IF v > 0 THEN RAISE EXCEPTION 'ORFAO product_fiscal_profiles=%', v; END IF;

  SELECT count(*) INTO v FROM public.customer_fiscal_profiles c
    WHERE NOT EXISTS (SELECT 1 FROM public.clientes x WHERE x.id = c.customer_id);
  IF v > 0 THEN RAISE EXCEPTION 'ORFAO customer_fiscal_profiles=%', v; END IF;

  SELECT count(*) INTO v FROM public.fiscal_events fe
    WHERE fe.fiscal_invoice_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.fiscal_invoices fi WHERE fi.id = fe.fiscal_invoice_id);
  IF v > 0 THEN RAISE EXCEPTION 'ORFAO fiscal_events=%', v; END IF;
END $$;

-- --------------------------------------------------------------------
-- 4. ISSUED nunca virou AUTHORIZED (sem provider real).
-- --------------------------------------------------------------------
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fiscal_invoices WHERE normalized_status = 'AUTHORIZED';
  IF v > 0 THEN RAISE EXCEPTION 'INDEVIDO AUTHORIZED=%', v; END IF;
END $$;

-- --------------------------------------------------------------------
-- 5. Metadados legados: origem/normalized/provider/environment.
-- --------------------------------------------------------------------
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fiscal_invoices
    WHERE document_origin IS DISTINCT FROM 'MANUAL_RECORD'
       OR normalized_status IS DISTINCT FROM 'LEGACY_RECORDED'
       OR provider IS DISTINCT FROM 'NONE'
       OR environment IS DISTINCT FROM 'NOT_CONFIGURED';
  IF v > 0 THEN RAISE EXCEPTION 'METADADOS INESPERADOS em legado=%', v; END IF;
END $$;

-- --------------------------------------------------------------------
-- 6. Múltiplos documentos por cliente preservados.
-- --------------------------------------------------------------------
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fiscal_invoices
   WHERE id IN ('f0000007-0000-0000-0000-000000000007','f0000008-0000-0000-0000-000000000008');
  IF v <> 2 THEN RAISE EXCEPTION 'MULTIDOC ausente por cliente B (esperado 2, achado %)', v; END IF;
END $$;

-- --------------------------------------------------------------------
-- 7. Índices críticos.
-- --------------------------------------------------------------------
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM pg_indexes
    WHERE schemaname='public' AND indexname IN (
      'ux_fi_env_doc_model_series_number_company',
      'ux_fi_provider_env_model_ref',
      'ux_fi_access_key',
      'ux_service_fiscal_profiles_service_active',
      'ux_service_fiscal_profiles_source_ref_active'
    );
  IF v < 5 THEN RAISE EXCEPTION 'INDICES faltantes: %', v; END IF;
END $$;

-- --------------------------------------------------------------------
-- 8. Máscara funcional.
-- --------------------------------------------------------------------
DO $$
DECLARE v jsonb;
BEGIN
  v := public.mask_sensitive_jsonb('{"Authorization":"x","ok":"keep"}'::jsonb);
  IF v->>'Authorization' IS DISTINCT FROM '***REDACTED***' OR v->>'ok' IS DISTINCT FROM 'keep' THEN
    RAISE EXCEPTION 'MASK falhou: %', v; END IF;
END $$;

-- --------------------------------------------------------------------
-- 9. View reconciliação existe.
-- --------------------------------------------------------------------
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM pg_views
    WHERE schemaname='public' AND viewname='v_fiscal_document_reconciliation_pending';
  IF v <> 1 THEN RAISE EXCEPTION 'VIEW reconciliation ausente'; END IF;
END $$;

SELECT 'BACKFILL VERIFY OK' AS result;
