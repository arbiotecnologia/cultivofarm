CREATE OR REPLACE FUNCTION public.get_partner_catalog_tecnico_secure(p_catalog_v2 boolean)
 RETURNS TABLE(item_id uuid, item_tipo text, nome text, codigo text, descricao_curta text, tipo text, nome_cientifico text, funcao text, dose_ml_ha numeric, valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric, preco_tabela_dose numeric, preco_tabela_litro numeric, preco_tabela_ha numeric, unidade_preco_principal text, resumo_curto text, explicacao_b2b text, beneficios_principais text, ficha_status text, ficha_aprovada boolean, familia_catalogo text, catalog_contract text, ficha_conteudo jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF p_catalog_v2 IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'catalog_contract_required' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT r.*, CASE WHEN r.item_tipo='microrganismo' THEN 'biologico'::text ELSE p.familia_catalogo END, 'C1B_DUAL_TENANT_V1'::text,
 CASE WHEN r.ficha_aprovada IS TRUE THEN jsonb_build_object(
  'subtitulo', CASE WHEN r.item_tipo='produto' THEN p.tipo::text ELSE m.nome_cientifico END,
  'funcao', CASE WHEN r.item_tipo='produto' THEN p.funcao_completa ELSE m.funcao_agronomica END,
  'dose_ml_ha', CASE WHEN r.item_tipo='produto' THEN p.dose_ml_ha ELSE m.dose_ml_ha END,
  'explicacao_produtor', COALESCE(pp.explicacao_produtor,mp.explicacao_produtor),
  'indicacoes_uso', COALESCE(pp.indicacoes_uso,mp.indicacoes_uso),
  'cuidados_aplicacao', COALESCE(pp.cuidados_aplicacao,mp.cuidados_aplicacao),
  'mecanismo_acao', mp.mecanismo_acao,
  'alvos_count', CASE WHEN r.item_tipo='produto' THEN
    (SELECT count(*) FROM public.product_target_recommendations t WHERE t.produto_id=r.item_id AND t.ativo IS TRUE)
    ELSE (SELECT count(*) FROM public.microorganism_targets t WHERE t.microrganismo_id=r.item_id AND t.ativo IS TRUE) END,
  'fontes_count', (SELECT count(*) FROM public.catalog_technical_sources cs WHERE cs.entidade_id=r.item_id
    AND cs.entidade_tipo IN (r.item_tipo, 'ficha_' || r.item_tipo))
 ) ELSE '{}'::jsonb END
 FROM public.get_partner_catalog_tecnico_secure() r
 LEFT JOIN public.produtos p ON r.item_tipo='produto' AND p.id=r.item_id
 LEFT JOIN public.microrganismos m ON r.item_tipo='microrganismo' AND m.id=r.item_id
 LEFT JOIN public.product_technical_profiles pp ON r.item_tipo='produto' AND pp.produto_id=r.item_id AND pp.status_validacao='aprovado'
 LEFT JOIN public.microorganism_technical_profiles mp ON r.item_tipo='microrganismo' AND mp.microrganismo_id=r.item_id AND mp.status_validacao='aprovado';
END $function$
