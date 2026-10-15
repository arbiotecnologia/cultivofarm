-- CANDIDATO 05 — NÃO APLICAR. Requer 01–04; gate permanece OFF.
-- Definições completas de writers SA e RPCs tenant de apresentações/preços.
-- Sem publicação. ACLs públicas existentes são preservadas.
BEGIN;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('create_global_product_core','e09129b948fdc2a8974d62df1ca9c7f2'),
    ('set_global_product_status_core','f74965cdacc9ecc433df4c5d36f5fbd2'),
    ('update_global_product_metadata_core','7cf0e86bbd40ad9050ea5117afd16efd'),
    ('set_global_product_composition_core','d03d2a8cb5ce0ca2aa65ef60b0ad245a'),
    ('set_global_product_family_core','8bd3ce69c5bd55b678246acb9d264548'),
    ('set_global_b2b_enabled_core','73419bcd860ca8b0ac4f50dd32a8ec3f'),
    ('create_global_microorganism_core','69b01d045a358bd8405dd3111248381c'),
    ('update_global_microorganism_core','9747855384fea9dbd1f16ad2e07e9bb9'),
    ('set_global_microorganism_status_core','67ac2e0995c7c44acc68bdd050d569ec'),
    ('create_global_culture_core','f3afe74a3384cb741570ec77004dc494'),
    ('update_global_culture_core','5ca15b5b3c6994dee970d0ef9a510dcf'),
    ('set_global_culture_status_core','0c327bf2cfc6be928288fcd3b97ac30f')
  ) v(fn,h) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='platform_private' AND p.proname=r.fn AND md5(pg_get_functiondef(p.oid))=r.h) THEN RAISE EXCEPTION 'ownership05_writer_drift: %',r.fn; END IF;
  END LOOP;
END $$;

