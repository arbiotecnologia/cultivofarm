CREATE OR REPLACE FUNCTION platform_private.global_product_fiscal_read_ready()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT auth.uid() IS NOT NULL AND platform_private.platform_actor_access_ready(auth.uid()) AND
 (public.is_platform_superadmin(auth.uid()) OR platform_private.has_role(auth.uid(),'administrador') OR platform_private.has_role(auth.uid(),'gestor') OR platform_private.has_role(auth.uid(),'financeiro'));
$function$
