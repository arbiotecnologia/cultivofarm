CREATE TABLE IF NOT EXISTS public.microorganism_fiscal_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  microorganism_id uuid NOT NULL REFERENCES public.microrganismos(id) ON DELETE RESTRICT,
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.microorganism_fiscal_profiles TO authenticated;
GRANT ALL ON public.microorganism_fiscal_profiles TO service_role;

ALTER TABLE public.microorganism_fiscal_profiles ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS ux_microorganism_fiscal_profiles_active
  ON public.microorganism_fiscal_profiles (microorganism_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS ix_microorganism_fiscal_profiles_status
  ON public.microorganism_fiscal_profiles (profile_status);

DROP POLICY IF EXISTS "microorganism_fiscal_profiles_read" ON public.microorganism_fiscal_profiles;
CREATE POLICY "microorganism_fiscal_profiles_read"
  ON public.microorganism_fiscal_profiles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'financeiro'::app_role)
  );

DROP POLICY IF EXISTS "microorganism_fiscal_profiles_write" ON public.microorganism_fiscal_profiles;
CREATE POLICY "microorganism_fiscal_profiles_write"
  ON public.microorganism_fiscal_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador'::app_role) OR public.has_role(auth.uid(),'financeiro'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'administrador'::app_role) OR public.has_role(auth.uid(),'financeiro'::app_role));

CREATE OR REPLACE FUNCTION public.tg_microorganism_fiscal_profiles_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_microorganism_fiscal_profiles_updated_at ON public.microorganism_fiscal_profiles;
CREATE TRIGGER trg_microorganism_fiscal_profiles_updated_at
  BEFORE UPDATE ON public.microorganism_fiscal_profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_microorganism_fiscal_profiles_updated_at();

CREATE OR REPLACE VIEW public.v_microorganism_fiscal_readiness
WITH (security_invoker = true) AS
SELECT
  m.id AS microorganism_id,
  m.codigo,
  m.nome,
  m.ativo,
  mfp.id AS profile_id,
  mfp.profile_status,
  (mfp.id IS NOT NULL
     AND mfp.is_active
     AND mfp.ncm IS NOT NULL
     AND mfp.origin_code IS NOT NULL
     AND mfp.cfop_in_state IS NOT NULL
     AND mfp.cfop_interstate IS NOT NULL
     AND (mfp.icms_cst IS NOT NULL OR mfp.icms_csosn IS NOT NULL)) AS fiscally_ready
FROM public.microrganismos m
LEFT JOIN public.microorganism_fiscal_profiles mfp
  ON mfp.microorganism_id = m.id AND mfp.is_active = true;

GRANT SELECT ON public.v_microorganism_fiscal_readiness TO authenticated;