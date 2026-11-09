CREATE OR REPLACE FUNCTION platform_private.b2b_actor_scope(p uuid)
 RETURNS TABLE(profile_ok boolean, partner_valid boolean, user_partner_count integer, user_partner uuid, org_partner uuid, has_catalog boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT pr.ativo, EXISTS(SELECT 1 FROM public.partner_accounts a WHERE a.id = min(pu.partner_id::text)::uuid AND a.ativo), count(pu.partner_id)::int,
           min(pu.partner_id::text)::uuid, min(pu.partner_id::text)::uuid, true
      FROM public.profiles pr LEFT JOIN public.partner_users pu ON pu.user_id = pr.user_id WHERE pr.user_id = p GROUP BY pr.ativo $function$
