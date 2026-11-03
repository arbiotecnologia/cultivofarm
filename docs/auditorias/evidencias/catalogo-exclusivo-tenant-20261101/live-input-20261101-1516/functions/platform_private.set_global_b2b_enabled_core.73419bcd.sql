CREATE OR REPLACE FUNCTION platform_private.set_global_b2b_enabled_core(p_item_tipo text, p_id uuid, p_expected_updated_at timestamp with time zone, p_b2b_enabled boolean, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
