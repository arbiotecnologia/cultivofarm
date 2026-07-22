-- =====================================================================
-- FASE FISCAL 3.15 — CENTRAL CONFIGURÁVEL DE NF-e E NFS-e (SEM EMISSÃO)
-- Migration canônica ADITIVA e idempotente. NÃO aplicada nesta fase.
-- Local: restoration/migrations/ (padrão do projeto para migrations
-- canônicas que aguardam aplicação humana controlada).
-- Sem provedor ativo, sem token, sem certificado, sem emissão externa.
-- =====================================================================

BEGIN;

-- 1. NOVAS COLUNAS ----------------------------------------------------
ALTER TABLE public.company_fiscal_settings
  ADD COLUMN IF NOT EXISTS nfe_configuration      jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS nfse_configuration     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS nfe_provider           text    NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS nfse_provider          text    NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS nfe_credential_ref     text,
  ADD COLUMN IF NOT EXISTS nfse_credential_ref    text,
  ADD COLUMN IF NOT EXISTS certificate_ref        text,
  ADD COLUMN IF NOT EXISTS webhook_ref            text,
  ADD COLUMN IF NOT EXISTS configuration_notes    text,
  ADD COLUMN IF NOT EXISTS configuration_version  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_validation_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_validation_status text    NOT NULL DEFAULT 'NOT_VALIDATED',
  ADD COLUMN IF NOT EXISTS last_validation_summary jsonb  NOT NULL DEFAULT '{}'::jsonb;

