CREATE OR REPLACE FUNCTION public.rpc_b2b_list_selectable_payment_plans()
 RETURNS TABLE(id uuid, code text, name text, description text, plan_type text, max_days integer, months_count numeric, installment_count integer, discount_percent numeric, monthly_interest_percent numeric, interest_type text, pricing_mode text, minimum_order_amount numeric, requires_credit_approval boolean, requires_guarantee boolean, requires_financial_approval boolean, is_default boolean, sort_order integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_admin := public.has_role(v_uid,'administrador'::app_role)
          OR public.has_role(v_uid,'financeiro'::app_role)
          OR public.has_role(v_uid,'gestor_comercial'::app_role);
  IF NOT (v_admin OR public.has_role(v_uid,'parceiro_b2b'::app_role)) THEN
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
    AND (
      v_admin
      OR EXISTS (
        SELECT 1
          FROM public.commercial_payment_plan_assignments a
          JOIN public.partner_users pu ON pu.partner_id = a.partner_id
         WHERE a.plan_id = p.id
           AND a.status = 'published'
           AND a.buyer_scope = 'partner'
           AND pu.user_id = v_uid
           AND a.valid_from <= CURRENT_DATE
           AND (a.valid_until IS NULL OR a.valid_until >= CURRENT_DATE)
      )
    )
  ORDER BY p.sort_order, p.name;
END
$function$
