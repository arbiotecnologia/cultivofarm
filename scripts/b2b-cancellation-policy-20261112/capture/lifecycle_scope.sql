CREATE OR REPLACE FUNCTION platform_private.b2b_forecast_lifecycle_scope_v1(p_operation text, p_actor uuid, p_org uuid, p_partner uuid, p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 -- Unlocked pre-filter only (never final authority): avoids waiting on foreign rows.
 SELECT p_actor IS NOT NULL AND p_org IS NOT NULL AND p_partner IS NOT NULL AND p_order IS NOT NULL
  AND EXISTS(SELECT 1 FROM platform_private.b2b_forecast_lifecycle_gate_v1 g WHERE g.singleton AND g.enabled IS TRUE)
  AND EXISTS(SELECT 1 FROM platform_private.b2b_forecast_lifecycle_allowlist_v1 a
   WHERE a.operation=p_operation AND a.actor_id=p_actor AND a.organization_id=p_org
    AND a.partner_id=p_partner AND a.order_id=p_order AND a.revoked_at IS NULL
    AND a.valid_from<=pg_catalog.clock_timestamp() AND a.valid_until>pg_catalog.clock_timestamp());
$function$