CREATE OR REPLACE FUNCTION public.solid_pack_price_set_v1(p_packaging_id uuid, p_preco_centavos bigint, p_valid_from date, p_expected_price_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid; k public.product_packagings; cur public.catalogo_precos_embalagem; nid uuid; res jsonb; fp text; v_preco numeric(14,2);
BEGIN
  SELECT * INTO k FROM public.product_packagings WHERE id = p_packaging_id;
  v_org := platform_private.solid_pack_admin_org(k.product_id);
  IF p_preco_centavos IS NULL OR p_preco_centavos <= 0 OR p_preco_centavos > 99999999999999 THEN RAISE EXCEPTION 'invalid_price' USING ERRCODE='22023'; END IF;
  IF p_valid_from IS NULL OR p_valid_from < current_date OR p_valid_from > current_date + 366 THEN RAISE EXCEPTION 'invalid_valid_from' USING ERRCODE='22023'; END IF;
  v_preco := p_preco_centavos::numeric / 100;
  fp := md5(concat_ws('|', p_packaging_id, p_preco_centavos, p_valid_from, COALESCE(p_expected_price_id::text,'-')));
  PERFORM pg_advisory_xact_lock(hashtextextended('solid_pack_product:'||k.product_id::text,0));
  IF platform_private.solid_pack_admin_org(k.product_id) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  IF platform_private.solid_pack_admin_org(k.product_id) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  res := platform_private.solid_pack_receipt(p_idempotency_key, v_org, 'price_set', fp);
  IF platform_private.solid_pack_admin_org(k.product_id) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  IF res IS NOT NULL THEN 
  IF platform_private.solid_pack_admin_org(k.product_id) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  RETURN res; END IF;
  SELECT * INTO k FROM public.product_packagings WHERE id = p_packaging_id FOR UPDATE;
  IF platform_private.solid_pack_admin_org(k.product_id) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  IF k.owner_organization_id IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_PRODUCT_OUTSIDE_TENANT' USING ERRCODE='42501'; END IF;
  IF k.ativo IS NOT TRUE THEN RAISE EXCEPTION 'PACK_OFFER_ARCHIVED' USING ERRCODE='PT409'; END IF;
  IF EXISTS (SELECT 1 FROM public.catalogo_precos_embalagem c WHERE c.packaging_id = k.id AND c.ativo AND c.valid_from > p_valid_from) THEN
    RAISE EXCEPTION 'PACK_PRICE_FUTURE_EXISTS' USING ERRCODE='PT409'; END IF;
  SELECT * INTO cur FROM public.catalogo_precos_embalagem c WHERE c.packaging_id = k.id AND c.ativo
     AND c.valid_from <= p_valid_from AND (c.valid_until IS NULL OR c.valid_until >= p_valid_from) ORDER BY c.valid_from DESC LIMIT 1 FOR UPDATE;
  IF platform_private.solid_pack_admin_org(k.product_id) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  IF cur.id IS DISTINCT FROM p_expected_price_id THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='PT409'; END IF;
  IF cur.id IS NOT NULL THEN
    IF cur.valid_from = p_valid_from THEN UPDATE public.catalogo_precos_embalagem SET ativo = false WHERE id = cur.id;
    ELSE UPDATE public.catalogo_precos_embalagem SET valid_until = p_valid_from - 1 WHERE id = cur.id; END IF;
  END IF;
  INSERT INTO public.catalogo_precos_embalagem(produto_id, owner_organization_id, packaging_id, preco_brl, valid_from, created_by)
  VALUES (k.product_id, v_org, k.id, v_preco, p_valid_from, auth.uid()) RETURNING id INTO nid;
  res := jsonb_build_object('price_id', nid, 'packaging_id', k.id, 'preco_centavos', p_preco_centavos, 'valid_from', p_valid_from, 'previous_price_id', cur.id);
  INSERT INTO platform_private.solid_pack_admin_receipts VALUES (p_idempotency_key, auth.uid(), v_org, 'price_set', fp, res);
  
  IF platform_private.solid_pack_admin_org(k.product_id) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  RETURN res;
END $function$
