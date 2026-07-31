DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS NULL OR v_ref <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: ambiente nao autorizado (%)', COALESCE(v_ref,'null');
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure(p_partner_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_partner_order_id IS NULL THEN
    RAISE EXCEPTION 'partner_order_id_required' USING ERRCODE='P0001';
  END IF;

  -- Serializa concorrencia real (clique duplo / chamadas simultaneas).
  -- Chave unica bigint: assinatura pg_advisory_xact_lock(bigint).
  PERFORM pg_advisory_xact_lock(
    hashtextextended('b2b_receivable:' || p_partner_order_id::text, 0)
  );

  IF NOT public.fn_b2b_order_priceable(p_partner_order_id) THEN
    RAISE EXCEPTION 'order_not_priceable_quote_required' USING ERRCODE='P0001';
  END IF;

  RETURN public.generate_b2b_receivable_secure_impl(p_partner_order_id);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_hml_fiscal_emit_mock(p_receivable_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ref text; v_ar record; v_order_id uuid; v_inv_id uuid;
  v_seq int := 0; v_it record; v_key text; v_existing uuid; v_num text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_ONLY_ADAPTER' USING ERRCODE='P0001';
  END IF;

  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'administrador'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_ar FROM public.accounts_receivable WHERE id = p_receivable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'receivable_not_found' USING ERRCODE='P0001'; END IF;
  IF v_ar.fiscal_invoice_required IS NOT TRUE THEN
    RAISE EXCEPTION 'fiscal_not_required_for_receivable' USING ERRCODE='P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hml_fiscal_mock:' || p_receivable_id::text, 0));

  SELECT id INTO v_existing FROM public.fiscal_invoices
   WHERE receivable_id = p_receivable_id AND provider = 'mock_homologation' AND status <> 'CANCELED';
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicated', true, 'invoice_id', v_existing);
  END IF;

  IF v_ar.origin_type = 'B2B_ORDER' THEN v_order_id := v_ar.origin_id; END IF;

  v_key := 'MOCKHML-' || upper(substr(encode(sha256(convert_to(p_receivable_id::text,'UTF8')),'hex'), 1, 44));
  v_num := 'SIM' || lpad((abs(hashtext(p_receivable_id::text)) % 1000000)::text, 6, '0');

  INSERT INTO public.fiscal_invoices (
    receivable_id, invoice_type, document_model, document_origin, direction,
    environment, provider, provider_reference, provider_status_raw,
    status, normalized_status, reconciliation_status,
    invoice_number, series, access_key, issue_date, total_amount,
    nature_operation, fiscal_operation_type, fin_nfe,
    idempotency_key, created_by, notes
  ) VALUES (
    p_receivable_id, 'NFE', 'NFE', 'PROVIDER_INTEGRATED', 'OUT',
    'HOMOLOGATION', 'mock_homologation', 'SIM-' || left(p_receivable_id::text, 8), 'SIMULATED',
    'ISSUED', 'AUTHORIZED', 'NOT_APPLICABLE',
    v_num, '900', v_key, current_date, COALESCE(v_ar.total_amount, 0),
    'Venda de mercadoria (homologacao simulada)', 'NORMAL', 1,
    'mockhml:' || p_receivable_id::text, auth.uid(),
    'DOCUMENTO SIMULADO DE HOMOLOGACAO - SEM VALOR FISCAL'
  ) RETURNING id INTO v_inv_id;

  IF v_order_id IS NOT NULL THEN
    FOR v_it IN
      SELECT poi.id, poi.quantidade, poi.unidade_medida,
             COALESCE(poi.preco_unitario_final_snapshot, poi.preco_unitario) AS preco,
             COALESCE(poi.produto_nome_snapshot, 'Item') AS nome
        FROM public.partner_order_items poi
       WHERE poi.order_id = v_order_id
       ORDER BY poi.id
    LOOP
      v_seq := v_seq + 1;
      INSERT INTO public.fiscal_invoice_items (
        fiscal_invoice_id, source_item_type, source_item_id, partner_order_item_id,
        item_sequence, item_kind, description, quantity, commercial_unit,
        unit_value, gross_value, net_value,
        ncm_snapshot, cfop_snapshot, cst_icms_snapshot, origem_snapshot
      ) VALUES (
        v_inv_id, 'PARTNER_ORDER_ITEM', v_it.id, v_it.id,
        v_seq, 'PRODUCT', v_it.nome, v_it.quantidade, COALESCE(v_it.unidade_medida,'UN'),
        v_it.preco, ROUND(v_it.preco * v_it.quantidade, 2), ROUND(v_it.preco * v_it.quantidade, 2),
        '38089999', '5102', '00', '0'
      );
    END LOOP;
  END IF;

  UPDATE public.accounts_receivable
     SET fiscal_invoice_status = 'AUTHORIZED_SIMULATED',
         fiscal_invoice_number = v_num,
         fiscal_access_key = v_key,
         fiscal_issue_date = current_date
   WHERE id = p_receivable_id;

  RETURN jsonb_build_object('ok', true, 'duplicated', false, 'invoice_id', v_inv_id,
                            'provider','mock_homologation','environment','HOMOLOGATION',
                            'provider_status_raw','SIMULATED','items', v_seq);
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_hml_fiscal_emit_mock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_hml_fiscal_emit_mock(uuid) TO authenticated, service_role;