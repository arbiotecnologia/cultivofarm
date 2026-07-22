-- =====================================================================
-- FASE FISCAL 3.15 — CENTRAL CONFIGURÁVEL DE NF-e E NFS-e (SEM EMISSÃO)
-- Migration canônica ADITIVA e idempotente. NÃO aplicada nesta fase.
--
-- Trilhos de segurança preservados:
--   - production_enabled continua fora do payload da UI.
--   - fiscalEmissionEnabled continua false no client.
--   - Nenhum secret/certificado/token entra no banco (constraint fail-closed).
--   - RLS/policies existentes não são alteradas.
-- =====================================================================

BEGIN;

-- 1. NOVAS COLUNAS ----------------------------------------------------
ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS nfe_configuration       jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS nfse_configuration      jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS nfe_provider            text    NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS nfse_provider           text    NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS nfe_credential_ref      text,
  ADD COLUMN IF NOT EXISTS nfse_credential_ref     text,
  ADD COLUMN IF NOT EXISTS certificate_ref         text,
  ADD COLUMN IF NOT EXISTS webhook_ref             text,
  ADD COLUMN IF NOT EXISTS configuration_notes     text,
  ADD COLUMN IF NOT EXISTS configuration_version   integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_validation_at      timestamptz,
  ADD COLUMN IF NOT EXISTS last_validation_status  text    NOT NULL DEFAULT 'NOT_VALIDATED',
  ADD COLUMN IF NOT EXISTS last_validation_summary jsonb   NOT NULL DEFAULT '{}'::jsonb;

