CREATE OR REPLACE FUNCTION platform_private.c2p1_history_allowed(p_entity text, p_id uuid, p_before jsonb, p_after jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT COALESCE(p_id IS NOT NULL AND p_entity IN ('assignment','item_price')
 AND platform_private.c2p1_snapshot_allowed(p_entity,p_id,p_before)
 AND platform_private.c2p1_snapshot_allowed(p_entity,p_id,p_after)
 AND CASE WHEN p_entity='assignment' THEN EXISTS(SELECT 1 FROM public.commercial_payment_plan_assignments a WHERE a.id=p_id AND platform_private.c2p1_assignment_allowed(a.buyer_scope,a.partner_id,a.customer_id))
 ELSE EXISTS(SELECT 1 FROM public.commercial_condition_item_prices i WHERE i.id=p_id AND platform_private.c2p1_item_allowed(i.assignment_id,i.plan_id,i.buyer_scope,i.partner_id,i.customer_id)) END,false);
$function$
