CREATE OR REPLACE FUNCTION platform_private.update_global_product_metadata_core(p_id uuid, p_expected_updated_at timestamp with time zone, p_patch jsonb, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