-- 2. CHECKS -----------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_nfe_configuration_is_object') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT cfs_nfe_configuration_is_object CHECK (jsonb_typeof(nfe_configuration)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_nfse_configuration_is_object') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT cfs_nfse_configuration_is_object CHECK (jsonb_typeof(nfse_configuration)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_last_validation_summary_is_object') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT cfs_last_validation_summary_is_object CHECK (jsonb_typeof(last_validation_summary)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_nfe_provider_domain') THEN
    ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT cfs_nfe_provider_domain
      CHECK (nfe_provider IN ('NONE','NOT_CONFIGURED','FOCUS_NFE','PLUGNOTAS','SEFAZ_DIRETO','NFSE_NACIONAL','MUNICIPAL','OTHER_FUTURE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_nfse_provider_domain') THEN
    ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT cfs_nfse_provider_domain
      CHECK (nfse_provider IN ('NONE','NOT_CONFIGURED','FOCUS_NFE','PLUGNOTAS','SEFAZ_DIRETO','NFSE_NACIONAL','MUNICIPAL','OTHER_FUTURE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_last_validation_status_domain') THEN
    ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT cfs_last_validation_status_domain
      CHECK (last_validation_status IN ('NOT_VALIDATED','INCOMPLETE','READY_FOR_HOMOLOGATION','VALIDATED_HOMOLOGATION','BLOCKED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_configuration_version_positive') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT cfs_configuration_version_positive CHECK (configuration_version > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_configuration_notes_len') THEN
    ALTER TABLE public.company_fiscal_settings
      ADD CONSTRAINT cfs_configuration_notes_len CHECK (configuration_notes IS NULL OR length(configuration_notes) <= 4000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_refs_shape') THEN
    ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT cfs_refs_shape CHECK (
      (nfe_credential_ref  IS NULL OR (length(nfe_credential_ref)  BETWEEN 1 AND 120 AND nfe_credential_ref  ~ '^[A-Za-z0-9_.:\-]+$'))
      AND (nfse_credential_ref IS NULL OR (length(nfse_credential_ref) BETWEEN 1 AND 120 AND nfse_credential_ref ~ '^[A-Za-z0-9_.:\-]+$'))
      AND (certificate_ref     IS NULL OR (length(certificate_ref)     BETWEEN 1 AND 120 AND certificate_ref     ~ '^[A-Za-z0-9_.:\-]+$'))
      AND (webhook_ref         IS NULL OR (length(webhook_ref)         BETWEEN 1 AND 120 AND webhook_ref         ~ '^[A-Za-z0-9_.:\-]+$'))
    );
  END IF;
END $$;

-- 3. FAIL-CLOSED sensitive keys --------------------------------------
-- Implementação PL/pgSQL realmente recursiva.
-- Objeto: itera jsonb_each, bloqueia chave sensível case-insensitive e
--         recursa no VALOR.
-- Array : itera jsonb_array_elements e recursa em CADA elemento.
-- Primitivo/null: retorna false.
-- Correspondência case-insensitive equivalente ao scanner TypeScript
-- (SENSITIVE_JSON_KEYS em src/lib/fiscal/companyFiscalValidation.ts).
CREATE OR REPLACE FUNCTION public.fiscal_json_has_sensitive_key(p jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  k text;
  v jsonb;
  item jsonb;
  sensitive constant text[] := ARRAY[
    'token','password','senha','secret','api_key','apikey',
    'private_key','privatekey','pfx','p12',
    'certificate_content','certificate_pem','pem',
    'authorization','bearer'
  ];
BEGIN
  IF p IS NULL THEN RETURN false; END IF;
  IF jsonb_typeof(p) = 'object' THEN
    FOR k, v IN SELECT key, value FROM jsonb_each(p) LOOP
      IF lower(k) = ANY (sensitive) THEN
        RETURN true;
      END IF;
      IF public.fiscal_json_has_sensitive_key(v) THEN
        RETURN true;
      END IF;
    END LOOP;
    RETURN false;
  ELSIF jsonb_typeof(p) = 'array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(p) LOOP
      IF public.fiscal_json_has_sensitive_key(item) THEN
        RETURN true;
      END IF;
    END LOOP;
    RETURN false;
  END IF;
  RETURN false;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_no_sensitive_keys_in_jsonb') THEN
    ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT cfs_no_sensitive_keys_in_jsonb CHECK (
      NOT public.fiscal_json_has_sensitive_key(nfe_configuration)
      AND NOT public.fiscal_json_has_sensitive_key(nfse_configuration)
      AND NOT public.fiscal_json_has_sensitive_key(last_validation_summary)
    );
  END IF;
END $$;

-- 4. Helper: contagem de chaves de objeto JSONB ----------------------
CREATE OR REPLACE FUNCTION public.jsonb_object_keys_count(p jsonb)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
           WHEN p IS NULL OR jsonb_typeof(p) <> 'object' THEN 0
           ELSE COALESCE((SELECT count(*)::int FROM jsonb_object_keys(p)), 0)
         END;
$$;

-- 5. VIEW v_fiscal_company_readiness ---------------------------------
-- CREATE OR REPLACE VIEW preservando exatamente o prefixo canônico
-- (id, configuration_status, nfe_enabled, nfse_enabled, production_enabled,
--  fiscal_environment, fiscal_provider, filled_score, max_score,
--  accounting_validated) e ADICIONANDO novas colunas somente ao FINAL.
-- security_invoker=true e grants existentes são preservados.
CREATE OR REPLACE VIEW public.v_fiscal_company_readiness
WITH (security_invoker=true) AS
SELECT
  id,
  configuration_status,
  nfe_enabled,
  nfse_enabled,
  production_enabled,
  fiscal_environment,
  fiscal_provider,
  ((cnpj IS NOT NULL)::int
   + (legal_name IS NOT NULL)::int
   + (trade_name IS NOT NULL)::int
   + (fiscal_email IS NOT NULL)::int
   + (tax_regime IS NOT NULL)::int
   + (crt IS NOT NULL)::int
   + (primary_cnae IS NOT NULL)::int
   + (municipal_registration IS NOT NULL)::int
   + (state_registration IS NOT NULL)::int
   + (municipality_ibge_code IS NOT NULL)::int
   + (postal_code IS NOT NULL)::int
   + (street IS NOT NULL)::int
   + (number IS NOT NULL)::int
   + (neighborhood IS NOT NULL)::int
   + (city IS NOT NULL)::int
   + (state IS NOT NULL)::int
   + (country_code IS NOT NULL)::int)::int AS filled_score,
  17 AS max_score,
  (accounting_validated_at IS NOT NULL) AS accounting_validated,
  -- NOVAS COLUNAS AO FINAL (aditivas, sem quebrar dependentes):
  nfe_provider,
  nfse_provider,
  configuration_version,
  last_validation_status,
  last_validation_at,
  public.jsonb_object_keys_count(nfe_configuration)  AS nfe_configuration_field_count,
  public.jsonb_object_keys_count(nfse_configuration) AS nfse_configuration_field_count
FROM public.company_fiscal_settings
WHERE is_active = true;

-- Grants certificados preservados (idempotentes):
GRANT SELECT ON public.v_fiscal_company_readiness TO authenticated;
GRANT SELECT ON public.v_fiscal_company_readiness TO service_role;

-- 6. TRIGGER de auditoria especializado ------------------------------
-- Substitui o trigger genérico (que persistia to_jsonb(NEW) inteiro e
-- portanto exporia refs/notes/configurações) por um trigger que:
--   * usa o CONTRATO REAL de fiscal_audit_log (table_name, record_id,
--     action, changed_by, changed_at, old_values, new_values);
--   * registra apenas campos seguros + booleanos de presença;
--   * cobre INSERT e UPDATE — DELETE não é auditado aqui porque a policy
--     de DELETE já é negada e não deve sugerir fluxo permitido;
--   * NÃO engole erros (sem EXCEPTION WHEN OTHERS THEN NULL): a
--     integridade da auditoria é obrigatória.
CREATE OR REPLACE FUNCTION public.tg_fiscal_cfs_audit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_new   jsonb;
  v_old   jsonb;
BEGIN
  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    v_new := jsonb_build_object(
      'id',                     NEW.id,
      'configuration_status',   NEW.configuration_status,
      'fiscal_environment',     NEW.fiscal_environment,
      'nfe_provider',           NEW.nfe_provider,
      'nfse_provider',          NEW.nfse_provider,
      'nfe_enabled',            NEW.nfe_enabled,
      'nfse_enabled',           NEW.nfse_enabled,
      'production_enabled',     NEW.production_enabled,
      'configuration_version',  NEW.configuration_version,
      'last_validation_status', NEW.last_validation_status,
      'nfe_config_field_count',  public.jsonb_object_keys_count(NEW.nfe_configuration),
      'nfse_config_field_count', public.jsonb_object_keys_count(NEW.nfse_configuration),
      'has_nfe_credential_ref',  (NEW.nfe_credential_ref  IS NOT NULL),
      'has_nfse_credential_ref', (NEW.nfse_credential_ref IS NOT NULL),
      'has_certificate_ref',     (NEW.certificate_ref     IS NOT NULL),
      'has_webhook_ref',         (NEW.webhook_ref         IS NOT NULL),
      'has_configuration_notes', (NEW.configuration_notes IS NOT NULL)
    );
    INSERT INTO public.fiscal_audit_log (table_name, record_id, action, changed_by, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_actor, v_new);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := jsonb_build_object(
      'id',                     OLD.id,
      'configuration_status',   OLD.configuration_status,
      'fiscal_environment',     OLD.fiscal_environment,
      'nfe_provider',           OLD.nfe_provider,
      'nfse_provider',          OLD.nfse_provider,
      'nfe_enabled',            OLD.nfe_enabled,
      'nfse_enabled',           OLD.nfse_enabled,
      'production_enabled',     OLD.production_enabled,
      'configuration_version',  OLD.configuration_version,
      'last_validation_status', OLD.last_validation_status,
      'nfe_config_field_count',  public.jsonb_object_keys_count(OLD.nfe_configuration),
      'nfse_config_field_count', public.jsonb_object_keys_count(OLD.nfse_configuration),
      'has_nfe_credential_ref',  (OLD.nfe_credential_ref  IS NOT NULL),
      'has_nfse_credential_ref', (OLD.nfse_credential_ref IS NOT NULL),
      'has_certificate_ref',     (OLD.certificate_ref     IS NOT NULL),
      'has_webhook_ref',         (OLD.webhook_ref         IS NOT NULL),
      'has_configuration_notes', (OLD.configuration_notes IS NOT NULL)
    );
    v_new := jsonb_build_object(
      'id',                     NEW.id,
      'configuration_status',   NEW.configuration_status,
      'fiscal_environment',     NEW.fiscal_environment,
      'nfe_provider',           NEW.nfe_provider,
      'nfse_provider',          NEW.nfse_provider,
      'nfe_enabled',            NEW.nfe_enabled,
      'nfse_enabled',           NEW.nfse_enabled,
      'production_enabled',     NEW.production_enabled,
      'configuration_version',  NEW.configuration_version,
      'last_validation_status', NEW.last_validation_status,
      'nfe_config_field_count',  public.jsonb_object_keys_count(NEW.nfe_configuration),
      'nfse_config_field_count', public.jsonb_object_keys_count(NEW.nfse_configuration),
      'has_nfe_credential_ref',  (NEW.nfe_credential_ref  IS NOT NULL),
      'has_nfse_credential_ref', (NEW.nfse_credential_ref IS NOT NULL),
      'has_certificate_ref',     (NEW.certificate_ref     IS NOT NULL),
      'has_webhook_ref',         (NEW.webhook_ref         IS NOT NULL),
      'has_configuration_notes', (NEW.configuration_notes IS NOT NULL)
    );
    INSERT INTO public.fiscal_audit_log (table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_actor, v_old, v_new);
    RETURN NEW;
  END IF;

  -- DELETE não é auditado por este trigger (policy nega DELETE nesta tabela).
  RETURN NULL;
END;
$$;

-- Substitui o trigger genérico da Fase 2 SOMENTE para
-- company_fiscal_settings, mantendo o genérico nas demais tabelas.
DROP TRIGGER IF EXISTS trg_fiscal_audit_company_fiscal_settings ON public.company_fiscal_settings;
DROP TRIGGER IF EXISTS tg_fiscal_cfs_audit ON public.company_fiscal_settings;
CREATE TRIGGER tg_fiscal_cfs_audit
  AFTER INSERT OR UPDATE ON public.company_fiscal_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_cfs_audit();

-- 7. RPC init (admin-only, idempotente, anti-corrida) ----------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_settings_init()
RETURNS public.company_fiscal_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_existing public.company_fiscal_settings;
  v_actor    uuid;
BEGIN
  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'administrador') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  -- Advisory lock transacional: elimina corrida de singleton entre
  -- chamadas concorrentes desta RPC.
  PERFORM pg_advisory_xact_lock(hashtext('fiscal_company_settings_singleton'));

  SELECT * INTO v_existing
    FROM public.company_fiscal_settings
    WHERE is_active = true
    LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.company_fiscal_settings (
    is_active, fiscal_environment, configuration_status,
    fiscal_provider, nfe_provider, nfse_provider,
    nfe_enabled, nfse_enabled, production_enabled,
    last_validation_status, configuration_version,
    created_by, updated_by
  ) VALUES (
    true, 'NOT_CONFIGURED', 'DRAFT',
    'NONE', 'NONE', 'NONE',
    false, false, false,
    'NOT_VALIDATED', 1,
    v_actor, v_actor
  ) RETURNING * INTO v_existing;

  RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_company_settings_init() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_company_settings_init() TO authenticated;

COMMIT;
