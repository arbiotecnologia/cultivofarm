-- A05: intersect every existing role/link policy with deterministic tenant ownership.
-- No role/feature is added. NULL/unowned legacy clients remain fail-closed.
-- Proven in a reverted transaction with two existing administrator identities.
CREATE POLICY audit_a05_tenant_isolation
ON public.registros_consultor AS RESTRICTIVE FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = registros_consultor.cliente_id
      AND c.organization_id = public.h15_actor_organization()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clientes c
    WHERE c.id = registros_consultor.cliente_id
      AND c.organization_id = public.h15_actor_organization()
  )
);

-- A03: contain the unused legacy DEFINER endpoint, which has no target scope.
-- Current UI uses canonical user-management flows; the only client reference
-- is an unconsumed hook declaration. Keep function/data and service ACL intact.
REVOKE EXECUTE ON FUNCTION public.set_partner_user_papel(uuid, text)
FROM PUBLIC, anon, authenticated;