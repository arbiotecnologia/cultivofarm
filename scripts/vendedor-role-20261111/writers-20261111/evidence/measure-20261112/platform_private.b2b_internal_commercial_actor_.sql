CREATE OR REPLACE FUNCTION platform_private.b2b_internal_commercial_actor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT auth.uid() IS NOT NULL AND public.h15_actor_organization() IS NOT NULL AND platform_private.platform_actor_access_ready(auth.uid()) AND (public.has_role(auth.uid(),'administrador'::public.app_role) OR public.has_role(auth.uid(),'gestor_comercial'::public.app_role)) AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role IN ('parceiro_b2b','parceiro_b2b_tecnico')); $function$