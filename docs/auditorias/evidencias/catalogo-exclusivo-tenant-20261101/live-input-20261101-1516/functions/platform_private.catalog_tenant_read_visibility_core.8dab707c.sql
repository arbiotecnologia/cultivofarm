CREATE OR REPLACE FUNCTION platform_private.catalog_tenant_read_visibility_core(p_entity_type text, p_ids uuid[])
 RETURNS TABLE(entity_id uuid, hidden boolean, version integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid;
BEGIN
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('produto','microrganismo','cultura') THEN
    RAISE EXCEPTION 'catalog_visibility_invalid_payload' USING ERRCODE='22023'; END IF;
  v_org := platform_private.catalog_tenant_actor(CASE WHEN p_entity_type='cultura' THEN 'read_management' ELSE 'read_catalog' END);
  IF p_ids IS NULL OR cardinality(p_ids) > 500 OR array_position(p_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'catalog_visibility_invalid_payload' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT COALESCE(v.produto_id,v.microrganismo_id,v.cultura_id), v.hidden, v.version, v.updated_at
    FROM public.catalog_tenant_visibility v
   WHERE v.organization_id=v_org AND v.entity_type=p_entity_type
     AND COALESCE(v.produto_id,v.microrganismo_id,v.cultura_id) = ANY(p_ids);
END; $function$
