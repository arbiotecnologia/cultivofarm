ALTER TABLE public.accounts_receivable
  DROP CONSTRAINT IF EXISTS accounts_receivable_fiscal_invoice_status_check;
ALTER TABLE public.accounts_receivable
  ADD CONSTRAINT accounts_receivable_fiscal_invoice_status_check
  CHECK (fiscal_invoice_status = ANY (ARRAY[
    'NOT_REQUIRED'::text,'PENDING'::text,'ISSUED'::text,'CANCELED'::text,
    'PENDING_PARAMETRIZATION'::text,'EXEMPT'::text]));