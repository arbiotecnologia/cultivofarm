-- CANDIDATO INCREMENTAL NÃO APLICADO — revisão Codex antes de DDL. Ref exclusivo swzpzcwiasxmjutrmvkm.
-- (1) Leitor mínimo Superadmin de microrganismos (id/codigo/nome/ativo), busca limitada e paginação.
-- (2) create_global_product_core passa a exigir microrganismo ativo, com FOR SHARE.
-- Sem grants de tabela, sem policies novas, sem mutação de composições existentes.
BEGIN;
DO $$
BEGIN
  IF to_regprocedure('platform_private.create_global_product_core(jsonb,text,uuid)') IS NULL
    OR to_regprocedure('platform_private.catalog_metadata_require_actor()') IS NULL THEN
    RAISE EXCEPTION 'composition_reader_requires_lifecycle';
  END IF;
  IF (SELECT data_type||':'||is_nullable FROM information_schema.columns WHERE table_schema='public'
    AND table_name='microrganismos' AND column_name='ativo') IS DISTINCT FROM 'boolean:NO'
    OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
    AND table_name='microrganismos' AND column_name IN ('id','codigo','nome')) <> 3 THEN
    RAISE EXCEPTION 'composition_reader_schema_requires_review';
  END IF;
END;
$$;

CREATE FUNCTION platform_private.read_global_microorganisms_core(p_search text, p_limit integer, p_offset integer, p_only_active boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_search text; v_items jsonb; v_count int;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000
    OR p_only_active IS NULL OR pg_catalog.char_length(COALESCE(p_search,'')) > 120 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_micro_invalid';
  END IF;
  v_search:=pg_catalog.btrim(COALESCE(p_search,''));
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',m.id,'codigo',m.codigo,'nome',m.nome,'ativo',m.ativo)
    ORDER BY m.nome, m.id),'[]'::jsonb), count(*)
  INTO v_items, v_count FROM (
    SELECT id,codigo,nome,ativo FROM public.microrganismos
    WHERE (NOT p_only_active OR ativo IS TRUE)
      AND (v_search='' OR pg_catalog.strpos(pg_catalog.lower(nome),pg_catalog.lower(v_search))>0
        OR pg_catalog.strpos(pg_catalog.lower(COALESCE(codigo,'')),pg_catalog.lower(v_search))>0)
    ORDER BY nome, id LIMIT p_limit+1 OFFSET p_offset) m;
  -- has_more por sentinela (limit+1), itens cortados ao limite.
  RETURN pg_catalog.jsonb_build_object('items',
    CASE WHEN v_count>p_limit THEN v_items - p_limit ELSE v_items END,'has_more',v_count>p_limit);
END;
$$;
REVOKE ALL ON FUNCTION platform_private.read_global_microorganisms_core(text,integer,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.read_global_microorganisms_core(text,integer,integer,boolean) TO authenticated;
CREATE FUNCTION public.platform_read_global_microorganisms(p_search text, p_limit integer, p_offset integer, p_only_active boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT platform_private.read_global_microorganisms_core(p_search,p_limit,p_offset,p_only_active);
$$;
REVOKE ALL ON FUNCTION public.platform_read_global_microorganisms(text,integer,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_read_global_microorganisms(text,integer,integer,boolean) TO authenticated;

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
  -- FOR SHARE bloqueia UPDATE concorrente (inclusive de ativo) até o fim da transação;
  -- só microrganismos ATIVOS entram em novas composições. Históricas não são tocadas.
  SELECT count(*) INTO v_count FROM (SELECT 1 FROM public.microrganismos WHERE id=ANY(v_ids) AND ativo IS TRUE FOR SHARE) s;
  IF v_count <> pg_catalog.cardinality(v_ids) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_create_invalid'; END IF;

  -- Novo item nasce INATIVO e fora do B2B; preços NULL (motor canônico decide depois);
  -- código NULL → trigger set_codigo_produto/proximo_codigo (upsert serializado).
  INSERT INTO public.produtos (nome,tipo,descricao,modo_acao,funcao_completa,modo_aplicacao,dose_ml_ha,
    ativo,b2b_enabled,codigo,valor_dose_brl,valor_litro_brl,valor_ha_brl)
  VALUES (pg_catalog.btrim(p_payload->>'nome'),(p_payload->>'tipo')::public.tipo_produto,
    p_payload->>'descricao',p_payload->>'modo_acao',p_payload->>'funcao_completa',p_payload->>'modo_aplicacao',
    v_dose,false,false,NULL,NULL,NULL,NULL)
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

ROLLBACK;

-- Reviewer test plan (BEGIN/ROLLBACK, claims reais):
-- N1 anon/tenant (FinanceiroAR/AdminAR/AdminFSF/ConsultorAR) e Superadmin sem readiness → 42501 no leitor.
-- N2 limit 0/51, offset -1, busca 121 chars → 22023.
-- N3 criar com microrganismo inativo → 22023, zero linhas; desativação concorrente bloqueia até commit (2 conexões).
-- P1 leitor só devolve id/codigo/nome/ativo; has_more correto; busca por nome/código; ordem estável.
-- P2 criação com ativo continua idêntica ao aplicado (replay, snapshot, ledger).
-- Rollback de contenção: REVOKE EXECUTE do leitor (público e core); para o create core, CREATE OR REPLACE com o corpo
-- arquivado em applied-platform-global-catalog-lifecycle.sql. Nada é apagado.
