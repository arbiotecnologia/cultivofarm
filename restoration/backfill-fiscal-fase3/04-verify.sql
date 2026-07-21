-- Fase Fiscal 3.0.1 — 04-verify.sql
-- Verifica invariantes após aplicação das migrations fiscais.
-- Cada bloco emite NOTICE e RAISE EXCEPTION em falha.
SET search_path = public;

DO $$
DECLARE
  v_baseline record;
  v_now_total int;
  v_now_issued int;
  v_now_canceled int;
  v_now_pending int;
  v_now_error int;
  v_now_with_key int;
BEGIN
  SELECT * INTO v_baseline FROM fiscal_backfill_audit.baseline;
  SELECT count(*), count(*) FILTER (WHERE status='ISSUED'),
         count(*) FILTER (WHERE status='CANCELED'),
         count(*) FILTER (WHERE status='PENDING'),
         count(*) FILTER (WHERE status='ERROR'),
         count(*) FILTER (WHERE access_key IS NOT NULL)
    INTO v_now_total, v_now_issued, v_now_canceled, v_now_pending, v_now_error, v_now_with_key
  FROM public.fiscal_invoices;

  IF v_now_total < v_baseline.invoices_total THEN
    RAISE EXCEPTION 'PERDA: invoices caiu de % para %', v_baseline.invoices_total, v_now_total;
  END IF;
  IF v_now_issued <> v_baseline.invoices_issued THEN
    RAISE EXCEPTION 'DIVERGE ISSUED: baseline=% agora=%', v_baseline.invoices_issued, v_now_issued;
  END IF;
  IF v_now_with_key <> v_baseline.invoices_with_key THEN
    RAISE EXCEPTION 'ANEXOS: access_key baseline=% agora=%', v_baseline.invoices_with_key, v_now_with_key;
  END IF;
  RAISE NOTICE 'OK contagens preservadas total=% issued=% canceled=% pending=% error=% with_key=%',
    v_now_total, v_now_issued, v_now_canceled, v_now_pending, v_now_error, v_now_with_key;
END $$;

-- Órfãos
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

-- ISSUED nunca virou AUTHORIZED (sem provider)
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fiscal_invoices
    WHERE normalized_status = 'AUTHORIZED';
  IF v > 0 THEN RAISE EXCEPTION 'INDEVIDO AUTHORIZED=%', v; END IF;
END $$;

-- Origem/normalized/provider/environment corretos para legado
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.fiscal_invoices
    WHERE document_origin <> 'MANUAL_RECORD' OR normalized_status <> 'LEGACY_RECORDED'
       OR provider <> 'NONE' OR environment <> 'NOT_CONFIGURED';
  IF v > 0 THEN RAISE EXCEPTION 'METADADOS INESPERADOS em legado=%', v; END IF;
END $$;

-- Índices críticos aplicados
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
  IF v < 5 THEN RAISE EXCEPTION 'INDICES faltantes: encontrados=%', v; END IF;
END $$;

SELECT 'BACKFILL VERIFY OK' AS result;
