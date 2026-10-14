-- CANDIDATO NÃO APLICADO — APRESENTAÇÕES/VOLUMES globais (public.catalogo_volumes) pelo Platform Superadmin.
-- Alvo exclusivo: swzpzcwiasxmjutrmvkm. Revisão/aplicação: Codex. NÃO executar a partir do Lovable.
-- Padrão: public SECURITY INVOKER -> platform_private SECURITY DEFINER; ator via
-- platform_private.catalog_metadata_require_actor(); ledger existente public.catalog_platform_admin_audit
-- reaproveitando platform_private.catalog_entity_replay/catalog_entity_audit (aplicados em platform_global_micro_culture_admin).
-- Sem grants DML, sem exclusão física, sem SQL dinâmico, sem escrita tenant.
--
-- Semântica canônica auditada (somente leitura, 2026-10-14):
--   * sync_catalogo_volumes_calc (BEFORE INS/UPD): preco_litro_brl = round(preco_brl/(volume_ml/1000),2);
--     valor_dose_100ml_brl = round(preco_litro_brl/10,2); doses_por_volume = round(volume_ml/100,4).
--   * trg_zz_catalogo_volumes_sync_mestre (AFTER INS/UPD/DEL) -> fn_catalogo_sync_mestre_preco(produto, micro):
--     considera SOMENTE apresentações ATIVAS. 0 ativas = preserva preço legado do pai;
--     1 preço/L distinto (>0) = grava valor_litro/dose(/ha) no pai; >1 preço/L distinto = ANULA preços do pai.
--   * Portanto: criar INATIVA não altera o pai; ativar/editar/arquivar uma ativa pode reprecificar ou anular o pai.
--     Este candidato executa, compara o pai antes/depois e ABORTA a transação inteira se houver
--     reprecificação sem confirmação explícita (erro 55000 com projeção antes/depois em DETAIL).
--   * Arquivar a última ativa NÃO restaura preço anterior: o pai mantém o último valor sincronizado (contrato preservado).
-- Volumes existentes no canônico na auditoria: 0. Nenhum valor comercial é criado por este arquivo.

-- ---------------------------------------------------------------- preflight exato (fail-closed)
DO $$
DECLARE v_chk text;
BEGIN
  IF to_regprocedure('platform_private.catalog_metadata_require_actor()') IS NULL
    OR to_regprocedure('platform_private.catalog_entity_replay(uuid,text,jsonb,text,uuid)') IS NULL
    OR to_regprocedure('platform_private.catalog_entity_audit(uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb)') IS NULL
    OR to_regprocedure('platform_private.catalog_touch_version()') IS NULL
    OR to_regprocedure('public.fn_catalogo_sync_mestre_preco(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'cv_preflight_helpers_missing';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='catalogo_volumes') <> 15
    OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos') <> 19
    OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='microrganismos') <> 23 THEN
    RAISE EXCEPTION 'cv_preflight_column_count_changed';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name IN ('catalogo_volumes','produtos','microrganismos')
      AND column_name IN ('organization_id','owner_organization_id','tenant_id')) THEN
    RAISE EXCEPTION 'cv_preflight_owner_columns_present';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.catalogo_volumes'::regclass AND NOT tgisinternal) <> 3
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.catalogo_volumes'::regclass AND NOT tgisinternal
      AND tgname IN ('trg_catalogo_volumes_updated_at','trg_sync_catalogo_volumes_calc','trg_zz_catalogo_volumes_sync_mestre')) <> 3
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.produtos'::regclass AND NOT tgisinternal) <> 5
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.microrganismos'::regclass AND NOT tgisinternal) <> 5 THEN
    RAISE EXCEPTION 'cv_preflight_triggers_changed';
  END IF;
  IF has_table_privilege('authenticated','public.catalogo_volumes','INSERT')
    OR has_table_privilege('authenticated','public.catalogo_volumes','UPDATE')
    OR has_table_privilege('authenticated','public.catalogo_volumes','DELETE')
    OR has_table_privilege('anon','public.catalogo_volumes','INSERT') THEN
    RAISE EXCEPTION 'cv_preflight_dml_grants_open';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_chk FROM pg_constraint
   WHERE conrelid='public.catalog_platform_admin_audit'::regclass AND conname='catalog_platform_admin_audit_operation_check';
  IF v_chk IS NULL OR v_chk NOT LIKE '%set_global_culture_status%' OR v_chk LIKE '%volume%' THEN
    RAISE EXCEPTION 'cv_preflight_ledger_changed';
  END IF;
