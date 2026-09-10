-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260730020828_350bd365-63f1-49e2-88fd-1ac51a305cef.sql
-- SHA-256 orig: 467ec8602d78048eafa15f2a8154a52331fa9deca5fc801e32f005446ad8a1d7
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

-- STAGING_GUARD normalizado (portatil / forward-only):
-- recusa apenas ambiente comprovadamente de PRODUCAO. Em banco novo (marker ausente)
-- a migration segue adiante, tornando o replay reprodutivel fora deste projeto.
-- [guarda de homologação removida pelo gerador de promoção]


DROP FUNCTION IF EXISTS public.rpc_b2b_list_selectable_payment_plans();

CREATE OR REPLACE FUNCTION public.rpc_b2b_list_selectable_payment_plans()
RETURNS TABLE (
  id uuid,
  code text,
  name text,
  description text,
  plan_type text,
  max_days integer,
  months_count numeric,
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