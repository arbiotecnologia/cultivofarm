-- H7A — ROLLBACK — somente se aprovado pelo pipeline de staging.
-- Não restaura colunas de senha nem qualquer material criptográfico.
-- A reversão é deliberadamente bloqueada quando houver certificado A1 ativo,
-- para evitar deixar uma referência ativa sem contrato de integridade.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.fiscal_environment_marker
    WHERE project_ref = 'ikaauvsflpmamgxmkhoq'
      AND environment_label = 'STAGING'
      AND production_emission_allowed = false
  ) THEN
    RAISE EXCEPTION 'H7A rollback: ambiente nao autorizado';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.fiscal_certificates
    WHERE environment = 'HOMOLOGATION'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'H7A rollback abortado: certificado A1 ativo exige revogacao antes da reversao';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_fiscal_certificate_ref_guard ON public.company_fiscal_settings;
DROP FUNCTION IF EXISTS public.fn_fiscal_certificate_ref_guard();

-- Restaura a implementação H7d anterior da RPC de registro, mantendo o
-- contrato sem senha persistida, SIGNING_BUNDLE_V2 e grants exclusivos do
-- service_role. Nenhum dado de certificado é recriado ou lido.
CREATE OR REPLACE FUNCTION public.rpc_fiscal_certificate_register_a1(
  p_company_settings_id uuid,
  p_created_by uuid,
  p_display_name text,
  p_subject_name text,
  p_issuer_name text,
  p_serial_number text,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_fingerprint_sha256 text,
  p_key_usage text[],
  p_object_path text,
  p_material_iv_b64 text,
  p_key_version integer,
  p_material_format text DEFAULT 'SIGNING_BUNDLE_V2',
  p_material_algorithm text DEFAULT 'AES-256-GCM'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IN ('anon', 'authenticated') THEN
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
  IF p_material_iv_b64 IS NULL OR length(p_material_iv_b64) = 0 THEN
    RAISE EXCEPTION 'material_iv_required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_material_format, '') <> 'SIGNING_BUNDLE_V2' THEN
    RAISE EXCEPTION 'material_format_unsupported' USING ERRCODE = '22023';
  END IF;

  UPDATE public.fiscal_certificates
  SET is_active = false,
      status = CASE WHEN status = 'AVAILABLE' THEN 'REVOKED' ELSE status END,
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
    certificate_id, object_path, material_iv, key_version,
    material_format, material_algorithm
  ) VALUES (
    v_id, p_object_path, decode(p_material_iv_b64, 'base64'),
    COALESCE(p_key_version, 1), p_material_format,
    COALESCE(p_material_algorithm, 'AES-256-GCM')
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_certificate_register_a1(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, text,
  text[], text, text, integer, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_certificate_register_a1(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, text,
  text[], text, text, integer, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_fiscal_certificate_register_a1(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, text,
  text[], text, text, integer, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_register_a1(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, text,
  text[], text, text, integer, text, text
) TO service_role;

-- A revogação H7A também remove a referência; sem a trigger, mantém-se a
-- função H7d de revogação, que não altera o vínculo por conta própria.
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
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_user, 'administrador'::app_role) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_certificates WHERE id = p_certificate_id) THEN
    RAISE EXCEPTION 'certificate_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.fiscal_certificates
  SET is_active = false,
      status = CASE WHEN status <> 'REVOKED' THEN 'REVOKED' ELSE status END,
      revoked_at = COALESCE(revoked_at, now()),
      revoked_by = COALESCE(revoked_by, v_user),
      revoke_reason = COALESCE(NULLIF(LEFT(COALESCE(p_reason, ''), 500), ''), revoke_reason),
      updated_at = now()
  WHERE id = p_certificate_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_certificate_revoke(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_revoke(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_revoke(uuid, text) TO service_role;

COMMIT;
