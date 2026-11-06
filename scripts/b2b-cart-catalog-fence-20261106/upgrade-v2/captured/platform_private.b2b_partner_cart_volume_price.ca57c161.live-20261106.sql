CREATE OR REPLACE FUNCTION platform_private.b2b_partner_cart_volume_price(p_partner_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- B2B_CART_CATALOG_FENCE_V1. Sem EXECUTE para clientes; só chamado por fn_resolve_commercial_price (escopo partner).
DECLARE v_seller uuid;
BEGIN
  BEGIN
    v_seller := platform_private.b2b_partner_catalog_reader(p_partner_id);   -- guard canônico: técnico/superadmin/outro parceiro/inativo negam
  EXCEPTION WHEN insufficient_privilege THEN
    v_seller := NULL;
  END;
  IF v_seller IS NULL THEN
    -- Não é leitor B2B autorizado deste parceiro: caminho anterior, inalterado, com tenant_catalog_fence.
    RETURN public.fn_catalogo_preco_canonico(p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml);
  END IF;
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 THEN RETURN NULL; END IF;
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
  RETURN platform_private.fn_catalogo_preco_canonico__tenant_core(p_product_id, p_microrganismo_id, p_unit_type, p_volume_ml);
END $function$
