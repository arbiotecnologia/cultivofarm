-- CANDIDATO NÃO APLICADO — gestão GLOBAL de microrganismos e culturas pelo Platform Superadmin.
-- Alvo exclusivo: swzpzcwiasxmjutrmvkm. Revisão/aplicação: Codex. Não executar a partir do Lovable.
-- Padrão: public SECURITY INVOKER -> platform_private SECURITY DEFINER; ator via
-- platform_private.catalog_metadata_require_actor(); ledger existente public.catalog_platform_admin_audit.
-- Sem grants DML, sem exclusão física, sem SQL dinâmico, sem campos de preço/B2B/código/produto/tenant no payload.
-- Políticas de 20261014185551 (INSERT/UPDATE/DELETE RESTRICTIVE) permanecem; funções DEFINER são o único escritor SA.

-- ---------------------------------------------------------------- preflight exato (fail-closed)
DO $$
DECLARE v_chk text;
BEGIN
  IF to_regprocedure('platform_private.catalog_metadata_require_actor()') IS NULL
    OR to_regprocedure('platform_private.read_global_microorganisms_core(text,integer,integer,boolean)') IS NULL THEN
    RAISE EXCEPTION 'mc_preflight_helpers_missing';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name IN ('microrganismos','culturas')
      AND column_name IN ('updated_at','organization_id','owner_organization_id','tenant_id','familia')) THEN
    RAISE EXCEPTION 'mc_preflight_columns_changed';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='microrganismos') <> 22
    OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='culturas') <> 7 THEN
    RAISE EXCEPTION 'mc_preflight_column_count_changed';
  END IF;
  -- Conjunto EXATO: nenhum trigger extra além dos auditados (4 em microrganismos, 2 em culturas).
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.microrganismos'::regclass AND NOT tgisinternal) <> 4
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.culturas'::regclass AND NOT tgisinternal) <> 2
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.microrganismos'::regclass AND NOT tgisinternal
      AND tgname IN ('trg_set_codigo_micro_ins','trg_set_codigo_micro_upd','trg_sync_microorganism_pricing','trg_zz_microrganismos_guard_preco')) <> 4
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.culturas'::regclass AND NOT tgisinternal
      AND tgname IN ('trg_culturas_block_delete_in_use','trg_culturas_stamp_desativacao')) <> 2 THEN
    RAISE EXCEPTION 'mc_preflight_triggers_changed';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_chk FROM pg_constraint
   WHERE conrelid='public.catalog_platform_admin_audit'::regclass AND conname='catalog_platform_admin_audit_operation_check';
  IF v_chk IS NULL OR v_chk NOT LIKE '%set_global_product_status%' OR v_chk LIKE '%microorganism%' OR v_chk LIKE '%culture%' THEN
    RAISE EXCEPTION 'mc_preflight_ledger_changed';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT pg_catalog.lower(pg_catalog.btrim(nome)) n FROM public.culturas GROUP BY 1 HAVING count(*)>1) d) THEN
    RAISE EXCEPTION 'mc_preflight_culture_duplicates';
  END IF;
END;
$$;

-- ---------------------------------------------------------------- versão segura (CAS)
-- Existentes recebem o instante da migração; trigger garante versão estritamente crescente
-- inclusive para escritores legados internos (sync de preço), tornando CAS confiável.
ALTER TABLE public.microrganismos ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.culturas ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE FUNCTION platform_private.catalog_touch_version() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  NEW.updated_at := GREATEST(pg_catalog.clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_touch_version() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trg_zzz_microrganismos_touch_version BEFORE UPDATE ON public.microrganismos
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_touch_version();
CREATE TRIGGER trg_zzz_culturas_touch_version BEFORE UPDATE ON public.culturas
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_touch_version();

-- ---------------------------------------------------------------- ledger: whitelist explícita
ALTER TABLE public.catalog_platform_admin_audit DROP CONSTRAINT catalog_platform_admin_audit_operation_check;
ALTER TABLE public.catalog_platform_admin_audit ADD CONSTRAINT catalog_platform_admin_audit_operation_check
  CHECK (operation IN ('wipe_global_products','update_global_product_metadata','create_global_product','set_global_product_status',
    'create_global_microorganism','update_global_microorganism','set_global_microorganism_status',
    'create_global_culture','update_global_culture','set_global_culture_status'));
CREATE POLICY catalog_entities_audit_active_read ON public.catalog_platform_admin_audit
AS RESTRICTIVE FOR SELECT TO authenticated USING (
  operation NOT IN ('create_global_microorganism','update_global_microorganism','set_global_microorganism_status',
    'create_global_culture','update_global_culture','set_global_culture_status') OR (
    auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'superadmin'::public.app_role)
    AND public.is_platform_superadmin(auth.uid()) AND platform_private.platform_actor_access_ready(auth.uid())));
