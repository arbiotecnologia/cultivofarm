-- =====================================================================================
-- CANDIDATO 04 — NÃO APLICAR. Requer 01–03. Gate permanece OFF.
-- Contenção operacional explícita: enquanto cada módulo não possuir resolução de owner certificada,
-- referências NOVAS/ALTERADAS a itens privados são recusadas. Linhas históricas e globais não são mutadas.
-- O trigger não confia em organization_id do payload e não usa GUC como autorização.
-- =====================================================================================

DO $$
DECLARE r record;
BEGIN
  IF to_regprocedure('platform_private.catalog_reader_org()') IS NULL
     OR to_regprocedure('platform_private.catalog_b2b_supplier_org(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ownership04_preflight_01_03_missing';
  END IF;
  -- Manifesto exato do live em 15/10/2026: tabela/coluna -> raiz. Drift aborta antes de criar triggers.
  FOR r IN SELECT * FROM (VALUES
    ('commercial_campaign_products','product_id','produtos'),
    ('commercial_condition_item_prices','product_id','produtos'),('commercial_condition_item_prices','microrganismo_id','microrganismos'),
    ('commercial_price_rules','product_id','produtos'),('commercial_price_rules','microrganismo_id','microrganismos'),
    ('cq_parametros_referencia','produto_id','produtos'),('cq_parametros_referencia','microrganismo_id','microrganismos'),
    ('entregas','produto_id','produtos'),('estoque_embalagens','produto_id','produtos'),
    ('estoque_produto','produto_id','produtos'),('estoque_produto','microrganismo_id','microrganismos'),
    ('lotes','produto_id','produtos'),('lotes','microrganismo_id','microrganismos'),
    ('microorganism_crop_recommendations','cultura_id','culturas'),('microorganism_crop_recommendations','microrganismo_id','microrganismos'),
    ('microorganism_fiscal_profiles','microorganism_id','microrganismos'),
    ('microorganism_regulatory_dossiers','microorganism_id','microrganismos'),
    ('microorganism_regulatory_publication_snapshots','microorganism_id','microrganismos'),
    ('microorganism_targets','microrganismo_id','microrganismos'),('microorganism_technical_profiles','microrganismo_id','microrganismos'),
    ('objetivos_visita_sugestoes','cultura_id','culturas'),
    ('ordens_servico','produto_id','produtos'),('ordens_servico','microrganismo_id','microrganismos'),
    ('ordens_servico_onfarm','cultura_id','culturas'),('ordens_servico_onfarm','produto_id','produtos'),('ordens_servico_onfarm','microrganismo_id','microrganismos'),
    ('os_faturamento_base','produto_id','produtos'),
    ('partner_order_items','product_id','produtos'),('partner_order_items','microrganismo_id','microrganismos'),
    ('partner_product_prices','product_id','produtos'),('partner_product_prices','microrganismo_id','microrganismos'),
    ('partner_simulation_items','product_id','produtos'),('partner_simulation_items','microrganismo_id','microrganismos'),
    ('product_crop_recommendations','cultura_id','culturas'),('product_crop_recommendations','produto_id','produtos'),
    ('product_fiscal_profiles','product_id','produtos'),('product_target_recommendations','produto_id','produtos'),
    ('product_technical_profiles','produto_id','produtos'),('produto_conformidade_perfis','produto_id','produtos'),
    ('produto_etiquetas','produto_id','produtos'),
    ('programacao_producao','produto_id','produtos'),('programacao_producao','microrganismo_id','microrganismos'),
    ('registros_consultor','cultura_id','culturas'),
    ('registros_consultor_recomendacoes','produto_biologico_sugerido_id','produtos'),('registros_consultor_recomendacoes','microrganismo_id','microrganismos'),
    ('talhao_safras','cultura_id','culturas'),('talhoes','cultura_id','culturas'),('visitas_campo','cultura_id','culturas')
  ) v(child_table, child_column, root_table) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute ca ON ca.attrelid=c.conrelid AND ca.attnum=ANY(c.conkey)
      WHERE c.contype='f' AND c.conrelid=to_regclass('public.'||r.child_table)
        AND c.confrelid=to_regclass('public.'||r.root_table) AND ca.attname=r.child_column
    ) THEN RAISE EXCEPTION 'ownership04_fk_manifest_drift: %.%',r.child_table,r.child_column; END IF;
  END LOOP;
