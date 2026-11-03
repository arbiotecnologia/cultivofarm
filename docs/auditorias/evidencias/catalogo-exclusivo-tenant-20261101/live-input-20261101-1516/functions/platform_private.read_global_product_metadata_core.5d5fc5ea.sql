CREATE OR REPLACE FUNCTION platform_private.read_global_product_metadata_core(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  SELECT pg_catalog.jsonb_build_object('id',p.id,'updated_at',p.updated_at,'nome',p.nome,
    'descricao',p.descricao,'modo_acao',p.modo_acao,'funcao_completa',p.funcao_completa,'modo_aplicacao',p.modo_aplicacao)
  INTO v_result FROM public.produtos p WHERE p.id=p_id;
  IF v_result IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_metadata_unavailable'; END IF;
  RETURN v_result;
END;
$function$
