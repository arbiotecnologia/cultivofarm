-- FASE H7j — Rollback (reverte apenas o que o apply criou).
\set ON_ERROR_STOP on
BEGIN;
DROP TRIGGER IF EXISTS trg_h7j_fiscal_invoice_delete_guard ON public.fiscal_invoices;
DROP FUNCTION IF EXISTS public.fn_h7j_fiscal_invoice_delete_guard();
COMMIT;
