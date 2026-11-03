CREATE OR REPLACE FUNCTION platform_private.set_global_product_composition_core(p_produto_id uuid, p_expected_updated_at timestamp with time zone, p_status text, p_itens jsonb, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid; v_req jsonb; v_replay jsonb; v_receipt jsonb; v_audit uuid := gen_random_uuid();
  v_op public.produtos%ROWTYPE; v_np public.produtos%ROWTYPE; v_e jsonb; v_i int := 0; v_n int;
  v_before jsonb; v_after jsonb; v_form_before text; v_form_after text; v_vol_before text; v_vol_after text;
  v_old_status text; v_keys text[] := ARRAY['base','componente_nome','microrganismo_id','natureza','ordem','quantidade','tipo_componente','unidade'];
BEGIN
  v_actor := platform_private.catalog_metadata_require_actor();
  IF p_produto_id IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at) OR p_idempotency_key IS NULL
     OR p_status IS NULL OR p_status NOT IN ('rascunho','completo')
     OR p_itens IS NULL OR pg_catalog.jsonb_typeof(p_itens) <> 'array' OR pg_catalog.jsonb_array_length(p_itens) > 50
     OR (p_status = 'completo' AND pg_catalog.jsonb_array_length(p_itens) = 0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_invalid'; END IF;
  -- Formato estrito de cada item (chaves exatas, tipos JSON, ordem 1..n sequencial). Valores finais validados pelos CHECKs.
  FOR v_e IN SELECT e FROM pg_catalog.jsonb_array_elements(p_itens) e LOOP
    v_i := v_i + 1;
    IF pg_catalog.jsonb_typeof(v_e) <> 'object'
       OR (SELECT pg_catalog.array_agg(k ORDER BY k) FROM pg_catalog.jsonb_object_keys(v_e) k) IS DISTINCT FROM v_keys
       OR pg_catalog.jsonb_typeof(v_e->'ordem') <> 'number' OR (v_e->>'ordem') <> v_i::text
       OR pg_catalog.jsonb_typeof(v_e->'quantidade') NOT IN ('number','null')
       OR pg_catalog.jsonb_typeof(v_e->'tipo_componente') <> 'string' OR pg_catalog.jsonb_typeof(v_e->'natureza') <> 'string'
       OR pg_catalog.jsonb_typeof(v_e->'microrganismo_id') NOT IN ('string','null')
       OR pg_catalog.jsonb_typeof(v_e->'componente_nome') NOT IN ('string','null')
       OR pg_catalog.jsonb_typeof(v_e->'unidade') NOT IN ('string','null') OR pg_catalog.jsonb_typeof(v_e->'base') NOT IN ('string','null')
       OR (v_e->>'microrganismo_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND v_e->>'microrganismo_id' IS NOT NULL
       OR (p_status = 'completo' AND v_e->>'quantidade' IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_invalid'; END IF;
    -- No máximo 6 casas decimais (numeric(24,6) arredondaria silenciosamente).
    IF v_e->>'quantidade' IS NOT NULL AND pg_catalog.scale((v_e->>'quantidade')::numeric) > 6 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_invalid'; END IF;
  END LOOP;
  v_req := pg_catalog.jsonb_build_object('produto_id',p_produto_id,'expected_updated_at',p_expected_updated_at,'status',p_status,
    'itens',p_itens,'reason',pg_catalog.btrim(COALESCE(p_reason,'')));
  v_replay := platform_private.catalog_entity_replay(v_actor,'set_global_product_composition',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT * INTO v_op FROM public.produtos WHERE id = p_produto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_composition_unavailable'; END IF;
  IF v_op.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_composition_conflict'; END IF;
  IF v_op.familia_catalogo IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_requires_family'; END IF;

  -- Família transacional (após lock) e regras cruzadas com a receita.
  FOR v_e IN SELECT e FROM pg_catalog.jsonb_array_elements(p_itens) e LOOP
    IF NOT platform_private.catalog_composition_type_allowed(v_op.familia_catalogo, v_e->>'tipo_componente') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='catalog_composition_family_conflict'; END IF;
    IF v_e->>'tipo_componente' = 'microrganismo' THEN
      -- Nova associação exige micro ativo; micro já declarado (mesmo arquivado depois) pode ser mantido.
      IF NOT EXISTS (SELECT 1 FROM public.microrganismos m WHERE m.id = (v_e->>'microrganismo_id')::uuid
          AND (m.ativo OR EXISTS (SELECT 1 FROM public.produto_composicao_declaracoes d
                 WHERE d.produto_id = p_produto_id AND d.microrganismo_id = m.id))) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_micro_unavailable'; END IF;
      IF EXISTS (SELECT 1 FROM public.formulacoes f WHERE f.produto_id = p_produto_id
          AND f.microrganismo_id = (v_e->>'microrganismo_id')::uuid AND f.concentracao IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='catalog_composition_duplicate_measure'; END IF;
    END IF;
  END LOOP;

  SELECT c.status INTO v_old_status FROM public.produto_composicao_conjuntos c WHERE c.produto_id = p_produto_id FOR UPDATE;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ordem',d.ordem,'tipo_componente',d.tipo_componente,
      'microrganismo_id',d.microrganismo_id,'componente_nome',d.componente_nome,'quantidade',d.quantidade,'unidade',d.unidade,
      'base',d.base,'natureza',d.natureza) ORDER BY d.ordem), '[]'::jsonb) INTO v_before
    FROM public.produto_composicao_declaracoes d WHERE d.produto_id = p_produto_id;
  SELECT md5(COALESCE(string_agg(pg_catalog.to_jsonb(f)::text, ',' ORDER BY f.id), '')) INTO v_form_before FROM public.formulacoes f WHERE f.produto_id = p_produto_id;
  SELECT md5(COALESCE(string_agg(pg_catalog.to_jsonb(v)::text, ',' ORDER BY v.id), '')) INTO v_vol_before FROM public.catalogo_volumes v WHERE v.produto_id = p_produto_id;

  INSERT INTO public.produto_composicao_conjuntos (produto_id, status, updated_by) VALUES (p_produto_id, p_status, v_actor)
  ON CONFLICT (produto_id) DO UPDATE SET status = EXCLUDED.status, updated_by = EXCLUDED.updated_by;
  DELETE FROM public.produto_composicao_declaracoes d WHERE d.produto_id = p_produto_id;
  INSERT INTO public.produto_composicao_declaracoes (produto_id, ordem, tipo_componente, microrganismo_id, componente_nome, quantidade, unidade, base, natureza)
  SELECT p_produto_id, (e->>'ordem')::smallint, e->>'tipo_componente', (e->>'microrganismo_id')::uuid, e->>'componente_nome',
         (e->>'quantidade')::numeric, e->>'unidade', e->>'base', e->>'natureza'
  FROM pg_catalog.jsonb_array_elements(p_itens) e;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ordem',d.ordem,'tipo_componente',d.tipo_componente,
      'microrganismo_id',d.microrganismo_id,'componente_nome',d.componente_nome,'quantidade',d.quantidade,'unidade',d.unidade,
      'base',d.base,'natureza',d.natureza) ORDER BY d.ordem), '[]'::jsonb) INTO v_after
    FROM public.produto_composicao_declaracoes d WHERE d.produto_id = p_produto_id;
  IF v_after = v_before AND v_old_status IS NOT DISTINCT FROM p_status THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_no_change'; END IF;

  -- Versão monotônica do produto; demais colunas, receita e apresentações intactas.
  UPDATE public.produtos SET updated_at = updated_at WHERE id = p_produto_id AND updated_at = p_expected_updated_at RETURNING * INTO v_np;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_composition_confirmation_failed'; END IF;
  SELECT md5(COALESCE(string_agg(pg_catalog.to_jsonb(f)::text, ',' ORDER BY f.id), '')) INTO v_form_after FROM public.formulacoes f WHERE f.produto_id = p_produto_id;
  SELECT md5(COALESCE(string_agg(pg_catalog.to_jsonb(v)::text, ',' ORDER BY v.id), '')) INTO v_vol_after FROM public.catalogo_volumes v WHERE v.produto_id = p_produto_id;
  IF v_n <> pg_catalog.jsonb_array_length(p_itens) OR v_np.updated_at IS NULL OR v_np.updated_at <= v_op.updated_at
     OR (pg_catalog.to_jsonb(v_op) - 'updated_at') IS DISTINCT FROM (pg_catalog.to_jsonb(v_np) - 'updated_at')
     OR v_form_before IS DISTINCT FROM v_form_after OR v_vol_before IS DISTINCT FROM v_vol_after THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_composition_confirmation_failed'; END IF;

  v_receipt := pg_catalog.jsonb_build_object('produto_id',p_produto_id,'status',p_status,'itens',v_n,'updated_at',v_np.updated_at,
    'idempotency_key',p_idempotency_key,'audit_id',v_audit,'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'set_global_product_composition',p_reason,p_idempotency_key,v_req,v_receipt,
    pg_catalog.jsonb_build_object('produto_id',p_produto_id,'status',v_old_status,'itens',v_before,'updated_at',v_op.updated_at),
    pg_catalog.jsonb_build_object('produto_id',p_produto_id,'status',p_status,'itens',v_after,'updated_at',v_np.updated_at));
  RETURN v_receipt;
END;
$function$
