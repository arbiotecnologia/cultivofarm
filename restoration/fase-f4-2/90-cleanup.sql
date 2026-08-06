-- =====================================================================
-- FASE F4.2 — CLEANUP determinístico das fixtures do harness
-- Remove EXCLUSIVAMENTE o que está registrado em public._f42_harness_fixtures
-- para a tag informada. Nenhum DELETE amplo, nenhum trigger desabilitado.
--
--   psql --single-transaction -v ON_ERROR_STOP=1 \
--        -v f42_tag="'F42-HARNESS-20260806A'" -f 90-cleanup.sql
--
-- Objetos de Storage (bucket fiscal-certificates e fiscal-xml) são
-- removidos pelo cleanup.sh, que usa a API de Storage com service_role.
-- =====================================================================

\if :{?f42_tag}
\else
  \echo 'ERRO: informe -v f42_tag'
  \quit
\endif

BEGIN;

DO $g$
DECLARE v text;
BEGIN
  SELECT project_ref INTO v FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
  IF v = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'F42_GUARD: ambiente de PRODUCAO — execucao proibida';
  END IF;
  IF v IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'F42_GUARD: somente staging ikaauvsflpmamgxmkhoq';
  END IF;
END $g$;

DO $c$
DECLARE
  v_tag text := :'f42_tag';
  v_inv uuid;
  v_cert uuid;
BEGIN
  -- 1. Certificados sintéticos do harness (material cai por CASCADE).
  FOR v_cert IN
    SELECT id FROM public.fiscal_certificates WHERE display_name LIKE v_tag || '%'
  LOOP
    DELETE FROM public.fiscal_certificate_material WHERE certificate_id = v_cert;
    DELETE FROM public.fiscal_certificates WHERE id = v_cert;
  END LOOP;

  -- 2. Execuções de XML e reservas ligadas aos documentos do harness.
  FOR v_inv IN
    SELECT entity_id FROM public._f42_harness_fixtures
     WHERE tag = v_tag AND entity = 'fiscal_invoices'
  LOOP
    DELETE FROM public.fiscal_audit_log
     WHERE table_name = 'fiscal_xml_runs'
       AND record_id IN (SELECT id FROM public.fiscal_xml_runs WHERE fiscal_invoice_id = v_inv);
    DELETE FROM public.fiscal_xml_runs        WHERE fiscal_invoice_id = v_inv;
    DELETE FROM public.fiscal_calculation_runs WHERE fiscal_invoice_id = v_inv;
    DELETE FROM public.fiscal_number_reservations WHERE fiscal_invoice_id = v_inv;
    DELETE FROM public.fiscal_invoice_items   WHERE fiscal_invoice_id = v_inv;
    DELETE FROM public.fiscal_invoices        WHERE id = v_inv;
  END LOOP;

  -- 3. Série, pedidos, parceiro, cliente e emitente sintéticos.
  DELETE FROM public.fiscal_document_series
   WHERE id IN (SELECT entity_id FROM public._f42_harness_fixtures
                 WHERE tag = v_tag AND entity = 'fiscal_document_series');
  DELETE FROM public.partner_orders
   WHERE id IN (SELECT entity_id FROM public._f42_harness_fixtures
                 WHERE tag = v_tag AND entity = 'partner_orders');
  DELETE FROM public.partner_accounts
   WHERE id IN (SELECT entity_id FROM public._f42_harness_fixtures
                 WHERE tag = v_tag AND entity = 'partner_accounts');
  DELETE FROM public.customer_fiscal_profiles
   WHERE customer_id IN (SELECT entity_id FROM public._f42_harness_fixtures
                          WHERE tag = v_tag AND entity = 'customer_fiscal_profiles');
  DELETE FROM public.clients
   WHERE id IN (SELECT entity_id FROM public._f42_harness_fixtures
                 WHERE tag = v_tag AND entity = 'clients');
  DELETE FROM public.company_fiscal_settings
   WHERE id IN (SELECT entity_id FROM public._f42_harness_fixtures
                 WHERE tag = v_tag AND entity = 'company_fiscal_settings');

  DELETE FROM public._f42_harness_fixtures WHERE tag = v_tag;

  RAISE NOTICE 'F42 CLEANUP OK tag=%', v_tag;
END $c$;

-- Prova de limpeza: todas as contagens devem ser 0.
SELECT
  (SELECT count(*) FROM public._f42_harness_fixtures WHERE tag = :'f42_tag') AS fixtures,
  (SELECT count(*) FROM public.fiscal_certificates WHERE display_name LIKE 'F42-HARNESS-%') AS certificados,
  (SELECT count(*) FROM public.company_fiscal_settings WHERE legal_name LIKE 'F42-HARNESS-%') AS emitentes,
  (SELECT count(*) FROM public.partner_accounts WHERE nome LIKE 'F42-HARNESS-%') AS parceiros;

COMMIT;