-- ================= create_global_product_core
CREATE OR REPLACE FUNCTION platform_private.create_global_product_core(
  p_payload jsonb, p_reason text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid; v_existing public.catalog_platform_admin_audit%ROWTYPE;
  v_new public.produtos%ROWTYPE; v_request jsonb; v_receipt jsonb; v_audit uuid:=gen_random_uuid();
  v_key text; v_item jsonb; v_comp jsonb:='[]'::jsonb; v_ids uuid[]:='{}';
  v_snapshot jsonb; v_dose numeric; v_vol numeric; v_prop numeric; v_micro uuid; v_count int;
  v_allowed constant text[]:=ARRAY['nome','tipo','descricao','modo_acao','funcao_completa','modo_aplicacao','dose_ml_ha','composicao'];
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  IF p_idempotency_key IS NULL OR p_reason IS NULL
    OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 10 AND 500
    OR p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid';
  END IF;
  -- Só depois de provar 'object' chamamos jsonb_object_keys (arrays/escalares abortariam com erro genérico).
  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_payload) LOOP
    IF NOT (v_key=ANY(v_allowed)) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid'; END IF;
  END LOOP;
  IF pg_catalog.jsonb_typeof(p_payload->'nome') IS DISTINCT FROM 'string'
    OR pg_catalog.char_length(pg_catalog.btrim(p_payload->>'nome')) NOT BETWEEN 1 AND 500
    OR pg_catalog.jsonb_typeof(p_payload->'tipo') IS DISTINCT FROM 'string'
    OR NOT ((p_payload->>'tipo') = ANY(pg_catalog.enum_range(NULL::public.tipo_produto)::text[])) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['descricao','modo_acao','funcao_completa','modo_aplicacao'] LOOP
    IF p_payload ? v_key AND (pg_catalog.jsonb_typeof(p_payload->v_key) IS DISTINCT FROM 'string'
      AND pg_catalog.jsonb_typeof(p_payload->v_key) IS DISTINCT FROM 'null'
      OR pg_catalog.char_length(p_payload->>v_key) > 10000) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid';
    END IF;
  END LOOP;
  -- Dose: número JSON finito (JSON não representa NaN/Infinity), 0 < d <= 1e6, até 6 casas.
  IF p_payload ? 'dose_ml_ha' AND pg_catalog.jsonb_typeof(p_payload->'dose_ml_ha') IS DISTINCT FROM 'null' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'dose_ml_ha') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid'; END IF;
    v_dose:=(p_payload->>'dose_ml_ha')::numeric;
    IF v_dose <= 0 OR v_dose > 1000000 OR pg_catalog.scale(v_dose) > 6 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid';
    END IF;
  END IF;
  IF p_payload ? 'composicao' THEN
    IF pg_catalog.jsonb_typeof(p_payload->'composicao') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid';
    END IF;
    IF pg_catalog.jsonb_array_length(p_payload->'composicao') > 50 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid';
    END IF;
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_payload->'composicao') LOOP
      -- Objeto primeiro (curto-circuito explícito), depois chaves e tipos com IS DISTINCT FROM (NULL/ausente = inválido).
      IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid';
      END IF;
      IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(v_item) k WHERE k NOT IN ('microrganismo_id','volume_ml','proporcao'))
        OR pg_catalog.jsonb_typeof(v_item->'microrganismo_id') IS DISTINCT FROM 'string'
        OR (v_item->>'microrganismo_id') IS NULL
        OR (v_item->>'microrganismo_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        OR pg_catalog.jsonb_typeof(v_item->'volume_ml') IS DISTINCT FROM 'number'
        OR (v_item ? 'proporcao' AND pg_catalog.jsonb_typeof(v_item->'proporcao') IS DISTINCT FROM 'number'
            AND pg_catalog.jsonb_typeof(v_item->'proporcao') IS DISTINCT FROM 'null') THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid';
      END IF;
      v_micro:=(v_item->>'microrganismo_id')::uuid; v_vol:=(v_item->>'volume_ml')::numeric;
      v_prop:=CASE WHEN pg_catalog.jsonb_typeof(v_item->'proporcao')='number' THEN (v_item->>'proporcao')::numeric END;
      IF v_vol IS NULL OR v_micro=ANY(v_ids) OR v_vol <= 0 OR v_vol > 1000000 OR pg_catalog.scale(v_vol) > 6
        OR (v_prop IS NOT NULL AND (v_prop <= 0 OR v_prop > 100 OR pg_catalog.scale(v_prop) > 6)) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid';
      END IF;
      v_ids:=v_ids||v_micro;
      v_comp:=v_comp||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('microrganismo_id',v_micro,'volume_ml',v_vol,'proporcao',v_prop));
    END LOOP;
  END IF;
  v_request:=pg_catalog.jsonb_build_object('payload',(p_payload-'composicao')||pg_catalog.jsonb_build_object(
    'nome',pg_catalog.btrim(p_payload->>'nome'),'composicao',v_comp),'reason',pg_catalog.btrim(p_reason));

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalog-metadata:'||p_idempotency_key::text,0));
  SELECT * INTO v_existing FROM public.catalog_platform_admin_audit WHERE correlation_id=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.operation<>'create_global_product' OR v_existing.actor_id<>v_actor
      OR v_existing.counts_after->'request' IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_create_conflict';
    END IF;
    RETURN (v_existing.counts_after->'receipt')||pg_catalog.jsonb_build_object('idempotent',true);
  END IF;
  -- Microrganismos referenciados devem existir; lock compartilhado evita remoção concorrente.
  SELECT count(*) INTO v_count FROM (SELECT 1 FROM public.microrganismos WHERE id=ANY(v_ids) AND owner_organization_id IS NULL FOR KEY SHARE) s;
  IF v_count <> pg_catalog.cardinality(v_ids) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid'; END IF;

  -- Novo item nasce INATIVO e fora do B2B; preços NULL (motor canônico decide depois);
  -- código NULL → trigger set_codigo_produto/proximo_codigo (upsert serializado).
  INSERT INTO public.produtos (nome,tipo,descricao,modo_acao,funcao_completa,modo_aplicacao,dose_ml_ha,
    ativo,b2b_enabled,codigo,valor_dose_brl,valor_litro_brl,valor_ha_brl,owner_organization_id)
  VALUES (pg_catalog.btrim(p_payload->>'nome'),(p_payload->>'tipo')::public.tipo_produto,
    p_payload->>'descricao',p_payload->>'modo_acao',p_payload->>'funcao_completa',p_payload->>'modo_aplicacao',
    v_dose,false,false,NULL,NULL,NULL,NULL,NULL)
  RETURNING * INTO v_new;
  IF v_new.id IS NULL OR v_new.codigo IS NULL OR v_new.ativo IS DISTINCT FROM false OR v_new.b2b_enabled
    OR v_new.valor_dose_brl IS NOT NULL OR v_new.valor_litro_brl IS NOT NULL OR v_new.valor_ha_brl IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_create_confirmation_failed';
  END IF;
  INSERT INTO public.formulacoes (produto_id,microrganismo_id,volume_ml,proporcao,e_volume_fixo,unidade)
  SELECT v_new.id,(c->>'microrganismo_id')::uuid,(c->>'volume_ml')::numeric,
    CASE WHEN c->>'proporcao' IS NULL THEN NULL ELSE (c->>'proporcao')::numeric END,true,'mL'
  FROM pg_catalog.jsonb_array_elements(v_comp) c;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> pg_catalog.jsonb_array_length(v_comp) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_create_confirmation_failed';
  END IF;
  -- Snapshot canônico relido do banco na mesma transação (produto + formulações com IDs).
  SELECT pg_catalog.jsonb_build_object('produto',pg_catalog.to_jsonb(p) - ARRAY['created_at'],
    'formulacoes',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',f.id,'microrganismo_id',f.microrganismo_id,
      'volume_ml',f.volume_ml,'proporcao',f.proporcao,'e_volume_fixo',f.e_volume_fixo,'unidade',f.unidade) ORDER BY f.id)
      FROM public.formulacoes f WHERE f.produto_id=p.id),'[]'::jsonb))
  INTO v_snapshot FROM public.produtos p WHERE p.id=v_new.id;
  IF v_snapshot IS NULL OR pg_catalog.jsonb_array_length(v_snapshot->'formulacoes') <> v_count
    OR (v_snapshot->'produto'->>'ativo')::boolean IS DISTINCT FROM false
    OR (v_snapshot->'produto'->>'b2b_enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_create_confirmation_failed';
  END IF;
  v_receipt:=pg_catalog.jsonb_build_object('id',v_new.id,'codigo',v_new.codigo,'updated_at',v_new.updated_at,
    'composicao_count',v_count,'idempotency_key',p_idempotency_key,'audit_id',v_audit,'idempotent',false);
  INSERT INTO public.catalog_platform_admin_audit (id,operation,actor_id,reason,correlation_id,status,counts_before,counts_after,completed_at)
  VALUES (v_audit,'create_global_product',v_actor,pg_catalog.btrim(p_reason),p_idempotency_key,'completed','{}'::jsonb,
    pg_catalog.jsonb_build_object('request',v_request,'receipt',v_receipt,'after',v_snapshot),pg_catalog.clock_timestamp());
  RETURN v_receipt;
END;
$$;

-- ================= set_global_product_status_core
CREATE OR REPLACE FUNCTION platform_private.set_global_product_status_core(
  p_id uuid, p_expected_updated_at timestamptz, p_ativo boolean, p_reason text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_old public.produtos%ROWTYPE; v_new public.produtos%ROWTYPE;
  v_existing public.catalog_platform_admin_audit%ROWTYPE; v_request jsonb; v_receipt jsonb; v_audit uuid:=gen_random_uuid();
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_ativo IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at)
    OR p_idempotency_key IS NULL OR p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_status_invalid';
  END IF;
  v_request:=pg_catalog.jsonb_build_object('id',p_id,'expected_updated_at',p_expected_updated_at,'ativo',p_ativo,'reason',pg_catalog.btrim(p_reason));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalog-metadata:'||p_idempotency_key::text,0));
  SELECT * INTO v_old FROM public.produtos WHERE id=p_id AND owner_organization_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_status_unavailable'; END IF;
  SELECT * INTO v_existing FROM public.catalog_platform_admin_audit WHERE correlation_id=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.operation<>'set_global_product_status' OR v_existing.actor_id<>v_actor
      OR v_existing.counts_after->'request' IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_status_conflict';
    END IF;
    RETURN (v_existing.counts_after->'receipt')||pg_catalog.jsonb_build_object('idempotent',true);
  END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_status_conflict'; END IF;
  IF COALESCE(v_old.ativo,false)=p_ativo THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_status_no_change'; END IF;
  -- Arquivar = ativo false. Nunca exclui; históricos (pedidos/estoque/fiscal) preservados.
  -- b2b_enabled e preços não são tocados aqui.
  UPDATE public.produtos SET ativo=p_ativo, updated_at=pg_catalog.clock_timestamp()
  WHERE id=p_id AND owner_organization_id IS NULL AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
  IF NOT FOUND OR v_new.id IS DISTINCT FROM p_id OR v_new.ativo IS DISTINCT FROM p_ativo
    OR v_new.updated_at IS NOT DISTINCT FROM v_old.updated_at OR v_new.updated_at <= v_old.updated_at
    OR (pg_catalog.to_jsonb(v_old)-ARRAY['ativo','updated_at']) IS DISTINCT FROM (pg_catalog.to_jsonb(v_new)-ARRAY['ativo','updated_at']) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_status_confirmation_failed';
  END IF;
  v_receipt:=pg_catalog.jsonb_build_object('id',p_id,'ativo',v_new.ativo,'updated_at',v_new.updated_at,
    'idempotency_key',p_idempotency_key,'audit_id',v_audit,'idempotent',false);
  INSERT INTO public.catalog_platform_admin_audit (id,operation,actor_id,reason,correlation_id,status,counts_before,counts_after,completed_at)
  VALUES (v_audit,'set_global_product_status',v_actor,pg_catalog.btrim(p_reason),p_idempotency_key,'completed',
    pg_catalog.jsonb_build_object('ativo',v_old.ativo),
    pg_catalog.jsonb_build_object('request',v_request,'receipt',v_receipt,'after',pg_catalog.jsonb_build_object('ativo',v_new.ativo)),
    pg_catalog.clock_timestamp());
  RETURN v_receipt;
END;
$$;

-- ================= update_global_product_metadata_core
CREATE OR REPLACE FUNCTION platform_private.update_global_product_metadata_core(
  p_id uuid, p_expected_updated_at timestamptz, p_patch jsonb, p_reason text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid; v_old public.produtos%ROWTYPE; v_new public.produtos%ROWTYPE;
  v_existing public.catalog_platform_admin_audit%ROWTYPE;
  v_patch jsonb:='{}'::jsonb; v_before jsonb:='{}'::jsonb; v_after jsonb:='{}'::jsonb;
  v_request jsonb; v_receipt jsonb; v_audit uuid; v_field text; v_text text;
  v_fields constant text[]:=ARRAY['nome','descricao','modo_acao','funcao_completa','modo_aplicacao'];
BEGIN
  -- Direct core calls have EXACTLY the wrapper's authorization/validation; no
  -- caller/GUC ticket can bypass these checks. service_role without actor denied.
  v_actor:=platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at)
    OR p_idempotency_key IS NULL OR p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 10 AND 500
    OR pg_catalog.jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch='{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_metadata_invalid';
  END IF;
  FOR v_field IN SELECT pg_catalog.jsonb_object_keys(p_patch) LOOP
    IF NOT (v_field=ANY(v_fields)) OR pg_catalog.jsonb_typeof(p_patch->v_field) NOT IN ('string','null') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_metadata_invalid';
    END IF;
    v_text:=p_patch->>v_field;
    IF v_field='nome' THEN
      IF v_text IS NULL OR pg_catalog.char_length(pg_catalog.btrim(v_text)) NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_metadata_invalid';
      END IF;
      v_text:=pg_catalog.btrim(v_text);
    ELSIF pg_catalog.char_length(v_text)>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_metadata_invalid';
    END IF;
    v_patch:=v_patch || pg_catalog.jsonb_build_object(v_field,v_text);
  END LOOP;
  -- Serialize globally unique correlation BEFORE product lock. Same key on
  -- different actor/target cannot expose a replay; comparison happens after auth.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalog-metadata:'||p_idempotency_key::text,0));
  SELECT * INTO v_old FROM public.produtos WHERE id=p_id AND owner_organization_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_metadata_unavailable'; END IF;
  v_request:=pg_catalog.jsonb_build_object('id',p_id,'expected_updated_at',p_expected_updated_at,
    'patch',v_patch,'reason',pg_catalog.btrim(p_reason));
  SELECT * INTO v_existing FROM public.catalog_platform_admin_audit WHERE correlation_id=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.operation<>'update_global_product_metadata' OR v_existing.actor_id<>v_actor
      OR v_existing.counts_after->'request' IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_metadata_conflict';
    END IF;
    RETURN (v_existing.counts_after->'receipt') || pg_catalog.jsonb_build_object('idempotent',true);
  END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_metadata_conflict';
  END IF;
  FOR v_field IN SELECT pg_catalog.jsonb_object_keys(v_patch) LOOP
    IF pg_catalog.to_jsonb(v_old)->v_field IS NOT DISTINCT FROM v_patch->v_field THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_metadata_no_change';
    END IF;
    v_before:=v_before || pg_catalog.jsonb_build_object(v_field,pg_catalog.to_jsonb(v_old)->v_field);
  END LOOP;
  UPDATE public.produtos SET
    nome=CASE WHEN v_patch?'nome' THEN v_patch->>'nome' ELSE nome END,
    descricao=CASE WHEN v_patch?'descricao' THEN v_patch->>'descricao' ELSE descricao END,
    modo_acao=CASE WHEN v_patch?'modo_acao' THEN v_patch->>'modo_acao' ELSE modo_acao END,
    funcao_completa=CASE WHEN v_patch?'funcao_completa' THEN v_patch->>'funcao_completa' ELSE funcao_completa END,
    modo_aplicacao=CASE WHEN v_patch?'modo_aplicacao' THEN v_patch->>'modo_aplicacao' ELSE modo_aplicacao END,
    updated_at=pg_catalog.clock_timestamp()
  WHERE id=p_id AND owner_organization_id IS NULL AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
  IF NOT FOUND OR v_new.id IS DISTINCT FROM p_id OR v_new.updated_at IS NOT DISTINCT FROM v_old.updated_at
    OR (pg_catalog.to_jsonb(v_old)-(v_fields||ARRAY['updated_at'])) IS DISTINCT FROM
       (pg_catalog.to_jsonb(v_new)-(v_fields||ARRAY['updated_at'])) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_metadata_confirmation_failed';
  END IF;
  FOR v_field IN SELECT pg_catalog.jsonb_object_keys(v_patch) LOOP
    IF pg_catalog.to_jsonb(v_new)->v_field IS DISTINCT FROM v_patch->v_field THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_metadata_confirmation_failed';
    END IF;
    v_after:=v_after || pg_catalog.jsonb_build_object(v_field,pg_catalog.to_jsonb(v_new)->v_field);
  END LOOP;
  FOREACH v_field IN ARRAY v_fields LOOP
    IF NOT (v_patch?v_field) AND pg_catalog.to_jsonb(v_old)->v_field IS DISTINCT FROM pg_catalog.to_jsonb(v_new)->v_field THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_metadata_confirmation_failed';
    END IF;
  END LOOP;
  v_audit:=pg_catalog.gen_random_uuid();
  v_receipt:=pg_catalog.jsonb_build_object('id',p_id,'updated_at',v_new.updated_at,
    'idempotency_key',p_idempotency_key,'idempotent',false,'audit_id',v_audit);
  INSERT INTO public.catalog_platform_admin_audit(id,operation,actor_id,reason,correlation_id,status,counts_before,counts_after,completed_at)
  VALUES(v_audit,'update_global_product_metadata',v_actor,pg_catalog.btrim(p_reason),p_idempotency_key,'completed',
    pg_catalog.jsonb_build_object('values',v_before),pg_catalog.jsonb_build_object('values',v_after,'request',v_request,'receipt',v_receipt),pg_catalog.clock_timestamp());
  RETURN v_receipt;
END;
$$;

-- ================= set_global_product_composition_core
CREATE OR REPLACE FUNCTION platform_private.set_global_product_composition_core(p_produto_id uuid, p_expected_updated_at timestamptz,
  p_status text, p_itens jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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

  SELECT * INTO v_op FROM public.produtos WHERE id = p_produto_id AND owner_organization_id IS NULL FOR UPDATE;
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
      IF NOT EXISTS (SELECT 1 FROM public.microrganismos m WHERE m.id = (v_e->>'microrganismo_id')::uuid AND m.owner_organization_id IS NULL
          AND (m.ativo OR EXISTS (SELECT 1 FROM public.produto_composicao_declaracoes d
                 WHERE d.produto_id = p_produto_id AND d.microrganismo_id = m.id))) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_composition_micro_unavailable'; END IF;
      IF EXISTS (SELECT 1 FROM public.formulacoes f WHERE f.produto_id = p_produto_id AND f.owner_organization_id IS NULL
          AND f.microrganismo_id = (v_e->>'microrganismo_id')::uuid AND f.concentracao IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='catalog_composition_duplicate_measure'; END IF;
    END IF;
  END LOOP;

  SELECT c.status INTO v_old_status FROM public.produto_composicao_conjuntos c WHERE c.produto_id = p_produto_id FOR UPDATE;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('ordem',d.ordem,'tipo_componente',d.tipo_componente,
      'microrganismo_id',d.microrganismo_id,'componente_nome',d.componente_nome,'quantidade',d.quantidade,'unidade',d.unidade,
      'base',d.base,'natureza',d.natureza) ORDER BY d.ordem), '[]'::jsonb) INTO v_before
    FROM public.produto_composicao_declaracoes d WHERE d.produto_id = p_produto_id;
  SELECT md5(COALESCE(string_agg(pg_catalog.to_jsonb(f)::text, ',' ORDER BY f.id), '')) INTO v_form_before FROM public.formulacoes f WHERE f.produto_id = p_produto_id AND f.owner_organization_id IS NULL;
  SELECT md5(COALESCE(string_agg(pg_catalog.to_jsonb(v)::text, ',' ORDER BY v.id), '')) INTO v_vol_before FROM public.catalogo_volumes v WHERE v.produto_id = p_produto_id AND v.owner_organization_id IS NULL;

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
  UPDATE public.produtos SET updated_at = updated_at WHERE id = p_produto_id AND owner_organization_id IS NULL AND updated_at = p_expected_updated_at RETURNING * INTO v_np;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_composition_confirmation_failed'; END IF;
  SELECT md5(COALESCE(string_agg(pg_catalog.to_jsonb(f)::text, ',' ORDER BY f.id), '')) INTO v_form_after FROM public.formulacoes f WHERE f.produto_id = p_produto_id AND f.owner_organization_id IS NULL;
  SELECT md5(COALESCE(string_agg(pg_catalog.to_jsonb(v)::text, ',' ORDER BY v.id), '')) INTO v_vol_after FROM public.catalogo_volumes v WHERE v.produto_id = p_produto_id AND v.owner_organization_id IS NULL;
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
$$;

-- ================= set_global_product_family_core
CREATE OR REPLACE FUNCTION platform_private.set_global_product_family_core(p_id uuid, p_expected_updated_at timestamptz,
  p_familia text, p_classe text, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_req jsonb; v_replay jsonb; v_receipt jsonb; v_audit uuid := gen_random_uuid();
  v_op public.produtos%ROWTYPE; v_np public.produtos%ROWTYPE; v_old jsonb; v_new jsonb;
  v_vols_before jsonb; v_vols_after jsonb; v_classe text := NULLIF(pg_catalog.btrim(COALESCE(p_classe,'')), '');
BEGIN
  v_actor := platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at) OR p_idempotency_key IS NULL
     OR p_familia IS NULL OR p_familia NOT IN ('biologico','quimico','fertilizante_adubo')
     OR NOT (v_classe IS NULL
       OR (p_familia='biologico' AND v_classe IN ('biofungicida','bioinseticida','inoculante','solubilizador'))
       OR (p_familia='quimico'   AND v_classe IN ('fungicida','inseticida','herbicida'))) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_family_invalid';
  END IF;
  v_req := pg_catalog.jsonb_build_object('id',p_id,'expected_updated_at',p_expected_updated_at,
    'familia_catalogo',p_familia,'classe_catalogo',v_classe,'reason',pg_catalog.btrim(COALESCE(p_reason,'')));
  v_replay := platform_private.catalog_entity_replay(v_actor,'set_global_product_family',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  SELECT * INTO v_op FROM public.produtos WHERE id=p_id AND owner_organization_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_family_unavailable'; END IF;
  IF v_op.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_family_conflict'; END IF;
  IF v_op.familia_catalogo IS NOT DISTINCT FROM p_familia AND v_op.classe_catalogo IS NOT DISTINCT FROM v_classe THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_family_no_change'; END IF;
  v_old := pg_catalog.to_jsonb(v_op);
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cv) ORDER BY cv.id),'[]'::jsonb) INTO v_vols_before
    FROM public.catalogo_volumes cv WHERE cv.produto_id=p_id AND cv.owner_organization_id IS NULL;

  UPDATE public.produtos SET familia_catalogo=p_familia, classe_catalogo=v_classe
   WHERE id=p_id AND owner_organization_id IS NULL AND updated_at=p_expected_updated_at RETURNING * INTO v_np;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_family_confirmation_failed'; END IF;
  v_new := pg_catalog.to_jsonb(v_np);
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cv) ORDER BY cv.id),'[]'::jsonb) INTO v_vols_after
    FROM public.catalogo_volumes cv WHERE cv.produto_id=p_id AND cv.owner_organization_id IS NULL;
  -- Somente família/classe/versão mudam (ativo, B2B, preços, dose, tipo, código, owner intactos).
  IF v_np.familia_catalogo IS DISTINCT FROM p_familia OR v_np.classe_catalogo IS DISTINCT FROM v_classe
    OR v_np.updated_at IS NULL OR v_np.updated_at <= v_op.updated_at
    OR (v_old - ARRAY['familia_catalogo','classe_catalogo','updated_at']) IS DISTINCT FROM (v_new - ARRAY['familia_catalogo','classe_catalogo','updated_at'])
    OR v_vols_before IS DISTINCT FROM v_vols_after THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_family_confirmation_failed'; END IF;

  v_receipt := pg_catalog.jsonb_build_object('id',p_id,'familia_catalogo',p_familia,'classe_catalogo',v_classe,
    'updated_at',v_np.updated_at,'idempotency_key',p_idempotency_key,'audit_id',v_audit,'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'set_global_product_family',p_reason,p_idempotency_key,v_req,v_receipt,
    pg_catalog.jsonb_build_object('id',p_id,'familia_catalogo',v_op.familia_catalogo,'classe_catalogo',v_op.classe_catalogo,'updated_at',v_op.updated_at),
    pg_catalog.jsonb_build_object('id',p_id,'familia_catalogo',p_familia,'classe_catalogo',v_classe,'updated_at',v_np.updated_at));
  RETURN v_receipt;
