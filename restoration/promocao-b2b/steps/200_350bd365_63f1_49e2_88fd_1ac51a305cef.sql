-- PACOTE DE PROMOCAO MOTOR B2B — passo 200
-- Revogacoes de planos comerciais
-- Origem (historico, NAO modificado): supabase/migrations/20260730020828_350bd365-63f1-49e2-88fd-1ac51a305cef.sql
-- sha256(origem) = 467ec8602d78048eafa15f2a8154a52331fa9deca5fc801e32f005446ad8a1d7
-- Guarda de ambiente removida deste passo: a verificacao de destino e
-- centralizada e fail-closed em 000_preflight.sql (executado antes).
-- Forward-only. Nao contem fixtures, UUIDs de teste nem DROP destrutivo de dados.

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
