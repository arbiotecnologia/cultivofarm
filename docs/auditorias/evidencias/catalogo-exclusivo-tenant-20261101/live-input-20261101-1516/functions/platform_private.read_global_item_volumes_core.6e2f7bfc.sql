CREATE OR REPLACE FUNCTION platform_private.read_global_item_volumes_core(p_item_tipo text, p_item_id uuid, p_limit integer, p_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_parent jsonb; v_items jsonb; v_more boolean;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  v_parent:=platform_private.catalog_volume_parent(p_item_tipo,p_item_id,false);
  WITH page AS (
    SELECT v.id, row_number() OVER (ORDER BY v.ordem, v.volume_ml, v.id) rn FROM public.catalogo_volumes v
     WHERE v.item_tipo=p_item_tipo AND COALESCE(v.produto_id,v.microrganismo_id)=p_item_id
     ORDER BY v.ordem, v.volume_ml, v.id LIMIT p_limit+1 OFFSET p_offset)
  SELECT COALESCE(pg_catalog.jsonb_agg(platform_private.catalog_volume_row(id) ORDER BY rn) FILTER (WHERE rn<=p_offset+p_limit),'[]'::jsonb),
         count(*)>p_limit
    INTO v_items, v_more FROM page;
  RETURN pg_catalog.jsonb_build_object('item',pg_catalog.jsonb_build_object('tipo',p_item_tipo,'id',p_item_id,'nome',v_parent->'nome',
      'codigo',v_parent->'codigo','ativo',v_parent->'ativo','pricing',platform_private.catalog_volume_pricing(v_parent) - 'updated_at'),
    'items',v_items,'has_more',v_more);
END;
$function$
