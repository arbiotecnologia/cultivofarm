-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É UMA MIGRATION HISTÓRICA
-- Origem: supabase/migrations/20260729023322_3b30cdd3-2b18-4831-8210-95d729d74265.sql
-- SHA-256 da origem: e12b6c639223d0c0583c7c4e8b7a951b1f96f499d3bf101afa47edd34e3ad8b2
-- Gerado por: restoration/promocao-producao-h9/gerar-promotion-sql.py (determinístico)
-- Transformação aplicada: to_regclass(marcador) -> true
-- O arquivo de origem NÃO foi alterado.
--
-- Guarda canônica: o runner valida o ref do alvo por canal externo e só então
-- executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela marcadora
-- de homologação é consultada.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- ==========================================================
-- STAGING GUARD
-- ==========================================================
-- STAGING_GUARD normalizado (portatil / forward-only):
-- recusa apenas ambiente comprovadamente de PRODUCAO. Em banco novo (marker ausente)
-- a migration segue adiante, tornando o replay reprodutivel fora deste projeto.
DO $guard$
DECLARE v_ref text;
BEGIN
  IF true THEN
    EXECUTE 'SELECT project_ref FROM public._fiscal_staging_marker WHERE marker = ''STAGING'' LIMIT 1'
      INTO v_ref;
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'STAGING_GUARD: project_ref de PRODUCAO recusado';
  END IF;
END
$guard$;

-- ==========================================================
-- 1. pricing_mode no plano de pagamento
-- ==========================================================
ALTER TABLE public.commercial_payment_plans
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'discount_from_base';

UPDATE public.commercial_payment_plans
   SET pricing_mode = 'discount_from_base'
 WHERE pricing_mode IS NULL;

ALTER TABLE public.commercial_payment_plans
  DROP CONSTRAINT IF EXISTS cpp_pricing_mode_chk;
ALTER TABLE public.commercial_payment_plans
  ADD CONSTRAINT cpp_pricing_mode_chk
  CHECK (pricing_mode IN ('discount_from_base','fixed_item_price','quote_only'));

COMMENT ON COLUMN public.commercial_payment_plans.pricing_mode IS
  'Estrategia canonica de preco da condicao: discount_from_base (padrao retrocompativel), fixed_item_price (exige regra fixa vigente para TODOS os itens) ou quote_only (sob consulta, nao precifica).';

-- ==========================================================
-- 2. Status de cotacao
-- ==========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'partner_order_status' AND e.enumlabel = 'aguardando_cotacao'
  ) THEN
    ALTER TYPE public.partner_order_status ADD VALUE 'aguardando_cotacao';
  END IF;
END $$;

-- ==========================================================
-- 3. Snapshots por item
-- ==========================================================
ALTER TABLE public.partner_order_items
  ADD COLUMN IF NOT EXISTS pricing_mode_snapshot         text,
  ADD COLUMN IF NOT EXISTS price_source_snapshot         text,
  ADD COLUMN IF NOT EXISTS base_price_snapshot           numeric(14,2),
  ADD COLUMN IF NOT EXISTS condition_price_snapshot      numeric(14,2),
  ADD COLUMN IF NOT EXISTS plan_discount_percent_snapshot numeric(9,4),
  ADD COLUMN IF NOT EXISTS unit_type_snapshot            text,
  ADD COLUMN IF NOT EXISTS volume_ml_snapshot            numeric(12,2),
  ADD COLUMN IF NOT EXISTS price_rule_id_snapshot        uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='poi_price_rule_snapshot_fk') THEN
    ALTER TABLE public.partner_order_items
      ADD CONSTRAINT poi_price_rule_snapshot_fk
      FOREIGN KEY (price_rule_id_snapshot)
      REFERENCES public.commercial_price_rules(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.partner_order_items.pricing_mode_snapshot IS
  'Estrategia de preco vigente no momento da criacao. NULL em pedidos anteriores a Fase 1 (nao recalculados).';

-- ==========================================================
-- 4. Snapshots na condicao do pedido
-- ==========================================================
ALTER TABLE public.partner_order_payment_terms
  ADD COLUMN IF NOT EXISTS pricing_mode_snapshot text,
  ADD COLUMN IF NOT EXISTS credit_decision_snapshot jsonb;

-- ==========================================================
-- 5. Matriz bruta: RLS restrita a perfis internos com alcada de preco
--    Decisao documentada: alcada de ESCRITA = administrador + gestor_comercial.
--    financeiro tem apenas LEITURA (audita preco, nao define preco).
--    parceiro/produtor NAO leem a tabela bruta.
-- ==========================================================
DROP POLICY IF EXISTS cpr_partner_select_own  ON public.commercial_price_rules;
DROP POLICY IF EXISTS cpr_producer_select_own ON public.commercial_price_rules;
DROP POLICY IF EXISTS cpr_staff_all           ON public.commercial_price_rules;
DROP POLICY IF EXISTS cpr_internal_select     ON public.commercial_price_rules;
DROP POLICY IF EXISTS cpr_pricing_authority_write ON public.commercial_price_rules;

CREATE POLICY cpr_internal_select ON public.commercial_price_rules
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'administrador'::app_role)
    OR has_role(auth.uid(),'gestor_comercial'::app_role)
    OR has_role(auth.uid(),'financeiro'::app_role)
  );

CREATE POLICY cpr_pricing_authority_write ON public.commercial_price_rules
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'administrador'::app_role)
    OR has_role(auth.uid(),'gestor_comercial'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(),'administrador'::app_role)
    OR has_role(auth.uid(),'gestor_comercial'::app_role)
  );

REVOKE ALL ON public.commercial_price_rules FROM anon;
REVOKE ALL ON public.commercial_price_rules FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_price_rules TO authenticated;
GRANT ALL ON public.commercial_price_rules TO service_role;

-- Regra da matriz deve declarar o mesmo modo do plano quando vinculada a um plano
CREATE OR REPLACE FUNCTION public.tg_commercial_price_rules_plan_mode_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE v_mode text;
BEGIN
  IF NEW.plan_id IS NOT NULL THEN
    SELECT pricing_mode INTO v_mode FROM public.commercial_payment_plans WHERE id = NEW.plan_id;
    IF v_mode IS NOT NULL AND v_mode <> NEW.pricing_mode THEN
      RAISE EXCEPTION 'PRICE_RULE_MODE_CONFLICT: regra % conflita com pricing_mode % do plano', NEW.pricing_mode, v_mode
        USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_commercial_price_rules_plan_mode ON public.commercial_price_rules;
CREATE TRIGGER trg_commercial_price_rules_plan_mode
  BEFORE INSERT OR UPDATE ON public.commercial_price_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_price_rules_plan_mode_guard();