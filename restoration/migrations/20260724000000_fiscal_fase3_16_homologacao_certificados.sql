-- ============================================================================
-- Fase Fiscal 3.16 — Homologação preparada, rascunhos NF-e/NFS-e e certificados
-- ----------------------------------------------------------------------------
-- Migration CANÔNICA aditiva. Não aplicar automaticamente; requer
-- autorização humana. Após aprovação, promover para
-- supabase/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql
-- via ferramenta de migração e aplicar em transação única.
-- Nenhum objeto anterior é alterado destrutivamente. Nenhuma emissão é
-- habilitada. `production_enabled` permanece inalterado e não editável.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. FISCAL_INVOICES — colunas aditivas para preparação de homologação
-- ============================================================================
ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS draft_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS homologation_validation_status text NOT NULL DEFAULT 'NOT_VALIDATED',
  ADD COLUMN IF NOT EXISTS homologation_validation_at timestamptz,
  ADD COLUMN IF NOT EXISTS homologation_validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS customer_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_homologation_status_domain') THEN
    ALTER TABLE public.fiscal_invoices
      ADD CONSTRAINT fi_homologation_status_domain
      CHECK (homologation_validation_status IN ('NOT_VALIDATED','READY','INCOMPLETE','BLOCKED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_homologation_summary_object') THEN
    ALTER TABLE public.fiscal_invoices
      ADD CONSTRAINT fi_homologation_summary_object
      CHECK (jsonb_typeof(homologation_validation_summary) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_homologation_summary_no_secrets') THEN
    ALTER TABLE public.fiscal_invoices
      ADD CONSTRAINT fi_homologation_summary_no_secrets
      CHECK (NOT public.fiscal_json_has_sensitive_key(homologation_validation_summary));
  END IF;
END $$;

-- FK opcional para customer_id: aplicar somente após auditoria de órfãos.
-- ALTER TABLE public.fiscal_invoices
--   ADD CONSTRAINT fi_customer_fk FOREIGN KEY (customer_id)
--   REFERENCES public.clientes(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. FISCAL_CERTIFICATES — metadados apenas (sem senha/PFX/chave)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fiscal_certificates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_settings_id uuid NOT NULL REFERENCES public.company_fiscal_settings(id) ON DELETE CASCADE,
  source_type         text NOT NULL,
  environment         text NOT NULL DEFAULT 'HOMOLOGATION',
  status              text NOT NULL DEFAULT 'NOT_CONFIGURED',
  display_name        text NOT NULL,
  native_alias        text,
  subject_name        text,
  issuer_name         text,
  serial_number       text,
  valid_from          timestamptz,
  valid_until         timestamptz,
  fingerprint_sha256  text,
  key_usage           text[],
  is_active           boolean NOT NULL DEFAULT true,
  version             integer NOT NULL DEFAULT 1,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  revoked_by          uuid,
  revoked_at          timestamptz,
  revoke_reason       text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fc_source_domain') THEN
    ALTER TABLE public.fiscal_certificates
      ADD CONSTRAINT fc_source_domain CHECK (source_type IN ('SYSTEM_STORE','A1_UPLOAD'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fc_env_domain') THEN
    ALTER TABLE public.fiscal_certificates
      ADD CONSTRAINT fc_env_domain CHECK (environment IN ('HOMOLOGATION','PRODUCTION'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fc_status_domain') THEN
    ALTER TABLE public.fiscal_certificates
      ADD CONSTRAINT fc_status_domain
      CHECK (status IN ('NOT_CONFIGURED','AVAILABLE','EXPIRED','REVOKED','ERROR'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fc_fingerprint_format') THEN
    ALTER TABLE public.fiscal_certificates
      ADD CONSTRAINT fc_fingerprint_format
      CHECK (fingerprint_sha256 IS NULL OR fingerprint_sha256 ~ '^[a-f0-9]{64}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_fiscal_certificates_active_per_env
  ON public.fiscal_certificates (company_settings_id, environment)
  WHERE is_active = true AND status = 'AVAILABLE';

CREATE INDEX IF NOT EXISTS ix_fiscal_certificates_company
  ON public.fiscal_certificates (company_settings_id);

GRANT SELECT ON public.fiscal_certificates TO authenticated;
GRANT ALL ON public.fiscal_certificates TO service_role;

ALTER TABLE public.fiscal_certificates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fc_read_metadata') THEN
    CREATE POLICY fc_read_metadata ON public.fiscal_certificates
      FOR SELECT TO authenticated
      USING (
        public.has_role(auth.uid(), 'administrador'::app_role)
        OR public.has_role(auth.uid(), 'financeiro'::app_role)
        OR public.has_role(auth.uid(), 'gestor'::app_role)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fc_admin_write') THEN
    CREATE POLICY fc_admin_write ON public.fiscal_certificates
      FOR INSERT TO authenticated
      WITH CHECK (public.has_role(auth.uid(), 'administrador'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'fc_admin_update') THEN
    CREATE POLICY fc_admin_update ON public.fiscal_certificates
      FOR UPDATE TO authenticated
      USING (public.has_role(auth.uid(), 'administrador'::app_role))
      WITH CHECK (public.has_role(auth.uid(), 'administrador'::app_role));
  END IF;
  -- DELETE físico permanece negado (não há policy DELETE).
END $$;

-- ============================================================================
-- 3. FISCAL_CERTIFICATE_MATERIAL — cofre. SOMENTE service_role.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.fiscal_certificate_material (
  certificate_id     uuid PRIMARY KEY REFERENCES public.fiscal_certificates(id) ON DELETE CASCADE,
  object_path        text NOT NULL,
  encrypted_password bytea NOT NULL,
  password_iv        bytea NOT NULL,
  material_iv        bytea NOT NULL,
  key_version        integer NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.fiscal_certificate_material FROM PUBLIC;
REVOKE ALL ON public.fiscal_certificate_material FROM anon;
REVOKE ALL ON public.fiscal_certificate_material FROM authenticated;
GRANT ALL ON public.fiscal_certificate_material TO service_role;

ALTER TABLE public.fiscal_certificate_material ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: acesso APENAS via service_role em Edge Functions.

-- ============================================================================
-- 4. VIEW SANITIZADA de prontidão do certificado (security_invoker)
-- ============================================================================
CREATE OR REPLACE VIEW public.v_fiscal_certificate_readiness
WITH (security_invoker = true) AS
SELECT
  fc.id                    AS certificate_id,
  fc.company_settings_id,
  fc.source_type,
  fc.environment,
  fc.status,
  fc.display_name,
  fc.subject_name,
  fc.issuer_name,
  fc.valid_from,
  fc.valid_until,
  fc.fingerprint_sha256,
  fc.is_active,
  fc.revoked_at,
  CASE
    WHEN fc.valid_until IS NULL THEN NULL
    ELSE GREATEST(0, EXTRACT(DAY FROM (fc.valid_until - now()))::integer)
  END AS days_until_expiration
FROM public.fiscal_certificates fc;

GRANT SELECT ON public.v_fiscal_certificate_readiness TO authenticated;

-- ============================================================================
-- 5. RPCs — todas SECURITY DEFINER, search_path fixo, fail-closed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_fiscal_draft_save(
  p_invoice_id uuid,
  p_invoice jsonb,
  p_items jsonb,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_row      public.fiscal_invoices;
  v_new_id   uuid;
  v_total    numeric(14,2) := 0;
  v_item     jsonb;
  v_seq      integer := 0;
  v_status   text;
  v_provider text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_user, 'administrador'::app_role)
          OR public.has_role(v_user, 'financeiro'::app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF public.fiscal_json_has_sensitive_key(COALESCE(p_invoice, '{}'::jsonb))
     OR public.fiscal_json_has_sensitive_key(COALESCE(p_items, '[]'::jsonb)) THEN
    RAISE EXCEPTION 'sensitive_key_in_payload' USING ERRCODE = '22023';
  END IF;

  v_status := COALESCE(p_invoice->>'status', 'DRAFT');
  v_provider := COALESCE(p_invoice->>'provider', 'NONE');
  IF v_status NOT IN ('DRAFT','HOMOLOGATION') THEN
    RAISE EXCEPTION 'status_not_allowed_in_draft' USING ERRCODE = '22023';
  END IF;
  IF v_provider <> 'NONE' THEN
    RAISE EXCEPTION 'provider_must_be_none' USING ERRCODE = '22023';
  END IF;

  IF p_invoice_id IS NULL THEN
    INSERT INTO public.fiscal_invoices (
      invoice_type, document_model, document_origin, environment, provider,
      status, normalized_status, series, issue_date, notes,
      company_cnpj, customer_id, receivable_id, delivery_id,
      customer_snapshot, company_snapshot, fiscal_totals_snapshot,
      draft_version, created_by
    ) VALUES (
      p_invoice->>'invoice_type',
      p_invoice->>'document_model',
      COALESCE(p_invoice->>'document_origin', 'MANUAL_RECORD'),
      COALESCE(p_invoice->>'environment', 'NOT_CONFIGURED'),
      'NONE',
      v_status,
      COALESCE(p_invoice->>'normalized_status', 'DRAFT'),
      p_invoice->>'series',
      NULLIF(p_invoice->>'issue_date','')::date,
      p_invoice->>'notes',
      p_invoice->>'company_cnpj',
      NULLIF(p_invoice->>'customer_id','')::uuid,
      NULLIF(p_invoice->>'receivable_id','')::uuid,
      NULLIF(p_invoice->>'delivery_id','')::uuid,
      COALESCE(p_invoice->'customer_snapshot','{}'::jsonb),
      COALESCE(p_invoice->'company_snapshot','{}'::jsonb),
      '{}'::jsonb,
      1,
      v_user
    ) RETURNING id INTO v_new_id;
  ELSE
    SELECT * INTO v_row FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;
    IF v_row.locked_at IS NOT NULL THEN RAISE EXCEPTION 'invoice_locked' USING ERRCODE = '55006'; END IF;
    IF v_row.status NOT IN ('DRAFT','HOMOLOGATION') THEN
      RAISE EXCEPTION 'invoice_not_editable' USING ERRCODE = '22023';
    END IF;
    IF v_row.provider <> 'NONE' THEN
      RAISE EXCEPTION 'invoice_has_provider' USING ERRCODE = '22023';
    END IF;
    IF v_row.draft_version <> p_expected_version THEN
      RAISE EXCEPTION 'conflict' USING ERRCODE = '40001';
    END IF;

    UPDATE public.fiscal_invoices SET
      invoice_type      = COALESCE(p_invoice->>'invoice_type', invoice_type),
      document_model    = COALESCE(p_invoice->>'document_model', document_model),
      series            = COALESCE(p_invoice->>'series', series),
      issue_date        = COALESCE(NULLIF(p_invoice->>'issue_date','')::date, issue_date),
      notes             = COALESCE(p_invoice->>'notes', notes),
      customer_id       = COALESCE(NULLIF(p_invoice->>'customer_id','')::uuid, customer_id),
      customer_snapshot = COALESCE(p_invoice->'customer_snapshot', customer_snapshot),
      status            = v_status,
      normalized_status = COALESCE(p_invoice->>'normalized_status', normalized_status),
      draft_version     = draft_version + 1,
      updated_at        = now()
    WHERE id = p_invoice_id;
    v_new_id := p_invoice_id;
  END IF;

  DELETE FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = v_new_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_seq := v_seq + 1;
    INSERT INTO public.fiscal_invoice_items (
      fiscal_invoice_id, item_sequence, item_kind, description,
      quantity, commercial_unit, unit_value, gross_value, discount_value, net_value,
      taxable_quantity, taxable_unit, source_item_type, source_item_id
    ) VALUES (
      v_new_id, v_seq,
      COALESCE(v_item->>'item_kind','PRODUCT'),
      COALESCE(v_item->>'description',''),
      COALESCE(NULLIF(v_item->>'quantity','')::numeric, 0),
      v_item->>'commercial_unit',
      COALESCE(NULLIF(v_item->>'unit_value','')::numeric, 0),
      COALESCE(NULLIF(v_item->>'gross_value','')::numeric, 0),
      COALESCE(NULLIF(v_item->>'discount_value','')::numeric, 0),
      COALESCE(NULLIF(v_item->>'net_value','')::numeric, 0),
      NULLIF(v_item->>'taxable_quantity','')::numeric,
      v_item->>'taxable_unit',
      v_item->>'source_item_type',
      NULLIF(v_item->>'source_item_id','')::uuid
    );
    v_total := v_total + COALESCE(NULLIF(v_item->>'net_value','')::numeric, 0);
  END LOOP;

  UPDATE public.fiscal_invoices SET
    total_amount = v_total,
    fiscal_totals_snapshot = jsonb_build_object('total_net', v_total, 'computed_at', now())
  WHERE id = v_new_id;

  SELECT * INTO v_row FROM public.fiscal_invoices WHERE id = v_new_id;
  RETURN jsonb_build_object(
    'id', v_row.id,
    'draft_version', v_row.draft_version,
    'total_amount', v_row.total_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_draft_save(uuid, jsonb, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_draft_save(uuid, jsonb, jsonb, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_draft_validate_homologation(
  p_invoice_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_row     public.fiscal_invoices;
  v_items   integer;
  v_missing text[] := ARRAY[]::text[];
  v_status  text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_user, 'administrador'::app_role)
          OR public.has_role(v_user, 'financeiro'::app_role)
          OR public.has_role(v_user, 'gestor'::app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.fiscal_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;

  IF v_row.status NOT IN ('DRAFT','HOMOLOGATION') THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','status_not_draft');
  END IF;
  IF v_row.provider <> 'NONE' THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','provider_not_none');
  END IF;

  IF v_row.invoice_type IS NULL THEN v_missing := array_append(v_missing,'invoice_type'); END IF;
  IF v_row.document_model IS NULL THEN v_missing := array_append(v_missing,'document_model'); END IF;
  IF v_row.company_cnpj IS NULL THEN v_missing := array_append(v_missing,'company_cnpj'); END IF;
  IF v_row.customer_id IS NULL THEN v_missing := array_append(v_missing,'customer_id'); END IF;
  IF v_row.series IS NULL THEN v_missing := array_append(v_missing,'series'); END IF;
  IF v_row.issue_date IS NULL THEN v_missing := array_append(v_missing,'issue_date'); END IF;

  SELECT COUNT(*) INTO v_items FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id;
  IF v_items = 0 THEN v_missing := array_append(v_missing,'items'); END IF;

  v_status := CASE WHEN array_length(v_missing, 1) IS NULL THEN 'READY' ELSE 'INCOMPLETE' END;

  RETURN jsonb_build_object(
    'status', v_status,
    'missing', to_jsonb(v_missing),
    'item_count', v_items,
    'total_amount', v_row.total_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_draft_validate_homologation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_draft_validate_homologation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_certificate_register_os(
  p_company_settings_id uuid,
  p_metadata jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id   uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_user, 'administrador'::app_role) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF public.fiscal_json_has_sensitive_key(COALESCE(p_metadata, '{}'::jsonb)) THEN
    RAISE EXCEPTION 'sensitive_key_in_payload' USING ERRCODE = '22023';
  END IF;

  UPDATE public.fiscal_certificates SET
    is_active = false,
    status = CASE WHEN status = 'AVAILABLE' THEN 'REVOKED' ELSE status END,
    revoked_at = now(), revoked_by = v_user, updated_at = now()
  WHERE company_settings_id = p_company_settings_id
    AND environment = 'HOMOLOGATION'
    AND is_active = true;

  INSERT INTO public.fiscal_certificates (
    company_settings_id, source_type, environment, status,
    display_name, native_alias, subject_name, issuer_name, serial_number,
    valid_from, valid_until, fingerprint_sha256, key_usage, created_by
  ) VALUES (
    p_company_settings_id, 'SYSTEM_STORE', 'HOMOLOGATION', 'AVAILABLE',
    COALESCE(p_metadata->>'display_name','Certificado do sistema operacional'),
    p_metadata->>'native_alias',
    p_metadata->>'subject_name',
    p_metadata->>'issuer_name',
    p_metadata->>'serial_number',
    NULLIF(p_metadata->>'valid_from','')::timestamptz,
    NULLIF(p_metadata->>'valid_until','')::timestamptz,
    p_metadata->>'fingerprint_sha256',
    CASE
      WHEN p_metadata ? 'key_usage' AND jsonb_typeof(p_metadata->'key_usage')='array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_metadata->'key_usage'))
      ELSE NULL
    END,
    v_user
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_certificate_register_os(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_register_os(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_fiscal_certificate_revoke(
  p_certificate_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_role(v_user, 'administrador'::app_role) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.fiscal_certificates SET
    is_active = false, status = 'REVOKED',
    revoked_at = now(), revoked_by = v_user,
    revoke_reason = LEFT(COALESCE(p_reason,''), 500),
    updated_at = now()
  WHERE id = p_certificate_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'certificate_not_found' USING ERRCODE = 'P0002'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_certificate_revoke(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_revoke(uuid, text) TO authenticated;

-- ============================================================================
-- 6. TRIGGER de auditoria de certificados (metadados apenas)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_fiscal_certificates_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action text; v_old jsonb; v_new jsonb;
BEGIN
  v_action := TG_OP;
  IF TG_OP = 'INSERT' THEN
    v_new := jsonb_build_object(
      'source_type', NEW.source_type, 'environment', NEW.environment,
      'status', NEW.status, 'display_name', NEW.display_name,
      'fingerprint_sha256', NEW.fingerprint_sha256, 'valid_until', NEW.valid_until
    );
    v_old := '{}'::jsonb;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := jsonb_build_object('status', OLD.status, 'is_active', OLD.is_active);
    v_new := jsonb_build_object('status', NEW.status, 'is_active', NEW.is_active);
  ELSE
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.fiscal_audit_log (
      table_name, record_id, action, changed_by, old_values, new_values
    ) VALUES (
      'fiscal_certificates', COALESCE(NEW.id, OLD.id), v_action, auth.uid(), v_old, v_new
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fiscal_certificates_audit ON public.fiscal_certificates;
CREATE TRIGGER trg_fiscal_certificates_audit
  AFTER INSERT OR UPDATE ON public.fiscal_certificates
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_certificates_audit();

COMMIT;

-- ============================================================================
-- TODO MANUAL PÓS-MIGRATION:
--   1) storage bucket privado `fiscal-certificates` via
--      supabase--storage_create_bucket (public=false).
--   2) Deploy das Edge Functions `fiscal-certificate-upload` e
--      `fiscal-certificate-revoke`.
--   3) Geração do secret FISCAL_CERTIFICATE_MASTER_KEY (base64 32 bytes)
--      e FISCAL_CORS_ALLOWLIST.
--   4) Auditoria de órfãos em fiscal_invoices.customer_id antes de aplicar FK.
-- ============================================================================
