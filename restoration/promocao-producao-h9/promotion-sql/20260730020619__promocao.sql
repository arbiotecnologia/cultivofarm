-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260730020619_2f7835f8-3e7c-4331-a0c9-24348bf1ed0f.sql
-- SHA-256 orig: bec4cfe8ab3cfd6814f33542780b1b332070fad0134cd780f7c6c94e3f137409
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-sql.py
-- Transformação: 1 bloco(s) DO de guarda removido(s); guarda canônica de promoção prefixada
--
-- A guarda de homologação foi REMOVIDA e substituída pela guarda canônica de
-- promoção. O runner valida o ref do alvo por canal externo (API/DSN) e só
-- então executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela
-- marcadora de homologação é consultada em produção.
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
-- FASE 6 — CORREÇÃO CONSOLIDADA (staging ikaauvsflpmamgxmkhoq)
-- ==========================================================
-- STAGING_GUARD normalizado (portatil / forward-only):
-- recusa apenas ambiente comprovadamente de PRODUCAO. Em banco novo (marker ausente)
-- a migration segue adiante, tornando o replay reprodutivel fora deste projeto.
-- [guarda de homologação removida pelo gerador de promoção]


-- Baseline fail-fast: as 4 RPCs operacionais devem estar exatamente no estado auditado
DO $baseline$
DECLARE
  expected jsonb := jsonb_build_object(
    'simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)', '0bbd1c83652c1dd529192cf731708c02',
    'create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)', 'f4f0da921facdcc3ce34d648b0af483c',
    'convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean)', 'b05e18a376861d60e7633fd1d21f2a06',
    'respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)', 'f8dee624c0b9cf12520b383f1a31f59a'
  );
  k text; v text; got text;
BEGIN
  FOR k, v IN SELECT * FROM jsonb_each_text(expected) LOOP
    SELECT md5(pg_get_functiondef(k::regprocedure::oid)) INTO got;
    IF got IS DISTINCT FROM v THEN
      RAISE EXCEPTION 'BASELINE MISMATCH em % (esperado %, obtido %)', k, v, got;
    END IF;
  END LOOP;
END
$baseline$;

-- A) Fechar acesso bruto à tabela financeira
REVOKE ALL ON public.commercial_payment_plans FROM authenticated;
REVOKE ALL ON public.commercial_payment_plans FROM anon;
GRANT ALL ON public.commercial_payment_plans TO service_role;

DROP POLICY IF EXISTS cpp_select ON public.commercial_payment_plans;
DROP POLICY IF EXISTS cpp_insert ON public.commercial_payment_plans;
DROP POLICY IF EXISTS cpp_update ON public.commercial_payment_plans;
DROP POLICY IF EXISTS cpp_delete ON public.commercial_payment_plans;

-- B) Fechar helpers internos
REVOKE ALL ON FUNCTION public.fn_b2b_can_admin_plans(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_b2b_plan_selectable(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_b2b_plan_referenced(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_b2b_can_admin_plans(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_b2b_plan_selectable(uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_b2b_plan_referenced(uuid) TO service_role;

-- A2) RPC operacional canônica de leitura de planos selecionáveis
CREATE OR REPLACE FUNCTION public.rpc_b2b_list_selectable_payment_plans()
RETURNS TABLE (
  id uuid,
  code text,
  name text,
  description text,
  plan_type text,
  max_days integer,
  months_count integer,
  installment_count integer,
  discount_percent numeric,
  monthly_interest_percent numeric,
  interest_type text,
  pricing_mode text,
  minimum_order_amount numeric,
  requires_credit_approval boolean,
  requires_guarantee boolean,
  requires_financial_approval boolean,
  is_default boolean,
  sort_order integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  -- Perfis autorizados: internos comerciais/financeiros e parceiro gestor B2B.
  -- parceiro_b2b_tecnico e cliente_produtor NAO recebem condicoes financeiras.
  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'financeiro'::app_role)
    OR public.has_role(v_uid, 'gestor_comercial'::app_role)
    OR public.has_role(v_uid, 'parceiro_b2b'::app_role)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT p.id, p.code, p.name, p.description, p.plan_type::text,
         p.max_days, p.months_count, p.installment_count,
         p.discount_percent, p.monthly_interest_percent,
         p.interest_type::text, p.pricing_mode::text, p.minimum_order_amount,
         p.requires_credit_approval, p.requires_guarantee, p.requires_financial_approval,
         p.is_default, p.sort_order
  FROM public.commercial_payment_plans p
  WHERE p.active = true
    AND p.superseded_by_id IS NULL
    AND p.valid_from <= now()
    AND (p.valid_until IS NULL OR p.valid_until > now())
  ORDER BY p.sort_order, p.name;
END
$$;

REVOKE ALL ON FUNCTION public.rpc_b2b_list_selectable_payment_plans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_list_selectable_payment_plans() TO authenticated, service_role;

-- C) Guard declarativo de vigencia (independe do texto das RPCs)
CREATE OR REPLACE FUNCTION public.tg_b2b_enforce_plan_selectable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_plan_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.payment_plan_id IS NOT DISTINCT FROM OLD.payment_plan_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.fn_b2b_plan_selectable(NEW.payment_plan_id) THEN
    RAISE EXCEPTION 'plan_not_selectable';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_b2b_plan_selectable_orders ON public.partner_orders;
CREATE TRIGGER trg_b2b_plan_selectable_orders
BEFORE INSERT OR UPDATE OF payment_plan_id ON public.partner_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_b2b_enforce_plan_selectable();

DROP TRIGGER IF EXISTS trg_b2b_plan_selectable_terms ON public.partner_order_payment_terms;
CREATE TRIGGER trg_b2b_plan_selectable_terms
BEFORE INSERT OR UPDATE OF payment_plan_id ON public.partner_order_payment_terms
FOR EACH ROW EXECUTE FUNCTION public.tg_b2b_enforce_plan_selectable();