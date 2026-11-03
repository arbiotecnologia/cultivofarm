CREATE OR REPLACE FUNCTION platform_private.create_global_microorganism_core(p_payload jsonb, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid; v jsonb; v_req jsonb; v_replay jsonb; v_new public.microrganismos%ROWTYPE; v_receipt jsonb; v_after jsonb;
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  v:=platform_private.catalog_micro_normalize(p_payload,true);
  v_req:=pg_catalog.jsonb_build_object('payload',v,'reason',pg_catalog.btrim(p_reason));
  v_replay:=platform_private.catalog_entity_replay(v_actor,'create_global_microorganism',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  -- Novo item INATIVO, fora do B2B, sem preço/dose/safra/produto; código pelo trigger do servidor.
  BEGIN
    INSERT INTO public.microrganismos (nome,tipo,nome_cientifico,concentracao_ufc_ml,concentracao_label,fornecedor,producao_on_farm,
      meio_cultivo,funcao_agronomica,observacoes,descricao,ativo,b2b_enabled,codigo,dose_ml_ha,valor_dose_brl,valor_litro_brl,preco_tabela,
      safra_referencia,product_id)
    VALUES (v->>'nome',(v->>'tipo')::public.tipo_microrganismo,v->>'nome_cientifico',(v->>'concentracao_ufc_ml')::numeric,v->>'concentracao_label',
      v->>'fornecedor',(v->>'producao_on_farm')::boolean,v->>'meio_cultivo',v->>'funcao_agronomica',v->>'observacoes',v->>'descricao',
      false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL)
    RETURNING * INTO v_new;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='catalog_entity_duplicate';
  END;
  IF v_new.id IS NULL OR v_new.codigo IS NULL OR v_new.ativo OR v_new.b2b_enabled OR v_new.valor_dose_brl IS NOT NULL
    OR v_new.dose_ml_ha IS NOT NULL OR v_new.safra_referencia IS NOT NULL
    OR v_new.valor_litro_brl IS NOT NULL OR v_new.preco_tabela IS NOT NULL OR v_new.product_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_confirmation_failed'; END IF;
  v_after:=platform_private.read_global_microorganism_detail_core(v_new.id);
  v_receipt:=pg_catalog.jsonb_build_object('id',v_new.id,'codigo',v_new.codigo,'ativo',false,'updated_at',v_new.updated_at,
    'idempotency_key',p_idempotency_key,'audit_id',gen_random_uuid(),'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'create_global_microorganism',p_reason,p_idempotency_key,v_req,v_receipt,'{}'::jsonb,v_after);
  RETURN v_receipt;
END;
$function$
