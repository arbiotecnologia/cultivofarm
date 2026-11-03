CREATE OR REPLACE FUNCTION platform_private.change_global_volume(p_operation text, p_id uuid, p_expected_updated_at timestamp with time zone, p_patch jsonb, p_ativo boolean, p_confirm_token text, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid; v jsonb; v_req jsonb; v_replay jsonb; v_tipo text; v_item uuid; v_parent jsonb; v_token text;
  v_old public.catalogo_volumes%ROWTYPE; v_before jsonb; v_settle jsonb; v_row jsonb; v_receipt jsonb; v_n int;
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at)
    OR (p_confirm_token IS NOT NULL AND p_confirm_token !~ '^[0-9a-f]{64}$')
    OR (p_operation='set_global_volume_status' AND p_ativo IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  IF p_operation='update_global_volume' THEN v:=platform_private.catalog_volume_normalize(p_patch,false);
  ELSIF p_operation='set_global_volume_status' THEN v:=pg_catalog.jsonb_build_object('ativo',p_ativo);
  ELSE RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  v_req:=pg_catalog.jsonb_build_object('id',p_id,'expected_updated_at',p_expected_updated_at,'change',v,'confirm_token',p_confirm_token,
    'reason',pg_catalog.btrim(p_reason));
  -- Replay idempotente (mesma chave + mesmo pedido, incluindo token) devolve o recibo original, mesmo que o estado tenha mudado.
  v_replay:=platform_private.catalog_entity_replay(v_actor,p_operation,v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT item_tipo, COALESCE(produto_id,microrganismo_id) INTO v_tipo, v_item FROM public.catalogo_volumes WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_volume_unavailable'; END IF;
  v_parent:=platform_private.catalog_volume_parent(v_tipo,v_item,true);   -- lock do pai antes da linha (serializa irmãs)
  SELECT * INTO v_old FROM public.catalogo_volumes WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v_old.item_tipo IS DISTINCT FROM v_tipo OR COALESCE(v_old.produto_id,v_old.microrganismo_id) IS DISTINCT FROM v_item THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_conflict'; END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_conflict'; END IF;
  IF p_operation='set_global_volume_status' AND v_old.ativo = p_ativo THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_conflict'; END IF;
  -- Token recalculado sob lock do pai, ANTES da mutação. Token enviado e divergente => prévia desatualizada.
  v_token:=platform_private.catalog_volume_preview_token(v_actor,p_operation,p_id,v,p_reason,v_old.updated_at,v_tipo,v_item,v_parent);
  IF p_confirm_token IS NOT NULL AND p_confirm_token IS DISTINCT FROM v_token THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_preview_stale'; END IF;
  v_before:=platform_private.catalog_volume_row(p_id);
  -- Overflow em derivados ou na coluna de preço do pai (limite depende do tipo do pai e da dose/ha reais) =>
  -- 22003 de domínio; a transação inteira é revertida (linha, pai e ledger intactos). 55000/40001 passam inalterados.
  BEGIN
  UPDATE public.catalogo_volumes SET
    volume_ml=CASE WHEN v ? 'volume_ml' THEN (v->>'volume_ml')::numeric ELSE volume_ml END,
    preco_brl=CASE WHEN v ? 'preco_brl' THEN (v->>'preco_brl')::numeric ELSE preco_brl END,
    rotulo=CASE WHEN v ? 'rotulo' THEN v->>'rotulo' ELSE rotulo END,
    ordem=CASE WHEN v ? 'ordem' THEN (v->>'ordem')::int ELSE ordem END,
    ativo=CASE WHEN v ? 'ativo' THEN (v->>'ativo')::boolean ELSE ativo END
  WHERE id=p_id AND updated_at=p_expected_updated_at;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_conflict'; END IF;
  PERFORM platform_private.catalog_volume_assert_row(p_id,v_tipo,v_item);
  v_row:=platform_private.catalog_volume_row(p_id);
  IF (v_row->>'updated_at')::timestamptz <= v_old.updated_at THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_confirmation_failed'; END IF;
  -- Toca linha ativa (antes ou depois) ou reprecifica o pai => sem token: 55000 com prévia (rollback integral);
  -- com token válido (já conferido acima): segue.
  v_settle:=platform_private.catalog_volume_settle(v_tipo,v_item,v_parent,v_old.ativo OR (v_row->>'ativo')::boolean,
    p_confirm_token IS NOT NULL,true,v_token);
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE='22003', MESSAGE='catalog_volume_price_out_of_range';
  END;
  v_receipt:=pg_catalog.jsonb_build_object('id',p_id,'item_tipo',v_tipo,'item_id',v_item,'ativo',(v_row->>'ativo')::boolean,
    'updated_at',v_row->'updated_at','repriced',v_settle->'repriced','idempotency_key',p_idempotency_key,'audit_id',gen_random_uuid(),'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,p_operation,p_reason,p_idempotency_key,v_req,v_receipt,
    pg_catalog.jsonb_build_object('volume',v_before,'parent',v_settle->'parent_before'),
    pg_catalog.jsonb_build_object('volume',v_row,'parent',v_settle->'parent_after'));
  RETURN v_receipt;
END;
$function$
