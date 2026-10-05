DO $$
BEGIN
  IF current_database() IS NULL THEN
    RAISE EXCEPTION 'canonical_database_unavailable';
  END IF;
END $$;

DROP POLICY IF EXISTS "Admins can update config" ON public.configuracoes_sistema;

-- A policy RESTRICTIVE existente continua como defesa em profundidade, mas a
-- policy permissiva abaixo torna explícito que a única mutação global aceita é
-- a de Superadmin de Plataforma.
DROP POLICY IF EXISTS "d51_5_system_config_global_mutation" ON public.configuracoes_sistema;
CREATE POLICY "d51_5_system_config_platform_mutation"
ON public.configuracoes_sistema
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.is_platform_superadmin((SELECT auth.uid())))
WITH CHECK (public.is_platform_superadmin((SELECT auth.uid())));

DROP POLICY IF EXISTS "saas_admin_read" ON public.organization_subscriptions;
CREATE POLICY "saas_tenant_admin_read_own_org"
ON public.organization_subscriptions
FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'administrador'::public.app_role)
  AND organization_id = public.h15_actor_organization()
);

DROP POLICY IF EXISTS "saas_admin_read" ON public.organization_subscription_history;
CREATE POLICY "saas_tenant_admin_read_own_org"
ON public.organization_subscription_history
FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'administrador'::public.app_role)
  AND organization_id = public.h15_actor_organization()
);

REVOKE ALL ON TABLE public.configuracoes_sistema FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.configuracoes_sistema TO authenticated;
GRANT UPDATE ON TABLE public.configuracoes_sistema TO authenticated;
GRANT ALL ON TABLE public.configuracoes_sistema TO service_role;