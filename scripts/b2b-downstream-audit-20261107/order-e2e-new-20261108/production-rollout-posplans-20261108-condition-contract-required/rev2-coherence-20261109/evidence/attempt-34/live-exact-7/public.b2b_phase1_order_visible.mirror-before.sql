CREATE OR REPLACE FUNCTION public.b2b_phase1_order_visible(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT EXISTS (SELECT 1 FROM public.partner_orders o JOIN public.partner_accounts a ON a.id = o.partner_id
                   JOIN public.profiles p ON p.organization_id = a.commercial_owner_organization_id AND p.ativo WHERE o.id = p_order AND p.user_id = auth.uid()) $function$
