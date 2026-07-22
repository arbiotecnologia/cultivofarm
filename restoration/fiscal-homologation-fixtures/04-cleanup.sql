-- ============================================================================
-- Fase Fiscal 3.17.1 — 04-cleanup.sql
-- ----------------------------------------------------------------------------
-- Remove EXCLUSIVAMENTE registros inventariados por este pacote.
-- Nunca usa CASCADE amplo, TRUNCATE ou DELETE sem WHERE. Não toca em
-- dados fora do inventário/prefixo FISCAL_HML_.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_marker_ref  text;
  v_session_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: marker STAGING ausente.';
  END IF;
  SELECT project_ref INTO v_marker_ref
    FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  BEGIN
    v_session_ref := current_setting('app.fiscal_test_project_ref', true);
  EXCEPTION WHEN OTHERS THEN v_session_ref := NULL; END;
  IF v_marker_ref IS NULL OR v_session_ref IS NULL OR v_marker_ref <> v_session_ref THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: project_ref divergente.';
  END IF;
END $$;

-- Itens dos rascunhos inventariados. Nunca usa a coluna inexistente
-- `invoice_id`; a coluna real é `fiscal_invoice_id`.
DELETE FROM public.fiscal_invoice_items
 WHERE fiscal_invoice_id IN (
   SELECT object_id FROM public._fiscal_hml_inventory
    WHERE kind = 'FISCAL_INVOICE'
 );

-- Rascunhos inventariados, com salvaguarda de prefixo em notes.
DELETE FROM public.fiscal_invoices fi
 USING public._fiscal_hml_inventory inv
 WHERE inv.kind = 'FISCAL_INVOICE'
   AND inv.object_id = fi.id
   AND fi.notes LIKE 'FISCAL_HML_%';

-- Clientes inventariados, com salvaguarda de prefixo no nome.
DELETE FROM public.clientes c
 USING public._fiscal_hml_inventory inv
 WHERE inv.kind = 'CLIENTE'
   AND inv.object_id = c.id
   AND c.nome LIKE 'FISCAL_HML_%';

-- Limpa o inventário para não cruzar corridas subsequentes.
DELETE FROM public._fiscal_hml_inventory;

COMMIT;
