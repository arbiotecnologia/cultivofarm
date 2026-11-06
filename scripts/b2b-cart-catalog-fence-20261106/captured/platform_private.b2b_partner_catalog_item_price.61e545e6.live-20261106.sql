CREATE OR REPLACE FUNCTION platform_private.b2b_partner_catalog_item_price(p_partner_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric, p_ref_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_seller uuid;
BEGIN
  v_seller := platform_private.b2b_partner_catalog_reader(p_partner_id);
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 OR p_volume_ml IS NOT NULL OR p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose') THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'ITEM_INVALID'); END IF;
  IF p_product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id = p_product_id
       AND z.owner_organization_id = v_seller AND z.ativo IS TRUE AND z.b2b_enabled IS TRUE
       AND NOT EXISTS (SELECT 1 FROM public.catalog_tenant_visibility cv WHERE cv.organization_id = ANY(platform_private.c1b_catalog_visibility_scope(p_partner_id))
                       AND cv.entity_type = 'produto' AND cv.hidden IS TRUE AND cv.produto_id = z.id)) THEN
    RAISE EXCEPTION 'b2b_catalog_item_denied' USING ERRCODE='42501'; END IF;
  IF p_microrganismo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.microrganismos z WHERE z.id = p_microrganismo_id
       AND z.owner_organization_id = v_seller AND z.ativo IS TRUE AND z.b2b_enabled IS TRUE
       AND NOT EXISTS (SELECT 1 FROM public.catalog_tenant_visibility cv WHERE cv.organization_id = ANY(platform_private.c1b_catalog_visibility_scope(p_partner_id))
                       AND cv.entity_type = 'microrganismo' AND cv.hidden IS TRUE AND cv.microrganismo_id = z.id)) THEN
    RAISE EXCEPTION 'b2b_catalog_item_denied' USING ERRCODE='42501'; END IF;
  RETURN platform_private.fn_b2b_resolve_base_unit_price__tenant_core(p_partner_id, p_product_id, p_microrganismo_id, p_unit_type, NULL, p_ref_date);
END $function$
