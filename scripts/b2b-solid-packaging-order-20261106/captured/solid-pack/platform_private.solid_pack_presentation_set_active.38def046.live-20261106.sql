CREATE OR REPLACE FUNCTION platform_private.solid_pack_presentation_set_active(p_id uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_product uuid; v_org uuid;
BEGIN
  SELECT product_id INTO v_product FROM public.product_packagings WHERE id=p_id;
  v_org := platform_private.solid_pack_admin_org(v_product);
  PERFORM 1 FROM public.product_packagings WHERE id=p_id FOR UPDATE;
  IF platform_private.solid_pack_admin_org(v_product) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  INSERT INTO platform_private.solid_pack_presentation_tx(txid) VALUES (pg_catalog.txid_current()) ON CONFLICT DO NOTHING;
  UPDATE public.product_packagings SET ativo = p_active, valid_to = CASE WHEN p_active THEN NULL ELSE now() END WHERE id = p_id;
  UPDATE public.catalogo_volumes SET ativo = p_active WHERE id = p_id AND medida = 'embalagem';
  DELETE FROM platform_private.solid_pack_presentation_tx WHERE txid = pg_catalog.txid_current();
  IF platform_private.solid_pack_admin_org(v_product) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
END $function$
