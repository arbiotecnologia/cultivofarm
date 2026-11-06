CREATE OR REPLACE FUNCTION platform_private.c2_accounting_promotion_ok(o jsonb, n jsonb, order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT coalesce(o->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1'
  AND n->>'contract'='C2_EXTERNAL_ORDER_ORIGIN_V1' AND platform_private.b2b_internal_origin_valid(n)
  AND n->>'organization_id'=o->>'organization_id' AND n->>'partner_id'=o->>'partner_id' AND n->>'actor_user_id'=o->>'actor_user_id'
  AND n->>'promoted_from_contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1'
  AND platform_private.has_ticket('c2_accounting_promote',order_id),false)
$function$
