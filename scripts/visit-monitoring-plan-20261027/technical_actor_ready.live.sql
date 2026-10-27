CREATE OR REPLACE FUNCTION public.technical_actor_ready(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN p_user IS NULL OR p_user IS DISTINCT FROM auth.uid()
   OR COALESCE((auth.jwt()->>'iat') ~ '^[0-9]{1,10}$',false) IS FALSE THEN false
 ELSE CASE WHEN (auth.jwt()->>'iat')::bigint <= 0 THEN false
 ELSE platform_private.h15_actor_organization() IS NOT NULL
 AND platform_private.platform_actor_access_ready(p_user) END END;
$function$
