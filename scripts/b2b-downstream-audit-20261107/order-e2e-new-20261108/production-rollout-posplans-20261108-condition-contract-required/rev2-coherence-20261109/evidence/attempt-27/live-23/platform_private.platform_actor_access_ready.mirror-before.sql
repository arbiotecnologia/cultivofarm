CREATE OR REPLACE FUNCTION platform_private.platform_actor_access_ready(u uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$ SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u AND p.ativo) $function$
