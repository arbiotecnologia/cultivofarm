BEGIN;

ALTER FUNCTION public.platform_claim_org_admin_provisioning(uuid,text,text,text,text,text,boolean) SECURITY INVOKER;

GRANT INSERT, UPDATE ON public.platform_org_admin_invites TO authenticated;

DROP POLICY IF EXISTS platform_org_admin_invites_superadmin_insert ON public.platform_org_admin_invites;
CREATE POLICY platform_org_admin_invites_superadmin_insert
  ON public.platform_org_admin_invites
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_superadmin((SELECT auth.uid())) AND invited_by=(SELECT auth.uid()));

DROP POLICY IF EXISTS platform_org_admin_invites_superadmin_update ON public.platform_org_admin_invites;
CREATE POLICY platform_org_admin_invites_superadmin_update
  ON public.platform_org_admin_invites
  FOR UPDATE TO authenticated
  USING (public.is_platform_superadmin((SELECT auth.uid())))
  WITH CHECK (public.is_platform_superadmin((SELECT auth.uid())) AND invited_by=(SELECT auth.uid()));

COMMIT;