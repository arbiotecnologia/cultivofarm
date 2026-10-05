CREATE OR REPLACE FUNCTION public.admin_can_update_user_password_server(p_actor_id uuid, p_target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
 SELECT p_actor_id IS NOT NULL
   AND p_target_id IS NOT NULL
   AND p_actor_id = auth.uid()
   AND NOT public.is_platform_superadmin(p_actor_id)
   AND NOT public.is_platform_superadmin(p_target_id)
   AND public.has_role(p_actor_id,'administrador'::public.app_role)
   AND EXISTS (
     SELECT 1
       FROM public.profiles a
       JOIN public.profiles t ON t.user_id = p_target_id
      WHERE a.user_id = p_actor_id
        AND a.ativo = true
        AND a.organization_id IS NOT NULL
        AND a.organization_id = t.organization_id
   );
$$;
REVOKE ALL ON FUNCTION public.admin_can_update_user_password_server(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_can_update_user_password_server(uuid,uuid) TO authenticated, service_role;