-- 2. CHECKS -----------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_nfe_configuration_is_object') THEN
    ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT cfs_nfe_configuration_is_object CHECK (jsonb_typeof(nfe_configuration)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_nfse_configuration_is_object') THEN
    ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT cfs_nfse_configuration_is_object CHECK (jsonb_typeof(nfse_configuration)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_last_validation_summary_is_object') THEN
    ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT cfs_last_validation_summary_is_object CHECK (jsonb_typeof(last_validation_summary)='object');
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
    ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT cfs_configuration_version_positive CHECK (configuration_version > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_configuration_notes_len') THEN
    ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT cfs_configuration_notes_len CHECK (configuration_notes IS NULL OR length(configuration_notes) <= 4000);
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
CREATE OR REPLACE FUNCTION public.fiscal_json_has_sensitive_key(p jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  WITH RECURSIVE walk(v) AS (
    SELECT p
    UNION ALL
    SELECT CASE
             WHEN jsonb_typeof(v)='object' THEN (SELECT jsonb_agg(value) FROM jsonb_each(v))
             WHEN jsonb_typeof(v)='array'  THEN v
             ELSE NULL END
    FROM walk WHERE jsonb_typeof(v) IN ('object','array') AND v IS NOT NULL
  ),
  keys AS (
    SELECT lower(k) AS k
    FROM walk, jsonb_object_keys(CASE WHEN jsonb_typeof(v)='object' THEN v ELSE '{}'::jsonb END) k
    WHERE jsonb_typeof(v)='object'
  )
  SELECT EXISTS (SELECT 1 FROM keys WHERE k IN
    ('token','password','senha','secret','api_key','apikey','private_key','privatekey',
     'pfx','p12','certificate_content','certificate_pem','pem','authorization','bearer'));
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

-- 4. VIEW readiness ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.jsonb_object_keys_count(p jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE((SELECT count(*)::int FROM jsonb_object_keys(p)),0);
$$;

DROP VIEW IF EXISTS public.v_fiscal_company_readiness;
CREATE VIEW public.v_fiscal_company_readiness WITH (security_invoker=true) AS
SELECT
  s.id, s.fiscal_environment, s.fiscal_provider,
  s.nfe_provider, s.nfse_provider, s.configuration_status,
  s.last_validation_status, s.last_validation_at, s.configuration_version,
  s.nfe_enabled, s.nfse_enabled, s.production_enabled,
  (s.accounting_validated_at IS NOT NULL) AS accounting_validated,
  ((s.cnpj IS NOT NULL)::int + (s.legal_name IS NOT NULL)::int
   + (s.trade_name IS NOT NULL)::int + (s.fiscal_email IS NOT NULL)::int
   + (s.tax_regime IS NOT NULL)::int + (s.crt IS NOT NULL)::int
   + (s.primary_cnae IS NOT NULL)::int + (s.municipal_registration IS NOT NULL)::int
   + (s.state_registration IS NOT NULL)::int + (s.municipality_ibge_code IS NOT NULL)::int
   + (s.postal_code IS NOT NULL)::int + (s.street IS NOT NULL)::int
   + (s.number IS NOT NULL)::int + (s.neighborhood IS NOT NULL)::int
   + (s.city IS NOT NULL)::int + (s.state IS NOT NULL)::int
   + (s.country_code IS NOT NULL)::int) AS filled_score,
  17 AS max_score,
  public.jsonb_object_keys_count(s.nfe_configuration)  AS nfe_configuration_field_count,
  public.jsonb_object_keys_count(s.nfse_configuration) AS nfse_configuration_field_count
FROM public.company_fiscal_settings s
WHERE s.is_active = true;

GRANT SELECT ON public.v_fiscal_company_readiness TO authenticated;
GRANT SELECT ON public.v_fiscal_company_readiness TO service_role;

-- 5. TRIGGER de auditoria (masked) -----------------------------------
CREATE OR REPLACE FUNCTION public.tg_fiscal_cfs_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_actor uuid;
  v_new jsonb; v_old jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fiscal_audit_log') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_new := jsonb_build_object(
      'id', NEW.id, 'configuration_status', NEW.configuration_status,
      'fiscal_environment', NEW.fiscal_environment,
      'nfe_provider', NEW.nfe_provider, 'nfse_provider', NEW.nfse_provider,
      'configuration_version', NEW.configuration_version,
      'last_validation_status', NEW.last_validation_status,
      'nfe_keys',  (SELECT jsonb_agg(k) FROM jsonb_object_keys(NEW.nfe_configuration) k),
      'nfse_keys', (SELECT jsonb_agg(k) FROM jsonb_object_keys(NEW.nfse_configuration) k),
      'has_nfe_credential_ref',  (NEW.nfe_credential_ref  IS NOT NULL),
      'has_nfse_credential_ref', (NEW.nfse_credential_ref IS NOT NULL),
      'has_certificate_ref',     (NEW.certificate_ref     IS NOT NULL),
      'has_webhook_ref',         (NEW.webhook_ref         IS NOT NULL));
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    v_old := jsonb_build_object('id',OLD.id,'configuration_status',OLD.configuration_status,
      'fiscal_environment',OLD.fiscal_environment,'nfe_provider',OLD.nfe_provider,
      'nfse_provider',OLD.nfse_provider,'configuration_version',OLD.configuration_version,
      'last_validation_status',OLD.last_validation_status);
  END IF;
  BEGIN
    INSERT INTO public.fiscal_audit_log (actor_id, entity, action, entity_id, payload)
    VALUES (v_actor,'company_fiscal_settings',TG_OP,COALESCE(NEW.id,OLD.id),
            jsonb_build_object('new',v_new,'old',v_old));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_fiscal_cfs_audit ON public.company_fiscal_settings;
CREATE TRIGGER tg_fiscal_cfs_audit AFTER INSERT OR UPDATE OR DELETE
ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_cfs_audit();

-- 6. RPC init (admin-only, idempotente) ------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_settings_init()
RETURNS public.company_fiscal_settings
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_existing public.company_fiscal_settings; v_actor uuid;
BEGIN
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  IF v_actor IS NULL OR NOT public.has_role(v_actor,'administrador') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_existing FROM public.company_fiscal_settings WHERE is_active=true LIMIT 1;
  IF v_existing.id IS NOT NULL THEN RETURN v_existing; END IF;
  INSERT INTO public.company_fiscal_settings (
    is_active, fiscal_environment, configuration_status,
    fiscal_provider, nfe_provider, nfse_provider,
    nfe_enabled, nfse_enabled, production_enabled,
    last_validation_status, configuration_version,
    created_by, updated_by
  ) VALUES (
    true, 'NOT_CONFIGURED', 'DRAFT', 'NONE', 'NONE', 'NONE',
    false, false, false, 'NOT_VALIDATED', 1, v_actor, v_actor
  ) RETURNING * INTO v_existing;
  RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_company_settings_init() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_company_settings_init() TO authenticated;

COMMIT;
