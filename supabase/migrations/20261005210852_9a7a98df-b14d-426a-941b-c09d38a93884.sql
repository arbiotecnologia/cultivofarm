CREATE TABLE public.catalog_platform_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  actor_id uuid NOT NULL,
  reason text NOT NULL,
  correlation_id uuid NOT NULL,
  status text NOT NULL,
  counts_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  counts_after jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT catalog_platform_admin_audit_operation_check CHECK (operation IN ('wipe_global_products')),
  CONSTRAINT catalog_platform_admin_audit_status_check CHECK (status IN ('completed')),
  CONSTRAINT catalog_platform_admin_audit_reason_check CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  CONSTRAINT catalog_platform_admin_audit_correlation_unique UNIQUE (correlation_id)
);

GRANT SELECT ON public.catalog_platform_admin_audit TO authenticated;
GRANT ALL ON public.catalog_platform_admin_audit TO service_role;

ALTER TABLE public.catalog_platform_admin_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_platform_admin_audit_superadmin_read
ON public.catalog_platform_admin_audit
FOR SELECT
TO authenticated
USING (public.is_platform_superadmin(auth.uid()));

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
  v_nullified bigint := 0;
  v_total_deleted bigint := 0;
  v_existing jsonb;
  v_tables constant text[] := ARRAY[
    'fiscal_invoices', 'entrega_checklist', 'entrega_comprovantes',
    'entrega_documentos', 'entrega_etiquetas', 'entrega_ocorrencias',
    'controle_qualidade', 'envase', 'estoque_movimentacoes',
    'ordens_servico_onfarm_status_history', 'production_order_link', 'aplicacoes',
    'produto_etiquetas', 'estoque_embalagens', 'estoque_produto', 'entregas',
    'lotes', 'programacao_producao', 'os_faturamento_base', 'ordens_servico_onfarm',
    'ordens_servico', 'partner_order_items', 'partner_simulation_items',
    'catalogo_volumes', 'commercial_campaign_products', 'cq_parametros_referencia',
    'partner_product_prices', 'product_crop_recommendations', 'product_fiscal_profiles',
    'product_target_recommendations', 'product_technical_profiles', 'formulacoes', 'produtos'
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
    'nullified', counts_after -> 'nullified',
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

  UPDATE public.registros_consultor_recomendacoes
  SET produto_biologico_sugerido_id = NULL
  WHERE produto_biologico_sugerido_id IS NOT NULL;
  GET DIAGNOSTICS v_nullified = ROW_COUNT;

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
    jsonb_build_object(
      'deleted', v_deleted,
      'nullified', jsonb_build_object('registros_consultor_recomendacoes.produto_biologico_sugerido_id', v_nullified),
      'total_deleted', v_total_deleted
    ),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'correlation_id', p_correlation_id,
    'deleted', v_deleted,
    'nullified', jsonb_build_object('registros_consultor_recomendacoes.produto_biologico_sugerido_id', v_nullified),
    'total_deleted', v_total_deleted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_wipe_global_product_catalog(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_wipe_global_product_catalog(uuid, text, uuid) TO service_role;

COMMENT ON TABLE public.catalog_platform_admin_audit IS 'Sanitized audit trail for global platform catalog administration.';
COMMENT ON FUNCTION public.platform_wipe_global_product_catalog(uuid, text, uuid) IS 'Atomic, idempotent global product catalog wipe callable only by service role after platform-superadmin validation.';