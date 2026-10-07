ALTER FUNCTION public.platform_actor_access_ready(uuid) SET SCHEMA platform_private;
CREATE FUNCTION public.platform_actor_access_ready(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $$ SELECT platform_private.platform_actor_access_ready(p_user); $$;
REVOKE ALL ON FUNCTION public.platform_actor_access_ready(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_actor_access_ready(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION platform_private.platform_actor_access_ready(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.platform_actor_access_ready(uuid) TO authenticated,service_role;