CREATE FUNCTION platform_private.catalog_entities_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF OLD.operation LIKE '%\_global\_microorganism%' OR OLD.operation LIKE '%\_global\_culture%'
    OR NEW.operation LIKE '%\_global\_microorganism%' OR NEW.operation LIKE '%\_global\_culture%' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_entities_audit_immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_entities_audit_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER catalog_entities_audit_immutable BEFORE UPDATE OR DELETE ON public.catalog_platform_admin_audit
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_entities_audit_immutable();

-- ---------------------------------------------------------------- validadores (whitelist explícita)
-- Retorna objeto normalizado; qualquer chave fora da lista, tipo errado ou limite excedido aborta.
CREATE FUNCTION platform_private.catalog_micro_normalize(p jsonb, p_create boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text; v_out jsonb:='{}'::jsonb; v_num numeric;
  v_text constant jsonb:='{"nome_cientifico":300,"concentracao_label":120,"fornecedor":200,"meio_cultivo":5000,"funcao_agronomica":5000,"observacoes":5000,"descricao":5000}';
BEGIN
  IF p IS NULL OR pg_catalog.jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  FOR k IN SELECT pg_catalog.jsonb_object_keys(p) LOOP
    IF k = 'nome' THEN
      IF pg_catalog.jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR pg_catalog.char_length(pg_catalog.btrim(p->>k)) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
      v_out:=v_out||pg_catalog.jsonb_build_object(k,pg_catalog.btrim(p->>k));
    ELSIF k = 'tipo' THEN
      -- tipo define prefixo do código gerado no servidor: somente na criação.
      IF NOT p_create OR pg_catalog.jsonb_typeof(p->k) IS DISTINCT FROM 'string'
        OR NOT ((p->>k) = ANY(pg_catalog.enum_range(NULL::public.tipo_microrganismo)::text[])) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
      v_out:=v_out||pg_catalog.jsonb_build_object(k,p->>k);
    ELSIF k = 'producao_on_farm' THEN
      IF pg_catalog.jsonb_typeof(p->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
      v_out:=v_out||pg_catalog.jsonb_build_object(k,p->k);
    ELSIF k = 'concentracao_ufc_ml' THEN
      IF pg_catalog.jsonb_typeof(p->k)='null' THEN v_out:=v_out||pg_catalog.jsonb_build_object(k,NULL::numeric);
      ELSE
        IF pg_catalog.jsonb_typeof(p->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
        v_num:=(p->>k)::numeric;
        -- Limite alinhado ao front: <= 9007199254740991 (Number.MAX_SAFE_INTEGER) e até 2 casas, sem notação exponencial.
        IF v_num <= 0 OR v_num > 9007199254740991 OR pg_catalog.scale(v_num) > 2 OR (p->>k) ~* 'e' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
        v_out:=v_out||pg_catalog.jsonb_build_object(k,v_num);
      END IF;
    ELSIF v_text ? k THEN
      IF pg_catalog.jsonb_typeof(p->k)='null' THEN v_out:=v_out||pg_catalog.jsonb_build_object(k,NULL::text);
      ELSIF pg_catalog.jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR pg_catalog.char_length(p->>k) > (v_text->>k)::int THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid';
      ELSE v_out:=v_out||pg_catalog.jsonb_build_object(k,NULLIF(pg_catalog.btrim(p->>k),''));
      END IF;
    ELSE RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid';
    END IF;
  END LOOP;
  IF p_create AND NOT (v_out ? 'nome' AND v_out ? 'tipo' AND v_out ? 'producao_on_farm') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  IF NOT p_create AND v_out = '{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  RETURN v_out;
END;
$$;
CREATE FUNCTION platform_private.catalog_culture_normalize(p jsonb, p_create boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text; v_out jsonb:='{}'::jsonb;
BEGIN
  IF p IS NULL OR pg_catalog.jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  FOR k IN SELECT pg_catalog.jsonb_object_keys(p) LOOP
    IF k = 'nome' AND pg_catalog.jsonb_typeof(p->k)='string' AND pg_catalog.char_length(pg_catalog.btrim(p->>k)) BETWEEN 1 AND 120 THEN
      v_out:=v_out||pg_catalog.jsonb_build_object(k,pg_catalog.btrim(p->>k));
    ELSIF k = 'descricao' AND pg_catalog.jsonb_typeof(p->k)='null' THEN v_out:=v_out||pg_catalog.jsonb_build_object(k,NULL::text);
    ELSIF k = 'descricao' AND pg_catalog.jsonb_typeof(p->k)='string' AND pg_catalog.char_length(p->>k) <= 2000 THEN
      v_out:=v_out||pg_catalog.jsonb_build_object(k,NULLIF(pg_catalog.btrim(p->>k),''));
    ELSE RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid';
    END IF;
  END LOOP;
  IF (p_create AND NOT v_out ? 'nome') OR (NOT p_create AND v_out='{}'::jsonb) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_micro_normalize(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION platform_private.catalog_culture_normalize(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;

-- Guard comum de motivo/chave + replay autorizado ANTES de qualquer efeito.
CREATE FUNCTION platform_private.catalog_entity_replay(p_actor uuid, p_operation text, p_request jsonb, p_reason text, p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_existing public.catalog_platform_admin_audit%ROWTYPE;
BEGIN
  IF p_key IS NULL OR p_reason IS NULL OR pg_catalog.char_length(pg_catalog.btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('catalog-metadata:'||p_key::text,0));
  SELECT * INTO v_existing FROM public.catalog_platform_admin_audit WHERE correlation_id=p_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_existing.actor_id IS DISTINCT FROM p_actor OR v_existing.operation IS DISTINCT FROM p_operation
    OR v_existing.counts_after->'request' IS DISTINCT FROM p_request THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_conflict'; END IF;
  RETURN (v_existing.counts_after->'receipt')||pg_catalog.jsonb_build_object('idempotent',true);
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_entity_replay(uuid,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION platform_private.catalog_entity_audit(p_actor uuid, p_operation text, p_reason text, p_key uuid,
  p_request jsonb, p_receipt jsonb, p_before jsonb, p_after jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  INSERT INTO public.catalog_platform_admin_audit (id,operation,actor_id,reason,correlation_id,status,counts_before,counts_after,completed_at)
  VALUES ((p_receipt->>'audit_id')::uuid,p_operation,p_actor,pg_catalog.btrim(p_reason),p_key,'completed',COALESCE(p_before,'{}'::jsonb),
    pg_catalog.jsonb_build_object('request',p_request,'receipt',p_receipt,'after',p_after),pg_catalog.clock_timestamp());
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_entity_audit(uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------- leitores
CREATE FUNCTION platform_private.read_global_microorganism_detail_core(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
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
$$;
CREATE FUNCTION platform_private.read_global_cultures_core(p_search text, p_limit integer, p_offset integer) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_search text; v_items jsonb; v_count int;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000
    OR pg_catalog.char_length(COALESCE(p_search,'')) > 120 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  v_search:=pg_catalog.btrim(COALESCE(p_search,''));
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',c.id,'nome',c.nome,'ativo',c.ativo) ORDER BY c.nome,c.id),'[]'::jsonb), count(*)
  INTO v_items, v_count FROM (SELECT id,nome,ativo FROM public.culturas
    WHERE v_search='' OR pg_catalog.strpos(pg_catalog.lower(nome),pg_catalog.lower(v_search))>0
    ORDER BY nome,id LIMIT p_limit+1 OFFSET p_offset) c;
  RETURN pg_catalog.jsonb_build_object('items',CASE WHEN v_count>p_limit THEN v_items - p_limit ELSE v_items END,'has_more',v_count>p_limit);
END;
$$;
CREATE FUNCTION platform_private.read_global_culture_detail_core(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_invalid'; END IF;
  SELECT pg_catalog.jsonb_build_object('id',c.id,'nome',c.nome,'descricao',c.descricao,'ativo',c.ativo,'updated_at',c.updated_at,
    'desativada_em',c.desativada_em)
  INTO v FROM public.culturas c WHERE c.id=p_id;
  IF v IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_entity_unavailable'; END IF;
  RETURN v;
END;
$$;

-- ---------------------------------------------------------------- microrganismos: criar / editar / status
CREATE FUNCTION platform_private.create_global_microorganism_core(p_payload jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb
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
$$;

CREATE FUNCTION platform_private.update_global_microorganism_core(p_id uuid, p_expected_updated_at timestamptz, p_patch jsonb,
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
  SELECT * INTO v_old FROM public.microrganismos WHERE id=p_id FOR UPDATE;
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
    WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
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

CREATE FUNCTION platform_private.set_global_microorganism_status_core(p_id uuid, p_expected_updated_at timestamptz, p_ativo boolean,
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
  SELECT * INTO v_old FROM public.microrganismos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_entity_unavailable'; END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_conflict'; END IF;
  IF v_old.ativo = p_ativo THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_no_change'; END IF;
  -- Arquivar = ativo false; nunca exclui. b2b_enabled/preços não são tocados.
  UPDATE public.microrganismos SET ativo=p_ativo WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
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

-- ---------------------------------------------------------------- culturas: criar / editar / status
CREATE FUNCTION platform_private.create_global_culture_core(p_payload jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb
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
  INSERT INTO public.culturas (nome,descricao,ativo) VALUES (v->>'nome',v->>'descricao',false) RETURNING * INTO v_new;
  IF v_new.id IS NULL OR v_new.ativo THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_confirmation_failed'; END IF;
  v_receipt:=pg_catalog.jsonb_build_object('id',v_new.id,'ativo',false,'updated_at',v_new.updated_at,
    'idempotency_key',p_idempotency_key,'audit_id',gen_random_uuid(),'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'create_global_culture',p_reason,p_idempotency_key,v_req,v_receipt,'{}'::jsonb,
    platform_private.read_global_culture_detail_core(v_new.id));
  RETURN v_receipt;
END;
$$;

CREATE FUNCTION platform_private.update_global_culture_core(p_id uuid, p_expected_updated_at timestamptz, p_patch jsonb,
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
  SELECT * INTO v_old FROM public.culturas WHERE id=p_id FOR UPDATE;
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
  WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
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

CREATE FUNCTION platform_private.set_global_culture_status_core(p_id uuid, p_expected_updated_at timestamptz, p_ativo boolean,
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
  SELECT * INTO v_old FROM public.culturas WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_entity_unavailable'; END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_entity_conflict'; END IF;
  IF v_old.ativo = p_ativo THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_entity_no_change'; END IF;
  -- desativada_em/desativada_por carimbados pelo trigger existente tg_culturas_stamp_desativacao.
  UPDATE public.culturas SET ativo=p_ativo WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
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

-- ---------------------------------------------------------------- ACL + wrappers INVOKER
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'read_global_microorganism_detail_core(uuid)','read_global_cultures_core(text,integer,integer)','read_global_culture_detail_core(uuid)',
    'create_global_microorganism_core(jsonb,text,uuid)','update_global_microorganism_core(uuid,timestamptz,jsonb,text,uuid)',
    'set_global_microorganism_status_core(uuid,timestamptz,boolean,text,uuid)','create_global_culture_core(jsonb,text,uuid)',
    'update_global_culture_core(uuid,timestamptz,jsonb,text,uuid)','set_global_culture_status_core(uuid,timestamptz,boolean,text,uuid)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION platform_private.'||s||' FROM PUBLIC,anon,authenticated,service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION platform_private.'||s||' TO authenticated';
  END LOOP;
END;
$$;
CREATE FUNCTION public.platform_read_global_microorganism_detail(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.read_global_microorganism_detail_core(p_id) $$;
CREATE FUNCTION public.platform_read_global_cultures(p_search text, p_limit integer, p_offset integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.read_global_cultures_core(p_search,p_limit,p_offset) $$;
CREATE FUNCTION public.platform_read_global_culture_detail(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.read_global_culture_detail_core(p_id) $$;
CREATE FUNCTION public.platform_create_global_microorganism(p_payload jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.create_global_microorganism_core(p_payload,p_reason,p_idempotency_key) $$;
CREATE FUNCTION public.platform_update_global_microorganism(p_id uuid, p_expected_updated_at timestamptz, p_patch jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.update_global_microorganism_core(p_id,p_expected_updated_at,p_patch,p_reason,p_idempotency_key) $$;
CREATE FUNCTION public.platform_set_global_microorganism_status(p_id uuid, p_expected_updated_at timestamptz, p_ativo boolean, p_reason text, p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.set_global_microorganism_status_core(p_id,p_expected_updated_at,p_ativo,p_reason,p_idempotency_key) $$;
CREATE FUNCTION public.platform_create_global_culture(p_payload jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.create_global_culture_core(p_payload,p_reason,p_idempotency_key) $$;
CREATE FUNCTION public.platform_update_global_culture(p_id uuid, p_expected_updated_at timestamptz, p_patch jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.update_global_culture_core(p_id,p_expected_updated_at,p_patch,p_reason,p_idempotency_key) $$;
CREATE FUNCTION public.platform_set_global_culture_status(p_id uuid, p_expected_updated_at timestamptz, p_ativo boolean, p_reason text, p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.set_global_culture_status_core(p_id,p_expected_updated_at,p_ativo,p_reason,p_idempotency_key) $$;
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'platform_read_global_microorganism_detail(uuid)','platform_read_global_cultures(text,integer,integer)','platform_read_global_culture_detail(uuid)',
    'platform_create_global_microorganism(jsonb,text,uuid)','platform_update_global_microorganism(uuid,timestamptz,jsonb,text,uuid)',
    'platform_set_global_microorganism_status(uuid,timestamptz,boolean,text,uuid)','platform_create_global_culture(jsonb,text,uuid)',
    'platform_update_global_culture(uuid,timestamptz,jsonb,text,uuid)','platform_set_global_culture_status(uuid,timestamptz,boolean,text,uuid)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.'||s||' FROM PUBLIC,anon,authenticated,service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||s||' TO authenticated';
  END LOOP;
END;
$$;

-- ================================================================ ROLLBACK SEGURO (não executar junto)
-- Preserva o ledger: se já houver recibos das novas operações, o CHECK ampliado e o trigger de imutabilidade PERMANECEM.
-- DO $$ BEGIN
--   DROP FUNCTION IF EXISTS public.platform_read_global_microorganism_detail(uuid), public.platform_read_global_cultures(text,integer,integer),
--     public.platform_read_global_culture_detail(uuid), public.platform_create_global_microorganism(jsonb,text,uuid),
--     public.platform_update_global_microorganism(uuid,timestamptz,jsonb,text,uuid), public.platform_set_global_microorganism_status(uuid,timestamptz,boolean,text,uuid),
--     public.platform_create_global_culture(jsonb,text,uuid), public.platform_update_global_culture(uuid,timestamptz,jsonb,text,uuid),
--     public.platform_set_global_culture_status(uuid,timestamptz,boolean,text,uuid);
--   DROP FUNCTION IF EXISTS platform_private.create_global_microorganism_core(jsonb,text,uuid), platform_private.update_global_microorganism_core(uuid,timestamptz,jsonb,text,uuid),
--     platform_private.set_global_microorganism_status_core(uuid,timestamptz,boolean,text,uuid), platform_private.create_global_culture_core(jsonb,text,uuid),
--     platform_private.update_global_culture_core(uuid,timestamptz,jsonb,text,uuid), platform_private.set_global_culture_status_core(uuid,timestamptz,boolean,text,uuid),
--     platform_private.read_global_microorganism_detail_core(uuid), platform_private.read_global_cultures_core(text,integer,integer),
--     platform_private.read_global_culture_detail_core(uuid), platform_private.catalog_entity_audit(uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb),
--     platform_private.catalog_entity_replay(uuid,text,jsonb,text,uuid), platform_private.catalog_micro_normalize(jsonb,boolean),
--     platform_private.catalog_culture_normalize(jsonb,boolean);
--   IF NOT EXISTS (SELECT 1 FROM public.catalog_platform_admin_audit WHERE operation LIKE '%\_global\_microorganism%' OR operation LIKE '%\_global\_culture%') THEN
--     DROP TRIGGER catalog_entities_audit_immutable ON public.catalog_platform_admin_audit;
--     DROP FUNCTION platform_private.catalog_entities_audit_immutable();
--     DROP POLICY catalog_entities_audit_active_read ON public.catalog_platform_admin_audit;
--     ALTER TABLE public.catalog_platform_admin_audit DROP CONSTRAINT catalog_platform_admin_audit_operation_check;
--     ALTER TABLE public.catalog_platform_admin_audit ADD CONSTRAINT catalog_platform_admin_audit_operation_check
--       CHECK (operation IN ('wipe_global_products','update_global_product_metadata','create_global_product','set_global_product_status'));
--   END IF;
--   -- Coluna updated_at e trigger de versão são mantidos (aditivos, inofensivos a consumidores); remoção exige revisão própria.
-- END $$;
