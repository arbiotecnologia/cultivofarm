CREATE OR REPLACE FUNCTION platform_private.c2_internal_order_target_reason(uuid, uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT CASE WHEN EXISTS (SELECT 1 FROM public.profiles p JOIN public.partner_accounts a ON a.commercial_owner_organization_id = p.organization_id
                             WHERE p.user_id = $1 AND p.ativo AND a.id = $2) THEN NULL ELSE 'foreign' END $function$
