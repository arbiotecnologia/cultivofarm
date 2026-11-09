CREATE OR REPLACE FUNCTION platform_private.b2b_owner_internal_partner_readable(p_partner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Read-only predicate. Internal staff (administrador/gestor_comercial/financeiro) of the active organization that
  -- commercially owns an active partner. External roles or active partner links deny. Reads no partner_orders (no recursion).
  SELECT auth.uid() IS NOT NULL AND p_partner IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()
                    AND r.role::text IN ('parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor'))
    AND NOT EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.user_id = auth.uid() AND pu.revoked_at IS NULL)
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = auth.uid()
                AND r.role::text IN ('administrador','gestor_comercial','financeiro'))
    AND EXISTS (SELECT 1 FROM public.partner_accounts pa
                JOIN public.organizations owner ON owner.id = pa.commercial_owner_organization_id
                     AND owner.ativo IS TRUE AND owner.status = 'ativa'
                WHERE pa.id = p_partner AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
                  AND pa.commercial_owner_organization_id = platform_private.h15_actor_organization())
$function$
