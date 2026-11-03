CREATE OR REPLACE FUNCTION platform_private.read_global_microorganism_detail_core(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  -- Projeção sem preços, dose, B2B ou vínculo de produto.
  SELECT pg_catalog.jsonb_build_object('id',m.id,'codigo',m.codigo,'nome',m.nome,'tipo',m.tipo,'nome_cientifico',m.nome_cientifico,
    'concentracao_ufc_ml',m.concentracao_ufc_ml,'concentracao_label',m.concentracao_label,'fornecedor',m.fornecedor,
    'producao_on_farm',m.producao_on_farm,'meio_cultivo',m.meio_cultivo,'funcao_agronomica',m.funcao_agronomica,
    'observacoes',m.observacoes,'descricao',m.descricao,'ativo',m.ativo,'updated_at',m.updated_at)
  INTO v FROM public.microrganismos m WHERE m.id=p_id;
  IF v IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_entity_unavailable'; END IF;
  RETURN v;
END;
$function$
