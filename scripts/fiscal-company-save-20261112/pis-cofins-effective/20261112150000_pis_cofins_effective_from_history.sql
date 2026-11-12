-- PIS/COFINS: início da vigência + histórico imutável por empresa.
-- Aditivo e idempotente. Não preenche nem deduz datas; registros existentes ficam NULL.
-- Pré-requisito: H15 (public.h15_actor_organization) e company_fiscal_settings.organization_id.
DO $pre$ BEGIN
  IF to_regprocedure('public.h15_actor_organization()') IS NULL THEN RAISE EXCEPTION 'PRE: h15_actor_organization ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_fiscal_settings' AND column_name='organization_id') THEN RAISE EXCEPTION 'PRE: organization_id ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_fiscal_settings' AND column_name='pis_cofins_regime') THEN RAISE EXCEPTION 'PRE: pis_cofins_regime ausente'; END IF;
END $pre$;

ALTER TABLE public.company_fiscal_settings ADD COLUMN IF NOT EXISTS pis_cofins_regime_effective_from date NULL;
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cfs_pis_cofins_effective_from_range') THEN
    ALTER TABLE public.company_fiscal_settings ADD CONSTRAINT cfs_pis_cofins_effective_from_range
      CHECK (pis_cofins_regime_effective_from IS NULL OR pis_cofins_regime_effective_from BETWEEN DATE '1988-10-05' AND DATE '2100-12-31');
  END IF;
END $c$;

CREATE TABLE IF NOT EXISTS public.company_fiscal_pis_cofins_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_settings_id uuid NOT NULL REFERENCES public.company_fiscal_settings(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL,
  old_regime text NULL,
  new_regime text NULL,
  old_effective_from date NULL,
  new_effective_from date NULL,
  configuration_version integer NULL,
  changed_by uuid NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS company_fiscal_pis_cofins_history_company_idx
  ON public.company_fiscal_pis_cofins_history (company_settings_id, changed_at DESC);

-- Somente leitura para clientes; escrita exclusiva pelo gatilho DEFINER.
REVOKE ALL ON public.company_fiscal_pis_cofins_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_fiscal_pis_cofins_history TO authenticated;
GRANT SELECT ON public.company_fiscal_pis_cofins_history TO service_role;
ALTER TABLE public.company_fiscal_pis_cofins_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_fiscal_pis_cofins_history_read ON public.company_fiscal_pis_cofins_history;
CREATE POLICY company_fiscal_pis_cofins_history_read ON public.company_fiscal_pis_cofins_history
  FOR SELECT TO authenticated
  USING ((has_role((SELECT auth.uid()), 'administrador'::app_role) OR has_role((SELECT auth.uid()), 'gestor'::app_role) OR has_role((SELECT auth.uid()), 'financeiro'::app_role))
         AND organization_id = public.h15_actor_organization());

-- Imutabilidade: nenhum UPDATE/DELETE, nem por papéis privilegiados.
CREATE OR REPLACE FUNCTION public.company_fiscal_pis_cofins_history_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $f$
BEGIN RAISE EXCEPTION 'PIS_COFINS_HISTORY_IMMUTABLE' USING ERRCODE = '42501'; END $f$;
REVOKE ALL ON FUNCTION public.company_fiscal_pis_cofins_history_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS company_fiscal_pis_cofins_history_immutable ON public.company_fiscal_pis_cofins_history;
CREATE TRIGGER company_fiscal_pis_cofins_history_immutable
  BEFORE UPDATE OR DELETE ON public.company_fiscal_pis_cofins_history
  FOR EACH ROW EXECUTE FUNCTION public.company_fiscal_pis_cofins_history_immutable();
DROP TRIGGER IF EXISTS company_fiscal_pis_cofins_history_no_truncate ON public.company_fiscal_pis_cofins_history;
CREATE TRIGGER company_fiscal_pis_cofins_history_no_truncate
  BEFORE TRUNCATE ON public.company_fiscal_pis_cofins_history
  FOR EACH STATEMENT EXECUTE FUNCTION public.company_fiscal_pis_cofins_history_immutable();

-- Registro transacional: mesma transação do salvamento; nada quando valores iguais.
CREATE OR REPLACE FUNCTION public.company_fiscal_pis_cofins_history_record()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $f$
DECLARE o_reg text; o_eff date;
BEGIN
  IF TG_OP = 'UPDATE' THEN o_reg := OLD.pis_cofins_regime; o_eff := OLD.pis_cofins_regime_effective_from; END IF;
  IF o_reg IS NOT DISTINCT FROM NEW.pis_cofins_regime AND o_eff IS NOT DISTINCT FROM NEW.pis_cofins_regime_effective_from THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.company_fiscal_pis_cofins_history
    (company_settings_id, organization_id, old_regime, new_regime, old_effective_from, new_effective_from, configuration_version, changed_by)
  VALUES (NEW.id, NEW.organization_id, o_reg, NEW.pis_cofins_regime, o_eff, NEW.pis_cofins_regime_effective_from, NEW.configuration_version, auth.uid());
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.company_fiscal_pis_cofins_history_record() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS company_fiscal_pis_cofins_history_record ON public.company_fiscal_settings;
CREATE TRIGGER company_fiscal_pis_cofins_history_record
  AFTER INSERT OR UPDATE OF pis_cofins_regime, pis_cofins_regime_effective_from ON public.company_fiscal_settings
  FOR EACH ROW EXECUTE FUNCTION public.company_fiscal_pis_cofins_history_record();

-- POST
DO $post$ BEGIN
  IF has_table_privilege('authenticated','public.company_fiscal_pis_cofins_history','INSERT')
     OR has_table_privilege('authenticated','public.company_fiscal_pis_cofins_history','UPDATE')
     OR has_table_privilege('authenticated','public.company_fiscal_pis_cofins_history','DELETE')
     OR has_table_privilege('anon','public.company_fiscal_pis_cofins_history','SELECT') THEN
    RAISE EXCEPTION 'POST: ACL do histórico aberta';
  END IF;
  IF has_function_privilege('authenticated','public.company_fiscal_pis_cofins_history_record()','EXECUTE') THEN RAISE EXCEPTION 'POST: EXECUTE aberto'; END IF;
END $post$;
