CREATE OR REPLACE FUNCTION platform_private.c2p1_item_allowed(p_assignment uuid, p_plan uuid, p_scope text, p_partner uuid, p_customer uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT platform_private.c2p1_assignment_allowed(p_scope,p_partner,p_customer) AND
 (p_assignment IS NULL OR EXISTS(SELECT 1 FROM public.commercial_payment_plan_assignments a
 WHERE a.id=p_assignment AND a.plan_id=p_plan AND a.buyer_scope=p_scope
 AND a.partner_id IS NOT DISTINCT FROM p_partner AND a.customer_id IS NOT DISTINCT FROM p_customer
 AND platform_private.c2p1_assignment_allowed(a.buyer_scope,a.partner_id,a.customer_id)));
$function$
