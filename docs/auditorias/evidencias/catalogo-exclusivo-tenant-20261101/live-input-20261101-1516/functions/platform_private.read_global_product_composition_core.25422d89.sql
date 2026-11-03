CREATE OR REPLACE FUNCTION platform_private.read_global_product_composition_core(p_produto_id uuid, p_limit integer, p_receita_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_p public.produtos%ROWTYPE; v_result jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_produto_id IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50 OR p_receita_offset IS NULL OR p_receita_offset < 0 OR p_receita_offset > 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_invalid_query'; END IF;
  SELECT * INTO v_p FROM public.produtos WHERE id = p_produto_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_composition_unavailable'; END IF;
  WITH rec AS MATERIALIZED (
    SELECT f.id AS formulacao_id, f.microrganismo_id, m.nome AS micro_nome, m.ativo AS micro_ativo, f.component_insumo_id,
           ip.nome AS insumo_nome, f.volume_ml, f.proporcao, f.concentracao, f.unidade, f.e_volume_fixo
    FROM public.formulacoes f JOIN public.microrganismos m ON m.id = f.microrganismo_id
    LEFT JOIN public.produtos ip ON ip.id = f.component_insumo_id
    WHERE f.produto_id = p_produto_id ORDER BY f.created_at, f.id LIMIT p_limit + 1 OFFSET p_receita_offset
  ), dec AS MATERIALIZED (
    SELECT d.id, d.ordem::int AS ordem, d.tipo_componente, d.microrganismo_id, m.nome AS micro_nome, m.ativo AS micro_ativo,
           d.componente_nome, d.quantidade, d.unidade, d.base, d.natureza
    FROM public.produto_composicao_declaracoes d LEFT JOIN public.microrganismos m ON m.id = d.microrganismo_id
    WHERE d.produto_id = p_produto_id ORDER BY d.ordem LIMIT 51
  )
  SELECT pg_catalog.jsonb_build_object(
    'produto', pg_catalog.jsonb_build_object('id',v_p.id,'nome',v_p.nome,'familia_catalogo',v_p.familia_catalogo,'updated_at',v_p.updated_at),
    'conjunto', (SELECT pg_catalog.jsonb_build_object('status',c.status,'updated_at',c.updated_at)
                 FROM public.produto_composicao_conjuntos c WHERE c.produto_id = p_produto_id),
    'receita', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r)) FROM (SELECT * FROM rec LIMIT p_limit) r), '[]'::jsonb),
    'receita_offset', p_receita_offset,
    'declaracoes', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.ordem) FROM (SELECT * FROM dec LIMIT 50) x), '[]'::jsonb),
    'receita_has_more', (SELECT pg_catalog.count(*) > p_limit FROM rec),
    'declaracoes_has_more', (SELECT pg_catalog.count(*) > 50 FROM dec)) INTO v_result;
  RETURN v_result;
END;
$function$
