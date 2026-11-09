CREATE OR REPLACE FUNCTION public.has_role(uuid, app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id = r.user_id AND p.ativo WHERE r.user_id = $1 AND r.role = $2) $function$
