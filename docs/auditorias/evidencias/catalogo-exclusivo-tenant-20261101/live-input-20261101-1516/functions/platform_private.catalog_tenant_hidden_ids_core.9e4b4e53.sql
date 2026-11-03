CREATE OR REPLACE FUNCTION platform_private.catalog_tenant_hidden_ids_core(p_entity_type text)
 RETURNS TABLE(entity_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid;
BEGIN
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('produto','microrganismo','cultura') THEN
    RAISE EXCEPTION 'catalog_visibility_invalid_payload' USING ERRCODE='22023'; END IF;
  v_org := platform_private.catalog_tenant_actor('read_prefs');
  RETURN QUERY SELECT COALESCE(v.produto_id,v.microrganismo_id,v.cultura_id) FROM public.catalog_tenant_visibility v
   WHERE v.organization_id=v_org AND v.entity_type=p_entity_type AND v.hidden
   ORDER BY 1 LIMIT 301; -- cliente rejeita >300 de forma explícita
END; $function$
