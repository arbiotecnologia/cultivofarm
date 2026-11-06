CREATE OR REPLACE FUNCTION platform_private.solid_pack_forma_presentations_ok(p_product uuid, p_forma text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_forma = 'solido' AND EXISTS (SELECT 1 FROM public.catalogo_volumes cv WHERE cv.produto_id = p_product AND cv.medida = 'volume' AND cv.ativo IS TRUE) THEN
    RAISE EXCEPTION 'PACK_ACTIVE_VOLUMES_EXIST' USING ERRCODE='PT409'; END IF;
  IF p_forma = 'liquido' AND EXISTS (SELECT 1 FROM public.catalogo_volumes cv WHERE cv.produto_id = p_product AND cv.medida = 'embalagem' AND cv.ativo IS TRUE) THEN
    RAISE EXCEPTION 'PACK_ACTIVE_OFFERS_EXIST' USING ERRCODE='PT409'; END IF;
END $function$
