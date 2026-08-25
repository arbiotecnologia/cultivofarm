-- =====================================================================
-- H7d — ROLLBACK estrutural autocontido (staging ikaauvsflpmamgxmkhoq)
--
-- Reverte APENAS a estrutura para o contrato histórico pré-H7d. NÃO lê,
-- exibe, deriva nem reintroduz senha real. Se existir material v2 já
-- importado (`SIGNING_BUNDLE_V2`), aborta: o fluxo antigo não consegue abrir
-- esse objeto sem reimportação segura do A1.
-- =====================================================================
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public._fiscal_staging_marker
    WHERE marker = 'STAGING' AND project_ref = 'ikaauvsflpmamgxmkhoq'
  ) THEN
    RAISE EXCEPTION 'H7d rollback: ambiente nao autorizado';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'fiscal_certificate_material'
      AND column_name = 'material_format'
  ) AND EXISTS (
    SELECT 1 FROM public.fiscal_certificate_material
    WHERE material_format = 'SIGNING_BUNDLE_V2'
  ) THEN
    RAISE EXCEPTION 'H7d rollback abortado: material SIGNING_BUNDLE_V2 existente; revogue/remova e reimporte o A1';
  END IF;
END
$$;

DROP FUNCTION IF EXISTS public.rpc_fiscal_certificate_register_a1(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, text,
  text[], text, text, integer, text, text
);

ALTER TABLE public.fiscal_certificate_material
  ADD COLUMN IF NOT EXISTS encrypted_password bytea,
  ADD COLUMN IF NOT EXISTS password_iv bytea;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fiscal_certificate_material
    WHERE encrypted_password IS NULL OR password_iv IS NULL
  ) THEN
    RAISE EXCEPTION 'H7d rollback abortado: material legado sem senha cifrada; reimportacao A1 obrigatoria';
  END IF;
END
$$;

ALTER TABLE public.fiscal_certificate_material
  ALTER COLUMN encrypted_password SET NOT NULL,
  ALTER COLUMN password_iv SET NOT NULL;

ALTER TABLE public.fiscal_certificate_material
  DROP CONSTRAINT IF EXISTS fiscal_certificate_material_format_chk,
  DROP CONSTRAINT IF EXISTS fiscal_certificate_material_alg_chk;

ALTER TABLE public.fiscal_certificate_material
  DROP COLUMN IF EXISTS material_format,
  DROP COLUMN IF EXISTS material_algorithm;

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

ALTER TABLE public.fiscal_certificate_material ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_certificate_material FROM PUBLIC;
REVOKE ALL ON public.fiscal_certificate_material FROM anon;
REVOKE ALL ON public.fiscal_certificate_material FROM authenticated;
GRANT ALL ON public.fiscal_certificate_material TO service_role;

COMMIT;