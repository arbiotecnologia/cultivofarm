CREATE OR REPLACE FUNCTION public.h15_actor_organization()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.h15_actor_organization(); $function$
