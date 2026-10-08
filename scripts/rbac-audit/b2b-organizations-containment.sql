-- Forward-only: no ownership inference, no data writes, no public projection.
-- External identities (including malformed mixed-role/link states) never read
-- onboarding_dados/responsavel_user_id through a full-row SELECT.
CREATE OR REPLACE FUNCTION platform_private.b2b_organization_full_row_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT auth.uid() IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid()
   AND r.role::text IN ('parceiro_b2b','parceiro_b2b_tecnico'));
$f$;
REVOKE ALL ON FUNCTION platform_private.b2b_organization_full_row_allowed() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.b2b_organization_full_row_allowed() TO authenticated,service_role;
DROP POLICY IF EXISTS b2b_organization_full_row_containment ON public.organizations;
CREATE POLICY b2b_organization_full_row_containment ON public.organizations
AS RESTRICTIVE FOR SELECT TO authenticated
USING(platform_private.b2b_organization_full_row_allowed());
ALTER POLICY organizations_select_scoped ON public.organizations
USING(EXISTS(SELECT 1 FROM public.profiles p
 WHERE p.user_id=(SELECT auth.uid()) AND p.organization_id=organizations.id));
-- Existing get_my_commercial_partner_context already projects organization_id,
-- mode and owner under ready/unique-role/unique-link/entitlement checks.
-- No additional organization/plan is invented or exposed here.
