-- ============================================================================
-- Fase Fiscal 3.16 — Homologação preparada, rascunhos NF-e/NFS-e e certificados
-- ----------------------------------------------------------------------------
-- Migration CANÔNICA aditiva e idempotente. Nenhum objeto anterior é alterado
-- destrutivamente. Nenhuma emissão é habilitada; `production_enabled` fica
-- imutável.
-- ============================================================================

BEGIN;

-- 1. FISCAL_INVOICES — colunas aditivas + FK real de cliente ----------------
ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS draft_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS homologation_validation_status text NOT NULL DEFAULT 'NOT_VALIDATED',
  ADD COLUMN IF NOT EXISTS homologation_validation_at timestamptz,
  ADD COLUMN IF NOT EXISTS homologation_validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS fiscal_profile_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tax_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

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
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_fiscal_profile_snapshot_object') THEN
    ALTER TABLE public.fiscal_invoices
      ADD CONSTRAINT fi_fiscal_profile_snapshot_object
      CHECK (jsonb_typeof(fiscal_profile_snapshot) = 'object'
             AND NOT public.fiscal_json_has_sensitive_key(fiscal_profile_snapshot));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_tax_snapshot_object') THEN
    ALTER TABLE public.fiscal_invoices
      ADD CONSTRAINT fi_tax_snapshot_object
      CHECK (jsonb_typeof(tax_snapshot) = 'object'
             AND NOT public.fiscal_json_has_sensitive_key(tax_snapshot));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fi_customer_id_fk') THEN
    ALTER TABLE public.fiscal_invoices
      ADD CONSTRAINT fi_customer_id_fk
      FOREIGN KEY (customer_id)
      REFERENCES public.clientes(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_fiscal_invoices_customer_id
  ON public.fiscal_invoices (customer_id);

-- 2. FISCAL_CERTIFICATES — metadados apenas ---------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_certificates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_settings_id uuid NOT NULL REFERENCES public.company_fiscal_settings(id) ON DELETE RESTRICT,
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
END $$;

-- 3. FISCAL_CERTIFICATE_MATERIAL — cofre. SOMENTE service_role. -------------
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

-- 4. VIEW sanitizada de prontidão (security_invoker) ------------------------
CREATE OR REPLACE VIEW public.v_fiscal_certificate_readiness
WITH (security_invoker = true) AS
SELECT
  fc.id AS certificate_id, fc.company_settings_id, fc.source_type,
  fc.environment, fc.status, fc.display_name,
  fc.subject_name, fc.issuer_name, fc.valid_from, fc.valid_until,
  fc.fingerprint_sha256, fc.is_active, fc.revoked_at,
  CASE
    WHEN fc.valid_until IS NULL THEN NULL
    ELSE GREATEST(0, EXTRACT(DAY FROM (fc.valid_until - now()))::integer)
  END AS days_until_expiration
FROM public.fiscal_certificates fc;

GRANT SELECT ON public.v_fiscal_certificate_readiness TO authenticated;

-- 5. STORAGE bucket privado (idempotente) — sem policies em storage.objects
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('fiscal-certificates', 'fiscal-certificates', false, 10485760)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- 6. RPC service-role-only para registro atômico do A1 ----------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_certificate_register_a1(
  p_company_settings_id     uuid,
  p_created_by              uuid,
  p_display_name            text,
  p_subject_name            text,
  p_issuer_name             text,
  p_serial_number           text,
  p_valid_from              timestamptz,
  p_valid_until             timestamptz,
  p_fingerprint_sha256      text,
  p_key_usage               text[],
  p_object_path             text,
  p_encrypted_password_b64  text,
  p_password_iv_b64         text,
  p_material_iv_b64         text,
  p_key_version             integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IN ('anon','authenticated') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_company_settings_id IS NULL THEN
    RAISE EXCEPTION 'company_settings_id_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_fiscal_settings WHERE id = p_company_settings_id) THEN
    RAISE EXCEPTION 'company_settings_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_fingerprint_sha256 IS NULL OR p_fingerprint_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'fingerprint_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_valid_until IS NULL OR p_valid_until <= now() THEN
    RAISE EXCEPTION 'certificate_expired' USING ERRCODE = '22023';
  END IF;
  IF p_object_path IS NULL OR length(p_object_path) = 0 THEN
    RAISE EXCEPTION 'object_path_required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.fiscal_certificates SET
    is_active = false,
    status    = CASE WHEN status = 'AVAILABLE' THEN 'REVOKED' ELSE status END,
    revoked_at = now(),
    revoked_by = p_created_by,
    revoke_reason = COALESCE(revoke_reason, 'substituido por novo A1'),
    updated_at = now()
  WHERE company_settings_id = p_company_settings_id
    AND environment = 'HOMOLOGATION'
    AND is_active = true;

  INSERT INTO public.fiscal_certificates (
    company_settings_id, source_type, environment, status,
    display_name, subject_name, issuer_name, serial_number,
    valid_from, valid_until, fingerprint_sha256, key_usage,
    is_active, created_by
  ) VALUES (
    p_company_settings_id, 'A1_UPLOAD', 'HOMOLOGATION', 'AVAILABLE',
    p_display_name, p_subject_name, p_issuer_name, p_serial_number,
    p_valid_from, p_valid_until, lower(p_fingerprint_sha256), p_key_usage,
    true, p_created_by
  ) RETURNING id INTO v_id;

  INSERT INTO public.fiscal_certificate_material (
    certificate_id, object_path,
    encrypted_password, password_iv, material_iv, key_version
  ) VALUES (
    v_id, p_object_path,
    decode(p_encrypted_password_b64, 'base64'),
    decode(p_password_iv_b64,        'base64'),
    decode(p_material_iv_b64,        'base64'),
    COALESCE(p_key_version, 1)
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_certificate_register_a1(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, text,
  text[], text, text, text, text, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_certificate_register_a1(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, text,
  text[], text, text, text, text, integer
) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_fiscal_certificate_register_a1(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, text,
  text[], text, text, text, text, integer
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_register_a1(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, text,
  text[], text, text, text, text, integer
) TO service_role;

-- 6.b. Helpers de whitelist para snapshots por item (Fase 3.16.2-C) --------
-- Fail-closed: rejeitam qualquer chave fora do contrato permitido.
CREATE OR REPLACE FUNCTION public.fiscal_validate_snapshot_keys(
  p_obj jsonb, p_allowed text[], p_label text
) RETURNS void
LANGUAGE plpgsql IMMUTABLE
AS $HELPERKEYS$
DECLARE k text;
BEGIN
  IF p_obj IS NULL OR jsonb_typeof(p_obj) <> 'object' THEN
    RETURN;
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_obj) LOOP
    IF NOT (k = ANY(p_allowed)) THEN
      RAISE EXCEPTION 'snapshot_unknown_key:%:%', p_label, k
        USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$HELPERKEYS$;
REVOKE ALL ON FUNCTION public.fiscal_validate_snapshot_keys(jsonb, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_validate_snapshot_keys(jsonb, text[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fiscal_validate_key_usage(p_arr jsonb)
RETURNS void
LANGUAGE plpgsql IMMUTABLE
AS $HELPERKU$
DECLARE
  v_len integer;
  v_el  jsonb;
BEGIN
  IF p_arr IS NULL THEN RETURN; END IF;
  IF jsonb_typeof(p_arr) <> 'array' THEN
    RAISE EXCEPTION 'key_usage_invalid' USING ERRCODE = '22023';
  END IF;
  v_len := jsonb_array_length(p_arr);
  IF v_len > 20 THEN
    RAISE EXCEPTION 'key_usage_too_many' USING ERRCODE = '22023';
  END IF;
  FOR v_el IN SELECT * FROM jsonb_array_elements(p_arr) LOOP
    IF jsonb_typeof(v_el) <> 'string' THEN
      RAISE EXCEPTION 'key_usage_item_not_string' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_el #>> '{}') < 1 OR char_length(v_el #>> '{}') > 80 THEN
      RAISE EXCEPTION 'key_usage_item_length_invalid' USING ERRCODE = '22023';
    END IF;
  END LOOP;
END;
$HELPERKU$;
REVOKE ALL ON FUNCTION public.fiscal_validate_key_usage(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_validate_key_usage(jsonb) TO authenticated;

-- 7. RPC de rascunho — validação estrita, cálculo server-side ---------------
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
  v_user           uuid := auth.uid();
  v_row            public.fiscal_invoices;
  v_new_id         uuid;
  v_total          numeric(14,2) := 0;
  v_item           jsonb;
  v_seq            integer := 0;
  v_env            text;
  v_invoice_type   text;
  v_customer_id    uuid;
  v_qty            numeric;
  v_unit           numeric;
  v_gross          numeric;
  v_disc           numeric;
  v_net            numeric;
  v_kind           text;
  v_items_count    integer;
  v_computed_items jsonb := '[]'::jsonb;
  v_profile_snap   jsonb;
  v_tax_snap       jsonb;
  FORBIDDEN_KEYS   text[] := ARRAY[
    'sefaz_key','access_key','protocol_number','authorization_number',
    'authorized_at','authorization_xml','xml','pdf','signed_xml',
    'cancel_protocol','provider_response'
  ];
  k text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_user, 'administrador'::app_role)
          OR public.has_role(v_user, 'financeiro'::app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object' THEN
    RAISE EXCEPTION 'invoice_object_required' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items_array_required' USING ERRCODE = '22023';
  END IF;

  IF public.fiscal_json_has_sensitive_key(p_invoice)
     OR public.fiscal_json_has_sensitive_key(p_items) THEN
    RAISE EXCEPTION 'sensitive_key_in_payload' USING ERRCODE = '22023';
  END IF;

  FOREACH k IN ARRAY FORBIDDEN_KEYS LOOP
    IF p_invoice ? k THEN
      RAISE EXCEPTION 'emission_field_forbidden' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_items_count := jsonb_array_length(p_items);
  IF v_items_count < 1 OR v_items_count > 500 THEN
    RAISE EXCEPTION 'items_count_out_of_range' USING ERRCODE = '22023';
  END IF;

  v_invoice_type := COALESCE(p_invoice->>'invoice_type','');
  IF v_invoice_type NOT IN ('NFE','NFSE') THEN
    RAISE EXCEPTION 'invoice_type_invalid' USING ERRCODE = '22023';
  END IF;

  v_env := COALESCE(p_invoice->>'environment','NOT_CONFIGURED');
  IF v_env NOT IN ('HOMOLOGATION','NOT_CONFIGURED') THEN
    RAISE EXCEPTION 'environment_not_allowed' USING ERRCODE = '22023';
  END IF;

  v_customer_id := NULLIF(p_invoice->>'customer_id','')::uuid;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = v_customer_id) THEN
    RAISE EXCEPTION 'customer_not_found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_seq  := v_seq + 1;
    v_kind := COALESCE(v_item->>'item_kind','');
    IF v_invoice_type = 'NFE'  AND v_kind <> 'PRODUCT' THEN
      RAISE EXCEPTION 'nfe_requires_product_items' USING ERRCODE = '22023';
    END IF;
    IF v_invoice_type = 'NFSE' AND v_kind <> 'SERVICE' THEN
      RAISE EXCEPTION 'nfse_requires_service_items' USING ERRCODE = '22023';
    END IF;

    v_qty  := COALESCE(NULLIF(v_item->>'quantity','')::numeric, 0);
    v_unit := COALESCE(NULLIF(v_item->>'unit_value','')::numeric, 0);
    v_disc := COALESCE(NULLIF(v_item->>'discount_value','')::numeric, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'item_quantity_must_be_positive' USING ERRCODE = '22023';
    END IF;
    IF v_unit < 0 THEN
      RAISE EXCEPTION 'item_unit_value_negative' USING ERRCODE = '22023';
    END IF;
    IF v_disc < 0 THEN
      RAISE EXCEPTION 'item_discount_negative' USING ERRCODE = '22023';
    END IF;

    v_gross := round(v_qty * v_unit, 2);
    IF v_disc > v_gross THEN
      RAISE EXCEPTION 'item_discount_gt_gross' USING ERRCODE = '22023';
    END IF;
    v_net  := round(v_gross - v_disc, 2);

    -- 3.16.2-C: whitelist FAIL-CLOSED por item + verificação de source_item_id
    DECLARE
      v_item_profile jsonb := COALESCE(v_item->'fiscal_profile_snapshot', '{}'::jsonb);
      v_item_tax     jsonb := COALESCE(v_item->'tax_snapshot', '{}'::jsonb);
      v_source_id    uuid  := NULLIF(v_item->>'source_item_id','')::uuid;
      v_icms_obj     jsonb;
      v_pis_obj      jsonb;
      v_cofins_obj   jsonb;
      v_ipi_obj      jsonb;
      v_rate         numeric;
      v_withheld     jsonb;
      v_rets         jsonb;
    BEGIN
      IF jsonb_typeof(v_item_profile) <> 'object' THEN v_item_profile := '{}'::jsonb; END IF;
      IF jsonb_typeof(v_item_tax)     <> 'object' THEN v_item_tax     := '{}'::jsonb; END IF;
      IF public.fiscal_json_has_sensitive_key(v_item_profile)
         OR public.fiscal_json_has_sensitive_key(v_item_tax) THEN
        RAISE EXCEPTION 'sensitive_key_in_snapshot' USING ERRCODE = '22023';
      END IF;

      IF v_invoice_type = 'NFE' THEN
        -- Whitelist do perfil NF-e
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_profile,
          ARRAY['ncm','cest','cfop','origem_mercadoria','cst_icms','csosn','unidade'],
          'nfe_profile'
        );
        -- Whitelist da tributação NF-e (somente configuração preparatória)
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_tax, ARRAY['pis','cofins','ipi','icms'], 'nfe_tax'
        );
        v_icms_obj   := v_item_tax->'icms';
        v_pis_obj    := v_item_tax->'pis';
        v_cofins_obj := v_item_tax->'cofins';
        v_ipi_obj    := v_item_tax->'ipi';
        IF v_icms_obj IS NOT NULL THEN
          IF jsonb_typeof(v_icms_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_icms_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(
            v_icms_obj, ARRAY['cst','csosn','aliquota','base_calculo_modalidade'], 'nfe_tax.icms'
          );
        END IF;
        IF v_pis_obj IS NOT NULL THEN
          IF jsonb_typeof(v_pis_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_pis_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(v_pis_obj, ARRAY['cst','aliquota'], 'nfe_tax.pis');
        END IF;
        IF v_cofins_obj IS NOT NULL THEN
          IF jsonb_typeof(v_cofins_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_cofins_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(v_cofins_obj, ARRAY['cst','aliquota'], 'nfe_tax.cofins');
        END IF;
        IF v_ipi_obj IS NOT NULL THEN
          IF jsonb_typeof(v_ipi_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_ipi_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(v_ipi_obj, ARRAY['cst','aliquota'], 'nfe_tax.ipi');
        END IF;

        -- Verificação de existência do source_item_id (produto + perfil)
        IF v_source_id IS NOT NULL THEN
          IF NOT EXISTS (SELECT 1 FROM public.produtos pr WHERE pr.id = v_source_id) THEN
            RAISE EXCEPTION 'source_item_product_not_found:%', v_seq USING ERRCODE = 'P0002';
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM public.product_fiscal_profiles pfp
            WHERE pfp.product_id = v_source_id AND pfp.is_active = true
          ) THEN
            RAISE EXCEPTION 'source_item_product_profile_missing:%', v_seq USING ERRCODE = 'P0002';
          END IF;
        END IF;
      ELSE
        -- NFS-e
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_profile,
          ARRAY['lc116_item','cnae','municipal_tax_code','national_tax_code','municipality_ibge_code'],
          'nfse_profile'
        );
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_tax, ARRAY['iss_rate','iss_withheld','retencoes_suportadas'], 'nfse_tax'
        );
        IF v_item_tax ? 'iss_rate' THEN
          IF jsonb_typeof(v_item_tax->'iss_rate') <> 'number' THEN
            RAISE EXCEPTION 'nfse_iss_rate_not_number' USING ERRCODE = '22023';
          END IF;
          v_rate := (v_item_tax->>'iss_rate')::numeric;
          IF v_rate < 0 OR v_rate > 100 THEN
            RAISE EXCEPTION 'nfse_iss_rate_out_of_range' USING ERRCODE = '22023';
          END IF;
        END IF;
        v_withheld := v_item_tax->'iss_withheld';
        IF v_withheld IS NOT NULL AND jsonb_typeof(v_withheld) <> 'boolean' THEN
          RAISE EXCEPTION 'nfse_iss_withheld_not_boolean' USING ERRCODE = '22023';
        END IF;
        v_rets := v_item_tax->'retencoes_suportadas';
        IF v_rets IS NOT NULL THEN
          IF jsonb_typeof(v_rets) <> 'object' THEN
            RAISE EXCEPTION 'nfse_retencoes_not_object' USING ERRCODE = '22023';
          END IF;
          PERFORM public.fiscal_validate_snapshot_keys(
            v_rets, ARRAY['pis','cofins','csll','irrf','inss'], 'nfse_tax.retencoes_suportadas'
          );
        END IF;

        IF v_source_id IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.service_fiscal_profiles sfp
            WHERE sfp.service_id = v_source_id AND sfp.is_active = true
          ) THEN
            RAISE EXCEPTION 'source_item_service_profile_missing:%', v_seq USING ERRCODE = 'P0002';
          END IF;
        END IF;
      END IF;

      v_computed_items := v_computed_items || jsonb_build_object(
        'seq', v_seq,
        'item_kind', v_kind,
        'description', COALESCE(v_item->>'description',''),
        'quantity', v_qty,
        'commercial_unit', v_item->>'commercial_unit',
        'unit_value', v_unit,
        'gross_value', v_gross,
        'discount_value', v_disc,
        'net_value', v_net,
        'source_item_type', v_item->>'source_item_type',
        'source_item_id',   NULLIF(v_item->>'source_item_id','')::uuid,
        'fiscal_profile_snapshot', v_item_profile,
        'tax_snapshot',            v_item_tax
      );
    END;
    v_total := v_total + v_net;
  END LOOP;

  v_profile_snap := COALESCE(p_invoice->'fiscal_profile_snapshot', '{}'::jsonb);
  v_tax_snap     := COALESCE(p_invoice->'tax_snapshot', '{}'::jsonb);
  IF jsonb_typeof(v_profile_snap) <> 'object' THEN v_profile_snap := '{}'::jsonb; END IF;
  IF jsonb_typeof(v_tax_snap)     <> 'object' THEN v_tax_snap     := '{}'::jsonb; END IF;
  IF public.fiscal_json_has_sensitive_key(v_profile_snap)
     OR public.fiscal_json_has_sensitive_key(v_tax_snap) THEN
    RAISE EXCEPTION 'sensitive_key_in_snapshot' USING ERRCODE = '22023';
  END IF;

  IF p_invoice_id IS NULL THEN
    INSERT INTO public.fiscal_invoices (
      invoice_type, document_model, document_origin, environment, provider,
      status, normalized_status, series, issue_date, notes,
      company_cnpj, customer_id, receivable_id, delivery_id,
      customer_snapshot, company_snapshot, fiscal_totals_snapshot,
      fiscal_profile_snapshot, tax_snapshot,
      draft_version, created_by, total_amount
    ) VALUES (
      v_invoice_type,
      p_invoice->>'document_model',
      'MANUAL_RECORD',
      v_env,
      'NONE',
      'DRAFT',
      'DRAFT',
      p_invoice->>'series',
      NULLIF(p_invoice->>'issue_date','')::date,
      p_invoice->>'notes',
      p_invoice->>'company_cnpj',
      v_customer_id,
      NULLIF(p_invoice->>'receivable_id','')::uuid,
      NULLIF(p_invoice->>'delivery_id','')::uuid,
      COALESCE(p_invoice->'customer_snapshot','{}'::jsonb),
      COALESCE(p_invoice->'company_snapshot','{}'::jsonb),
      jsonb_build_object('total_net', v_total, 'computed_at', now()),
      v_profile_snap,
      v_tax_snap,
      1,
      v_user,
      v_total
    ) RETURNING id INTO v_new_id;
  ELSE
    SELECT * INTO v_row FROM public.fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;
    IF v_row.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'invoice_locked' USING ERRCODE = '55006';
    END IF;
    IF v_row.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'invoice_not_editable' USING ERRCODE = '22023';
    END IF;
    IF v_row.provider <> 'NONE' THEN
      RAISE EXCEPTION 'invoice_has_provider' USING ERRCODE = '22023';
    END IF;
    IF v_row.document_origin <> 'MANUAL_RECORD' THEN
      RAISE EXCEPTION 'invoice_origin_forbidden' USING ERRCODE = '22023';
    END IF;
    IF v_row.draft_version <> p_expected_version THEN
      RAISE EXCEPTION 'conflict' USING ERRCODE = '40001';
    END IF;

    UPDATE public.fiscal_invoices SET
      invoice_type      = v_invoice_type,
      document_model    = COALESCE(p_invoice->>'document_model', document_model),
      document_origin   = 'MANUAL_RECORD',
      environment       = v_env,
      provider          = 'NONE',
      status            = 'DRAFT',
      normalized_status = 'DRAFT',
      series            = COALESCE(p_invoice->>'series', series),
      issue_date        = COALESCE(NULLIF(p_invoice->>'issue_date','')::date, issue_date),
      notes             = COALESCE(p_invoice->>'notes', notes),
      customer_id       = v_customer_id,
      customer_snapshot = COALESCE(p_invoice->'customer_snapshot', customer_snapshot),
      fiscal_profile_snapshot = v_profile_snap,
      tax_snapshot            = v_tax_snap,
      fiscal_totals_snapshot  = jsonb_build_object('total_net', v_total, 'computed_at', now()),
      total_amount            = v_total,
      draft_version           = draft_version + 1,
      updated_at              = now()
    WHERE id = p_invoice_id;
    v_new_id := p_invoice_id;
  END IF;

  DELETE FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = v_new_id;

  INSERT INTO public.fiscal_invoice_items (
    fiscal_invoice_id, item_sequence, item_kind, description,
    quantity, commercial_unit, unit_value, gross_value, discount_value, net_value,
    source_item_type, source_item_id,
    fiscal_profile_snapshot, tax_snapshot
  )
  SELECT
    v_new_id,
    (it->>'seq')::integer,
    it->>'item_kind',
    it->>'description',
    (it->>'quantity')::numeric,
    it->>'commercial_unit',
    (it->>'unit_value')::numeric,
    (it->>'gross_value')::numeric,
    (it->>'discount_value')::numeric,
    (it->>'net_value')::numeric,
    it->>'source_item_type',
    NULLIF(it->>'source_item_id','')::uuid,
    COALESCE(it->'fiscal_profile_snapshot','{}'::jsonb),
    COALESCE(it->'tax_snapshot','{}'::jsonb)
  FROM jsonb_array_elements(v_computed_items) AS it;

  SELECT * INTO v_row FROM public.fiscal_invoices WHERE id = v_new_id;
  RETURN jsonb_build_object(
    'id',            v_row.id,
    'draft_version', v_row.draft_version,
    'total_amount',  v_row.total_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_draft_save(uuid, jsonb, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_draft_save(uuid, jsonb, jsonb, integer) TO authenticated;

-- 8. RPC STABLE de validação de prontidão -----------------------------------
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
  v_missing jsonb := '[]'::jsonb;
  v_status  text;
  v_has_cert boolean;
  v_has_company boolean;
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

  IF v_row.status <> 'DRAFT' THEN
    RETURN jsonb_build_object(
      'status','BLOCKED',
      'reason','Documento nao esta em rascunho (status atual: '||v_row.status||').'
    );
  END IF;
  IF v_row.provider <> 'NONE' THEN
    RETURN jsonb_build_object(
      'status','BLOCKED',
      'reason','Documento com provedor configurado nao pode ser homologado por esta central.'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.company_fiscal_settings cs WHERE cs.cnpj = v_row.company_cnpj
  ) INTO v_has_company;

  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_certificates fc
    JOIN public.company_fiscal_settings cs ON cs.id = fc.company_settings_id
    WHERE cs.cnpj = v_row.company_cnpj
      AND fc.environment = 'HOMOLOGATION'
      AND fc.is_active = true
      AND fc.status = 'AVAILABLE'
  ) INTO v_has_cert;

  IF NOT v_has_company THEN
    v_missing := v_missing || jsonb_build_object('field','company','message','Configuracao fiscal da empresa nao encontrada.');
  END IF;
  IF v_row.customer_id IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','customer','message','Cliente destinatario e obrigatorio.');
  ELSIF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = v_row.customer_id) THEN
    v_missing := v_missing || jsonb_build_object('field','customer','message','Cliente informado nao existe mais no cadastro.');
  END IF;
  IF v_row.invoice_type IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','invoice_type','message','Tipo de documento (NF-e/NFS-e) e obrigatorio.');
  END IF;
  IF v_row.document_model IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','document_model','message','Modelo do documento e obrigatorio.');
  END IF;
  IF v_row.series IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','series','message','Serie do documento e obrigatoria.');
  END IF;
  IF v_row.issue_date IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','issue_date','message','Data de emissao e obrigatoria.');
  END IF;

  SELECT COUNT(*) INTO v_items FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id;
  IF v_items = 0 THEN
    v_missing := v_missing || jsonb_build_object('field','items','message','Documento precisa de ao menos um item.');
  END IF;

  -- 3.16.2-C: perfil fiscal + tributos obrigatórios por item
  -- Produto (NF-e): NCM, CFOP e (CST_ICMS ou CSOSN).
  -- Serviço (NFS-e): LC116, CNAE e ISS rate.
  DECLARE
    r RECORD;
    v_prof jsonb;
    v_tax  jsonb;
    v_icms jsonb;
    v_has_cst_or_csosn boolean;
  BEGIN
    FOR r IN
      SELECT item_sequence, item_kind,
             COALESCE(fiscal_profile_snapshot, '{}'::jsonb) AS prof,
             COALESCE(tax_snapshot, '{}'::jsonb) AS tax
      FROM public.fiscal_invoice_items
      WHERE fiscal_invoice_id = p_invoice_id
      ORDER BY item_sequence
    LOOP
      v_prof := r.prof;
      v_tax  := r.tax;
      IF r.item_kind = 'PRODUCT' THEN
        IF v_prof = '{}'::jsonb OR NULLIF(v_prof->>'ncm','') IS NULL THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_fiscal_profile','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem NCM no perfil fiscal.'
          );
        END IF;
        IF NULLIF(v_prof->>'cfop','') IS NULL THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_cfop','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem CFOP no perfil fiscal.'
          );
        END IF;
        v_icms := v_tax->'icms';
        v_has_cst_or_csosn :=
          NULLIF(v_prof->>'cst_icms','') IS NOT NULL
          OR NULLIF(v_prof->>'csosn','') IS NOT NULL
          OR (v_icms IS NOT NULL AND (NULLIF(v_icms->>'cst','') IS NOT NULL OR NULLIF(v_icms->>'csosn','') IS NOT NULL));
        IF NOT v_has_cst_or_csosn THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_cst_csosn','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem CST_ICMS ou CSOSN definido.'
          );
        END IF;
      ELSIF r.item_kind = 'SERVICE' THEN
        IF v_prof = '{}'::jsonb OR NULLIF(v_prof->>'lc116_item','') IS NULL THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_lc116','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem item LC 116 no perfil fiscal.'
          );
        END IF;
        IF NULLIF(v_prof->>'cnae','') IS NULL THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_cnae','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem CNAE no perfil fiscal.'
          );
        END IF;
        IF NOT (v_tax ? 'iss_rate') OR jsonb_typeof(v_tax->'iss_rate') <> 'number' THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_iss_rate','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem aliquota de ISS definida.'
          );
        END IF;
      END IF;
    END LOOP;
  END;

  IF v_row.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customer_fiscal_profiles WHERE customer_id = v_row.customer_id
  ) THEN
    v_missing := v_missing || jsonb_build_object('field','customer_fiscal_profile','message','Cliente ainda nao possui perfil fiscal cadastrado.');
  END IF;

  IF NOT v_has_cert THEN
    v_missing := v_missing || jsonb_build_object('field','certificate','message','Certificado digital ativo para homologacao nao configurado.');
  END IF;

  v_status := CASE WHEN jsonb_array_length(v_missing) = 0 THEN 'READY' ELSE 'INCOMPLETE' END;

  RETURN jsonb_build_object(
    'status', v_status,
    'missing', v_missing,
    'item_count', v_items,
    'total_amount', v_row.total_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_draft_validate_homologation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_draft_validate_homologation(uuid) TO authenticated;

-- 9. RPC de registro SYSTEM_STORE (bridge nativo) ---------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_certificate_register_os(
  p_company_settings_id uuid,
  p_metadata jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user            uuid := auth.uid();
  v_id              uuid;
  v_display_name    text;
  v_native_alias    text;
  v_subject         text;
  v_issuer          text;
  v_serial          text;
  v_from            timestamptz;
  v_until           timestamptz;
  v_fp              text;
  v_env             text := 'HOMOLOGATION';
  ALLOWED_KEYS      text[] := ARRAY[
    'display_name','native_alias','subject_name','issuer_name',
    'serial_number','valid_from','valid_until','fingerprint_sha256','key_usage'
  ];
  k text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_user, 'administrador'::app_role) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'metadata_object_required' USING ERRCODE = '22023';
  END IF;
  IF public.fiscal_json_has_sensitive_key(p_metadata) THEN
    RAISE EXCEPTION 'sensitive_key_in_payload' USING ERRCODE = '22023';
  END IF;

  -- 3.16.2-C: exigir company_settings_id existente antes de qualquer escrita
  IF p_company_settings_id IS NULL THEN
    RAISE EXCEPTION 'company_settings_id_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_fiscal_settings WHERE id = p_company_settings_id
  ) THEN
    RAISE EXCEPTION 'company_settings_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Whitelist estrita de chaves
  FOR k IN SELECT jsonb_object_keys(p_metadata) LOOP
    IF NOT (k = ANY(ALLOWED_KEYS)) THEN
      RAISE EXCEPTION 'metadata_key_not_allowed' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Ambiente sempre HOMOLOGATION nesta fase (PRODUCTION bloqueado)
  IF v_env <> 'HOMOLOGATION' THEN
    RAISE EXCEPTION 'environment_not_allowed' USING ERRCODE = '22023';
  END IF;

  v_display_name := COALESCE(NULLIF(p_metadata->>'display_name',''), 'Certificado do sistema operacional');
  IF char_length(v_display_name) > 120 THEN
    RAISE EXCEPTION 'display_name_too_long' USING ERRCODE = '22023';
  END IF;

  v_native_alias := NULLIF(p_metadata->>'native_alias','');
  IF v_native_alias IS NOT NULL AND char_length(v_native_alias) > 200 THEN
    RAISE EXCEPTION 'native_alias_too_long' USING ERRCODE = '22023';
  END IF;

  v_subject := NULLIF(p_metadata->>'subject_name','');
  IF v_subject IS NULL OR char_length(v_subject) > 500 THEN
    RAISE EXCEPTION 'subject_name_invalid' USING ERRCODE = '22023';
  END IF;

  v_issuer := NULLIF(p_metadata->>'issuer_name','');
  IF v_issuer IS NULL OR char_length(v_issuer) > 500 THEN
    RAISE EXCEPTION 'issuer_name_invalid' USING ERRCODE = '22023';
  END IF;

  v_serial := NULLIF(p_metadata->>'serial_number','');
  IF v_serial IS NULL OR char_length(v_serial) > 128 THEN
    RAISE EXCEPTION 'serial_number_invalid' USING ERRCODE = '22023';
  END IF;

  v_fp := lower(COALESCE(p_metadata->>'fingerprint_sha256',''));
  IF v_fp !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'fingerprint_sha256_invalid' USING ERRCODE = '22023';
  END IF;

  v_from  := NULLIF(p_metadata->>'valid_from','')::timestamptz;
  v_until := NULLIF(p_metadata->>'valid_until','')::timestamptz;
  IF v_from IS NULL OR v_until IS NULL THEN
    RAISE EXCEPTION 'validity_required' USING ERRCODE = '22023';
  END IF;
  IF v_from >= v_until THEN
    RAISE EXCEPTION 'validity_range_invalid' USING ERRCODE = '22023';
  END IF;
  -- 3.16.2-C: notBefore server-side (v_from <= now() < v_until)
  IF v_from > now() THEN
    RAISE EXCEPTION 'certificate_not_yet_valid' USING ERRCODE = '22023';
  END IF;
  IF now() >= v_until THEN
    RAISE EXCEPTION 'certificate_expired' USING ERRCODE = '22023';
  END IF;

  -- 3.16.2-C: key_usage — max 20 itens, cada string 1..80, apenas strings
  IF p_metadata ? 'key_usage' THEN
    PERFORM public.fiscal_validate_key_usage(p_metadata->'key_usage');
  END IF;

  -- Revoga certificados ativos anteriores de homologação
  UPDATE public.fiscal_certificates SET
    is_active = false,
    status = CASE WHEN status = 'AVAILABLE' THEN 'REVOKED' ELSE status END,
    revoked_at = now(), revoked_by = v_user, updated_at = now()
  WHERE company_settings_id = p_company_settings_id
    AND environment = v_env
    AND is_active = true;

  INSERT INTO public.fiscal_certificates (
    company_settings_id, source_type, environment, status,
    display_name, native_alias, subject_name, issuer_name, serial_number,
    valid_from, valid_until, fingerprint_sha256, key_usage, created_by
  ) VALUES (
    p_company_settings_id, 'SYSTEM_STORE', v_env, 'AVAILABLE',
    v_display_name, v_native_alias, v_subject, v_issuer, v_serial,
    v_from, v_until, v_fp,
    CASE
      WHEN p_metadata ? 'key_usage'
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

-- 10. RPC de revogação lógica (admin-only, idempotente) ---------------------
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
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_certificates WHERE id = p_certificate_id) THEN
    RAISE EXCEPTION 'certificate_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.fiscal_certificates SET
    is_active = false,
    status = CASE WHEN status <> 'REVOKED' THEN 'REVOKED' ELSE status END,
    revoked_at = COALESCE(revoked_at, now()),
    revoked_by = COALESCE(revoked_by, v_user),
    revoke_reason = COALESCE(NULLIF(LEFT(COALESCE(p_reason,''), 500), ''), revoke_reason),
    updated_at = now()
  WHERE id = p_certificate_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_certificate_revoke(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_revoke(uuid, text) TO authenticated;

-- 11. TRIGGER de auditoria — falhas propagadas, sem material sensível -------
CREATE OR REPLACE FUNCTION public.tg_fiscal_certificates_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action text;
  v_old    jsonb;
  v_new    jsonb;
BEGIN
  v_action := TG_OP;
  IF TG_OP = 'INSERT' THEN
    v_old := '{}'::jsonb;
    v_new := jsonb_build_object(
      'source_type', NEW.source_type,
      'environment', NEW.environment,
      'status',      NEW.status,
      'display_name',NEW.display_name,
      'fingerprint_sha256', NEW.fingerprint_sha256,
      'valid_until', NEW.valid_until,
      'is_active',   NEW.is_active
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := jsonb_build_object('status', OLD.status, 'is_active', OLD.is_active, 'valid_until', OLD.valid_until);
    v_new := jsonb_build_object('status', NEW.status, 'is_active', NEW.is_active, 'valid_until', NEW.valid_until);
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.fiscal_audit_log (
    table_name, record_id, action, changed_by, old_values, new_values
  ) VALUES (
    'fiscal_certificates', COALESCE(NEW.id, OLD.id), v_action, auth.uid(), v_old, v_new
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fiscal_certificates_audit ON public.fiscal_certificates;
CREATE TRIGGER trg_fiscal_certificates_audit
  AFTER INSERT OR UPDATE ON public.fiscal_certificates
  FOR EACH ROW EXECUTE FUNCTION public.tg_fiscal_certificates_audit();

COMMIT;
