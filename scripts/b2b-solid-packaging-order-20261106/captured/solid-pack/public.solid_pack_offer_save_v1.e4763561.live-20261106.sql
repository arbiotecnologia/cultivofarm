CREATE OR REPLACE FUNCTION public.solid_pack_offer_save_v1(p_product uuid, p_packaging_id uuid, p_codigo text, p_descricao text, p_peso_liquido_kg numeric, p_expected_version integer, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid; v_cod text := btrim(p_codigo); v_desc text := NULLIF(btrim(p_descricao), ''); old public.product_packagings;
  v int; nid uuid; res jsonb; fp text;
BEGIN
  v_org := platform_private.solid_pack_admin_org(p_product);
  IF v_cod IS NULL OR v_cod = '' OR length(v_cod) > 40 THEN RAISE EXCEPTION 'invalid_packaging_code' USING ERRCODE='22023'; END IF;
  IF v_desc IS NOT NULL AND length(v_desc) > 120 THEN RAISE EXCEPTION 'invalid_packaging_label' USING ERRCODE='22023'; END IF;
  IF p_peso_liquido_kg IS NULL OR p_peso_liquido_kg = 'NaN'::numeric OR p_peso_liquido_kg <= 0 OR p_peso_liquido_kg >= 1000000000
     OR p_peso_liquido_kg <> trunc(p_peso_liquido_kg, 3) THEN RAISE EXCEPTION 'invalid_net_weight' USING ERRCODE='22023'; END IF;
  IF (p_packaging_id IS NULL) <> (p_expected_version IS NULL) THEN RAISE EXCEPTION 'version_required' USING ERRCODE='22023'; END IF;
  fp := md5(concat_ws('|', p_product, COALESCE(p_packaging_id::text,'-'), v_cod, COALESCE(v_desc,'-'), p_peso_liquido_kg::text, COALESCE(p_expected_version::text,'-')));
  PERFORM pg_advisory_xact_lock(hashtextextended('solid_pack_product:'||p_product::text,0));
  IF platform_private.solid_pack_admin_org(p_product) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  IF platform_private.solid_pack_admin_org(p_product) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  res := platform_private.solid_pack_receipt(p_idempotency_key, v_org, 'offer_save', fp);
  IF platform_private.solid_pack_admin_org(p_product) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  IF res IS NOT NULL THEN 
  IF platform_private.solid_pack_admin_org(p_product) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  RETURN res; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.product_sale_units s WHERE s.product_id = p_product AND s.owner_organization_id = v_org AND s.forma_fisica = 'solido') THEN
    RAISE EXCEPTION 'PACK_PRODUCT_NOT_SOLID' USING ERRCODE='PT409'; END IF;
  IF p_packaging_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.product_packagings k WHERE k.product_id = p_product AND k.codigo = v_cod AND k.ativo) THEN
      RAISE EXCEPTION 'PACK_CODE_EXISTS' USING ERRCODE='PT409'; END IF;
  ELSE
    SELECT * INTO old FROM public.product_packagings k WHERE k.id = p_packaging_id FOR UPDATE;
  IF platform_private.solid_pack_admin_org(p_product) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
    IF NOT FOUND OR old.product_id IS DISTINCT FROM p_product OR old.owner_organization_id IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'PACK_ADMIN_PRODUCT_OUTSIDE_TENANT' USING ERRCODE='42501'; END IF;
    IF old.ativo IS NOT TRUE OR old.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'version_conflict' USING ERRCODE='PT409'; END IF;
    IF old.codigo IS DISTINCT FROM v_cod THEN RAISE EXCEPTION 'PACK_CODE_IMMUTABLE' USING ERRCODE='22023'; END IF;
    UPDATE public.catalogo_precos_embalagem SET ativo = false WHERE packaging_id = old.id AND ativo;
  END IF;
  
  res := platform_private.solid_pack_presentation_new_version(p_product, v_org, v_cod, v_desc, p_peso_liquido_kg);
  IF platform_private.solid_pack_admin_org(p_product) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  nid := (res->>'packaging_id')::uuid; v := (res->>'version')::int;
  res := jsonb_build_object('packaging_id', nid, 'codigo', v_cod, 'version', v, 'previous_packaging_id', p_packaging_id, 'price_required', true);
  INSERT INTO platform_private.solid_pack_admin_receipts VALUES (p_idempotency_key, auth.uid(), v_org, 'offer_save', fp, res);
  
  IF platform_private.solid_pack_admin_org(p_product) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  RETURN res;
END $function$
