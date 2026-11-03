CREATE OR REPLACE FUNCTION platform_private.catalog_volume_assert_row(p_id uuid, p_tipo text, p_item uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.catalogo_volumes%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.catalogo_volumes WHERE id=p_id;
  IF NOT FOUND OR r.item_tipo IS DISTINCT FROM p_tipo OR COALESCE(r.produto_id,r.microrganismo_id) IS DISTINCT FROM p_item
    OR r.moeda IS DISTINCT FROM 'BRL'
    OR r.preco_litro_brl IS DISTINCT FROM pg_catalog.round(r.preco_brl/(r.volume_ml/1000.0),2)
    OR r.valor_dose_100ml_brl IS DISTINCT FROM pg_catalog.round(r.preco_litro_brl/10.0,2)
    OR r.doses_por_volume IS DISTINCT FROM pg_catalog.round(r.volume_ml/100.0,4) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_confirmation_failed'; END IF;
  -- Duplicidade: no máximo uma apresentação ATIVA por pai e volume.
  IF r.ativo AND EXISTS (SELECT 1 FROM public.catalogo_volumes o WHERE o.id<>r.id AND o.ativo AND o.volume_ml=r.volume_ml
      AND o.item_tipo=r.item_tipo AND o.produto_id IS NOT DISTINCT FROM r.produto_id AND o.microrganismo_id IS NOT DISTINCT FROM r.microrganismo_id) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='catalog_volume_duplicate'; END IF;
END;
$function$
