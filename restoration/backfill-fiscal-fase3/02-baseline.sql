-- Fase Fiscal 3.0.1 — 02-baseline.sql
-- Snapshot ANTES da aplicação das migrations fiscais.
-- Registra contagens em tabela temporária.
CREATE SCHEMA IF NOT EXISTS fiscal_backfill_audit;

DROP TABLE IF EXISTS fiscal_backfill_audit.baseline;
CREATE TABLE fiscal_backfill_audit.baseline AS
SELECT
  (SELECT count(*) FROM public.fiscal_invoices) AS invoices_total,
  (SELECT count(*) FROM public.fiscal_invoices WHERE status='ISSUED') AS invoices_issued,
  (SELECT count(*) FROM public.fiscal_invoices WHERE status='CANCELED') AS invoices_canceled,
  (SELECT count(*) FROM public.fiscal_invoices WHERE status='PENDING') AS invoices_pending,
  (SELECT count(*) FROM public.fiscal_invoices WHERE status='ERROR') AS invoices_error,
  (SELECT count(*) FROM public.fiscal_invoices WHERE access_key IS NOT NULL) AS invoices_with_key,
  now() AS captured_at;

SELECT * FROM fiscal_backfill_audit.baseline;
