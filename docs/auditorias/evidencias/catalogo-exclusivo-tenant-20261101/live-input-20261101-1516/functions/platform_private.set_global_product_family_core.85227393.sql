CREATE OR REPLACE FUNCTION platform_private.set_global_product_family_core(p_id uuid, p_expected_updated_at timestamp with time zone, p_familia text, p_classe text, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor uuid; v_req jsonb; v_replay jsonb; v_receipt jsonb; v_audit uuid := gen_random_uuid();
  v_op public.produtos%ROWTYPE; v_np public.produtos%ROWTYPE; v_old jsonb; v_new jsonb;
  v_vols_before jsonb; v_vols_after jsonb; v_classe text := NULLIF(pg_catalog.btrim(COALESCE(p_classe,'')), '');
BEGIN
  v_actor := platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at) OR p_idempotency_key IS NULL
     OR p_familia IS NULL OR p_familia NOT IN ('biologico','quimico','fertilizante_adubo') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_family_invalid';
  END IF;
  v_req := pg_catalog.jsonb_build_object('id',p_id,'expected_updated_at',p_expected_updated_at,
    'familia_catalogo',p_familia,'classe_catalogo',v_classe,'reason',pg_catalog.btrim(COALESCE(p_reason,'')));
  v_replay := platform_private.catalog_entity_replay(v_actor,'set_global_product_family',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;

  -- Revalidação mutante APÓS o replay: só nova execução exige rótulo ativo (com lock).
  IF NOT (v_classe IS NULL OR platform_private.catalog_family_label_check(p_familia, v_classe)) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_family_invalid';
  END IF;

  SELECT * INTO v_op FROM public.produtos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_family_unavailable'; END IF;
  IF v_op.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_family_conflict'; END IF;
  IF v_op.familia_catalogo IS NOT DISTINCT FROM p_familia AND v_op.classe_catalogo IS NOT DISTINCT FROM v_classe THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_family_no_change'; END IF;
  v_old := pg_catalog.to_jsonb(v_op);
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cv) ORDER BY cv.id),'[]'::jsonb) INTO v_vols_before
    FROM public.catalogo_volumes cv WHERE cv.produto_id=p_id;

  UPDATE public.produtos SET familia_catalogo=p_familia, classe_catalogo=v_classe
   WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_np;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_family_confirmation_failed'; END IF;
  v_new := pg_catalog.to_jsonb(v_np);
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cv) ORDER BY cv.id),'[]'::jsonb) INTO v_vols_after
    FROM public.catalogo_volumes cv WHERE cv.produto_id=p_id;
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
$function$
