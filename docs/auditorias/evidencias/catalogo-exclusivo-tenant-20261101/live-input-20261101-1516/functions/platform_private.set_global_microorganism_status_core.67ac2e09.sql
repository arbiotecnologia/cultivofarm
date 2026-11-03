CREATE OR REPLACE FUNCTION platform_private.set_global_microorganism_status_core(p_id uuid, p_expected_updated_at timestamp with time zone, p_ativo boolean, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
