-- Rollback H7.1 — desfaz apenas o que 73 aplicou (regime derivado e série HML).
\set ON_ERROR_STOP on
BEGIN;

DELETE FROM public.fiscal_document_series
 WHERE document_model = '55' AND series = 1 AND environment_code = '2'
   AND notes = 'H7.1 — serie de homologacao NF-e 55'
   AND current_number = 0;

UPDATE public.company_fiscal_settings
   SET nfe_series_number = NULL, nfe_series = NULL
 WHERE is_active AND nfe_series_number = 1 AND nfe_environment_code = '2';

UPDATE public.company_fiscal_settings
   SET pis_cofins_regime = NULL
 WHERE is_active;

COMMIT;
