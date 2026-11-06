CREATE OR REPLACE FUNCTION platform_private.solid_pack_unit_apply(p_product uuid, p_org uuid, p_unidade text, p_expected_version integer)
 RETURNS product_sale_units
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE cur public.product_sale_units; v_forma text;
BEGIN
  IF p_unidade IS NULL OR btrim(p_unidade) = '' THEN RAISE EXCEPTION 'PRODUCT_UNIT_REQUIRED' USING ERRCODE='22023'; END IF;
  IF p_unidade NOT IN ('kg','g','ml','l') THEN RAISE EXCEPTION 'PRODUCT_UNIT_INVALID' USING ERRCODE='22023'; END IF;
  IF p_expected_version IS NULL OR p_expected_version < 0 THEN RAISE EXCEPTION 'version_required' USING ERRCODE='22023'; END IF;
  IF p_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id = p_product AND z.owner_organization_id = p_org) THEN
    RAISE EXCEPTION 'PACK_ADMIN_PRODUCT_OUTSIDE_TENANT' USING ERRCODE='42501'; END IF;
  v_forma := CASE WHEN p_unidade IN ('kg','g') THEN 'solido' ELSE 'liquido' END;
  
  
  PERFORM 1 FROM public.produtos z WHERE z.id = p_product FOR UPDATE;
  IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM p_org OR NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id=p_product AND z.owner_organization_id=p_org) THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  SELECT * INTO cur FROM public.product_sale_units WHERE product_id = p_product FOR UPDATE;
  IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM p_org OR NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id=p_product AND z.owner_organization_id=p_org) THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  IF NOT FOUND THEN
    IF p_expected_version <> 0 THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='PT409'; END IF;
    PERFORM platform_private.solid_pack_forma_presentations_ok(p_product, v_forma);
    INSERT INTO public.product_sale_units(product_id, owner_organization_id, unidade_conteudo, updated_by)
    VALUES (p_product, p_org, p_unidade, auth.uid()) RETURNING * INTO cur;
  ELSE
    IF cur.owner_organization_id IS DISTINCT FROM p_org THEN RAISE EXCEPTION 'PACK_ADMIN_PRODUCT_OUTSIDE_TENANT' USING ERRCODE='42501'; END IF;
    IF cur.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='PT409'; END IF;
    IF cur.unidade_conteudo IS DISTINCT FROM p_unidade THEN
      
      IF cur.forma_fisica IS DISTINCT FROM v_forma THEN PERFORM platform_private.solid_pack_forma_presentations_ok(p_product, v_forma); END IF;
      UPDATE public.product_sale_units SET unidade_conteudo = p_unidade, version = version + 1, updated_at = now(), updated_by = auth.uid()
       WHERE product_id = p_product RETURNING * INTO cur;
    END IF;
  END IF;
  
  IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM p_org OR NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id=p_product AND z.owner_organization_id=p_org) THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  RETURN cur;
END $function$
