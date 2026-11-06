CREATE OR REPLACE FUNCTION platform_private.solid_pack_presentation_insert(p_product uuid, p_org uuid, p_codigo text, p_descricao text, p_peso numeric, p_version integer, p_ordem integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE nid uuid := gen_random_uuid();
BEGIN

  IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM p_org OR NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id=p_product AND z.owner_organization_id=p_org) THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  INSERT INTO platform_private.solid_pack_presentation_tx(txid) VALUES (pg_catalog.txid_current()) ON CONFLICT DO NOTHING;
  INSERT INTO public.catalogo_volumes(id, item_tipo, produto_id, owner_organization_id, medida, volume_ml, rotulo, preco_brl, ativo, ordem)
  VALUES (nid, 'produto', p_product, p_org, 'embalagem', NULL,
          COALESCE(NULLIF(btrim(p_descricao),''), btrim(p_codigo)) || ' · ' ||
          
          platform_private.solid_pack_weight_label(p_peso,
            (SELECT s.unidade_conteudo FROM public.product_sale_units s WHERE s.product_id = p_product)),
          0, true, COALESCE(p_ordem, 0));
  INSERT INTO public.product_packagings(id, product_id, owner_organization_id, codigo, descricao, peso_liquido_kg, version, created_by)
  VALUES (nid, p_product, p_org, btrim(p_codigo), NULLIF(btrim(p_descricao),''), p_peso, p_version, auth.uid());
  DELETE FROM platform_private.solid_pack_presentation_tx WHERE txid = pg_catalog.txid_current();
  
  IF platform_private.recorte_a_actor_fresh('mutate') IS DISTINCT FROM p_org OR NOT EXISTS (SELECT 1 FROM public.produtos z WHERE z.id=p_product AND z.owner_organization_id=p_org) THEN RAISE EXCEPTION 'PACK_ADMIN_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  RETURN nid;
END $function$
