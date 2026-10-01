DROP POLICY IF EXISTS organizations_select_scoped ON public.organizations;
CREATE POLICY organizations_select_scoped ON public.organizations FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()) AND p.organization_id = organizations.id)
  OR (partner_account_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.partner_users pu
         WHERE pu.user_id = (SELECT auth.uid()) AND pu.partner_id = organizations.partner_account_id))
);
REVOKE SELECT ON public.organizations FROM anon;