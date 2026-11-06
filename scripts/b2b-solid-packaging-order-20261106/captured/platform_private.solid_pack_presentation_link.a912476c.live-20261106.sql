CREATE OR REPLACE FUNCTION platform_private.solid_pack_presentation_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.catalogo_volumes cv WHERE cv.id = NEW.id AND cv.medida = 'embalagem'
                   AND cv.produto_id = NEW.product_id AND cv.owner_organization_id = NEW.owner_organization_id
                   AND cv.ativo IS NOT DISTINCT FROM NEW.ativo) THEN
    RAISE EXCEPTION 'PRESENTATION_LINK_MISMATCH' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $function$
