-- FASE H7b — H7B-004: remoção estritamente escopada de resíduos de harness.
-- Só remove documento fiscal comprovadamente descartável:
--   sem número, sem série, sem chave de acesso, total = 0, status DRAFT,
--   sem receivable, sem delivery, sem source_type, sem itens, sem eventos,
--   sem reserva de numeração e sem execução de XML.
-- Qualquer documento fora desse perfil é PRESERVADO para revisão humana.
-- Executar somente no staging autorizado (guard abaixo).

BEGIN;

DO $guard$
DECLARE v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_environment_marker
     WHERE project_ref = 'ikaauvsflpmamgxmkhoq'
       AND environment_label = 'STAGING'
       AND production_emission_allowed = false
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'H7B-004 GUARD: ambiente nao e o staging autorizado — abortado.';
  END IF;
END
$guard$;

CREATE TEMP TABLE _h7b_alvo ON COMMIT DROP AS
SELECT fi.id
  FROM public.fiscal_invoices fi
 WHERE fi.status = 'DRAFT'
   AND coalesce(fi.normalized_status,'DRAFT') = 'DRAFT'
   AND fi.invoice_number IS NULL
   AND fi.series IS NULL
   AND fi.access_key IS NULL
   AND coalesce(fi.total_amount,0) = 0
   AND fi.receivable_id IS NULL
   AND fi.delivery_id IS NULL
   AND fi.source_type IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.fiscal_invoice_items i WHERE i.fiscal_invoice_id = fi.id)
   AND NOT EXISTS (SELECT 1 FROM public.fiscal_events e WHERE e.fiscal_invoice_id = fi.id)
   AND NOT EXISTS (SELECT 1 FROM public.fiscal_number_reservations r WHERE r.fiscal_invoice_id = fi.id)
   AND NOT EXISTS (SELECT 1 FROM public.fiscal_xml_runs x WHERE x.fiscal_invoice_id = fi.id);

-- Evidência ANTES
SELECT 'antes' AS momento,
       (SELECT count(*) FROM public.fiscal_invoices) AS total_documentos,
       (SELECT count(*) FROM _h7b_alvo)              AS residuos_identificados;

DELETE FROM public.fiscal_invoices fi
 USING _h7b_alvo a
 WHERE fi.id = a.id;

-- Evidência DEPOIS
SELECT 'depois' AS momento,
       (SELECT count(*) FROM public.fiscal_invoices) AS total_documentos,
       (SELECT count(*) FROM public.fiscal_invoices fi
         WHERE fi.status='DRAFT' AND fi.invoice_number IS NULL AND fi.access_key IS NULL
           AND coalesce(fi.total_amount,0)=0 AND fi.receivable_id IS NULL) AS residuos_restantes;

COMMIT;
