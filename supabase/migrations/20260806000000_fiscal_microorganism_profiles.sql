-- =====================================================================
-- FASE FISCAL 3.21 — PERFIL FISCAL PRÓPRIO DE MICRORGANISMOS
--
-- Fonte executável CANÔNICA (única) desta fase.
--
-- Aditiva, transacional, não destrutiva.
-- Sem emissão externa, sem certificados, sem tokens, sem segredos.
--
-- Objetivo:
--   Permitir faturamento fiscal DIRETO de microrganismos, sem exigir
--   associação a um produto canônico. O vínculo `microrganismos.product_id`
--   permanece opcional (composição/comercial) — jamais requisito fiscal.
--
-- Escopo:
--   1. Tabela `public.microorganism_fiscal_profiles` (espelha os campos
--      realmente usados de `product_fiscal_profiles`).
--   2. Índice único parcial de perfil ativo por microrganismo.
--   3. GRANTs + RLS equivalentes (e não mais permissivas que
--      `product_fiscal_profiles`): escrita restrita a administrador/
--      financeiro.
--   4. Trigger de `updated_at` (reutiliza função canônica existente).
--   5. View `public.v_microorganism_fiscal_readiness` (security_invoker).
--
-- Fora de escopo:
--   - Backfill, cópia de dados de produto ou geração automática de perfis.
--   - Alteração de dados ou objetos existentes.
--   - Emissão fiscal, provedor externo ou ampliação de RLS existente.
--
-- Aplicação: NÃO aplicar via Lovable. Aplicar externamente no projeto
-- Supabase AR-BIO após revisão humana.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. TABELA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.microorganism_fiscal_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  microorganism_id uuid NOT NULL
    REFERENCES public.microrganismos(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  fiscal_description text,
  commercial_unit text,
  taxable_unit text,
  ncm text,
  cest text,
  origin_code text,
  cfop_in_state text,
  cfop_interstate text,
  icms_cst text,
  icms_csosn text,
  pis_cst text,
  cofins_cst text,
  ipi_cst text,
  gtin text,
  taxable_gtin text,
  tax_benefit_code text,
  profile_status text NOT NULL DEFAULT 'DRAFT'
    CHECK (profile_status IN ('DRAFT','PENDING_ACCOUNTING','VALIDATED','BLOCKED','NOT_FISCALLY_SOLD')),
  accounting_notes text,
  accounting_validated_at timestamptz,
  accounting_validated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

-- No máximo 1 perfil ATIVO por microrganismo. Histórico via is_active=false.
CREATE UNIQUE INDEX IF NOT EXISTS ux_microorganism_fiscal_profiles_active
  ON public.microorganism_fiscal_profiles (microorganism_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_microorganism_fiscal_profiles_status
  ON public.microorganism_fiscal_profiles (profile_status);

DROP TRIGGER IF EXISTS trg_microorganism_fiscal_profiles_updated_at
  ON public.microorganism_fiscal_profiles;
CREATE TRIGGER trg_microorganism_fiscal_profiles_updated_at
  BEFORE UPDATE ON public.microorganism_fiscal_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. GRANTs + RLS (equivalentes a product_fiscal_profiles)
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.microorganism_fiscal_profiles TO authenticated;
GRANT ALL ON public.microorganism_fiscal_profiles TO service_role;

ALTER TABLE public.microorganism_fiscal_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "microorganism_fiscal_profiles_read" ON public.microorganism_fiscal_profiles;
CREATE POLICY "microorganism_fiscal_profiles_read"
  ON public.microorganism_fiscal_profiles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'gestor')
    OR public.has_role(auth.uid(),'financeiro')
  );

DROP POLICY IF EXISTS "microorganism_fiscal_profiles_write" ON public.microorganism_fiscal_profiles;
CREATE POLICY "microorganism_fiscal_profiles_write"
  ON public.microorganism_fiscal_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'financeiro'));

-- ---------------------------------------------------------------------
-- 3. VIEW DE PRONTIDÃO (security_invoker — respeita RLS do chamador)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_microorganism_fiscal_readiness AS
SELECT
  microorganism_id,
  profile_status,
  (ncm IS NOT NULL AND cfop_in_state IS NOT NULL) AS minimally_classified,
  accounting_validated_at IS NOT NULL AS accounting_validated
FROM public.microorganism_fiscal_profiles
WHERE is_active = true;

ALTER VIEW public.v_microorganism_fiscal_readiness SET (security_invoker = true);

GRANT SELECT ON public.v_microorganism_fiscal_readiness TO authenticated;

COMMIT;
