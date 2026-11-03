CREATE OR REPLACE FUNCTION platform_private.set_global_product_status_core(p_id uuid, p_expected_updated_at timestamp with time zone, p_ativo boolean, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
