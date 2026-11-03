CREATE OR REPLACE FUNCTION platform_private.create_global_volume_core(p_item_tipo text, p_item_id uuid, p_payload jsonb, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid; v jsonb; v_req jsonb; v_replay jsonb; v_before jsonb; v_settle jsonb; v_id uuid; v_row jsonb; v_receipt jsonb;
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  v:=platform_private.catalog_volume_normalize(p_payload,true);
  v_req:=pg_catalog.jsonb_build_object('item_tipo',p_item_tipo,'item_id',p_item_id,'payload',v,'reason',pg_catalog.btrim(p_reason));
  v_replay:=platform_private.catalog_entity_replay(v_actor,'create_global_volume',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  v_before:=platform_private.catalog_volume_parent(p_item_tipo,p_item_id,true);
  -- Overflow de derivados/preços do pai (p.ex. numeric(10,2) histórico) = rejeição de domínio atômica (sem ampliar tipos).
  BEGIN
  INSERT INTO public.catalogo_volumes (item_tipo,produto_id,microrganismo_id,volume_ml,rotulo,preco_brl,moeda,ativo,ordem)
  VALUES (p_item_tipo, CASE WHEN p_item_tipo='produto' THEN p_item_id END, CASE WHEN p_item_tipo='microrganismo' THEN p_item_id END,
    (v->>'volume_ml')::numeric, v->>'rotulo', (v->>'preco_brl')::numeric, 'BRL', false, COALESCE((v->>'ordem')::int,0))
  RETURNING id INTO v_id;
  PERFORM platform_private.catalog_volume_assert_row(v_id,p_item_tipo,p_item_id);
  -- Nasce inativa: qualquer alteração no pai é falha (não apaga preço legado silenciosamente).
  v_settle:=platform_private.catalog_volume_settle(p_item_tipo,p_item_id,v_before,false,false,false,NULL);
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE='22003', MESSAGE='catalog_volume_price_out_of_range';
  END;
  v_row:=platform_private.catalog_volume_row(v_id);
  v_receipt:=pg_catalog.jsonb_build_object('id',v_id,'item_tipo',p_item_tipo,'item_id',p_item_id,'ativo',false,'updated_at',v_row->'updated_at',
    'repriced',false,'idempotency_key',p_idempotency_key,'audit_id',gen_random_uuid(),'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'create_global_volume',p_reason,p_idempotency_key,v_req,v_receipt,
    pg_catalog.jsonb_build_object('volume','{}'::jsonb,'parent',v_settle->'parent_before'),
    pg_catalog.jsonb_build_object('volume',v_row,'parent',v_settle->'parent_after'));
  RETURN v_receipt;
END;
$function$
