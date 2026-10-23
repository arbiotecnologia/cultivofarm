CREATE OR REPLACE FUNCTION platform_private.c2_order_partner_recipients(_partner uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT DISTINCT pu.user_id
    FROM public.partner_users pu
    JOIN public.partner_accounts pa ON pa.id = pu.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
    JOIN public.profiles p ON p.user_id = pu.user_id AND p.ativo IS TRUE AND p.organization_id = pu.tenant_id
   WHERE pu.partner_id = _partner AND pu.revoked_at IS NULL
     AND (pu.valid_from IS NULL OR pu.valid_from <= now())
     AND public.is_valid_b2b_partner_user(pu.user_id, pu.partner_id);
$function$
