-- Fase E — hardening final do motor de condições comerciais + fiscal B2B
-- Forward-only, idempotente. Aplicar somente após autorização humana de promoção.
-- Origem certificada: staging ikaauvsflpmamgxmkhoq (run 4ec2d2bc — 75 PASS / 0 FAIL / 1 SKIP)

BEGIN;

-- 1) Situação fiscal do recebível precisa aceitar os estados emitidos por
--    fn_fiscal_requirement_resolve (fail-closed sem derrubar a geração do recebível).
ALTER TABLE public.accounts_receivable
  DROP CONSTRAINT IF EXISTS accounts_receivable_fiscal_invoice_status_check;

ALTER TABLE public.accounts_receivable
  ADD CONSTRAINT accounts_receivable_fiscal_invoice_status_check
  CHECK (fiscal_invoice_status = ANY (ARRAY[
    'NOT_REQUIRED'::text,
    'PENDING'::text,
    'ISSUED'::text,
    'CANCELED'::text,
    'PENDING_PARAMETRIZATION'::text,
    'EXEMPT'::text]));

-- 2) Postcheck fail-closed: aborta a promoção se a constraint não ficou coerente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.accounts_receivable'::regclass
      AND conname = 'accounts_receivable_fiscal_invoice_status_check'
      AND pg_get_constraintdef(oid) LIKE '%PENDING_PARAMETRIZATION%'
  ) THEN
    RAISE EXCEPTION 'FASE-E/30: constraint fiscal de accounts_receivable não aplicada';
  END IF;
END $$;

COMMIT;
