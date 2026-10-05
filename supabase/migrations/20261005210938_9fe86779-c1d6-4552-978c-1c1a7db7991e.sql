CREATE OR REPLACE FUNCTION public.platform_wipe_global_product_catalog(
  p_actor_id uuid,
  p_reason text,
  p_correlation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_table text;
  v_count bigint;
  v_before jsonb := '{}'::jsonb;
  v_deleted jsonb := '{}'::jsonb;
  v_total_deleted bigint := 0;
  v_existing jsonb;
  v_tables constant text[] := ARRAY[
    'catalogo_volumes',
    'product_crop_recommendations',
    'product_fiscal_profiles',
    'product_target_recommendations',
    'product_technical_profiles',
    'formulacoes',
    'produtos'
  ];
BEGIN
  IF p_actor_id IS NULL OR NOT public.is_platform_superadmin(p_actor_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_correlation_id IS NULL THEN
    RAISE EXCEPTION 'correlation_id_required' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'invalid_reason' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('platform_wipe_global_product_catalog', 0));

  SELECT jsonb_build_object(
    'ok', true,
    'idempotent', true,
    'correlation_id', correlation_id,
    'deleted', counts_after -> 'deleted',
    'total_deleted', COALESCE((counts_after ->> 'total_deleted')::bigint, 0)
  )
  INTO v_existing
  FROM public.catalog_platform_admin_audit
  WHERE correlation_id = p_correlation_id
    AND operation = 'wipe_global_products'
    AND status = 'completed';

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_count;
    v_before := v_before || jsonb_build_object(v_table, v_count);
  END LOOP;

  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format('DELETE FROM public.%I WHERE id IS NOT NULL', v_table);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted := v_deleted || jsonb_build_object(v_table, v_count);
    v_total_deleted := v_total_deleted + v_count;
  END LOOP;

  INSERT INTO public.catalog_platform_admin_audit (
    operation, actor_id, reason, correlation_id, status,
    counts_before, counts_after, completed_at
  ) VALUES (
    'wipe_global_products', p_actor_id, btrim(p_reason), p_correlation_id, 'completed',
    v_before,
    jsonb_build_object('deleted', v_deleted, 'total_deleted', v_total_deleted),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'correlation_id', p_correlation_id,
    'deleted', v_deleted,
    'total_deleted', v_total_deleted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_wipe_global_product_catalog(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_wipe_global_product_catalog(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.platform_wipe_global_product_catalog(uuid, text, uuid) IS 'Atomic and idempotent wipe limited to global catalog tables. Operational history is never deleted; foreign-key references fail the entire transaction closed.';