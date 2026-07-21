-- Fase Fiscal 3.0.2-C — 99-cleanup.sql
-- Remove fixtures sintéticas e schema de auditoria SEM apagar
-- public._fiscal_staging_marker (o staging é persistente).
\set ON_ERROR_STOP on
SET search_path = public;

-- Cleanup DEPENDÊNCIA: fiscal_events referenciam fiscal_invoices; apagar primeiro.
DELETE FROM public.fiscal_events
  WHERE fiscal_invoice_id IN (SELECT id FROM public.fiscal_invoices WHERE id::text LIKE 'f000000%');
DELETE FROM public.fiscal_invoice_items
  WHERE fiscal_invoice_id IN (SELECT id FROM public.fiscal_invoices WHERE id::text LIKE 'f000000%');
DELETE FROM public.fiscal_invoices WHERE id::text LIKE 'f000000%';
DELETE FROM public.accounts_receivable WHERE id::text LIKE 'a%000000%';
DELETE FROM public.clientes WHERE id::text LIKE 'c1111111-1111-1111-1111-111111111111'
                              OR id::text LIKE 'c2222222-2222-2222-2222-222222222222'
                              OR id::text LIKE 'c3333333-3333-3333-3333-333333333333'
                              OR id::text LIKE 'c4444444-4444-4444-4444-444444444444';

DROP SCHEMA IF EXISTS fiscal_backfill_audit CASCADE;

-- IMPORTANTE: _fiscal_staging_marker PERMANECE — o projeto AR-Bio-TEMP é persistente.
-- Só o operador humano pode remover manualmente se descartar o projeto inteiro.
SELECT 'BACKFILL CLEANUP OK — marker preservado' AS result;
