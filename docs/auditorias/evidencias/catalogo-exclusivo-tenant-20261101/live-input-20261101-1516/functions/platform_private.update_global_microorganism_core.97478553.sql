CREATE OR REPLACE FUNCTION platform_private.update_global_microorganism_core(p_id uuid, p_expected_updated_at timestamp with time zone, p_patch jsonb, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid; v jsonb; v_req jsonb; v_replay jsonb; v_old public.microrganismos%ROWTYPE; v_new public.microrganismos%ROWTYPE;
  v_before jsonb; v_after jsonb; v_receipt jsonb; v_keys text[];
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  v:=platform_private.catalog_micro_normalize(p_patch,false);
  v_req:=pg_catalog.jsonb_build_object('id',p_id,'expected_updated_at',p_expected_updated_at,'patch',v,'reason',pg_catalog.btrim(p_reason));
  v_replay:=platform_private.catalog_entity_replay(v_actor,'update_global_microorganism',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT * INTO v_old FROM public.microrganismos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_entity_unavailable'; END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_conflict'; END IF;
  v_before:=platform_private.read_global_microorganism_detail_core(p_id);
  SELECT pg_catalog.array_agg(k) INTO v_keys FROM pg_catalog.jsonb_object_keys(v) k;
  BEGIN
    UPDATE public.microrganismos SET
      nome=CASE WHEN v ? 'nome' THEN v->>'nome' ELSE nome END,
      nome_cientifico=CASE WHEN v ? 'nome_cientifico' THEN v->>'nome_cientifico' ELSE nome_cientifico END,
      concentracao_ufc_ml=CASE WHEN v ? 'concentracao_ufc_ml' THEN (v->>'concentracao_ufc_ml')::numeric ELSE concentracao_ufc_ml END,
      concentracao_label=CASE WHEN v ? 'concentracao_label' THEN v->>'concentracao_label' ELSE concentracao_label END,
      fornecedor=CASE WHEN v ? 'fornecedor' THEN v->>'fornecedor' ELSE fornecedor END,
      producao_on_farm=CASE WHEN v ? 'producao_on_farm' THEN (v->>'producao_on_farm')::boolean ELSE producao_on_farm END,
      meio_cultivo=CASE WHEN v ? 'meio_cultivo' THEN v->>'meio_cultivo' ELSE meio_cultivo END,
      funcao_agronomica=CASE WHEN v ? 'funcao_agronomica' THEN v->>'funcao_agronomica' ELSE funcao_agronomica END,
      observacoes=CASE WHEN v ? 'observacoes' THEN v->>'observacoes' ELSE observacoes END,
      descricao=CASE WHEN v ? 'descricao' THEN v->>'descricao' ELSE descricao END
    WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='catalog_entity_duplicate';
  END;
  -- Confirma linha/ID/versão e que NENHUMA coluna fora da whitelist mudou — inclusive preços (valor_dose_brl,
  -- valor_litro_brl, preco_tabela), dose, B2B, código, produto e ativo. Se algum trigger (ex.: guard de preço
  -- canônico) recalcular campo protegido, a edição descritiva aborta integralmente (rollback da transação).
  IF NOT FOUND OR v_new.id IS DISTINCT FROM p_id OR v_new.updated_at <= v_old.updated_at
    OR (pg_catalog.to_jsonb(v_old) - v_keys - 'updated_at')
       IS DISTINCT FROM (pg_catalog.to_jsonb(v_new) - v_keys - 'updated_at') THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_confirmation_failed'; END IF;
  v_after:=platform_private.read_global_microorganism_detail_core(p_id);
  v_receipt:=pg_catalog.jsonb_build_object('id',p_id,'ativo',v_new.ativo,'updated_at',v_new.updated_at,
    'idempotency_key',p_idempotency_key,'audit_id',gen_random_uuid(),'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'update_global_microorganism',p_reason,p_idempotency_key,v_req,v_receipt,v_before,v_after);
  RETURN v_receipt;
END;
$function$
