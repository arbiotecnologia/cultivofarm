-- HISTORICAL CANDIDATE — APPLIED externally by Codex as platform_global_catalog_metadata
-- to swzpzcwiasxmjutrmvkm (reported 2026-10-10 14:46 UTC). DO NOT REAPPLY.
-- Body/preflight/reviewer harness below preserved as historical evidence.
-- CANDIDATE ONLY — NOT APPLIED. Canonical ref swzpzcwiasxmjutrmvkm must be
-- independently proved by the reviewer before any remote operation.
-- Local functional base db8f29b; documentation base 6ff0a70b.
-- No creation, tenant features, price/type/classification/composition/flags writes.
-- Preflight: inspect equivalent readers/writers, live columns, constraints, owner,
-- schema USAGE, auth helpers, JWT fencing, all product triggers and dependencies.
-- Reject promotion if a trigger modifies related commercial/composition data on
-- metadata UPDATE. Inspect and transactionally test actual trigger bodies first.
-- Do not run obsolete rbac-audit runner/default environments. No table grants.
BEGIN;
SELECT p.oid::regprocedure, pg_catalog.pg_get_functiondef(p.oid)
FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='platform_private' AND p.proname IN ('platform_actor_access_ready','has_role'))
   OR (n.nspname='public' AND p.proname IN ('has_role','is_platform_superadmin','sync_product_pricing','trg_mestre_guard_preco_canonico','set_codigo_produto'));
SELECT t.tgname, pg_catalog.pg_get_triggerdef(t.oid), pg_catalog.pg_get_functiondef(t.tgfoid)
FROM pg_catalog.pg_trigger t WHERE t.tgrelid='public.produtos'::regclass AND NOT t.tgisinternal;
SELECT conname, pg_catalog.pg_get_constraintdef(oid)
FROM pg_catalog.pg_constraint WHERE conrelid='public.catalog_platform_admin_audit'::regclass;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
    AND table_name='produtos' AND column_name IN ('organization_id','owner_organization_id')) THEN
    RAISE EXCEPTION 'catalog_metadata_global_scope_requires_review';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
    AND table_name='produtos' AND column_name IN ('id','updated_at','nome','descricao','modo_acao','funcao_completa','modo_aplicacao')) <> 7 THEN
    RAISE EXCEPTION 'catalog_metadata_columns_require_review';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.catalog_platform_admin_audit'::regclass
    AND conname='catalog_platform_admin_audit_operation_check'
    AND pg_catalog.pg_get_constraintdef(oid) LIKE '%wipe_global_products%') THEN
    RAISE EXCEPTION 'catalog_metadata_audit_requires_review';
  END IF;
END;
$$;

-- Reuse existing restricted platform ledger/correlation uniqueness, not a free
-- audit table. JSON envelopes preserve wipe ABI; no INSERT client grant.
ALTER TABLE public.catalog_platform_admin_audit DROP CONSTRAINT catalog_platform_admin_audit_operation_check;
ALTER TABLE public.catalog_platform_admin_audit ADD CONSTRAINT catalog_platform_admin_audit_operation_check
  CHECK (operation IN ('wipe_global_products','update_global_product_metadata'));
-- Existing wipe read remains unchanged; new metadata receipts require active actor.
CREATE POLICY catalog_metadata_audit_active_read ON public.catalog_platform_admin_audit
AS RESTRICTIVE FOR SELECT TO authenticated USING (
  operation <> 'update_global_product_metadata' OR (
    auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'superadmin'::public.app_role)
    AND public.is_platform_superadmin(auth.uid()) AND platform_private.platform_actor_access_ready(auth.uid())
  )
);
CREATE FUNCTION platform_private.catalog_metadata_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF OLD.operation='update_global_product_metadata' OR NEW.operation='update_global_product_metadata' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_metadata_audit_immutable';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.catalog_metadata_audit_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER catalog_metadata_audit_immutable BEFORE UPDATE OR DELETE ON public.catalog_platform_admin_audit
FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_metadata_audit_immutable();

CREATE FUNCTION platform_private.catalog_metadata_require_actor() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid(); v_jwt jsonb:=auth.jwt();
BEGIN
  IF v_actor IS NULL OR pg_catalog.jsonb_typeof(v_jwt->'iat') IS DISTINCT FROM 'number'
    OR COALESCE(v_jwt->>'iat','') !~ '^[0-9]{1,12}$'
    OR pg_catalog.jsonb_typeof(v_jwt->'exp') IS DISTINCT FROM 'number'
    OR COALESCE(v_jwt->>'exp','') !~ '^[0-9]{1,12}$' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_metadata_forbidden';
  END IF;
  IF (v_jwt->>'iat')::bigint <= 0 OR (v_jwt->>'exp')::bigint <= EXTRACT(EPOCH FROM pg_catalog.statement_timestamp())
    OR (v_jwt->>'iat')::bigint > EXTRACT(EPOCH FROM pg_catalog.statement_timestamp())
    OR NOT COALESCE(public.has_role(v_actor,'superadmin'::public.app_role),false)
    OR NOT COALESCE(public.is_platform_superadmin(v_actor),false)
    OR NOT COALESCE(platform_private.platform_actor_access_ready(v_actor),false) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_metadata_forbidden';
  END IF;
  RETURN v_actor;
