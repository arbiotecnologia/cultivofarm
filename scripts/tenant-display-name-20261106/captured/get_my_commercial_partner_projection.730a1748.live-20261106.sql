CREATE OR REPLACE FUNCTION public.get_my_commercial_partner_projection()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT platform_private.b2b_commercial_partner_projection();
$function$
