-- =====================================================================
-- H7d — APPLY — Cofre A1 sem senha persistida
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq
-- Produção navfzbwgwzruipouyfnk: NÃO EXECUTAR.
--
-- Motivo: `fiscal_certificate_material` guardava a SENHA DO PFX cifrada
-- (`encrypted_password` + `password_iv`) para poder reabrir o PKCS#12 na
-- assinatura. A política de segredos deste projeto proíbe persistir a senha
-- em qualquer forma, inclusive cifrada.
--
-- Nova arquitetura: o cofre guarda apenas o BUNDLE DE ASSINATURA
-- (certificado + cadeia em PEM e chave privada em PKCS#8 PEM não cifrada por
-- senha), inteiro cifrado com AES-256-GCM pela chave mestra server-side.
-- A senha do A1 existe somente em memória durante o POST de importação.
--
-- Incremental: não edita migrations históricas; preserva RLS fail-closed
-- (zero policies), grants somente service_role, bucket privado, metadados,
-- revogação e readiness.
-- =====================================================================
BEGIN;

-- Guard de ambiente: aborta fora do staging esperado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public._fiscal_staging_marker
    WHERE marker = 'STAGING' AND project_ref = 'ikaauvsflpmamgxmkhoq'
  ) THEN
    RAISE EXCEPTION 'H7d: ambiente nao autorizado para esta migracao';
  END IF;
END
$$;

-- 1. Novos campos mínimos do cofre (formato/algoritmo versionados) ----------
ALTER TABLE public.fiscal_certificate_material
  ADD COLUMN IF NOT EXISTS material_format text NOT NULL DEFAULT 'SIGNING_BUNDLE_V2',
  ADD COLUMN IF NOT EXISTS material_algorithm text NOT NULL DEFAULT 'AES-256-GCM';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_certificate_material_format_chk') THEN
    ALTER TABLE public.fiscal_certificate_material
      ADD CONSTRAINT fiscal_certificate_material_format_chk
      CHECK (material_format IN ('SIGNING_BUNDLE_V2'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_certificate_material_alg_chk') THEN
    ALTER TABLE public.fiscal_certificate_material
      ADD CONSTRAINT fiscal_certificate_material_alg_chk
      CHECK (material_algorithm IN ('AES-256-GCM'));
  END IF;
END
$$;

-- 2. Eliminação das colunas de senha ---------------------------------------
-- Cofre vazio (caso do staging) => remoção física. Com material legado =>
-- apenas torna opcional, sem destruir dado e sem ler/logar qualquer valor.
DO $$
DECLARE
  v_rows bigint;
BEGIN
  SELECT count(*) INTO v_rows FROM public.fiscal_certificate_material;
  IF v_rows = 0 THEN
    ALTER TABLE public.fiscal_certificate_material
      DROP COLUMN IF EXISTS encrypted_password,
      DROP COLUMN IF EXISTS password_iv;
    RAISE NOTICE 'H7d: colunas de senha removidas (cofre vazio)';
  ELSE
    ALTER TABLE public.fiscal_certificate_material
      ALTER COLUMN encrypted_password DROP NOT NULL,
      ALTER COLUMN password_iv DROP NOT NULL;
    RAISE NOTICE 'H7d: cofre com material legado — colunas de senha tornadas opcionais';
  END IF;
END
$$;

-- 3. RLS e privilégios preservados (fail-closed, zero policies) -------------
ALTER TABLE public.fiscal_certificate_material ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_certificate_material FROM PUBLIC;
REVOKE ALL ON public.fiscal_certificate_material FROM anon;
REVOKE ALL ON public.fiscal_certificate_material FROM authenticated;
GRANT ALL ON public.fiscal_certificate_material TO service_role;

-- 4. Nova RPC de registro, sem qualquer parâmetro de senha -------------------
-- H7D.1: remove explicitamente o overload legado de 15 parâmetros, cuja cauda
-- era: object_path, encrypted_password_b64, password_iv_b64, material_iv_b64,
-- key_version. A nova assinatura também tem 15 parâmetros, mas troca a cauda
-- para: object_path, material_iv_b64, key_version, material_format,
-- material_algorithm. O postcheck exige count(*)=1 para impedir coexistência.
DROP FUNCTION IF EXISTS public.rpc_fiscal_certificate_register_a1(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, text,
  text[], text, text, text, text, integer
);

CREATE OR REPLACE FUNCTION public.rpc_fiscal_certificate_register_a1(
  p_company_settings_id uuid,
  p_created_by          uuid,
  p_display_name        text,
  p_subject_name        text,
  p_issuer_name         text,
  p_serial_number       text,
  p_valid_from          timestamptz,
  p_valid_until         timestamptz,
  p_fingerprint_sha256  text,
  p_key_usage           text[],
  p_object_path         text,
  p_material_iv_b64     text,
  p_key_version         integer,
  p_material_format     text DEFAULT 'SIGNING_BUNDLE_V2',
  p_material_algorithm  text DEFAULT 'AES-256-GCM'
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
  IF p_material_iv_b64 IS NULL OR length(p_material_iv_b64) = 0 THEN
    RAISE EXCEPTION 'material_iv_required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_material_format, '') <> 'SIGNING_BUNDLE_V2' THEN
    RAISE EXCEPTION 'material_format_unsupported' USING ERRCODE = '22023';
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
    certificate_id, object_path, material_iv, key_version,
    material_format, material_algorithm
  ) VALUES (
    v_id, p_object_path, decode(p_material_iv_b64, 'base64'),
    COALESCE(p_key_version, 1),
    p_material_format, COALESCE(p_material_algorithm, 'AES-256-GCM')
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

DO $$
DECLARE
  v_overloads integer;
BEGIN
  SELECT count(*) INTO v_overloads
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'rpc_fiscal_certificate_register_a1';

  IF v_overloads <> 1 THEN
    RAISE EXCEPTION 'H7d: overload inseguro de rpc_fiscal_certificate_register_a1 (% encontrados)', v_overloads;
  END IF;
END
$$;

COMMENT ON TABLE public.fiscal_certificate_material IS
  'H7d: guarda apenas o bundle de assinatura cifrado (AES-256-GCM, chave mestra server-side). A senha do PFX nunca e persistida.';

COMMIT;