END $$;

CREATE FUNCTION platform_private.catalog_block_uncertified_private_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE spec jsonb; col_name text; root_name text; item_id uuid; owner_id uuid;
BEGIN
  FOR spec IN SELECT value FROM jsonb_array_elements(TG_ARGV[0]::jsonb) LOOP
    col_name:=spec->>'column'; root_name:=spec->>'root';
    item_id:=NULLIF(to_jsonb(NEW)->>col_name,'')::uuid;
    IF item_id IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT owner_organization_id FROM public.%I WHERE id=$1',root_name) INTO owner_id USING item_id;
    IF owner_id IS NOT NULL THEN
      RAISE EXCEPTION 'catalog_private_reference_module_unavailable' USING ERRCODE='42501';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_block_uncertified_private_reference() FROM PUBLIC,anon,authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT child_table, jsonb_agg(jsonb_build_object('column',child_column,'root',root_table) ORDER BY child_column) args
    FROM (VALUES
      ('commercial_campaign_products','product_id','produtos'),
      ('commercial_condition_item_prices','product_id','produtos'),('commercial_condition_item_prices','microrganismo_id','microrganismos'),
      ('commercial_price_rules','product_id','produtos'),('commercial_price_rules','microrganismo_id','microrganismos'),
      ('cq_parametros_referencia','produto_id','produtos'),('cq_parametros_referencia','microrganismo_id','microrganismos'),
      ('entregas','produto_id','produtos'),('estoque_embalagens','produto_id','produtos'),
      ('estoque_produto','produto_id','produtos'),('estoque_produto','microrganismo_id','microrganismos'),
      ('lotes','produto_id','produtos'),('lotes','microrganismo_id','microrganismos'),
      ('microorganism_crop_recommendations','cultura_id','culturas'),('microorganism_crop_recommendations','microrganismo_id','microrganismos'),
      ('microorganism_fiscal_profiles','microorganism_id','microrganismos'),('microorganism_regulatory_dossiers','microorganism_id','microrganismos'),
      ('microorganism_regulatory_publication_snapshots','microorganism_id','microrganismos'),
      ('microorganism_targets','microrganismo_id','microrganismos'),('microorganism_technical_profiles','microrganismo_id','microrganismos'),
      ('objetivos_visita_sugestoes','cultura_id','culturas'),('ordens_servico','produto_id','produtos'),('ordens_servico','microrganismo_id','microrganismos'),
      ('ordens_servico_onfarm','cultura_id','culturas'),('ordens_servico_onfarm','produto_id','produtos'),('ordens_servico_onfarm','microrganismo_id','microrganismos'),
      ('os_faturamento_base','produto_id','produtos'),('partner_order_items','product_id','produtos'),('partner_order_items','microrganismo_id','microrganismos'),
      ('partner_product_prices','product_id','produtos'),('partner_product_prices','microrganismo_id','microrganismos'),
      ('partner_simulation_items','product_id','produtos'),('partner_simulation_items','microrganismo_id','microrganismos'),
      ('product_crop_recommendations','cultura_id','culturas'),('product_crop_recommendations','produto_id','produtos'),
      ('product_fiscal_profiles','product_id','produtos'),('product_target_recommendations','produto_id','produtos'),
      ('product_technical_profiles','produto_id','produtos'),('produto_conformidade_perfis','produto_id','produtos'),('produto_etiquetas','produto_id','produtos'),
      ('programacao_producao','produto_id','produtos'),('programacao_producao','microrganismo_id','microrganismos'),
      ('registros_consultor','cultura_id','culturas'),('registros_consultor_recomendacoes','produto_biologico_sugerido_id','produtos'),
      ('registros_consultor_recomendacoes','microrganismo_id','microrganismos'),('talhao_safras','cultura_id','culturas'),
      ('talhoes','cultura_id','culturas'),('visitas_campo','cultura_id','culturas')
    ) x(child_table,child_column,root_table) GROUP BY child_table
  LOOP
    EXECUTE format('CREATE TRIGGER trg_catalog_private_ref_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_block_uncertified_private_reference(%L)',r.child_table,r.args::text);
  END LOOP;
END $$;

-- O recorte 04 é contenção, não certificação: gate e readers_certified_at permanecem fechados.
DO $$ BEGIN
  IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership04_gate_must_remain_off'; END IF;
END $$;