-- Forward-only correction; keep b2b_direct_partner_row_containment intact.
CREATE OR REPLACE FUNCTION platform_private.b2b_coherent_self_partner(p_partner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $f$
 SELECT COALESCE((platform_private.b2b_commercial_context()->>'partner_id')::uuid=p_partner,false);
$f$;
REVOKE ALL ON FUNCTION platform_private.b2b_coherent_self_partner(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.b2b_coherent_self_partner(uuid) TO authenticated,service_role;
ALTER POLICY d51_5_partner_accounts_tenant_guard ON public.partner_accounts
USING (platform_private.b2b_coherent_self_partner(id) OR
 ((commercial_owner_organization_id=public.h15_actor_organization()) AND
  ((client_id IS NULL) OR EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=partner_accounts.client_id AND c.organization_id=partner_accounts.commercial_owner_organization_id))) OR
 ((commercial_owner_organization_id IS NULL) AND EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=partner_accounts.client_id AND c.organization_id=public.h15_actor_organization())));
ALTER POLICY partner_accounts_self_select ON public.partner_accounts
USING (platform_private.b2b_coherent_self_partner(id));