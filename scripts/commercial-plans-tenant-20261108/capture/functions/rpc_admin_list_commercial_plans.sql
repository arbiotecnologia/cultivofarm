CREATE OR REPLACE FUNCTION public.rpc_admin_list_commercial_plans(p_search text DEFAULT NULL::text, p_status text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, code text, name text, description text, plan_type text, version integer, root_plan_id uuid, superseded_by_id uuid, valid_from timestamp with time zone, valid_until timestamp with time zone, is_default boolean, active boolean, sort_order integer, max_days integer, months_count numeric, installment_count integer, discount_percent numeric, monthly_interest_percent numeric, interest_type text, pricing_mode text, minimum_order_amount numeric, requires_credit_approval boolean, requires_guarantee boolean, requires_financial_approval boolean, is_referenced boolean, selectable boolean, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_limit integer := least(greatest(coalesce(p_limit,20),1),100);
        v_offset integer := greatest(coalesce(p_offset,0),0);
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  WITH base AS (
    SELECT p.* FROM public.commercial_payment_plans p
    WHERE (p_search IS NULL OR btrim(p_search) = ''
           OR p.name ILIKE '%'||btrim(p_search)||'%' OR p.code ILIKE '%'||btrim(p_search)||'%')
      AND (coalesce(p_status,'all') = 'all'
           OR (p_status = 'active' AND p.active)
           OR (p_status = 'inactive' AND NOT p.active))
  ), counted AS (SELECT count(*)::bigint c FROM base)
  SELECT b.id, b.code, b.name, b.description, b.plan_type, b.version,
         b.root_plan_id, b.superseded_by_id, b.valid_from, b.valid_until,
         b.is_default, b.active, b.sort_order, b.max_days, b.months_count,
         b.installment_count, b.discount_percent, b.monthly_interest_percent,
         b.interest_type, b.pricing_mode, b.minimum_order_amount,
         b.requires_credit_approval, b.requires_guarantee, b.requires_financial_approval,
         public.fn_b2b_plan_referenced(b.id), public.fn_b2b_plan_selectable(b.id),
         (SELECT c FROM counted)
  FROM base b
  ORDER BY b.sort_order ASC, b.code ASC, b.version DESC
  LIMIT v_limit OFFSET v_offset;
END
$function$
