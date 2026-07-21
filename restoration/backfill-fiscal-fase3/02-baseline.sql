-- Fase Fiscal 3.0.2-C — 02-baseline.sql
-- Baseline por UUID + contagens ANTES das migrations fiscais canônicas.
-- Usa IS DISTINCT FROM em nullables para não perder discrepâncias com NULL.
\set ON_ERROR_STOP on
SET search_path = public;

CREATE SCHEMA IF NOT EXISTS fiscal_backfill_audit;

DROP TABLE IF EXISTS fiscal_backfill_audit.baseline_counts;
CREATE TABLE fiscal_backfill_audit.baseline_counts AS
SELECT
  (SELECT count(*) FROM public.fiscal_invoices) AS invoices_total,
  (SELECT count(*) FROM public.fiscal_invoices WHERE status='ISSUED')   AS invoices_issued,
  (SELECT count(*) FROM public.fiscal_invoices WHERE status='CANCELED') AS invoices_canceled,
  (SELECT count(*) FROM public.fiscal_invoices WHERE status='PENDING')  AS invoices_pending,
  (SELECT count(*) FROM public.fiscal_invoices WHERE status='ERROR')    AS invoices_error,
  (SELECT count(*) FROM public.fiscal_invoices WHERE access_key IS NOT NULL) AS invoices_with_key,
  now() AS captured_at;

-- Snapshot por UUID de cada invoice fixture: status, invoice_type, receivable_id, access_key.
DROP TABLE IF EXISTS fiscal_backfill_audit.baseline_invoices;
CREATE TABLE fiscal_backfill_audit.baseline_invoices AS
SELECT id, status, invoice_type, series, invoice_number, access_key, receivable_id, delivery_id
FROM public.fiscal_invoices
WHERE id IN (SELECT id FROM fiscal_backfill_audit.fixture_ids WHERE entity LIKE 'invoice_%');

SELECT * FROM fiscal_backfill_audit.baseline_counts;
