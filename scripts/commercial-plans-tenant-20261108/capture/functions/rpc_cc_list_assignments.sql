CREATE OR REPLACE FUNCTION public.rpc_cc_list_assignments(p_status text DEFAULT NULL::text)
 RETURNS SETOF commercial_payment_plan_assignments
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY SELECT * FROM public.commercial_payment_plan_assignments a
    WHERE platform_private.c2p1_assignment_allowed(a.buyer_scope,a.partner_id,a.customer_id) AND (p_status IS NULL OR a.status = p_status)
    ORDER BY a.created_at DESC;
END $function$
