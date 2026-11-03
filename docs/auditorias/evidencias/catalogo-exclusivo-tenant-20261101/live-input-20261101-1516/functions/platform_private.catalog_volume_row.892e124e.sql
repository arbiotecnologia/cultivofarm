CREATE OR REPLACE FUNCTION platform_private.catalog_volume_row(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT pg_catalog.jsonb_build_object('id',v.id,'item_tipo',v.item_tipo,'item_id',COALESCE(v.produto_id,v.microrganismo_id),
    'volume_ml',v.volume_ml::text,'rotulo',v.rotulo,'preco_brl',v.preco_brl::text,'moeda',v.moeda,'ativo',v.ativo,'ordem',v.ordem,
    'preco_litro_brl',v.preco_litro_brl::text,'valor_dose_100ml_brl',v.valor_dose_100ml_brl::text,'doses_por_volume',v.doses_por_volume::text,
    'updated_at',v.updated_at)
  FROM public.catalogo_volumes v WHERE v.id=p_id;
$function$
