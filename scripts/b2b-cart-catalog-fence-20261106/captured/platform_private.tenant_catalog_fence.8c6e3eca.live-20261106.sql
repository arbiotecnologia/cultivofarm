CREATE OR REPLACE FUNCTION platform_private.tenant_catalog_fence(p_mode text, p_orgs uuid[])
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid;
BEGIN
  IF p_mode NOT IN ('mutate','read_catalog') THEN RAISE EXCEPTION 'tenant_catalog_fence_mode' USING ERRCODE='22023'; END IF;
  IF auth.uid() IS NULL THEN
    IF session_user::text IN ('anon','authenticated') OR current_setting('role', true) IN ('anon','authenticated') THEN
      RAISE EXCEPTION 'tenant_catalog_fence_denied' USING ERRCODE='42501'; END IF;
    RETURN;   -- contexto servidor sem ator (gatilho/serviço); clientes sempre têm auth.uid()
  END IF;
  BEGIN
    v_actor := platform_private.catalog_tenant_actor(p_mode);
  EXCEPTION WHEN raise_exception OR insufficient_privilege OR invalid_parameter_value THEN
    RAISE EXCEPTION 'tenant_catalog_fence_denied' USING ERRCODE='42501';
  END;
  IF v_actor IS NULL OR EXISTS (SELECT 1 FROM unnest(p_orgs) o WHERE o IS DISTINCT FROM v_actor) THEN
    RAISE EXCEPTION 'tenant_catalog_fence_denied' USING ERRCODE='42501'; END IF;
END $function$
