CREATE OR REPLACE FUNCTION platform_private.require_service_role()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE v_role text;
BEGIN
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
                     nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF v_role <> 'service_role' THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
END $function$
