CREATE OR REPLACE FUNCTION platform_private.b2b_forecast_lifecycle_allowed_v1(p_operation text, p_actor uuid, p_org uuid, p_partner uuid, p_order uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_grant record;v_enabled boolean;
BEGIN
 IF p_actor IS NULL OR p_org IS NULL OR p_partner IS NULL OR p_order IS NULL
  OR p_operation NOT IN ('forecast_sync','forecast_cancel','forecast_begin') THEN RETURN false; END IF;
 -- Single lock order grant -> gate; both held until commit, so revocation/gate OFF
 -- serialize with an authorized writer; enabled/validity measured after every wait.
 FOR v_grant IN SELECT a.* FROM platform_private.b2b_forecast_lifecycle_allowlist_v1 a
  WHERE a.operation=p_operation AND a.actor_id=p_actor AND a.organization_id=p_org
   AND a.partner_id=p_partner AND a.order_id=p_order ORDER BY a.id FOR UPDATE
 LOOP
  SELECT g.enabled INTO v_enabled FROM platform_private.b2b_forecast_lifecycle_gate_v1 g WHERE g.singleton FOR UPDATE;
  IF v_enabled IS NOT TRUE THEN RETURN false; END IF;
  IF v_grant.synthetic IS TRUE AND v_grant.revoked_at IS NULL
   AND v_grant.valid_from<=pg_catalog.clock_timestamp() AND v_grant.valid_until>pg_catalog.clock_timestamp() THEN RETURN true; END IF;
 END LOOP;
 RETURN false;
END;
$function$