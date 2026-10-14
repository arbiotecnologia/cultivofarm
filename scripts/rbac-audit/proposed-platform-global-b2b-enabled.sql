-- =====================================================================================
-- CANDIDATO — NÃO APLICAR AUTOMATICAMENTE. Revisão independente aplicará no canônico
-- swzpzcwiasxmjutrmvkm. Nenhum produto/microrganismo é alterado por este arquivo.
--
-- Gestão GLOBAL de `b2b_enabled` (produtos e microrganismos) exclusiva Platform Superadmin.
-- Padrão: wrapper public SECURITY INVOKER -> platform_private SECURITY DEFINER,
-- catalog_metadata_require_actor (SA ativo/readiness/JWT fence), motivo 10..500,
-- idempotência no ledger catalog_platform_admin_audit, CAS em updated_at, lock de linha,
-- confirmação pós-UPDATE (somente b2b_enabled/updated_at mudam) e audit before/after.
--
-- Regras:
--  * liberar (true) exige item ATIVO; retirar (false) é sempre permitido.
--  * não toca ativo, preços, dose, composição, apresentações, fichas, fiscal, snapshots.
--  * não aprova ficha técnica: visibilidade comercial != ficha aprovada.
--  * sem DML/grant novo para anon/authenticated nas tabelas; sem SQL dinâmico.
--  * se trigger legado de preço recalcular qualquer coluna durante o UPDATE, a operação
--    falha fechada (40001 catalog_b2b_confirmation_failed) em vez de gravar drift.
-- Rollback: rollback-platform-global-b2b-enabled.sql
-- =====================================================================================

-- ---------------------------------------------------------------- preflight fail-closed
DO $$
DECLARE v_chk text;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL AND current_setting('request.jwt.claims', true) <> '' THEN
    RAISE EXCEPTION 'b2b_preflight_must_run_as_owner';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos') <> 19
    OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='microrganismos') <> 23 THEN
    RAISE EXCEPTION 'b2b_preflight_column_count_changed';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.produtos'::regclass AND NOT tgisinternal) <> 5
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.produtos'::regclass AND NOT tgisinternal AND tgname IN
      ('trg_set_codigo_produto_ins','trg_set_codigo_produto_upd','trg_sync_product_pricing','trg_zz_produtos_guard_preco','update_produtos_updated_at')) <> 5
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.microrganismos'::regclass AND NOT tgisinternal) <> 5
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.microrganismos'::regclass AND NOT tgisinternal AND tgname IN
      ('trg_set_codigo_micro_ins','trg_set_codigo_micro_upd','trg_sync_microorganism_pricing','trg_zz_microrganismos_guard_preco',
       'trg_zzz_microrganismos_touch_version')) <> 5 THEN
    RAISE EXCEPTION 'b2b_preflight_triggers_changed';
  END IF;
  IF (SELECT data_type||is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='produtos' AND column_name='b2b_enabled') <> 'booleanNO'
    OR (SELECT data_type||is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='microrganismos' AND column_name='b2b_enabled') <> 'booleanNO' THEN
    RAISE EXCEPTION 'b2b_preflight_column_changed';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO v_chk FROM pg_constraint
   WHERE conrelid='public.catalog_platform_admin_audit'::regclass AND conname='catalog_platform_admin_audit_operation_check';
  IF v_chk IS NULL OR v_chk NOT LIKE '%set_global_volume_status%' OR v_chk LIKE '%set_global_b2b_enabled%' THEN
    RAISE EXCEPTION 'b2b_preflight_ledger_changed';
  END IF;
  IF to_regprocedure('platform_private.catalog_metadata_require_actor()') IS NULL
    OR to_regprocedure('platform_private.catalog_entity_replay(uuid,text,jsonb,text,uuid)') IS NULL
    OR to_regprocedure('platform_private.catalog_entity_audit(uuid,text,text,uuid,jsonb,jsonb,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'b2b_preflight_helpers_missing';
  END IF;
  -- Nenhuma grant DML de cliente nas tabelas-alvo (contenção existente preservada).
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants WHERE table_schema='public'
      AND table_name IN ('produtos','microrganismos') AND grantee IN ('anon','authenticated','PUBLIC')
      AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')) THEN
    RAISE EXCEPTION 'b2b_preflight_client_dml_present';
  END IF;
END;
$$;

-- ---------------------------------------------------------------- ledger: whitelist + leitura SA + imutável
ALTER TABLE public.catalog_platform_admin_audit DROP CONSTRAINT catalog_platform_admin_audit_operation_check;
ALTER TABLE public.catalog_platform_admin_audit ADD CONSTRAINT catalog_platform_admin_audit_operation_check
  CHECK (operation IN ('wipe_global_products','update_global_product_metadata','create_global_product','set_global_product_status',
    'create_global_microorganism','update_global_microorganism','set_global_microorganism_status',
    'create_global_culture','update_global_culture','set_global_culture_status',
    'create_global_volume','update_global_volume','set_global_volume_status',
    'set_global_b2b_enabled'));

CREATE POLICY catalog_b2b_audit_active_read ON public.catalog_platform_admin_audit
AS RESTRICTIVE FOR SELECT TO authenticated USING (
  operation <> 'set_global_b2b_enabled' OR (
    auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'superadmin'::public.app_role)
    AND public.is_platform_superadmin(auth.uid()) AND platform_private.platform_actor_access_ready(auth.uid())));

