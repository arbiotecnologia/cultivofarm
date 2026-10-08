DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') OR EXISTS (SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref<>'swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'canonical_project_required'; END IF; END $$;
CREATE OR REPLACE FUNCTION platform_private.b2b_direct_partner_row_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT NOT EXISTS (
 SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid()
 AND (r.role='parceiro_b2b_tecnico'::public.app_role OR
 (r.role='parceiro_b2b'::public.app_role AND EXISTS (
 SELECT 1 FROM public.profiles p
 JOIN public.partner_users pu ON pu.user_id=p.user_id
 JOIN public.partner_accounts pa ON pa.id=pu.partner_id
 WHERE p.user_id=r.user_id AND p.organization_id=pa.commercial_owner_organization_id
 ))));
$f$;
REVOKE ALL ON FUNCTION platform_private.b2b_direct_partner_row_allowed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.b2b_direct_partner_row_allowed() TO authenticated,service_role;
DROP POLICY IF EXISTS b2b_direct_partner_row_containment ON public.partner_accounts;
CREATE POLICY b2b_direct_partner_row_containment ON public.partner_accounts AS RESTRICTIVE FOR ALL TO authenticated
USING (platform_private.b2b_direct_partner_row_allowed()) WITH CHECK (platform_private.b2b_direct_partner_row_allowed());
COMMENT ON FUNCTION platform_private.b2b_direct_partner_row_allowed() IS 'Direct whole-row containment, including unready/mixed-role actors; own minimal projections are separately reviewed. Does not certify other channels or enable provisioning.';