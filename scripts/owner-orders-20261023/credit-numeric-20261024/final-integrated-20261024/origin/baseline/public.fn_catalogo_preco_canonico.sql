CREATE OR REPLACE FUNCTION public.fn_catalogo_preco_canonico(p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_litro   numeric(18,6);
  v_distint integer;
  v_dose_ha numeric;
  v_unit    numeric(18,6);
BEGIN
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 THEN RETURN NULL; END IF;
  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN RETURN NULL; END IF;

  SELECT count(DISTINCT round(cv.preco_litro_brl,2)), min(round(cv.preco_litro_brl,2))
    INTO v_distint, v_litro
  FROM public.catalogo_volumes cv
  WHERE cv.ativo = true
    AND cv.preco_litro_brl IS NOT NULL
    AND cv.produto_id IS NOT DISTINCT FROM p_product_id
    AND cv.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id;

  IF COALESCE(v_distint,0) <> 1 OR COALESCE(v_litro,0) <= 0 THEN
    RETURN NULL;
  END IF;

  IF p_unit_type = 'unidade' THEN
    IF COALESCE(p_volume_ml,0) <= 0 THEN RETURN NULL; END IF;
    SELECT round(cv.preco_brl,2) INTO v_unit
    FROM public.catalogo_volumes cv
    WHERE cv.ativo = true
      AND cv.volume_ml = p_volume_ml
      AND cv.produto_id IS NOT DISTINCT FROM p_product_id
      AND cv.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
    ORDER BY cv.volume_ml
    LIMIT 1;
    RETURN COALESCE(v_unit, round(v_litro * (p_volume_ml / 1000.0), 2));
  END IF;

  IF p_unit_type = 'litro' THEN RETURN v_litro; END IF;
  IF p_unit_type = 'dose'  THEN RETURN round(v_litro / 10.0, 2); END IF;

  -- hectare
  IF p_product_id IS NOT NULL THEN
    SELECT pr.dose_ml_ha INTO v_dose_ha FROM public.produtos pr WHERE pr.id = p_product_id;
  ELSE
    SELECT mo.dose_ml_ha INTO v_dose_ha FROM public.microrganismos mo WHERE mo.id = p_microrganismo_id;
  END IF;
  IF COALESCE(v_dose_ha,0) <= 0 THEN RETURN NULL; END IF;
  RETURN round(v_litro * (v_dose_ha / 1000.0), 2);
END
$function$
