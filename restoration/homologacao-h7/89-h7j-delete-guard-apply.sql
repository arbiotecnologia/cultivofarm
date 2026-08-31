-- FASE H7j — Guarda de exclusão física do documento fiscal (apply atômico).
-- Finding H7-120 (P1): documento fiscal com trilha podia ser deletado por staff.
-- Idempotente. Executar SOMENTE no staging ikaauvsflpmamgxmkhoq.
\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_h7j_fiscal_invoice_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_status text := coalesce(OLD.normalized_status, OLD.status, 'DRAFT');
BEGIN
  IF v_status <> 'DRAFT'
     OR OLD.status <> 'DRAFT'
     OR OLD.access_key IS NOT NULL
     OR OLD.invoice_number IS NOT NULL
     OR OLD.authorized_at IS NOT NULL
     OR OLD.canceled_at IS NOT NULL
     OR OLD.rejected_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENT_DELETE_FORBIDDEN: documento fiscal com trilha (status=%) nao pode ser excluido.', v_status;
  END IF;

  IF EXISTS (SELECT 1 FROM public.fiscal_events e WHERE e.fiscal_invoice_id = OLD.id) THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENT_DELETE_FORBIDDEN: documento fiscal possui eventos registrados.';
  END IF;

  IF to_regclass('public.fiscal_sefaz_transmissions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.fiscal_sefaz_transmissions t WHERE t.fiscal_invoice_id = OLD.id) THEN
      RAISE EXCEPTION 'FISCAL_DOCUMENT_DELETE_FORBIDDEN: documento fiscal possui transmissoes SEFAZ.';
    END IF;
  END IF;

  IF to_regclass('public.fiscal_number_reservations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.fiscal_number_reservations r WHERE r.fiscal_invoice_id = OLD.id) THEN
      RAISE EXCEPTION 'FISCAL_DOCUMENT_DELETE_FORBIDDEN: documento fiscal possui numeracao reservada.';
    END IF;
  END IF;

  RETURN OLD;
END;
$fn$;

ALTER FUNCTION public.fn_h7j_fiscal_invoice_delete_guard() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.fn_h7j_fiscal_invoice_delete_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_h7j_fiscal_invoice_delete_guard() FROM anon;
REVOKE ALL ON FUNCTION public.fn_h7j_fiscal_invoice_delete_guard() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_h7j_fiscal_invoice_delete_guard() TO postgres, service_role;

DROP TRIGGER IF EXISTS trg_h7j_fiscal_invoice_delete_guard ON public.fiscal_invoices;
CREATE TRIGGER trg_h7j_fiscal_invoice_delete_guard
BEFORE DELETE ON public.fiscal_invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_h7j_fiscal_invoice_delete_guard();

-- Menor privilegio: TRUNCATE apagaria a trilha ignorando o trigger.
REVOKE TRUNCATE ON public.fiscal_invoices FROM authenticated;
REVOKE TRUNCATE ON public.fiscal_invoice_items FROM authenticated;

COMMIT;