END;
$$;

-- ---------------------------------------------------------------- versão monotônica (CAS)
-- update_updated_at_column usa now() (igual dentro da transação); o touch garante crescimento estrito.
CREATE TRIGGER trg_zzz_catalogo_volumes_touch_version BEFORE UPDATE ON public.catalogo_volumes
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_touch_version();

-- Defesa em profundidade: a política permissiva legada "Admin gestor manage catalogo_volumes" está inerte
-- (sem grants DML). Estas RESTRICTIVE garantem que, mesmo se grants forem reabertos, só SA ativo escreve.
CREATE POLICY catalog_volumes_sa_insert ON public.catalogo_volumes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'superadmin'::public.app_role)
    AND public.is_platform_superadmin(auth.uid()) AND platform_private.platform_actor_access_ready(auth.uid()));
CREATE POLICY catalog_volumes_sa_update ON public.catalogo_volumes AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'superadmin'::public.app_role)
    AND public.is_platform_superadmin(auth.uid()) AND platform_private.platform_actor_access_ready(auth.uid()))
  WITH CHECK (auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'superadmin'::public.app_role)
    AND public.is_platform_superadmin(auth.uid()) AND platform_private.platform_actor_access_ready(auth.uid()));
CREATE POLICY catalog_volumes_sa_delete ON public.catalogo_volumes AS RESTRICTIVE FOR DELETE TO authenticated
  USING (false);

-- ---------------------------------------------------------------- ledger: whitelist explícita
ALTER TABLE public.catalog_platform_admin_audit DROP CONSTRAINT catalog_platform_admin_audit_operation_check;
ALTER TABLE public.catalog_platform_admin_audit ADD CONSTRAINT catalog_platform_admin_audit_operation_check
  CHECK (operation IN ('wipe_global_products','update_global_product_metadata','create_global_product','set_global_product_status',
    'create_global_microorganism','update_global_microorganism','set_global_microorganism_status',
    'create_global_culture','update_global_culture','set_global_culture_status',
    'create_global_volume','update_global_volume','set_global_volume_status'));
CREATE POLICY catalog_volumes_audit_active_read ON public.catalog_platform_admin_audit
AS RESTRICTIVE FOR SELECT TO authenticated USING (
  operation NOT IN ('create_global_volume','update_global_volume','set_global_volume_status') OR (
    auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'superadmin'::public.app_role)
    AND public.is_platform_superadmin(auth.uid()) AND platform_private.platform_actor_access_ready(auth.uid())));
CREATE FUNCTION platform_private.catalog_volumes_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF OLD.operation LIKE '%\_global\_volume%' OR (TG_OP='UPDATE' AND NEW.operation LIKE '%\_global\_volume%') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_volumes_audit_immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_volumes_audit_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER catalog_volumes_audit_immutable BEFORE UPDATE OR DELETE ON public.catalog_platform_admin_audit
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_volumes_audit_immutable();

