-- =====================================================================
-- Fase Fiscal 3.19 — Adequação Legal 2026 e CNPJ Alfanumérico
--
-- ARTEFATO CANÔNICO. NÃO APLICADO AUTOMATICAMENTE nesta rodada.
-- Deploy segue a política humana da esteira fiscal.
--
-- Regras:
--   * Estritamente ADITIVO (colunas jsonb novas + função + policies OFF).
--   * TRANSACIONAL e fail-fast: aborta se qualquer tabela alvo não existir.
--   * Não altera `production_enabled`, providers, GRANTs, emissão, RLS,
--     credenciais, seeds ou dados. Não toca `cnpj`/`document_number`.
--   * Constraint CHECK garante:
--       (a) jsonb_typeof(col) = 'object'
--       (b) ausência recursiva de chaves sensíveis (tokens, segredos,
--           certificados, credenciais) via função IMMUTABLE STRICT com
--           search_path fixo.
--   * Idempotente: `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`,
--     `IF NOT EXISTS` para constraints (DO block).
-- =====================================================================

BEGIN;

-- 1) Fail-fast: exige as três tabelas fiscais reais.
DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'company_fiscal_settings'
  ) THEN missing := missing || 'company_fiscal_settings'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'product_fiscal_profiles'
  ) THEN missing := missing || 'product_fiscal_profiles'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'service_fiscal_profiles'
  ) THEN missing := missing || 'service_fiscal_profiles'; END IF;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'Fase 3.19 abortada: tabelas fiscais ausentes: %', array_to_string(missing, ', ');
  END IF;
END $$;

-- 2) Função scanner de chaves sensíveis. IMMUTABLE STRICT, search_path fixo,
--    sem SECURITY DEFINER (não escala privilégios). Retorna TRUE se qualquer
--    chave em qualquer profundidade casar com o vocabulário sensível.
CREATE OR REPLACE FUNCTION public.fiscal_rtc_has_sensitive_key(payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
DECLARE
  k text;
  v jsonb;
  needle text;
  needles text[] := ARRAY[
    'token','password','senha','secret','api_key','apikey',
    'private_key','privatekey','pfx','p12',
    'certificate','certificate_content','certificate_pem','pem',
    'authorization','bearer','access_token','refresh_token','client_secret'
  ];
BEGIN
  IF payload IS NULL THEN RETURN false; END IF;

  IF jsonb_typeof(payload) = 'object' THEN
    FOR k, v IN SELECT * FROM jsonb_each(payload) LOOP
      FOREACH needle IN ARRAY needles LOOP
        IF position(needle IN lower(k)) > 0 THEN RETURN true; END IF;
      END LOOP;
      IF public.fiscal_rtc_has_sensitive_key(v) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(payload) = 'array' THEN
    FOR v IN SELECT jsonb_array_elements(payload) LOOP
      IF public.fiscal_rtc_has_sensitive_key(v) THEN RETURN true; END IF;
    END LOOP;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) IS
  'Fase Fiscal 3.19 — Scanner recursivo de chaves sensíveis em payloads RTC (IBS/CBS). Usada por CHECK constraints. Espelha o contrato TS rtcHasSensitiveKey.';

-- 3) Colunas RTC/IBS-CBS (aditivas, default {}).
ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS rtc_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.company_fiscal_settings.rtc_configuration IS
  'Fase Fiscal 3.19 — Config transição IBS/CBS (LC 214/2025, LC 227/2026). Contrato TS: rtcCompanySchema.';

ALTER TABLE public.product_fiscal_profiles
  ADD COLUMN IF NOT EXISTS ibs_cbs_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.product_fiscal_profiles.ibs_cbs_configuration IS
  'Fase Fiscal 3.19 — Config IBS/CBS por item (NT NF-e 2025.002). Contrato TS: ibsCbsItemSchema.';

ALTER TABLE public.service_fiscal_profiles
  ADD COLUMN IF NOT EXISTS ibs_cbs_configuration jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.service_fiscal_profiles.ibs_cbs_configuration IS
  'Fase Fiscal 3.19 — Config IBS/CBS por serviço (NFS-e NT 007/2026, NT 009/2026). Contrato TS: ibsCbsItemSchema.';

-- 4) CHECK constraints (tipo object + ausência de segredos). Idempotentes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'company_fiscal_settings_rtc_config_object_chk'
  ) THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT company_fiscal_settings_rtc_config_object_chk
      CHECK (jsonb_typeof(rtc_configuration) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'company_fiscal_settings_rtc_config_no_secret_chk'
  ) THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT company_fiscal_settings_rtc_config_no_secret_chk
      CHECK (NOT public.fiscal_rtc_has_sensitive_key(rtc_configuration));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'product_fiscal_profiles_ibs_cbs_object_chk'
  ) THEN
    ALTER TABLE public.product_fiscal_profiles
      ADD CONSTRAINT product_fiscal_profiles_ibs_cbs_object_chk
      CHECK (jsonb_typeof(ibs_cbs_configuration) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'product_fiscal_profiles_ibs_cbs_no_secret_chk'
  ) THEN
    ALTER TABLE public.product_fiscal_profiles
      ADD CONSTRAINT product_fiscal_profiles_ibs_cbs_no_secret_chk
      CHECK (NOT public.fiscal_rtc_has_sensitive_key(ibs_cbs_configuration));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'service_fiscal_profiles_ibs_cbs_object_chk'
  ) THEN
    ALTER TABLE public.service_fiscal_profiles
      ADD CONSTRAINT service_fiscal_profiles_ibs_cbs_object_chk
      CHECK (jsonb_typeof(ibs_cbs_configuration) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'service_fiscal_profiles_ibs_cbs_no_secret_chk'
  ) THEN
    ALTER TABLE public.service_fiscal_profiles
      ADD CONSTRAINT service_fiscal_profiles_ibs_cbs_no_secret_chk
      CHECK (NOT public.fiscal_rtc_has_sensitive_key(ibs_cbs_configuration));
  END IF;
END $$;

-- 5) Privilégios da função scanner: público não precisa executá-la;
--    apenas o próprio motor de constraints usa. Revogamos anon/public.
REVOKE ALL ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) TO authenticated;

COMMIT;

-- =====================================================================
-- OBSERVAÇÕES FINAIS:
-- * NÃO altera `document_number` nem `cnpj` — colunas suportadas como
--   text/varchar aceitam alfanumérico sem migração de tipo.
-- * NÃO cria RPCs de escrita nesta migration; hardening backend (item C)
--   deve entrar em migration incremental posterior.
-- * NÃO altera checklist de homologação existente; item E entra em
--   migration incremental posterior (não editar 20260725000000).
-- =====================================================================
