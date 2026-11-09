CREATE OR REPLACE FUNCTION platform_private.b2b_phase1_order_visible(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.partner_orders o WHERE o.id=p_order AND public.b2b_phase1_partner_visible(o.partner_id,false));
$function$
