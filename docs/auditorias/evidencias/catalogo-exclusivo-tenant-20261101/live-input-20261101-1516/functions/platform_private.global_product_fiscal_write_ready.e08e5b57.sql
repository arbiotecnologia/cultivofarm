CREATE OR REPLACE FUNCTION platform_private.global_product_fiscal_write_ready()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT auth.uid() IS NOT NULL AND platform_private.platform_actor_access_ready(auth.uid()) AND public.is_platform_superadmin(auth.uid());
$function$
