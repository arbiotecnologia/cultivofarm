CREATE OR REPLACE FUNCTION public.get_user_partner_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
           WHEN count(*) FILTER (WHERE pu.revoked_at IS NULL) <> 1 THEN NULL
           WHEN bool_or(pa.ativo IS TRUE AND pa.deleted_at IS NULL
                        AND pa.commercial_owner_organization_id IS NOT NULL
                        AND pu.tenant_id IS NOT NULL
                        AND pu.tenant_id = pa.commercial_owner_organization_id)
                FILTER (WHERE pu.revoked_at IS NULL)
           THEN (array_agg(pu.partner_id) FILTER (WHERE pu.revoked_at IS NULL))[1]
         END
  FROM public.partner_users pu
  LEFT JOIN public.partner_accounts pa ON pa.id = pu.partner_id
  WHERE pu.user_id = auth.uid();
$function$
