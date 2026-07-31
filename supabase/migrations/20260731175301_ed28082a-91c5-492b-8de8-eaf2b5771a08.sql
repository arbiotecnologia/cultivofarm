CREATE OR REPLACE FUNCTION public.rpc_hml_fiscal_emit_mock(p_receivable_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ref text; v_ar record; v_order_id uuid; v_inv_id uuid;
  v_seq int := 0; v_it record; v_key text; v_existing uuid; v_num text;
  v_company record; v_partner record;
  v_uf_dest text; v_cfop text; v_cst text; v_csosn text; v_simples boolean;
  v_kind text; v_net numeric; v_sum numeric := 0;
  v_src text; v_prof_id uuid; v_ncm text; v_cest text; v_origin text;
  v_cfop_in text; v_cfop_out text; v_icms_cst text; v_icms_csosn text;
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
  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_SOURCE_UNSUPPORTED' USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_company FROM public.company_fiscal_settings WHERE is_active IS TRUE LIMIT 1;
  IF v_company.id IS NULL OR v_company.state IS NULL OR v_company.crt IS NULL THEN
    RAISE EXCEPTION 'FISCAL_PROFILE_INCOMPLETE: company_fiscal_settings' USING ERRCODE='P0001';
  END IF;
  v_simples := v_company.crt::text IN ('1','2');

  SELECT pa.* INTO v_partner
    FROM public.partner_orders po JOIN public.partner_accounts pa ON pa.id = po.partner_id
   WHERE po.id = v_order_id;
  v_uf_dest := COALESCE(v_partner.entrega_estado, v_partner.commercial_state);
  IF v_uf_dest IS NULL THEN
    RAISE EXCEPTION 'FISCAL_PROFILE_INCOMPLETE: partner_uf' USING ERRCODE='P0001';
  END IF;

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
    'DRAFT', 'DRAFT', 'NOT_APPLICABLE',
    v_num, '900', v_key, current_date, COALESCE(v_ar.total_amount, 0),
    'Venda de mercadoria (homologacao simulada)', 'NORMAL', 1,
    'mockhml:' || p_receivable_id::text, auth.uid(),
    'DOCUMENTO SIMULADO DE HOMOLOGACAO - SEM VALOR FISCAL'
  ) RETURNING id INTO v_inv_id;

  FOR v_it IN
    SELECT poi.id, poi.product_id, poi.microrganismo_id, poi.quantidade, poi.unidade_medida,
           COALESCE(poi.preco_unitario_final_snapshot, poi.preco_unitario) AS preco,
           COALESCE(poi.produto_nome_snapshot, 'Item') AS nome
      FROM public.partner_order_items poi
     WHERE poi.order_id = v_order_id
     ORDER BY poi.id
  LOOP
    v_seq := v_seq + 1;
    v_kind := CASE WHEN v_it.microrganismo_id IS NOT NULL THEN 'MICROORGANISM' ELSE 'PRODUCT' END;

    v_src := NULL; v_prof_id := NULL; v_ncm := NULL; v_cest := NULL; v_origin := NULL;
    v_cfop_in := NULL; v_cfop_out := NULL; v_icms_cst := NULL; v_icms_csosn := NULL;

    IF v_kind = 'MICROORGANISM' THEN
      SELECT 'microorganism_fiscal_profiles', mfp.id, mfp.ncm, mfp.cest, mfp.origin_code,
             mfp.cfop_in_state, mfp.cfop_interstate, mfp.icms_cst, mfp.icms_csosn
        INTO v_src, v_prof_id, v_ncm, v_cest, v_origin, v_cfop_in, v_cfop_out, v_icms_cst, v_icms_csosn
        FROM public.microorganism_fiscal_profiles mfp
       WHERE mfp.microorganism_id = v_it.microrganismo_id
         AND mfp.is_active IS TRUE
         AND mfp.profile_status <> 'NOT_FISCALLY_SOLD'
       LIMIT 1;
    ELSIF v_it.product_id IS NOT NULL THEN
      SELECT 'product_fiscal_profiles', pfp.id, pfp.ncm, pfp.cest, pfp.origin_code,
             pfp.cfop_in_state, pfp.cfop_interstate, pfp.icms_cst, pfp.icms_csosn
        INTO v_src, v_prof_id, v_ncm, v_cest, v_origin, v_cfop_in, v_cfop_out, v_icms_cst, v_icms_csosn
        FROM public.product_fiscal_profiles pfp
       WHERE pfp.product_id = v_it.product_id AND pfp.is_active IS TRUE
       LIMIT 1;
    END IF;

    IF v_prof_id IS NULL THEN
      RAISE EXCEPTION 'FISCAL_PROFILE_INCOMPLETE: item % (%), sem perfil fiscal ativo', v_seq, v_kind
        USING ERRCODE='P0001';
    END IF;

    v_cfop  := CASE WHEN v_uf_dest = v_company.state THEN v_cfop_in ELSE v_cfop_out END;
    v_cst   := CASE WHEN v_simples THEN NULL ELSE v_icms_cst END;
    v_csosn := CASE WHEN v_simples THEN v_icms_csosn ELSE NULL END;

    IF v_ncm IS NULL OR v_origin IS NULL OR v_cfop IS NULL
       OR (v_simples AND v_csosn IS NULL) OR (NOT v_simples AND v_cst IS NULL) THEN
      RAISE EXCEPTION 'FISCAL_PROFILE_INCOMPLETE: item % sem NCM/CFOP/CST/CSOSN/origem', v_seq
        USING ERRCODE='P0001';
    END IF;

    v_net := ROUND(v_it.preco * v_it.quantidade, 2);
    v_sum := v_sum + v_net;

    INSERT INTO public.fiscal_invoice_items (
      fiscal_invoice_id, source_item_type, source_item_id, partner_order_item_id,
      item_sequence, item_kind, description, quantity, commercial_unit,
      unit_value, gross_value, net_value,
      ncm_snapshot, cest_snapshot, cfop_snapshot, cst_icms_snapshot, csosn_snapshot, origem_snapshot,
      fiscal_profile_snapshot
    ) VALUES (
      v_inv_id, 'PARTNER_ORDER_ITEM', v_it.id, v_it.id,
      v_seq, v_kind, v_it.nome, v_it.quantidade, COALESCE(v_it.unidade_medida,'UN'),
      v_it.preco, v_net, v_net,
      v_ncm, v_cest, v_cfop, v_cst, v_csosn, v_origin::text,
      jsonb_build_object('source', v_src, 'profile_id', v_prof_id,
                         'item_kind', v_kind, 'uf_origem', v_company.state, 'uf_destino', v_uf_dest,
                         'crt', v_company.crt, 'simulated', true)
    );
  END LOOP;

  IF v_seq = 0 THEN
    RAISE EXCEPTION 'FISCAL_PROFILE_INCOMPLETE: pedido sem itens' USING ERRCODE='P0001';
  END IF;

  IF ROUND(v_sum,2) <> ROUND(COALESCE(v_ar.total_amount,0),2) THEN
    RAISE EXCEPTION 'FISCAL_TOTALS_MISMATCH: itens=% recebivel=%', ROUND(v_sum,2), ROUND(COALESCE(v_ar.total_amount,0),2)
      USING ERRCODE='P0001';
  END IF;

  UPDATE public.fiscal_invoices
     SET status = 'ISSUED', normalized_status = 'AUTHORIZED',
         provider_status_raw = 'SIMULATED', authorized_at = now(),
         total_amount = ROUND(v_sum,2)
   WHERE id = v_inv_id;

  UPDATE public.accounts_receivable
     SET fiscal_invoice_status = 'ISSUED',
         fiscal_invoice_number = v_num,
         fiscal_access_key = v_key,
         fiscal_issue_date = current_date
   WHERE id = p_receivable_id;

  RETURN jsonb_build_object('ok', true, 'duplicated', false, 'invoice_id', v_inv_id,
                            'provider','mock_homologation','environment','HOMOLOGATION',
                            'provider_status_raw','SIMULATED','items', v_seq,
                            'items_total', ROUND(v_sum,2), 'real_fiscal_document', false);
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_hml_fiscal_emit_mock(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_hml_fiscal_emit_mock(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_hml_fiscal_emit_mock(uuid) TO authenticated;