CREATE FUNCTION platform_private.catalog_b2b_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF OLD.operation = 'set_global_b2b_enabled' OR NEW.operation = 'set_global_b2b_enabled' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_b2b_audit_immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_b2b_audit_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER catalog_b2b_audit_immutable BEFORE UPDATE OR DELETE ON public.catalog_platform_admin_audit
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_b2b_audit_immutable();

-- ---------------------------------------------------------------- leitor mínimo de estado B2B
-- Projeção mínima: sem preço, dose, composição, ficha ou tenant.
CREATE FUNCTION platform_private.read_global_b2b_state_core(p_item_tipo text, p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_out jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_item_tipo IS NULL OR p_item_tipo NOT IN ('produto','microrganismo') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_b2b_invalid'; END IF;
  IF p_item_tipo='produto' THEN
    SELECT pg_catalog.jsonb_build_object('item_tipo','produto','id',p.id,'nome',p.nome,'codigo',p.codigo,
      'ativo',COALESCE(p.ativo,false),'b2b_enabled',p.b2b_enabled,'updated_at',p.updated_at)
      INTO v_out FROM public.produtos p WHERE p.id=p_id;
  ELSE
    SELECT pg_catalog.jsonb_build_object('item_tipo','microrganismo','id',m.id,'nome',m.nome,'codigo',m.codigo,
      'ativo',m.ativo,'b2b_enabled',m.b2b_enabled,'updated_at',m.updated_at)
      INTO v_out FROM public.microrganismos m WHERE m.id=p_id;
  END IF;
  IF v_out IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_b2b_unavailable'; END IF;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.read_global_b2b_state_core(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.read_global_b2b_state_core(text,uuid) TO authenticated;

-- ---------------------------------------------------------------- writer
CREATE FUNCTION platform_private.set_global_b2b_enabled_core(p_item_tipo text, p_id uuid, p_expected_updated_at timestamptz,
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
    SELECT * INTO v_op FROM public.produtos WHERE id=p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_b2b_unavailable'; END IF;
    v_old:=pg_catalog.to_jsonb(v_op); v_old_ativo:=COALESCE(v_op.ativo,false); v_old_b2b:=v_op.b2b_enabled; v_old_ver:=v_op.updated_at;
  ELSE
    SELECT * INTO v_om FROM public.microrganismos WHERE id=p_id FOR UPDATE;
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
   WHERE (p_item_tipo='produto' AND cv.produto_id=p_id) OR (p_item_tipo='microrganismo' AND cv.microrganismo_id=p_id);

  IF p_item_tipo='produto' THEN
    UPDATE public.produtos SET b2b_enabled=p_b2b_enabled WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_np;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_b2b_confirmation_failed'; END IF;
    v_new:=pg_catalog.to_jsonb(v_np); v_new_ver:=v_np.updated_at;
  ELSE
    UPDATE public.microrganismos SET b2b_enabled=p_b2b_enabled WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_nm;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_b2b_confirmation_failed'; END IF;
    v_new:=pg_catalog.to_jsonb(v_nm); v_new_ver:=v_nm.updated_at;
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cv) ORDER BY cv.id),'[]'::jsonb) INTO v_vols_after
    FROM public.catalogo_volumes cv
   WHERE (p_item_tipo='produto' AND cv.produto_id=p_id) OR (p_item_tipo='microrganismo' AND cv.microrganismo_id=p_id);

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
REVOKE ALL ON FUNCTION platform_private.set_global_b2b_enabled_core(text,uuid,timestamptz,boolean,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.set_global_b2b_enabled_core(text,uuid,timestamptz,boolean,text,uuid) TO authenticated;

-- ---------------------------------------------------------------- wrappers INVOKER
CREATE FUNCTION public.platform_read_global_b2b_state(p_item_tipo text, p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.read_global_b2b_state_core(p_item_tipo,p_id) $$;
CREATE FUNCTION public.platform_set_global_b2b_enabled(p_item_tipo text, p_id uuid, p_expected_updated_at timestamptz,
  p_b2b_enabled boolean, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.set_global_b2b_enabled_core(p_item_tipo,p_id,p_expected_updated_at,p_b2b_enabled,p_reason,p_idempotency_key) $$;
REVOKE ALL ON FUNCTION public.platform_read_global_b2b_state(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.platform_set_global_b2b_enabled(text,uuid,timestamptz,boolean,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_read_global_b2b_state(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_set_global_b2b_enabled(text,uuid,timestamptz,boolean,text,uuid) TO authenticated;
