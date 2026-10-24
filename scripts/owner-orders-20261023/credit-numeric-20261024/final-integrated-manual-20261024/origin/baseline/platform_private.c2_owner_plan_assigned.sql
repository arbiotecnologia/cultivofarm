CREATE OR REPLACE FUNCTION platform_private.c2_owner_plan_assigned(_partner uuid, _plan uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT public.fn_b2b_plan_selectable(_plan) AND EXISTS (
    SELECT 1 FROM public.commercial_payment_plan_assignments a
     WHERE a.plan_id = _plan AND a.partner_id = _partner
       AND a.buyer_scope = 'partner' AND a.status = 'published'
       AND a.valid_from <= CURRENT_DATE AND (a.valid_until IS NULL OR a.valid_until >= CURRENT_DATE));
$function$
