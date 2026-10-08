CREATE OR REPLACE FUNCTION public.get_my_commercial_partner_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $fn$
 SELECT platform_private.b2b_commercial_context();
$fn$;
GRANT EXECUTE ON FUNCTION platform_private.b2b_commercial_context() TO authenticated;
REVOKE ALL ON FUNCTION platform_private.b2b_commercial_context() FROM PUBLIC,anon;