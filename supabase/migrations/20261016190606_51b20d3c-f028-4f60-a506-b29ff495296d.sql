ALTER FUNCTION public.tenant_admin_user_links(uuid[]) SET SCHEMA platform_private;
REVOKE ALL ON FUNCTION platform_private.tenant_admin_user_links(uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_admin_user_links(uuid[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.tenant_admin_user_links(p_user_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $f$ SELECT platform_private.tenant_admin_user_links(p_user_ids) $f$;
REVOKE ALL ON FUNCTION public.tenant_admin_user_links(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_admin_user_links(uuid[]) TO authenticated;