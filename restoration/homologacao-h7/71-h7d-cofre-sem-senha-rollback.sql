-- =====================================================================
-- H7d — ROLLBACK estrutural (staging ikaauvsflpmamgxmkhoq)
--
-- Reverte APENAS a estrutura: recria as colunas de senha como OPCIONAIS e
-- restaura a assinatura antiga da RPC de registro. NÃO reintroduz nenhuma
-- senha real, nem material, nem valores; o cofre volta ao formato anterior
-- vazio. Após o rollback, o certificado A1 precisa ser reimportado.
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

-- Material do formato v2 não é interpretável pelo fluxo antigo: descartar
-- registros e objetos deve ser feito pela função de revogação. Aqui apenas
-- estrutura.
ALTER TABLE public.fiscal_certificate_material
  ADD COLUMN IF NOT EXISTS encrypted_password bytea,
  ADD COLUMN IF NOT EXISTS password_iv bytea;

ALTER TABLE public.fiscal_certificate_material
  DROP CONSTRAINT IF EXISTS fiscal_certificate_material_format_chk,
  DROP CONSTRAINT IF EXISTS fiscal_certificate_material_alg_chk;

ALTER TABLE public.fiscal_certificate_material
  DROP COLUMN IF EXISTS material_format,
  DROP COLUMN IF EXISTS material_algorithm;

DROP FUNCTION IF EXISTS public.rpc_fiscal_certificate_register_a1(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, text,
  text[], text, text, integer, text, text
);

-- A assinatura histórica da RPC está em
-- supabase/migrations/20260724000000_fiscal_fase3_16_homologacao_certificados.sql
-- e deve ser reaplicada a partir dali se o rollback for necessário.

ALTER TABLE public.fiscal_certificate_material ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_certificate_material FROM PUBLIC;
REVOKE ALL ON public.fiscal_certificate_material FROM anon;
REVOKE ALL ON public.fiscal_certificate_material FROM authenticated;
GRANT ALL ON public.fiscal_certificate_material TO service_role;

COMMIT;
