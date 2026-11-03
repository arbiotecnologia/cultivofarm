CREATE OR REPLACE FUNCTION platform_private.catalog_tenant_selection_core(p_entity_type text, p_search text, p_limit integer, p_offset integer, p_include_ids uuid[])
 RETURNS TABLE(id uuid, nome text, ativo boolean, hidden boolean, selectable boolean, in_page boolean, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid; v_q text := NULLIF(btrim(COALESCE(p_search,'')),'');
BEGIN
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('produto','microrganismo','cultura')
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000
     OR (v_q IS NOT NULL AND char_length(v_q) > 80)
     OR (p_include_ids IS NOT NULL AND (cardinality(p_include_ids) > 50 OR array_position(p_include_ids, NULL) IS NOT NULL)) THEN
    RAISE EXCEPTION 'catalog_visibility_invalid_payload' USING ERRCODE='22023'; END IF;
  v_org := platform_private.catalog_tenant_actor(CASE WHEN p_entity_type='cultura' THEN 'read_selection_cultura' ELSE 'read_catalog' END);
  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.nome::text AS nome, p.ativo FROM public.produtos p WHERE p_entity_type='produto'
    UNION ALL SELECT m.id, m.nome::text, m.ativo FROM public.microrganismos m WHERE p_entity_type='microrganismo'
    UNION ALL SELECT c.id, c.nome::text, c.ativo FROM public.culturas c WHERE p_entity_type='cultura'
  ), marked AS (
    SELECT b.*, COALESCE(v.hidden,false) AS hidden FROM base b
      LEFT JOIN public.catalog_tenant_visibility v ON v.organization_id=v_org AND v.entity_type=p_entity_type
       AND COALESCE(v.produto_id,v.microrganismo_id,v.cultura_id)=b.id
  ), page AS (
    SELECT m.*, count(*) OVER () AS total FROM marked m
     WHERE m.ativo IS TRUE AND m.hidden IS FALSE
       AND (v_q IS NULL OR m.nome ILIKE '%' || replace(replace(replace(v_q,'\','\\'),'%','\%'),'_','\_') || '%')
     ORDER BY m.nome, m.id LIMIT p_limit OFFSET p_offset
  )
  SELECT pg.id, pg.nome, pg.ativo, pg.hidden, true, true, pg.total FROM page pg
  UNION ALL
  SELECT m.id, m.nome, m.ativo, m.hidden, (m.ativo IS TRUE AND m.hidden IS FALSE), false, NULL::bigint FROM marked m
   WHERE p_include_ids IS NOT NULL AND m.id = ANY(p_include_ids) AND m.id NOT IN (SELECT pg2.id FROM page pg2);
END; $function$
