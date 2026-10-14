-- CANDIDATO NÃO APLICADO — revisão Codex obrigatória antes de qualquer DDL.
-- Projeto canônico exclusivo: swzpzcwiasxmjutrmvkm. Não executar em outro ref.
-- Escopo: criação global (produto + composição de microrganismos, atômica) e
-- ativação/arquivamento global por Platform Superadmin ativo/readiness/JWT.
-- Fora do escopo: preços, b2b_enabled, famílias novas (B1/B2), insumos na
-- composição, edição de composição de produto existente, tenants, exclusão.
-- Reaproveita: catalog_platform_admin_audit (ledger restrito + correlation
-- UNIQUE), platform_private.catalog_metadata_require_actor() (ator validado),
-- trigger set_codigo_produto/proximo_codigo (código servidor sob concorrência).
BEGIN;

-- Preflight fail-closed: aborta se o schema real divergir do contrato revisado.
DO $$
BEGIN
  IF to_regprocedure('platform_private.catalog_metadata_require_actor()') IS NULL THEN
    RAISE EXCEPTION 'lifecycle_requires_metadata_actor_helper';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='produtos' AND column_name IN ('organization_id','owner_organization_id','familia')) THEN
    RAISE EXCEPTION 'lifecycle_global_scope_requires_review';
  END IF;
  IF (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public'
    AND table_name='formulacoes' AND column_name='microrganismo_id') <> 'NO' THEN
    RAISE EXCEPTION 'lifecycle_composition_contract_requires_review';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.produtos'::regclass
    AND tgname IN ('trg_set_codigo_produto_ins','trg_set_codigo_produto_upd') AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'lifecycle_code_trigger_requires_review';
  END IF;
END;
$$;

ALTER TABLE public.catalog_platform_admin_audit DROP CONSTRAINT catalog_platform_admin_audit_operation_check;
ALTER TABLE public.catalog_platform_admin_audit ADD CONSTRAINT catalog_platform_admin_audit_operation_check
  CHECK (operation IN ('wipe_global_products','update_global_product_metadata',
    'create_global_product','set_global_product_status'));

CREATE POLICY catalog_lifecycle_audit_active_read ON public.catalog_platform_admin_audit
AS RESTRICTIVE FOR SELECT TO authenticated USING (
  operation NOT IN ('create_global_product','set_global_product_status') OR (
    auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'superadmin'::public.app_role)
    AND public.is_platform_superadmin(auth.uid()) AND platform_private.platform_actor_access_ready(auth.uid())
  )
);

CREATE FUNCTION platform_private.catalog_lifecycle_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF OLD.operation IN ('create_global_product','set_global_product_status')
    OR NEW.operation IN ('create_global_product','set_global_product_status') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_lifecycle_audit_immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_lifecycle_audit_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER catalog_lifecycle_audit_immutable BEFORE UPDATE OR DELETE ON public.catalog_platform_admin_audit
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_lifecycle_audit_immutable();

-- ---------------------------------------------------------------- criação
CREATE FUNCTION platform_private.create_global_product_core(
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
  SELECT count(*) INTO v_count FROM (SELECT 1 FROM public.microrganismos WHERE id=ANY(v_ids) FOR KEY SHARE) s;
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
REVOKE ALL ON FUNCTION platform_private.create_global_product_core(jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.create_global_product_core(jsonb,text,uuid) TO authenticated;
CREATE FUNCTION public.platform_create_global_product(p_payload jsonb, p_reason text, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT platform_private.create_global_product_core(p_payload,p_reason,p_idempotency_key);
$$;
REVOKE ALL ON FUNCTION public.platform_create_global_product(jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_create_global_product(jsonb,text,uuid) TO authenticated;
-- ------------------------------------------------------ ativar/arquivar
CREATE FUNCTION platform_private.set_global_product_status_core(
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
  SELECT * INTO v_old FROM public.produtos WHERE id=p_id FOR UPDATE;
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
  WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
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
REVOKE ALL ON FUNCTION platform_private.set_global_product_status_core(uuid,timestamptz,boolean,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.set_global_product_status_core(uuid,timestamptz,boolean,text,uuid) TO authenticated;
CREATE FUNCTION public.platform_set_global_product_status(p_id uuid, p_expected_updated_at timestamptz, p_ativo boolean, p_reason text, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT platform_private.set_global_product_status_core(p_id,p_expected_updated_at,p_ativo,p_reason,p_idempotency_key);
$$;
REVOKE ALL ON FUNCTION public.platform_set_global_product_status(uuid,timestamptz,boolean,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_set_global_product_status(uuid,timestamptz,boolean,text,uuid) TO authenticated;

ROLLBACK;

-- Reviewer test plan (BEGIN/ROLLBACK, claims reais; nada persiste):
-- N1 anon/FinanceiroAR/AdminAR/AdminFSF/ConsultorAR (inclusive user_metadata.role=superadmin) → 42501 nas duas RPCs.
-- N2 Superadmin inativo / readiness false / iat 0 / exp vencido → 42501.
-- N3 payload com chave extra (valor_dose_brl, b2b_enabled, ativo, codigo) → 22023.
-- N4 tipo fora do enum, nome vazio, dose 0/-1/1e7/7 casas, volume 0, microrganismo duplicado/inexistente → 22023, zero linhas.
-- P1 criar com 2 microrganismos → 1 produto inativo, b2b false, preços NULL, código PREFIXO-N, 2 formulacoes, 1 audit.
-- P2 replay mesma chave/payload → mesmo id, idempotent=true, nenhuma linha nova; payload divergente → 40001.
-- P3 duas sessões concorrentes do mesmo tipo → códigos distintos (proximo_codigo upsert).
-- P4 falha no 2º INSERT de formulacoes (FK forçada) → produto também revertido (atomicidade).
-- P5 status: arquivar/reativar com updated_at correto; stale → 40001; sem mudança → 22023; demais colunas invariantes.
-- PREFLIGHT pendente: confirmar que sync_product_pricing/trg_mestre_guard_preco_canonico não preenchem preços no INSERT (senão P1 falha por desenho).
-- P6 composição: item array/escalar, sem volume_ml, volume null, microrganismo_id null/maiúsculo/sem hífens → 22023.
-- P7 payload array/escalar/null → 22023 (não erro genérico de jsonb_object_keys).
-- P8 ledger 'after' contém produto + IDs de formulacoes iguais aos persistidos.
-- Rollback de CONTENÇÃO pós-aplicação (preserva histórico): REVOKE EXECUTE das 2 RPCs públicas e dos 2 cores
-- de authenticated; manter ledger, CHECK ampliado, policy de leitura restrita e trigger de imutabilidade.
-- Nunca DELETE/UPDATE em catalog_platform_admin_audit; nunca DROP das linhas criadas.
