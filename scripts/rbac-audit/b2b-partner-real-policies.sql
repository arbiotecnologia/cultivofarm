-- Snapshot of all FIVE partner_accounts policies read from the canonical
-- swzpzcwiasxmjutrmvkm on 2026-10-08 at 21:51 UTC. Local replay only.
-- Normalized qualification/whitespace; policy predicates and roles preserved.
CREATE POLICY d51_5_partner_accounts_tenant_guard ON public.partner_accounts AS RESTRICTIVE FOR ALL TO authenticated
USING ((id=get_user_partner_id()) OR
 ((commercial_owner_organization_id=h15_actor_organization()) AND
  ((client_id IS NULL) OR EXISTS(SELECT 1 FROM clientes c WHERE c.id=partner_accounts.client_id AND c.organization_id=partner_accounts.commercial_owner_organization_id))) OR
 ((commercial_owner_organization_id IS NULL) AND EXISTS(SELECT 1 FROM clientes c WHERE c.id=partner_accounts.client_id AND c.organization_id=h15_actor_organization())))
WITH CHECK ((commercial_owner_organization_id=h15_actor_organization()) AND
 ((client_id IS NULL) OR EXISTS(SELECT 1 FROM clientes c WHERE c.id=partner_accounts.client_id AND c.organization_id=partner_accounts.commercial_owner_organization_id)));
CREATE POLICY partner_accounts_insert ON public.partner_accounts FOR INSERT TO authenticated
WITH CHECK (platform_private.has_role((SELECT auth.uid()),'administrador'::app_role) OR platform_private.has_role((SELECT auth.uid()),'gestor_comercial'::app_role));
CREATE POLICY partner_accounts_select ON public.partner_accounts FOR SELECT TO authenticated
USING (platform_private.has_role((SELECT auth.uid()),'administrador'::app_role) OR platform_private.has_role((SELECT auth.uid()),'gestor_comercial'::app_role));
CREATE POLICY partner_accounts_self_select ON public.partner_accounts FOR SELECT TO PUBLIC
USING ((platform_private.has_role((SELECT auth.uid()),'parceiro_b2b'::app_role) OR platform_private.has_role((SELECT auth.uid()),'parceiro_b2b_tecnico'::app_role)) AND id=get_user_partner_id());
CREATE POLICY partner_accounts_update ON public.partner_accounts FOR UPDATE TO authenticated
USING (platform_private.has_role((SELECT auth.uid()),'administrador'::app_role) OR platform_private.has_role((SELECT auth.uid()),'gestor_comercial'::app_role))
WITH CHECK (platform_private.has_role((SELECT auth.uid()),'administrador'::app_role) OR platform_private.has_role((SELECT auth.uid()),'gestor_comercial'::app_role));