GRANT SELECT ON public.platform_org_admin_invites TO authenticated;

DROP POLICY IF EXISTS "platform_org_admin_invites_superadmin_read" ON public.platform_org_admin_invites;
CREATE POLICY "platform_org_admin_invites_superadmin_read"
  ON public.platform_org_admin_invites
  FOR SELECT TO authenticated
  USING (public.is_platform_superadmin(auth.uid()));
