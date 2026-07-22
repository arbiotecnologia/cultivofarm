-- ============================================================================
-- Fase Fiscal 3.17 — 04-cleanup.sql
-- ----------------------------------------------------------------------------
-- Remove EXCLUSIVAMENTE registros com prefixo FISCAL_HML_. Nunca usa
-- CASCADE amplo, TRUNCATE ou DELETE sem WHERE. Não altera produção.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker WHERE marker = 'STAGING') THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: marker STAGING ausente.';
  END IF;
END $$;

-- Rascunhos fiscais sintéticos.
DELETE FROM public.fiscal_invoice_items
 WHERE invoice_id IN (
   SELECT id FROM public.fiscal_invoices
    WHERE internal_reference LIKE 'FISCAL_HML_%'
 );

DELETE FROM public.fiscal_invoices
 WHERE internal_reference LIKE 'FISCAL_HML_%';

-- Clientes sintéticos (apenas os do inventário).
DELETE FROM public.clientes
 WHERE nome LIKE 'FISCAL_HML_%'
   AND nome IN ('FISCAL_HML_CLIENTE_A','FISCAL_HML_CLIENTE_B');

COMMIT;
