-- =====================================================================
-- Fase SINIEF 4.0 — CLEANUP DETERMINÍSTICO
-- Remove SOMENTE registros marcados 'sinief49-fx' criados pelos scripts
-- 10-fixtures.sql / 11-scenarios.sql. Staging AR-Bio-TEMP apenas.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public._fiscal_staging_marker
     WHERE marker='STAGING' AND project_ref='ikaauvsflpmamgxmkhoq'
  ) THEN
    RAISE EXCEPTION 'ABORT: cleanup só permitido no staging AR-Bio-TEMP';
  END IF;
END $$;

-- Referências primeiro (para respeitar FKs).
DELETE FROM public.fiscal_invoice_item_references
 WHERE fiscal_invoice_item_id IN (
   SELECT id FROM public.fiscal_invoice_items
    WHERE fiscal_invoice_id IN (
      SELECT id FROM public.fiscal_invoices
       WHERE tax_authority_notes LIKE 'FIXTURE sinief49-fx%'
          OR id::text LIKE '00000000-0000-4000-8000-0000000000%'
    )
 );

DELETE FROM public.fiscal_invoice_references
 WHERE fiscal_invoice_id IN (
   SELECT id FROM public.fiscal_invoices
    WHERE tax_authority_notes LIKE 'FIXTURE sinief49-fx%'
       OR id::text LIKE '00000000-0000-4000-8000-0000000000%'
 );

DELETE FROM public.fiscal_stock_loss_contexts
 WHERE fiscal_invoice_id IN (
   SELECT id FROM public.fiscal_invoices
    WHERE tax_authority_notes LIKE 'FIXTURE sinief49-fx%'
 );

DELETE FROM public.fiscal_invoice_items
 WHERE fiscal_invoice_id IN (
   SELECT id FROM public.fiscal_invoices
    WHERE tax_authority_notes LIKE 'FIXTURE sinief49-fx%'
       OR id::text LIKE '00000000-0000-4000-8000-0000000000%'
 );

DELETE FROM public.fiscal_invoices
 WHERE tax_authority_notes LIKE 'FIXTURE sinief49-fx%'
    OR id::text LIKE '00000000-0000-4000-8000-0000000000%';

-- Papéis e usuários sintéticos.
DELETE FROM public.user_roles
 WHERE user_id::text LIKE '00000000-0000-4000-8000-00000000f10%';

DELETE FROM auth.users
 WHERE email LIKE '%@sinief49.fixture.local';

COMMIT;
