CREATE OR REPLACE FUNCTION platform_private.solid_pack_presentation_new_version(p_product uuid, p_org uuid, p_codigo text, p_descricao text, p_peso numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v int; nid uuid; v_cod text := btrim(p_codigo);
BEGIN
  IF v_cod IS NULL OR v_cod = '' OR length(v_cod) > 40 THEN RAISE EXCEPTION 'invalid_packaging_code' USING ERRCODE='22023'; END IF;
  IF platform_private.solid_mass_price_ok(p_peso) IS NOT TRUE OR p_peso <= 0 OR p_peso >= 1000000000 OR p_peso <> trunc(p_peso, 3) THEN
    RAISE EXCEPTION 'invalid_net_weight' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_sale_units s WHERE s.product_id = p_product AND s.owner_organization_id = p_org AND s.forma_fisica = 'solido') THEN
    RAISE EXCEPTION 'PACK_PRODUCT_NOT_SOLID' USING ERRCODE='PT409'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('solid_mass_pack:'||p_product::text||':'||v_cod,0));
  IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM p_org OR NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id=p_product AND z.owner_organization_id=p_org) THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(max(version),0) + 1 INTO v FROM public.product_packagings WHERE product_id = p_product AND codigo = v_cod;
  PERFORM platform_private.solid_pack_presentation_set_active(k.id, false)
     FROM public.product_packagings k WHERE k.product_id = p_product AND k.codigo = v_cod AND k.ativo;
  nid := platform_private.solid_pack_presentation_insert(p_product, p_org, v_cod, p_descricao, p_peso, v);
  
  IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM p_org OR NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id=p_product AND z.owner_organization_id=p_org) THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('packaging_id', nid, 'version', v);
END $function$
