CREATE OR REPLACE FUNCTION public._saas_user_has_feature(_uid uuid, _feature_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM platform_private.entitlements_for_user(_uid) e
    WHERE e.feature_key = _feature_key
  )
$function$
