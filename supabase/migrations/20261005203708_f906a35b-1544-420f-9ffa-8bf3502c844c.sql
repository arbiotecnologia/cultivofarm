DROP POLICY IF EXISTS d51_5_onfarm_tenant_guard ON public.ordens_servico_onfarm;
CREATE POLICY d51_5_onfarm_tenant_guard
ON public.ordens_servico_onfarm
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = ordens_servico_onfarm.cliente_id
      AND c.organization_id = public.h15_actor_organization()
  )
  OR ordens_servico_onfarm.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = ordens_servico_onfarm.cliente_id
      AND c.organization_id = public.h15_actor_organization()
  )
);

DROP POLICY IF EXISTS d51_5_partner_accounts_tenant_guard ON public.partner_accounts;
CREATE POLICY d51_5_partner_accounts_tenant_guard
ON public.partner_accounts
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  partner_accounts.id = public.get_user_partner_id()
  OR EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = partner_accounts.client_id
      AND c.organization_id = public.h15_actor_organization()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.clientes c
    WHERE c.id = partner_accounts.client_id
      AND c.organization_id = public.h15_actor_organization()
  )
);

DROP POLICY IF EXISTS d51_5_production_planning_tenant_guard ON public.production_planning;
CREATE POLICY d51_5_production_planning_tenant_guard
ON public.production_planning
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  production_planning.partner_id = public.get_user_partner_id()
  OR EXISTS (
    SELECT 1
    FROM public.partner_accounts pa
    JOIN public.clientes c ON c.id = pa.client_id
    WHERE pa.id = production_planning.partner_id
      AND c.organization_id = public.h15_actor_organization()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.partner_accounts pa
    JOIN public.clientes c ON c.id = pa.client_id
    WHERE pa.id = production_planning.partner_id
      AND c.organization_id = public.h15_actor_organization()
  )
);