-- ---------------------------------------------------------------- validador (whitelist explícita)
-- Decimais SOMENTE como string JSON (sem float JS). moeda é fixa 'BRL' (não aceita no payload).
-- Vínculo pai (item_tipo/produto_id/microrganismo_id), ativo e derivados NUNCA vêm do payload.
CREATE FUNCTION platform_private.catalog_volume_normalize(p jsonb, p_create boolean) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text; v_out jsonb:='{}'::jsonb; v_num numeric; v_int numeric;
BEGIN
  IF p IS NULL OR pg_catalog.jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  FOR k IN SELECT pg_catalog.jsonb_object_keys(p) LOOP
    IF k = 'volume_ml' THEN
      IF pg_catalog.jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR (p->>k) !~ '^[0-9]{1,7}(\.[0-9]{1,3})?$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
      v_num:=(p->>k)::numeric;
      IF v_num <= 0 OR v_num > 1000000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
      v_out:=v_out||pg_catalog.jsonb_build_object(k,v_num);
    ELSIF k = 'preco_brl' THEN
      IF pg_catalog.jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR (p->>k) !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
      v_num:=(p->>k)::numeric;
      -- > 0: preço zero ativo faria o sync anular o pai; preço desconhecido não é cadastrado.
      IF v_num <= 0 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
      v_out:=v_out||pg_catalog.jsonb_build_object(k,v_num);
    ELSIF k = 'rotulo' THEN
      IF pg_catalog.jsonb_typeof(p->k)='null' THEN v_out:=v_out||pg_catalog.jsonb_build_object(k,NULL::text);
      ELSIF pg_catalog.jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR pg_catalog.char_length(pg_catalog.btrim(p->>k)) > 60 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid';
      ELSE v_out:=v_out||pg_catalog.jsonb_build_object(k,NULLIF(pg_catalog.btrim(p->>k),''));
      END IF;
    ELSIF k = 'ordem' THEN
      IF pg_catalog.jsonb_typeof(p->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
      v_int:=(p->>k)::numeric;
      IF v_int <> pg_catalog.trunc(v_int) OR v_int < 0 OR v_int > 9999 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
      v_out:=v_out||pg_catalog.jsonb_build_object(k,v_int::int);
    ELSE RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid';
    END IF;
  END LOOP;
  IF p_create AND NOT (v_out ? 'volume_ml' AND v_out ? 'preco_brl') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  IF NOT p_create AND v_out = '{}'::jsonb THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_volume_normalize(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------- pai: leitura/lock e comparação protegida
CREATE FUNCTION platform_private.catalog_volume_parent(p_tipo text, p_id uuid, p_lock boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb;
BEGIN
  IF p_id IS NULL OR p_tipo IS NULL OR p_tipo NOT IN ('produto','microrganismo') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  IF p_tipo='produto' THEN
    IF p_lock THEN SELECT pg_catalog.to_jsonb(x) INTO v FROM public.produtos x WHERE x.id=p_id FOR UPDATE;
    ELSE SELECT pg_catalog.to_jsonb(x) INTO v FROM public.produtos x WHERE x.id=p_id; END IF;
  ELSE
    IF p_lock THEN SELECT pg_catalog.to_jsonb(x) INTO v FROM public.microrganismos x WHERE x.id=p_id FOR UPDATE;
    ELSE SELECT pg_catalog.to_jsonb(x) INTO v FROM public.microrganismos x WHERE x.id=p_id; END IF;
  END IF;
  IF v IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_volume_unavailable'; END IF;
  RETURN v;
END;
$$;
CREATE FUNCTION platform_private.catalog_volume_pricing(p_parent jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT pg_catalog.jsonb_build_object('valor_litro_brl',p_parent->'valor_litro_brl','valor_dose_brl',p_parent->'valor_dose_brl',
    'valor_ha_brl',COALESCE(p_parent->'valor_ha_brl','null'::jsonb),'updated_at',p_parent->'updated_at');
$$;
-- Executa a verificação pós-efeito: campos protegidos do pai (B2B, dose, código, nome, tipo, ativo, preco_tabela...)
-- devem ser idênticos; reprecificação exige confirmação, e em criação é sempre proibida.
CREATE FUNCTION platform_private.catalog_volume_settle(p_tipo text, p_item uuid, p_before jsonb,
  p_touches_active boolean, p_confirm boolean, p_allow_reprice boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_after jsonb; v_strip text[]:=ARRAY['valor_litro_brl','valor_dose_brl','valor_ha_brl','updated_at'];
  v_pb jsonb; v_pa jsonb; v_repriced boolean;
BEGIN
  v_after:=platform_private.catalog_volume_parent(p_tipo,p_item,false);
  IF (v_after - v_strip) IS DISTINCT FROM (p_before - v_strip) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_parent_protected_changed'; END IF;
  v_pb:=platform_private.catalog_volume_pricing(p_before); v_pa:=platform_private.catalog_volume_pricing(v_after);
  v_repriced:=(v_pb - 'updated_at') IS DISTINCT FROM (v_pa - 'updated_at');
  IF v_repriced AND NOT p_allow_reprice THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_unexpected_repricing'; END IF;
  IF (p_touches_active OR v_repriced) AND NOT COALESCE(p_confirm,false) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='catalog_volume_confirmation_required',
      DETAIL=pg_catalog.jsonb_build_object('repriced',v_repriced,'parent_before',v_pb - 'updated_at','parent_after',v_pa - 'updated_at')::text;
  END IF;
  RETURN pg_catalog.jsonb_build_object('repriced',v_repriced,'parent_before',v_pb,'parent_after',v_pa);
END;
$$;
CREATE FUNCTION platform_private.catalog_volume_row(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.jsonb_build_object('id',v.id,'item_tipo',v.item_tipo,'item_id',COALESCE(v.produto_id,v.microrganismo_id),
    'volume_ml',v.volume_ml::text,'rotulo',v.rotulo,'preco_brl',v.preco_brl::text,'moeda',v.moeda,'ativo',v.ativo,'ordem',v.ordem,
    'preco_litro_brl',v.preco_litro_brl::text,'valor_dose_100ml_brl',v.valor_dose_100ml_brl::text,'doses_por_volume',v.doses_por_volume::text,
    'updated_at',v.updated_at)
  FROM public.catalogo_volumes v WHERE v.id=p_id;
$$;
-- Confirma derivados calculados pelo trigger canônico e moeda/vínculo intactos.
CREATE FUNCTION platform_private.catalog_volume_assert_row(p_id uuid, p_tipo text, p_item uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.catalogo_volumes%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.catalogo_volumes WHERE id=p_id;
  IF NOT FOUND OR r.item_tipo IS DISTINCT FROM p_tipo OR COALESCE(r.produto_id,r.microrganismo_id) IS DISTINCT FROM p_item
    OR r.moeda IS DISTINCT FROM 'BRL'
    OR r.preco_litro_brl IS DISTINCT FROM pg_catalog.round(r.preco_brl/(r.volume_ml/1000.0),2)
    OR r.valor_dose_100ml_brl IS DISTINCT FROM pg_catalog.round(r.preco_litro_brl/10.0,2)
    OR r.doses_por_volume IS DISTINCT FROM pg_catalog.round(r.volume_ml/100.0,4) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_confirmation_failed'; END IF;
  -- Duplicidade: no máximo uma apresentação ATIVA por pai e volume.
  IF r.ativo AND EXISTS (SELECT 1 FROM public.catalogo_volumes o WHERE o.id<>r.id AND o.ativo AND o.volume_ml=r.volume_ml
      AND o.item_tipo=r.item_tipo AND o.produto_id IS NOT DISTINCT FROM r.produto_id AND o.microrganismo_id IS NOT DISTINCT FROM r.microrganismo_id) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='catalog_volume_duplicate'; END IF;
END;
$$;
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['catalog_volume_parent(text,uuid,boolean)','catalog_volume_pricing(jsonb)',
    'catalog_volume_settle(text,uuid,jsonb,boolean,boolean,boolean)','catalog_volume_row(uuid)','catalog_volume_assert_row(uuid,text,uuid)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION platform_private.'||s||' FROM PUBLIC,anon,authenticated,service_role';
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------- leitores (SA ativo/readiness)
CREATE FUNCTION platform_private.read_global_item_volumes_core(p_item_tipo text, p_item_id uuid, p_limit integer, p_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_parent jsonb; v_items jsonb; v_more boolean;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  v_parent:=platform_private.catalog_volume_parent(p_item_tipo,p_item_id,false);
  WITH page AS (
    SELECT v.id, row_number() OVER (ORDER BY v.ordem, v.volume_ml, v.id) rn FROM public.catalogo_volumes v
     WHERE v.item_tipo=p_item_tipo AND COALESCE(v.produto_id,v.microrganismo_id)=p_item_id
     ORDER BY v.ordem, v.volume_ml, v.id LIMIT p_limit+1 OFFSET p_offset)
  SELECT COALESCE(pg_catalog.jsonb_agg(platform_private.catalog_volume_row(id) ORDER BY rn) FILTER (WHERE rn<=p_offset+p_limit),'[]'::jsonb),
         count(*)>p_limit
    INTO v_items, v_more FROM page;
  RETURN pg_catalog.jsonb_build_object('item',pg_catalog.jsonb_build_object('tipo',p_item_tipo,'id',p_item_id,'nome',v_parent->'nome',
      'codigo',v_parent->'codigo','ativo',v_parent->'ativo','pricing',platform_private.catalog_volume_pricing(v_parent) - 'updated_at'),
    'items',v_items,'has_more',v_more);
END;
$$;
CREATE FUNCTION platform_private.read_global_volume_detail_core(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  v:=platform_private.catalog_volume_row(p_id);
  IF v IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_volume_unavailable'; END IF;
  RETURN v;
END;
$$;

-- ---------------------------------------------------------------- escritores (pai bloqueado primeiro => serialização por pai)
CREATE FUNCTION platform_private.create_global_volume_core(p_item_tipo text, p_item_id uuid, p_payload jsonb, p_reason text, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v jsonb; v_req jsonb; v_replay jsonb; v_before jsonb; v_settle jsonb; v_id uuid; v_row jsonb; v_receipt jsonb;
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  v:=platform_private.catalog_volume_normalize(p_payload,true);
  v_req:=pg_catalog.jsonb_build_object('item_tipo',p_item_tipo,'item_id',p_item_id,'payload',v,'reason',pg_catalog.btrim(p_reason));
  v_replay:=platform_private.catalog_entity_replay(v_actor,'create_global_volume',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  v_before:=platform_private.catalog_volume_parent(p_item_tipo,p_item_id,true);
  INSERT INTO public.catalogo_volumes (item_tipo,produto_id,microrganismo_id,volume_ml,rotulo,preco_brl,moeda,ativo,ordem)
  VALUES (p_item_tipo, CASE WHEN p_item_tipo='produto' THEN p_item_id END, CASE WHEN p_item_tipo='microrganismo' THEN p_item_id END,
    (v->>'volume_ml')::numeric, v->>'rotulo', (v->>'preco_brl')::numeric, 'BRL', false, COALESCE((v->>'ordem')::int,0))
  RETURNING id INTO v_id;
  PERFORM platform_private.catalog_volume_assert_row(v_id,p_item_tipo,p_item_id);
  -- Nasce inativa: qualquer alteração no pai é falha (não apaga preço legado silenciosamente).
  v_settle:=platform_private.catalog_volume_settle(p_item_tipo,p_item_id,v_before,false,false,false);
  v_row:=platform_private.catalog_volume_row(v_id);
  v_receipt:=pg_catalog.jsonb_build_object('id',v_id,'item_tipo',p_item_tipo,'item_id',p_item_id,'ativo',false,'updated_at',v_row->'updated_at',
    'repriced',false,'idempotency_key',p_idempotency_key,'audit_id',gen_random_uuid(),'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'create_global_volume',p_reason,p_idempotency_key,v_req,v_receipt,
    pg_catalog.jsonb_build_object('volume','{}'::jsonb,'parent',v_settle->'parent_before'),
    pg_catalog.jsonb_build_object('volume',v_row,'parent',v_settle->'parent_after'));
  RETURN v_receipt;
END;
$$;

CREATE FUNCTION platform_private.change_global_volume(p_operation text, p_id uuid, p_expected_updated_at timestamptz,
  p_patch jsonb, p_ativo boolean, p_confirm boolean, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v jsonb; v_req jsonb; v_replay jsonb; v_tipo text; v_item uuid; v_parent jsonb;
  v_old public.catalogo_volumes%ROWTYPE; v_before jsonb; v_settle jsonb; v_row jsonb; v_receipt jsonb; v_n int;
BEGIN
  v_actor:=platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at) OR p_confirm IS NULL
    OR (p_operation='set_global_volume_status' AND p_ativo IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  IF p_operation='update_global_volume' THEN v:=platform_private.catalog_volume_normalize(p_patch,false);
  ELSIF p_operation='set_global_volume_status' THEN v:=pg_catalog.jsonb_build_object('ativo',p_ativo);
  ELSE RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_volume_invalid'; END IF;
  v_req:=pg_catalog.jsonb_build_object('id',p_id,'expected_updated_at',p_expected_updated_at,'change',v,'confirm',p_confirm,
    'reason',pg_catalog.btrim(p_reason));
  v_replay:=platform_private.catalog_entity_replay(v_actor,p_operation,v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT item_tipo, COALESCE(produto_id,microrganismo_id) INTO v_tipo, v_item FROM public.catalogo_volumes WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_volume_unavailable'; END IF;
  v_parent:=platform_private.catalog_volume_parent(v_tipo,v_item,true);   -- lock do pai antes da linha
  SELECT * INTO v_old FROM public.catalogo_volumes WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v_old.item_tipo IS DISTINCT FROM v_tipo OR COALESCE(v_old.produto_id,v_old.microrganismo_id) IS DISTINCT FROM v_item THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_conflict'; END IF;
  IF v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_conflict'; END IF;
  IF p_operation='set_global_volume_status' AND v_old.ativo = p_ativo THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_conflict'; END IF;
  v_before:=platform_private.catalog_volume_row(p_id);
  UPDATE public.catalogo_volumes SET
    volume_ml=CASE WHEN v ? 'volume_ml' THEN (v->>'volume_ml')::numeric ELSE volume_ml END,
    preco_brl=CASE WHEN v ? 'preco_brl' THEN (v->>'preco_brl')::numeric ELSE preco_brl END,
    rotulo=CASE WHEN v ? 'rotulo' THEN v->>'rotulo' ELSE rotulo END,
    ordem=CASE WHEN v ? 'ordem' THEN (v->>'ordem')::int ELSE ordem END,
    ativo=CASE WHEN v ? 'ativo' THEN (v->>'ativo')::boolean ELSE ativo END
  WHERE id=p_id AND updated_at=p_expected_updated_at;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_conflict'; END IF;
  PERFORM platform_private.catalog_volume_assert_row(p_id,v_tipo,v_item);
  v_row:=platform_private.catalog_volume_row(p_id);
  IF (v_row->>'updated_at')::timestamptz <= v_old.updated_at THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_volume_confirmation_failed'; END IF;
  -- Toca linha ativa (antes ou depois) => confirmação explícita obrigatória; reprecificação do pai => idem, com projeção.
  v_settle:=platform_private.catalog_volume_settle(v_tipo,v_item,v_parent,v_old.ativo OR (v_row->>'ativo')::boolean,p_confirm,true);
  v_receipt:=pg_catalog.jsonb_build_object('id',p_id,'item_tipo',v_tipo,'item_id',v_item,'ativo',(v_row->>'ativo')::boolean,
    'updated_at',v_row->'updated_at','repriced',v_settle->'repriced','idempotency_key',p_idempotency_key,'audit_id',gen_random_uuid(),'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,p_operation,p_reason,p_idempotency_key,v_req,v_receipt,
    pg_catalog.jsonb_build_object('volume',v_before,'parent',v_settle->'parent_before'),
    pg_catalog.jsonb_build_object('volume',v_row,'parent',v_settle->'parent_after'));
  RETURN v_receipt;
END;
$$;
CREATE FUNCTION platform_private.update_global_volume_core(p_id uuid, p_expected_updated_at timestamptz, p_patch jsonb,
  p_confirm boolean, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS
$$ SELECT platform_private.change_global_volume('update_global_volume',p_id,p_expected_updated_at,p_patch,NULL,p_confirm,p_reason,p_idempotency_key) $$;
CREATE FUNCTION platform_private.set_global_volume_status_core(p_id uuid, p_expected_updated_at timestamptz, p_ativo boolean,
  p_confirm boolean, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS
$$ SELECT platform_private.change_global_volume('set_global_volume_status',p_id,p_expected_updated_at,NULL,p_ativo,p_confirm,p_reason,p_idempotency_key) $$;
REVOKE ALL ON FUNCTION platform_private.change_global_volume(text,uuid,timestamptz,jsonb,boolean,boolean,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- ---------------------------------------------------------------- ACL + wrappers INVOKER
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['read_global_item_volumes_core(text,uuid,integer,integer)','read_global_volume_detail_core(uuid)',
    'create_global_volume_core(text,uuid,jsonb,text,uuid)','update_global_volume_core(uuid,timestamptz,jsonb,boolean,text,uuid)',
    'set_global_volume_status_core(uuid,timestamptz,boolean,boolean,text,uuid)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION platform_private.'||s||' FROM PUBLIC,anon,authenticated,service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION platform_private.'||s||' TO authenticated';
  END LOOP;
END;
$$;
CREATE FUNCTION public.platform_read_global_item_volumes(p_item_tipo text, p_item_id uuid, p_limit integer, p_offset integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.read_global_item_volumes_core(p_item_tipo,p_item_id,p_limit,p_offset) $$;
CREATE FUNCTION public.platform_read_global_volume_detail(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.read_global_volume_detail_core(p_id) $$;
CREATE FUNCTION public.platform_create_global_volume(p_item_tipo text, p_item_id uuid, p_payload jsonb, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.create_global_volume_core(p_item_tipo,p_item_id,p_payload,p_reason,p_idempotency_key) $$;
CREATE FUNCTION public.platform_update_global_volume(p_id uuid, p_expected_updated_at timestamptz, p_patch jsonb, p_confirm boolean, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.update_global_volume_core(p_id,p_expected_updated_at,p_patch,p_confirm,p_reason,p_idempotency_key) $$;
CREATE FUNCTION public.platform_set_global_volume_status(p_id uuid, p_expected_updated_at timestamptz, p_ativo boolean, p_confirm boolean, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.set_global_volume_status_core(p_id,p_expected_updated_at,p_ativo,p_confirm,p_reason,p_idempotency_key) $$;
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['platform_read_global_item_volumes(text,uuid,integer,integer)','platform_read_global_volume_detail(uuid)',
    'platform_create_global_volume(text,uuid,jsonb,text,uuid)','platform_update_global_volume(uuid,timestamptz,jsonb,boolean,text,uuid)',
    'platform_set_global_volume_status(uuid,timestamptz,boolean,boolean,text,uuid)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.'||s||' FROM PUBLIC,anon,authenticated,service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||s||' TO authenticated';
  END LOOP;
END;
$$;

-- ================================================================ ROLLBACK SEGURO (não executar junto)
-- Preserva o ledger: se houver recibos de volume, CHECK ampliado, política de leitura e trigger de imutabilidade PERMANECEM.
-- Linhas de catalogo_volumes criadas pelo SA NÃO são apagadas pelo rollback (seriam dados comerciais auditados).
-- DO $$ BEGIN
--   DROP FUNCTION IF EXISTS public.platform_read_global_item_volumes(text,uuid,integer,integer), public.platform_read_global_volume_detail(uuid),
--     public.platform_create_global_volume(text,uuid,jsonb,text,uuid), public.platform_update_global_volume(uuid,timestamptz,jsonb,boolean,text,uuid),
--     public.platform_set_global_volume_status(uuid,timestamptz,boolean,boolean,text,uuid);
--   DROP FUNCTION IF EXISTS platform_private.update_global_volume_core(uuid,timestamptz,jsonb,boolean,text,uuid),
--     platform_private.set_global_volume_status_core(uuid,timestamptz,boolean,boolean,text,uuid),
--     platform_private.change_global_volume(text,uuid,timestamptz,jsonb,boolean,boolean,text,uuid),
--     platform_private.create_global_volume_core(text,uuid,jsonb,text,uuid), platform_private.read_global_volume_detail_core(uuid),
--     platform_private.read_global_item_volumes_core(text,uuid,integer,integer), platform_private.catalog_volume_assert_row(uuid,text,uuid),
--     platform_private.catalog_volume_row(uuid), platform_private.catalog_volume_settle(text,uuid,jsonb,boolean,boolean,boolean),
--     platform_private.catalog_volume_pricing(jsonb), platform_private.catalog_volume_parent(text,uuid,boolean),
--     platform_private.catalog_volume_normalize(jsonb,boolean);
--   DROP POLICY IF EXISTS catalog_volumes_sa_insert ON public.catalogo_volumes;
--   DROP POLICY IF EXISTS catalog_volumes_sa_update ON public.catalogo_volumes;
--   DROP POLICY IF EXISTS catalog_volumes_sa_delete ON public.catalogo_volumes;
--   DROP TRIGGER IF EXISTS trg_zzz_catalogo_volumes_touch_version ON public.catalogo_volumes;
--   IF NOT EXISTS (SELECT 1 FROM public.catalog_platform_admin_audit WHERE operation LIKE '%\_global\_volume%') THEN
--     DROP TRIGGER IF EXISTS catalog_volumes_audit_immutable ON public.catalog_platform_admin_audit;
--     DROP FUNCTION IF EXISTS platform_private.catalog_volumes_audit_immutable();
--     DROP POLICY IF EXISTS catalog_volumes_audit_active_read ON public.catalog_platform_admin_audit;
--     ALTER TABLE public.catalog_platform_admin_audit DROP CONSTRAINT catalog_platform_admin_audit_operation_check;
--     ALTER TABLE public.catalog_platform_admin_audit ADD CONSTRAINT catalog_platform_admin_audit_operation_check
--       CHECK (operation IN ('wipe_global_products','update_global_product_metadata','create_global_product','set_global_product_status',
--         'create_global_microorganism','update_global_microorganism','set_global_microorganism_status',
--         'create_global_culture','update_global_culture','set_global_culture_status'));
--   END IF;
-- END $$;
