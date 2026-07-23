-- =====================================================================
-- Fase Fiscal 3.19 — Adequação Legal 2026 e CNPJ Alfanumérico
--
-- ARTEFATO INERTE — NÃO aplicado automaticamente. Deploy segue a
-- política humana da esteira fiscal (ver docs/fiscal-fase3-19-*.md).
--
-- Estritamente aditivo, seguro para reexecução:
--   1. Novas colunas jsonb para RTC 2026 (IBS/CBS) na empresa, produto
--      e serviço, sempre com default '{}'::jsonb.
--   2. Alarga `document_number` em `company_fiscal_settings` para
--      varchar(18) SOMENTE se o limite atual for menor. Nunca reduz.
--
-- NÃO altera RLS, GRANTs, policies, triggers, extensões ou dados.
-- =====================================================================

BEGIN;

ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS rtc_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.company_fiscal_settings.rtc_configuration IS
  'Fase Fiscal 3.19 — Config transição IBS/CBS (LC 214/2025). Contrato TS: rtcCompanySchema.';

ALTER TABLE public.product_fiscal_profiles
  ADD COLUMN IF NOT EXISTS ibs_cbs_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.product_fiscal_profiles.ibs_cbs_configuration IS
  'Fase Fiscal 3.19 — Config IBS/CBS por item (NT NF-e 2025.002). Contrato TS: ibsCbsItemSchema.';

ALTER TABLE public.service_fiscal_profiles
  ADD COLUMN IF NOT EXISTS ibs_cbs_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.service_fiscal_profiles.ibs_cbs_configuration IS
  'Fase Fiscal 3.19 — Config IBS/CBS por serviço (NFS-e NT 007/2026). Contrato TS: ibsCbsItemSchema.';

DO $$
DECLARE
  cur_len integer;
BEGIN
  SELECT character_maximum_length INTO cur_len
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'company_fiscal_settings'
      AND column_name = 'document_number';
  IF cur_len IS NOT NULL AND cur_len < 18 THEN
    EXECUTE 'ALTER TABLE public.company_fiscal_settings
               ALTER COLUMN document_number TYPE varchar(18)';
  END IF;
END $$;

COMMIT;
