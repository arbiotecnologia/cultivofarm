CREATE OR REPLACE FUNCTION public.fn_b2b_resolve_base_unit_price(p_partner_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric DEFAULT NULL::numeric, p_ref_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ref  date := COALESCE(p_ref_date, current_date);
  v_base numeric(18,6);
  v_src  text;
BEGIN
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'ITEM_INVALID');
  END IF;
  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'UNIT_INVALID');
  END IF;
  IF p_unit_type = 'unidade' AND COALESCE(p_volume_ml, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'VOLUME_REQUIRED');
  END IF;

  IF p_partner_id IS NOT NULL THEN
    SELECT ppp.preco_tabela INTO v_base
    FROM public.partner_product_prices ppp
    WHERE ppp.partner_id = p_partner_id
      AND ppp.ativo
      AND ppp.product_id IS NOT DISTINCT FROM p_product_id
      AND ppp.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
      AND (ppp.valid_from IS NULL OR ppp.valid_from <= v_ref)
      AND (ppp.valid_until IS NULL OR ppp.valid_until >= v_ref)
    ORDER BY ppp.is_current DESC, ppp.valid_from DESC NULLS LAST
    LIMIT 1;
    IF COALESCE(v_base, 0) > 0 THEN v_src := 'partner_base_price'; ELSE v_base := NULL; END IF;
  END IF;

  -- H3b: fonte canonica de preco comercial = catalogo_volumes (apresentacao ativa).
  IF v_base IS NULL THEN
    v_base := public.fn_catalogo_preco_canonico(p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml);
    IF COALESCE(v_base,0) > 0 THEN v_src := 'catalog_volume_price'; ELSE v_base := NULL; END IF;
  END IF;

  -- Fallback legado documentado: mestre produtos/microrganismos (nao canonico).
  IF v_base IS NULL THEN
    IF p_product_id IS NOT NULL THEN
      SELECT CASE p_unit_type
               WHEN 'hectare' THEN COALESCE(NULLIF(pr.valor_ha_brl,0), (pr.dose_ml_ha/100.0) * pr.valor_dose_brl)
               WHEN 'litro'   THEN COALESCE(NULLIF(pr.valor_litro_brl,0), pr.valor_dose_brl * 10)
               WHEN 'dose'    THEN COALESCE(NULLIF(pr.valor_dose_brl,0), pr.valor_litro_brl / 10)
               WHEN 'unidade' THEN (p_volume_ml / 1000.0) * COALESCE(NULLIF(pr.valor_litro_brl,0), pr.valor_dose_brl*10)
             END
        INTO v_base
      FROM public.produtos pr WHERE pr.id = p_product_id;
    ELSE
      SELECT CASE p_unit_type
               WHEN 'hectare' THEN (mo.dose_ml_ha/100.0) * mo.valor_dose_brl
               WHEN 'litro'   THEN COALESCE(NULLIF(mo.valor_litro_brl,0), mo.valor_dose_brl * 10)
               WHEN 'dose'    THEN COALESCE(NULLIF(mo.valor_dose_brl,0), mo.valor_litro_brl / 10)
               WHEN 'unidade' THEN (p_volume_ml / 1000.0) * COALESCE(NULLIF(mo.valor_litro_brl,0), mo.valor_dose_brl*10)
             END
        INTO v_base
      FROM public.microrganismos mo WHERE mo.id = p_microrganismo_id;
    END IF;
    IF COALESCE(v_base, 0) > 0 THEN v_src := 'catalog_base_price'; ELSE v_base := NULL; END IF;
  END IF;

  IF v_base IS NULL OR v_base <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'ITEM_WITHOUT_PRICE');
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'reason_code', 'OK',
    'price_source', v_src,
    'base_price', round(v_base, 2),
    'currency', 'BRL',
    'resolved_at', now()
  );
END
$function$;