END;
$$;
-- Internal helper only: clients cannot invoke; no editable metadata authority.
REVOKE ALL ON FUNCTION platform_private.catalog_metadata_require_actor() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION platform_private.read_global_product_metadata_core(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM platform_private.catalog_metadata_require_actor();
  SELECT pg_catalog.jsonb_build_object('id',p.id,'updated_at',p.updated_at,'nome',p.nome,
    'descricao',p.descricao,'modo_acao',p.modo_acao,'funcao_completa',p.funcao_completa,'modo_aplicacao',p.modo_aplicacao)
  INTO v_result FROM public.produtos p WHERE p.id=p_id;
  IF v_result IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_metadata_unavailable'; END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.read_global_product_metadata_core(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.read_global_product_metadata_core(uuid) TO authenticated;
CREATE FUNCTION public.platform_read_global_product_metadata(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT platform_private.read_global_product_metadata_core(p_id);
$$;
REVOKE ALL ON FUNCTION public.platform_read_global_product_metadata(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_read_global_product_metadata(uuid) TO authenticated;

CREATE FUNCTION platform_private.update_global_product_metadata_core(
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
  SELECT * INTO v_old FROM public.produtos WHERE id=p_id FOR UPDATE;
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
  WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
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
REVOKE ALL ON FUNCTION platform_private.update_global_product_metadata_core(uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.update_global_product_metadata_core(uuid,timestamptz,jsonb,text,uuid) TO authenticated;
CREATE FUNCTION public.platform_update_global_product_metadata(
  p_id uuid, p_expected_updated_at timestamptz, p_patch jsonb, p_reason text, p_idempotency_key uuid
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT platform_private.update_global_product_metadata_core(p_id,p_expected_updated_at,p_patch,p_reason,p_idempotency_key);
$$;
REVOKE ALL ON FUNCTION public.platform_update_global_product_metadata(uuid,timestamptz,jsonb,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.platform_update_global_product_metadata(uuid,timestamptz,jsonb,text,uuid) TO authenticated;

-- REVIEWER TEST PLAN — NOT RUN. Prove canonical ref before execution. BEGIN with
-- candidate installed transactionally; savepoints for negatives; final ROLLBACK.
-- Existing explicitly authorized product/real actors only, no persistent fixtures.
-- 1. FinanceiroAR/AdminAR/AdminFSF/Consultor/B2B/inactive/provisional/processing/anon,
--    NULL actor, expired JWT, invalid/absent/future iat and pre-fence iat denied;
--    forged metadata superadmin denied through wrapper AND direct core.
-- 2. Superadmin active/readiness: detail exactly id/version + five texts, no price.
-- 3. Patch each five-field whitelist (and combinations); null optional allowed;
--    name null/blank/>500, optional >10000, nested JSON, {} or foreign key rejected.
--    Try price/type/family/composition/dose/code/flags/tenant/author overrides.
-- 4. Version mismatch/unknown ID leaves product/audit untouched. Success confirms
--    row/token + one audit, before/after ONLY changed keys; server actor/reason.
-- 5. Replay same key/content returns identical audit/token; altered content/actor/
--    target and wipe collision rejected. Real two-session concurrency key/product
--    tested separately: one effect; CAS loser conflicts; not simulated by claims.
-- 6. Forced audit or trigger failure rolls back product AND all trigger effects;
--    compare prices/formulacoes/volumes/related tables before/after. No incidental
--    side effects or trigger suppression permitted. No log classification changes.
-- 7. Direct ledger INSERT denied, UPDATE/DELETE of new operation denied; existing
--    wipe remains compatible. Review ledger owner, immutable trigger/ACL and JSON
--    constraint extension against LIVE schema before promotion.
-- 8. Rollback returns to applied baseline read20261010141924 and contained price/
--    audit20261010140830/20261010031113; never reopen client EXECUTE/writes. For live
--    rollback disable editor/revoke ONLY new RPCs under authorization; preserve
--    metadata audit history, no DELETE ledger or constraint narrowing with rows.
ROLLBACK;
