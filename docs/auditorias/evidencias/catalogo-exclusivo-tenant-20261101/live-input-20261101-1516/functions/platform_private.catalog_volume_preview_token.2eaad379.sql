CREATE OR REPLACE FUNCTION platform_private.catalog_volume_preview_token(p_actor uuid, p_operation text, p_id uuid, p_change jsonb, p_reason text, p_row_version timestamp with time zone, p_tipo text, p_item uuid, p_parent jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'v',1,'actor',p_actor,'operation',p_operation,'id',p_id,'change',p_change,'reason',pg_catalog.btrim(p_reason),
    'row_version',p_row_version,'parent',p_parent,
    'siblings',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(o.id,o.updated_at,o.ativo,o.volume_ml::text,o.preco_brl::text)
        ORDER BY o.id),'[]'::jsonb)
      FROM public.catalogo_volumes o WHERE o.item_tipo=p_tipo AND COALESCE(o.produto_id,o.microrganismo_id)=p_item AND o.id<>p_id)
  )::text,'UTF8')),'hex');
$function$