END;
$$;

-- ================= set_global_b2b_enabled_core
CREATE OR REPLACE FUNCTION platform_private.set_global_b2b_enabled_core(p_item_tipo text, p_id uuid, p_expected_updated_at timestamptz,
  p_b2b_enabled boolean, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_req jsonb; v_replay jsonb; v_receipt jsonb; v_audit uuid:=gen_random_uuid();
  v_op public.produtos%ROWTYPE; v_np public.produtos%ROWTYPE;
  v_om public.microrganismos%ROWTYPE; v_nm public.microrganismos%ROWTYPE;
  v_old jsonb; v_new jsonb; v_old_ativo boolean; v_old_b2b boolean; v_old_ver timestamptz; v_new_ver timestamptz;
  v_vols_before jsonb; v_vols_after jsonb;
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  IF p_item_tipo IS NULL OR p_item_tipo NOT IN ('produto','microrganismo') OR p_id IS NULL OR p_b2b_enabled IS NULL
    OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_b2b_invalid'; END IF;
  v_req:=pg_catalog.jsonb_build_object('item_tipo',p_item_tipo,'id',p_id,'expected_updated_at',p_expected_updated_at,
    'b2b_enabled',p_b2b_enabled,'reason',pg_catalog.btrim(COALESCE(p_reason,'')));
  -- Motivo/chave validados e replay autorizado ANTES de qualquer efeito (lock por chave).
  v_replay:=platform_private.catalog_entity_replay(v_actor,'set_global_b2b_enabled',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  -- Serialização por item (mesmo lock de linha usado pelos writers de status/apresentações).
  IF p_item_tipo='produto' THEN
    SELECT * INTO v_op FROM public.produtos WHERE id=p_id AND owner_organization_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_b2b_unavailable'; END IF;
    v_old:=pg_catalog.to_jsonb(v_op); v_old_ativo:=COALESCE(v_op.ativo,false); v_old_b2b:=v_op.b2b_enabled; v_old_ver:=v_op.updated_at;
  ELSE
    SELECT * INTO v_om FROM public.microrganismos WHERE id=p_id AND owner_organization_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_b2b_unavailable'; END IF;
    v_old:=pg_catalog.to_jsonb(v_om); v_old_ativo:=v_om.ativo; v_old_b2b:=v_om.b2b_enabled; v_old_ver:=v_om.updated_at;
  END IF;
  IF v_old_ver IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_b2b_conflict'; END IF;
  IF v_old_b2b = p_b2b_enabled THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_b2b_no_change'; END IF;
  IF p_b2b_enabled AND NOT v_old_ativo THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_b2b_requires_active'; END IF;

  -- Apresentações do item: provamos que não mudam (sem sync de preço disparado aqui).
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cv) ORDER BY cv.id),'[]'::jsonb) INTO v_vols_before
    FROM public.catalogo_volumes cv
   WHERE cv.owner_organization_id IS NULL AND ((p_item_tipo='produto' AND cv.produto_id=p_id) OR (p_item_tipo='microrganismo' AND cv.microrganismo_id=p_id));

  IF p_item_tipo='produto' THEN
    UPDATE public.produtos SET b2b_enabled=p_b2b_enabled WHERE id=p_id AND owner_organization_id IS NULL AND updated_at=p_expected_updated_at RETURNING * INTO v_np;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_b2b_confirmation_failed'; END IF;
    v_new:=pg_catalog.to_jsonb(v_np); v_new_ver:=v_np.updated_at;
  ELSE
    UPDATE public.microrganismos SET b2b_enabled=p_b2b_enabled WHERE id=p_id AND owner_organization_id IS NULL AND updated_at=p_expected_updated_at RETURNING * INTO v_nm;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_b2b_confirmation_failed'; END IF;
    v_new:=pg_catalog.to_jsonb(v_nm); v_new_ver:=v_nm.updated_at;
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cv) ORDER BY cv.id),'[]'::jsonb) INTO v_vols_after
    FROM public.catalogo_volumes cv
   WHERE cv.owner_organization_id IS NULL AND ((p_item_tipo='produto' AND cv.produto_id=p_id) OR (p_item_tipo='microrganismo' AND cv.microrganismo_id=p_id));

  -- Confirmação: somente b2b_enabled/updated_at mudaram; versão estritamente crescente.
  -- (produtos usa update_updated_at_column = now(); se a versão não cresce, falha fechada.)
  IF (v_new->>'b2b_enabled')::boolean IS DISTINCT FROM p_b2b_enabled
    OR v_new_ver IS NULL OR v_new_ver <= v_old_ver
    OR (v_old - ARRAY['b2b_enabled','updated_at']) IS DISTINCT FROM (v_new - ARRAY['b2b_enabled','updated_at'])
    OR v_vols_before IS DISTINCT FROM v_vols_after THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_b2b_confirmation_failed'; END IF;

  v_receipt:=pg_catalog.jsonb_build_object('item_tipo',p_item_tipo,'id',p_id,'ativo',v_old_ativo,'b2b_enabled',p_b2b_enabled,
    'updated_at',v_new_ver,'idempotency_key',p_idempotency_key,'audit_id',v_audit,'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'set_global_b2b_enabled',p_reason,p_idempotency_key,v_req,v_receipt,
    pg_catalog.jsonb_build_object('item_tipo',p_item_tipo,'id',p_id,'ativo',v_old_ativo,'b2b_enabled',v_old_b2b,'updated_at',v_old_ver),
    pg_catalog.jsonb_build_object('item_tipo',p_item_tipo,'id',p_id,'ativo',v_old_ativo,'b2b_enabled',p_b2b_enabled,'updated_at',v_new_ver));
  RETURN v_receipt;
