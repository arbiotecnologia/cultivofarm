CREATE OR REPLACE FUNCTION platform_private.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id));
$function$
