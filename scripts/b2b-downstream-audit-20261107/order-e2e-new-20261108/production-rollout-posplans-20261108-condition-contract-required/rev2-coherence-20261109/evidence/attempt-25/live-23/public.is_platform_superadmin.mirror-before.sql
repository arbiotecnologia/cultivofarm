CREATE OR REPLACE FUNCTION public.is_platform_superadmin(uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = $1) $function$