END;
$$;

-- ================= create_global_microorganism_core
CREATE OR REPLACE FUNCTION platform_private.create_global_microorganism_core(p_payload jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
      safra_referencia,product_id,owner_organization_id)
    VALUES (v->>'nome',(v->>'tipo')::public.tipo_microrganismo,v->>'nome_cientifico',(v->>'concentracao_ufc_ml')::numeric,v->>'concentracao_label',
      v->>'fornecedor',(v->>'producao_on_farm')::boolean,v->>'meio_cultivo',v->>'funcao_agronomica',v->>'observacoes',v->>'descricao',
      false,false,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)
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
$$;

-- ================= update_global_microorganism_core
CREATE OR REPLACE FUNCTION platform_private.update_global_microorganism_core(p_id uuid, p_expected_updated_at timestamptz, p_patch jsonb,
  p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  SELECT * INTO v_old FROM public.microrganismos WHERE id=p_id AND owner_organization_id IS NULL FOR UPDATE;
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
    WHERE id=p_id AND owner_organization_id IS NULL AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
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
$$;

-- ================= set_global_microorganism_status_core
CREATE OR REPLACE FUNCTION platform_private.set_global_microorganism_status_core(p_id uuid, p_expected_updated_at timestamptz, p_ativo boolean,
  p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_req jsonb; v_replay jsonb; v_old public.microrganismos%ROWTYPE; v_new public.microrganismos%ROWTYPE; v_receipt jsonb;
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_ativo IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  v_req:=pg_catalog.jsonb_build_object('id',p_id,'expected_updated_at',p_expected_updated_at,'ativo',p_ativo,'reason',pg_catalog.btrim(COALESCE(p_reason,'')));
  v_replay:=platform_private.catalog_entity_replay(v_actor,'set_global_microorganism_status',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT * INTO v_old FROM public.microrganismos WHERE id=p_id AND owner_organization_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_entity_unavailable'; END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_conflict'; END IF;
  IF v_old.ativo = p_ativo THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_no_change'; END IF;
  -- Arquivar = ativo false; nunca exclui. b2b_enabled/preços não são tocados.
  UPDATE public.microrganismos SET ativo=p_ativo WHERE id=p_id AND owner_organization_id IS NULL AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
  IF NOT FOUND OR v_new.ativo IS DISTINCT FROM p_ativo OR v_new.updated_at <= v_old.updated_at
    OR (pg_catalog.to_jsonb(v_old) - ARRAY['ativo','updated_at'])
       IS DISTINCT FROM (pg_catalog.to_jsonb(v_new) - ARRAY['ativo','updated_at']) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_confirmation_failed'; END IF;
  v_receipt:=pg_catalog.jsonb_build_object('id',p_id,'ativo',v_new.ativo,'updated_at',v_new.updated_at,
    'idempotency_key',p_idempotency_key,'audit_id',gen_random_uuid(),'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'set_global_microorganism_status',p_reason,p_idempotency_key,v_req,v_receipt,
    pg_catalog.jsonb_build_object('ativo',v_old.ativo,'updated_at',v_old.updated_at),
    pg_catalog.jsonb_build_object('ativo',v_new.ativo,'updated_at',v_new.updated_at));
  RETURN v_receipt;
END;
$$;

-- ================= create_global_culture_core
CREATE OR REPLACE FUNCTION platform_private.create_global_culture_core(p_payload jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v jsonb; v_req jsonb; v_replay jsonb; v_new public.culturas%ROWTYPE; v_receipt jsonb;
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  v:=platform_private.catalog_culture_normalize(p_payload,true);
  v_req:=pg_catalog.jsonb_build_object('payload',v,'reason',pg_catalog.btrim(p_reason));
  v_replay:=platform_private.catalog_entity_replay(v_actor,'create_global_culture',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  -- Unicidade case-insensitive serializada (tabela sem UNIQUE).
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalog-culture-name',0));
  IF EXISTS (SELECT 1 FROM public.culturas WHERE pg_catalog.lower(pg_catalog.btrim(nome))=pg_catalog.lower(v->>'nome')) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='catalog_entity_duplicate'; END IF;
  INSERT INTO public.culturas (nome,descricao,ativo,owner_organization_id) VALUES (v->>'nome',v->>'descricao',false,NULL) RETURNING * INTO v_new;
  IF v_new.id IS NULL OR v_new.ativo THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_confirmation_failed'; END IF;
  v_receipt:=pg_catalog.jsonb_build_object('id',v_new.id,'ativo',false,'updated_at',v_new.updated_at,
    'idempotency_key',p_idempotency_key,'audit_id',gen_random_uuid(),'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'create_global_culture',p_reason,p_idempotency_key,v_req,v_receipt,'{}'::jsonb,
    platform_private.read_global_culture_detail_core(v_new.id));
  RETURN v_receipt;
END;
$$;

-- ================= update_global_culture_core
CREATE OR REPLACE FUNCTION platform_private.update_global_culture_core(p_id uuid, p_expected_updated_at timestamptz, p_patch jsonb,
  p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v jsonb; v_req jsonb; v_replay jsonb; v_old public.culturas%ROWTYPE; v_new public.culturas%ROWTYPE;
  v_before jsonb; v_receipt jsonb; v_keys text[];
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  v:=platform_private.catalog_culture_normalize(p_patch,false);
  v_req:=pg_catalog.jsonb_build_object('id',p_id,'expected_updated_at',p_expected_updated_at,'patch',v,'reason',pg_catalog.btrim(p_reason));
  v_replay:=platform_private.catalog_entity_replay(v_actor,'update_global_culture',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalog-culture-name',0));
  SELECT * INTO v_old FROM public.culturas WHERE id=p_id AND owner_organization_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_entity_unavailable'; END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_conflict'; END IF;
  IF v ? 'nome' AND EXISTS (SELECT 1 FROM public.culturas WHERE id<>p_id
      AND pg_catalog.lower(pg_catalog.btrim(nome))=pg_catalog.lower(v->>'nome')) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='catalog_entity_duplicate'; END IF;
  v_before:=platform_private.read_global_culture_detail_core(p_id);
  SELECT pg_catalog.array_agg(k) INTO v_keys FROM pg_catalog.jsonb_object_keys(v) k;
  UPDATE public.culturas SET
    nome=CASE WHEN v ? 'nome' THEN v->>'nome' ELSE nome END,
    descricao=CASE WHEN v ? 'descricao' THEN v->>'descricao' ELSE descricao END
  WHERE id=p_id AND owner_organization_id IS NULL AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
  IF NOT FOUND OR v_new.id IS DISTINCT FROM p_id OR v_new.updated_at <= v_old.updated_at
    OR (pg_catalog.to_jsonb(v_old) - v_keys - 'updated_at') IS DISTINCT FROM (pg_catalog.to_jsonb(v_new) - v_keys - 'updated_at') THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_confirmation_failed'; END IF;
  v_receipt:=pg_catalog.jsonb_build_object('id',p_id,'ativo',v_new.ativo,'updated_at',v_new.updated_at,
    'idempotency_key',p_idempotency_key,'audit_id',gen_random_uuid(),'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'update_global_culture',p_reason,p_idempotency_key,v_req,v_receipt,v_before,
    platform_private.read_global_culture_detail_core(p_id));
  RETURN v_receipt;
END;
$$;

-- ================= set_global_culture_status_core
CREATE OR REPLACE FUNCTION platform_private.set_global_culture_status_core(p_id uuid, p_expected_updated_at timestamptz, p_ativo boolean,
  p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_req jsonb; v_replay jsonb; v_old public.culturas%ROWTYPE; v_new public.culturas%ROWTYPE; v_receipt jsonb;
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_ativo IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  v_req:=pg_catalog.jsonb_build_object('id',p_id,'expected_updated_at',p_expected_updated_at,'ativo',p_ativo,'reason',pg_catalog.btrim(COALESCE(p_reason,'')));
  v_replay:=platform_private.catalog_entity_replay(v_actor,'set_global_culture_status',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT * INTO v_old FROM public.culturas WHERE id=p_id AND owner_organization_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_entity_unavailable'; END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_conflict'; END IF;
  IF v_old.ativo = p_ativo THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_no_change'; END IF;
  -- desativada_em/desativada_por carimbados pelo trigger existente tg_culturas_stamp_desativacao.
  UPDATE public.culturas SET ativo=p_ativo WHERE id=p_id AND owner_organization_id IS NULL AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
  IF NOT FOUND OR v_new.ativo IS DISTINCT FROM p_ativo OR v_new.updated_at <= v_old.updated_at
    OR (pg_catalog.to_jsonb(v_old) - ARRAY['ativo','updated_at','desativada_em','desativada_por'])
       IS DISTINCT FROM (pg_catalog.to_jsonb(v_new) - ARRAY['ativo','updated_at','desativada_em','desativada_por']) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_confirmation_failed'; END IF;
  v_receipt:=pg_catalog.jsonb_build_object('id',p_id,'ativo',v_new.ativo,'updated_at',v_new.updated_at,
    'idempotency_key',p_idempotency_key,'audit_id',gen_random_uuid(),'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'set_global_culture_status',p_reason,p_idempotency_key,v_req,v_receipt,
    pg_catalog.jsonb_build_object('ativo',v_old.ativo,'updated_at',v_old.updated_at,'desativada_em',v_old.desativada_em,'desativada_por',v_old.desativada_por),
    pg_catalog.jsonb_build_object('ativo',v_new.ativo,'updated_at',v_new.updated_at,'desativada_em',v_new.desativada_em,'desativada_por',v_new.desativada_por));
  RETURN v_receipt;
END;
$$;


-- =====================================================================================
-- Descendentes diretos: microrganismo.product_id e composição herdam o owner do pai.
-- RLS não depende de client DML; writers DEFINER seguem sendo a única escrita.
CREATE FUNCTION platform_private.catalog_owner_guard_micro_product() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_product_owner uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.owner_organization_id IS DISTINCT FROM OLD.owner_organization_id THEN
    RAISE EXCEPTION 'catalog_owner_immutable' USING ERRCODE='42501'; END IF;
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  SELECT owner_organization_id INTO v_product_owner FROM public.produtos WHERE id=NEW.product_id FOR KEY SHARE;
  IF NOT FOUND OR v_product_owner IS DISTINCT FROM NEW.owner_organization_id THEN
    RAISE EXCEPTION 'catalog_cross_owner_reference' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_owner_guard_micro_product() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_catalog_owner_micro_product BEFORE INSERT OR UPDATE OF product_id,owner_organization_id ON public.microrganismos
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_owner_guard_micro_product();

CREATE FUNCTION platform_private.catalog_composition_parent_owner(p_product uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT owner_organization_id FROM public.produtos WHERE id=p_product
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_composition_parent_owner(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION platform_private.catalog_composition_owner_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owner uuid; v_micro_owner uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.produto_id IS DISTINCT FROM OLD.produto_id THEN
    RAISE EXCEPTION 'catalog_parent_immutable' USING ERRCODE='42501'; END IF;
  SELECT owner_organization_id INTO v_owner FROM public.produtos WHERE id=NEW.produto_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'catalog_cross_owner_reference' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='produto_composicao_declaracoes' AND NEW.microrganismo_id IS NOT NULL THEN
    SELECT owner_organization_id INTO v_micro_owner FROM public.microrganismos WHERE id=NEW.microrganismo_id FOR KEY SHARE;
    IF NOT FOUND OR v_micro_owner IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION 'catalog_cross_owner_reference' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_composition_owner_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_catalog_composition_owner_guard BEFORE INSERT OR UPDATE OF produto_id ON public.produto_composicao_conjuntos
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_composition_owner_guard();
CREATE TRIGGER trg_catalog_composition_owner_guard BEFORE INSERT OR UPDATE OF produto_id,microrganismo_id ON public.produto_composicao_declaracoes
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_composition_owner_guard();

CREATE POLICY catalog_composition_parent_scope ON public.produto_composicao_conjuntos AS RESTRICTIVE FOR SELECT TO authenticated
USING (platform_private.catalog_composition_parent_owner(produto_id) IS NOT DISTINCT FROM platform_private.catalog_reader_org()
       OR platform_private.catalog_composition_parent_owner(produto_id) IS NULL);
CREATE POLICY catalog_composition_declaration_parent_scope ON public.produto_composicao_declaracoes AS RESTRICTIVE FOR SELECT TO authenticated
USING (platform_private.catalog_composition_parent_owner(produto_id) IS NOT DISTINCT FROM platform_private.catalog_reader_org()
       OR platform_private.catalog_composition_parent_owner(produto_id) IS NULL);

-- =====================================================================================
-- Apresentações/dose/preço próprios: uma transação, CAS, idempotência e ledger; sem DML de cliente.
CREATE FUNCTION platform_private.catalog_owned_presentation_mutate_core(
  p_operation text, p_parent_id uuid, p_presentation_id uuid, p_expected_updated_at timestamptz,
  p_payload jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_uid uuid:=auth.uid(); v_org uuid; v_parent public.produtos%ROWTYPE; v_old public.catalogo_volumes%ROWTYPE;
  v_new public.catalogo_volumes%ROWTYPE; v_payload jsonb:=COALESCE(p_payload,'{}'::jsonb); v_hash text; v_prev public.catalog_tenant_owned_ledger%ROWTYPE;
  v_before jsonb; v_after jsonb; v_result jsonb; v_volume numeric; v_price numeric; v_reason text:=btrim(COALESCE(p_reason,''));
BEGIN
  IF NOT platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'catalog_ownership_disabled' USING ERRCODE='55000'; END IF;
  v_org:=platform_private.catalog_tenant_actor('mutate');
  IF (p_operation IN ('create','update','archive','restore')) IS NOT TRUE OR p_parent_id IS NULL OR p_idempotency_key IS NULL
     OR char_length(v_reason) NOT BETWEEN 10 AND 500 OR jsonb_typeof(v_payload) IS DISTINCT FROM 'object'
     OR EXISTS(SELECT 1 FROM jsonb_object_keys(v_payload) k WHERE k NOT IN ('volume_ml','rotulo','preco_brl','ordem')) THEN
    RAISE EXCEPTION 'catalog_owned_presentation_invalid' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text||':'||v_org::text||':'||p_idempotency_key::text,0));
  v_hash:=encode(sha256(convert_to(jsonb_build_object('operation',p_operation,'parent',p_parent_id,'id',p_presentation_id,
    'expected',p_expected_updated_at,'payload',v_payload,'reason',v_reason)::text,'UTF8')),'hex');
  SELECT * INTO v_prev FROM public.catalog_tenant_owned_ledger WHERE actor_id=v_uid AND organization_id=v_org AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_prev.payload_hash IS DISTINCT FROM v_hash OR v_prev.operation<>'presentation' THEN RAISE EXCEPTION 'catalog_owned_idempotency_conflict' USING ERRCODE='40001'; END IF;
    RETURN v_prev.result||jsonb_build_object('replayed',true);
  END IF;
  SELECT * INTO v_parent FROM public.produtos WHERE id=p_parent_id AND owner_organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'catalog_owned_not_found' USING ERRCODE='P0002'; END IF;
  IF p_operation='create' THEN
    IF p_presentation_id IS NOT NULL OR p_expected_updated_at IS NOT NULL OR jsonb_typeof(v_payload->'volume_ml') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_payload->'preco_brl') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'catalog_owned_presentation_invalid' USING ERRCODE='22023'; END IF;
    v_volume:=(v_payload->>'volume_ml')::numeric; v_price:=(v_payload->>'preco_brl')::numeric;
    IF v_volume<=0 OR v_volume>1000000 OR scale(v_volume)>6 OR v_price<0 OR v_price>1000000000 OR scale(v_price)>2 THEN
      RAISE EXCEPTION 'catalog_owned_presentation_invalid' USING ERRCODE='22023'; END IF;
    INSERT INTO public.catalogo_volumes(item_tipo,produto_id,volume_ml,rotulo,preco_brl,moeda,ativo,ordem,owner_organization_id)
    VALUES('produto',p_parent_id,v_volume,NULLIF(btrim(v_payload->>'rotulo'),''),v_price,'BRL',true,COALESCE((v_payload->>'ordem')::int,0),v_org)
    RETURNING * INTO v_new;
    v_before:=NULL;
  ELSE
    SELECT * INTO v_old FROM public.catalogo_volumes WHERE id=p_presentation_id AND produto_id=p_parent_id AND owner_organization_id=v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'catalog_owned_not_found' USING ERRCODE='P0002'; END IF;
    IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'catalog_owned_conflict' USING ERRCODE='40001'; END IF;
    v_before:=to_jsonb(v_old);
    IF p_operation='update' THEN
      v_volume:=COALESCE((v_payload->>'volume_ml')::numeric,v_old.volume_ml); v_price:=COALESCE((v_payload->>'preco_brl')::numeric,v_old.preco_brl);
      IF v_volume<=0 OR v_volume>1000000 OR scale(v_volume)>6 OR v_price<0 OR v_price>1000000000 OR scale(v_price)>2 THEN RAISE EXCEPTION 'catalog_owned_presentation_invalid' USING ERRCODE='22023'; END IF;
      UPDATE public.catalogo_volumes SET volume_ml=v_volume,preco_brl=v_price,
        rotulo=CASE WHEN v_payload?'rotulo' THEN NULLIF(btrim(v_payload->>'rotulo'),'') ELSE rotulo END,
        ordem=CASE WHEN v_payload?'ordem' THEN (v_payload->>'ordem')::int ELSE ordem END
       WHERE id=v_old.id AND owner_organization_id=v_org AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
    ELSE
      IF v_payload<>'{}'::jsonb THEN RAISE EXCEPTION 'catalog_owned_presentation_invalid' USING ERRCODE='22023'; END IF;
      UPDATE public.catalogo_volumes SET ativo=(p_operation='restore') WHERE id=v_old.id AND owner_organization_id=v_org AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.catalogo_volumes x WHERE x.id<>v_new.id AND x.produto_id=p_parent_id AND x.owner_organization_id=v_org
      AND x.ativo AND v_new.ativo AND x.volume_ml=v_new.volume_ml) THEN RAISE EXCEPTION 'catalog_owned_presentation_duplicate' USING ERRCODE='23505'; END IF;
  v_after:=to_jsonb(v_new); v_result:=jsonb_build_object('id',v_new.id,'parent_id',p_parent_id,'updated_at',v_new.updated_at,
    'preco_litro_brl',v_new.preco_litro_brl,'valor_dose_100ml_brl',v_new.valor_dose_100ml_brl,'replayed',false);
  INSERT INTO public.catalog_tenant_owned_ledger(organization_id,actor_id,entity_type,entity_id,operation,idempotency_key,payload_hash,reason,before_state,after_state,result)
  VALUES(v_org,v_uid,'produto',p_parent_id,'presentation',p_idempotency_key,v_hash,v_reason,v_before,v_after,v_result);
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION platform_private.catalog_owned_presentation_mutate_core(text,uuid,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.catalog_owned_presentation_mutate_core(text,uuid,uuid,timestamptz,jsonb,text,uuid) TO authenticated;
CREATE FUNCTION public.tenant_catalog_owned_presentation_mutate(text,uuid,uuid,timestamptz,jsonb,text,uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT platform_private.catalog_owned_presentation_mutate_core($1,$2,$3,$4,$5,$6,$7) $$;
REVOKE ALL ON FUNCTION public.tenant_catalog_owned_presentation_mutate(text,uuid,uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_catalog_owned_presentation_mutate(text,uuid,uuid,timestamptz,jsonb,text,uuid) TO authenticated;

-- O gate nunca é aberto pelo candidato.
DO $$ BEGIN IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership05_gate_must_remain_off'; END IF; END $$;
COMMIT;
