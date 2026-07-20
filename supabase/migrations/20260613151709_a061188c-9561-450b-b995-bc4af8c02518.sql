
-- =========================================================
-- Fase Financeiro 3.1 — Criação manual de títulos e fiscal
-- =========================================================

CREATE OR REPLACE FUNCTION public.rpc_create_financial_title(p_kind text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total numeric(14,2);
  v_count int;
  v_first_due date;
  v_category uuid;
  v_cc uuid;
  v_desc text;
  v_notes text;
  v_issue date;
  v_title_id uuid;
  v_installments jsonb;
  v_sum numeric(14,2) := 0;
  v_inst jsonb;
  v_fk_col text;
  v_table text;
  v_fiscal_req boolean;
  v_customer uuid;
  v_supplier_id uuid;
  v_supplier_name text;
  v_payment uuid;
  v_supplier_invoice_date date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para criar títulos financeiros.' USING ERRCODE='insufficient_privilege';
  END IF;

  IF p_kind NOT IN ('receivable','payable') THEN
    RAISE EXCEPTION 'Tipo de título inválido: %', p_kind USING ERRCODE='check_violation';
  END IF;

  v_desc       := NULLIF(p_payload->>'description','');
  v_category   := NULLIF(p_payload->>'category_id','')::uuid;
  v_cc         := NULLIF(p_payload->>'cost_center_id','')::uuid;
  v_total      := COALESCE((p_payload->>'total_amount')::numeric, 0);
  v_count      := COALESCE((p_payload->>'installment_count')::int, 1);
  v_first_due  := NULLIF(p_payload->>'first_due_date','')::date;
  v_issue      := COALESCE(NULLIF(p_payload->>'issue_date','')::date, CURRENT_DATE);
  v_notes      := NULLIF(p_payload->>'notes','');
  v_installments := p_payload->'installments';

  IF v_desc IS NULL THEN RAISE EXCEPTION 'Descrição obrigatória.'; END IF;
  IF v_category IS NULL THEN RAISE EXCEPTION 'Categoria obrigatória.'; END IF;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Valor total deve ser maior que zero.'; END IF;
  IF v_first_due IS NULL THEN RAISE EXCEPTION '1º vencimento obrigatório.'; END IF;
  IF v_count < 1 OR v_count > 36 THEN RAISE EXCEPTION 'Nº de parcelas deve estar entre 1 e 36.'; END IF;

  IF NOT EXISTS (SELECT 1 FROM financial_categories WHERE id = v_category) THEN
    RAISE EXCEPTION 'Categoria inexistente.';
  END IF;

  -- Validar parcelas customizadas (se fornecidas)
  IF v_installments IS NOT NULL AND jsonb_typeof(v_installments) = 'array' THEN
    IF jsonb_array_length(v_installments) <> v_count THEN
      RAISE EXCEPTION 'Qtd de parcelas customizadas (%) difere de installment_count (%)',
        jsonb_array_length(v_installments), v_count;
    END IF;
    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_installments) LOOP
      v_sum := v_sum + COALESCE((v_inst->>'amount')::numeric, 0);
    END LOOP;
    IF abs(v_sum - v_total) > 0.01 THEN
      RAISE EXCEPTION 'Soma das parcelas (%) difere do total (%)', v_sum, v_total;
    END IF;
  END IF;

  IF p_kind = 'receivable' THEN
    v_customer   := NULLIF(p_payload->>'customer_id','')::uuid;
    v_payment    := NULLIF(p_payload->>'payment_method_id','')::uuid;
    v_fiscal_req := COALESCE((p_payload->>'fiscal_invoice_required')::boolean, false);
    IF v_customer IS NULL THEN RAISE EXCEPTION 'Cliente obrigatório.'; END IF;

    INSERT INTO accounts_receivable (
      customer_id, description, category_id, cost_center_id,
      total_amount, issue_date, first_due_date, installment_count,
      notes, created_by, origin_type,
      fiscal_invoice_required, fiscal_invoice_status, payment_method_id
    ) VALUES (
      v_customer, v_desc, v_category, v_cc,
      v_total, v_issue, v_first_due, v_count,
      v_notes, v_uid, 'MANUAL',
      v_fiscal_req,
      CASE WHEN v_fiscal_req THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
      v_payment
    ) RETURNING id INTO v_title_id;

    v_table  := 'accounts_receivable_installments';
    v_fk_col := 'receivable_id';
  ELSE
    v_supplier_id   := NULLIF(p_payload->>'supplier_id','')::uuid;
    v_supplier_name := NULLIF(p_payload->>'supplier_name','');
    v_supplier_invoice_date := NULLIF(p_payload->>'supplier_invoice_date','')::date;
    IF v_supplier_id IS NULL AND v_supplier_name IS NULL THEN
      RAISE EXCEPTION 'Fornecedor obrigatório.';
    END IF;

    INSERT INTO accounts_payable (
      supplier_id, supplier_name, description, category_id, cost_center_id,
      total_amount, issue_date, first_due_date, installment_count,
      notes, created_by, origin_type, supplier_invoice_date
    ) VALUES (
      v_supplier_id, v_supplier_name, v_desc, v_category, v_cc,
      v_total, v_issue, v_first_due, v_count,
      v_notes, v_uid, 'MANUAL', v_supplier_invoice_date
    ) RETURNING id INTO v_title_id;

    v_table  := 'accounts_payable_installments';
    v_fk_col := 'payable_id';
  END IF;

  -- Substituir parcelas geradas pelo trigger quando o cliente envia customizadas
  IF v_installments IS NOT NULL AND jsonb_typeof(v_installments) = 'array' THEN
    EXECUTE format('DELETE FROM %I WHERE %I = $1', v_table, v_fk_col) USING v_title_id;
    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_installments) LOOP
      EXECUTE format(
        'INSERT INTO %I (%I, installment_number, due_date, original_amount, net_amount, status) VALUES ($1,$2,$3,$4,$4,''OPEN'')',
        v_table, v_fk_col
      ) USING v_title_id,
              COALESCE((v_inst->>'installment_number')::int, 1),
              (v_inst->>'due_date')::date,
              (v_inst->>'amount')::numeric;
    END LOOP;

    INSERT INTO financial_audit_log (entity_type, entity_id, action, old_data, new_data, performed_by)
    VALUES (v_table, v_title_id, 'FINANCIAL_INSTALLMENTS_CUSTOMIZED', NULL,
            jsonb_build_object('installment_count', v_count, 'total_amount', v_total), v_uid);
  END IF;

  INSERT INTO financial_audit_log (entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES (
    CASE WHEN p_kind='receivable' THEN 'accounts_receivable' ELSE 'accounts_payable' END,
    v_title_id,
    CASE WHEN p_kind='receivable' THEN 'AR_MANUAL_CREATED' ELSE 'AP_MANUAL_CREATED' END,
    NULL,
    jsonb_build_object(
      'total_amount', v_total,
      'installment_count', v_count,
      'first_due_date', v_first_due,
      'category_id', v_category
    ),
    v_uid
  );

  RETURN jsonb_build_object(
    'success', true,
    'kind', p_kind,
    'title_id', v_title_id,
    'installment_count', v_count,
    'total_amount', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_financial_title(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_financial_title(text, jsonb) TO authenticated;

-- =========================================================
-- Atualizar rpc_upsert_fiscal_invoice_manual com delivery_id
-- =========================================================
CREATE OR REPLACE FUNCTION public.rpc_upsert_fiscal_invoice_manual(p_receivable_id uuid, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ar  record;
  v_existing record;
  v_id uuid;
  v_status text;
  v_number text;
  v_series text;
  v_key text;
  v_issue date;
  v_type text;
  v_total numeric(14,2);
  v_delivery uuid;
  v_old jsonb;
  v_action text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para alterar dados fiscais.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_ar FROM accounts_receivable WHERE id = p_receivable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a receber não encontrada.'; END IF;

  v_status   := COALESCE(NULLIF(p_payload->>'status',''), 'PENDING');
  v_number   := NULLIF(p_payload->>'invoice_number','');
  v_series   := NULLIF(p_payload->>'series','');
  v_key      := NULLIF(p_payload->>'access_key','');
  v_issue    := NULLIF(p_payload->>'issue_date','')::date;
  v_type     := COALESCE(NULLIF(p_payload->>'invoice_type',''), 'NFE');
  v_total    := COALESCE((p_payload->>'total_amount')::numeric, v_ar.total_amount);
  v_delivery := NULLIF(p_payload->>'delivery_id','')::uuid;

  IF v_status NOT IN ('PENDING','ISSUED','CANCELED','ERROR') THEN
    RAISE EXCEPTION 'Status fiscal inválido: %', v_status USING ERRCODE='check_violation';
  END IF;

  SELECT * INTO v_existing FROM fiscal_invoices WHERE receivable_id = p_receivable_id LIMIT 1;

  IF FOUND THEN
    v_old := to_jsonb(v_existing);
    UPDATE fiscal_invoices SET
      status = v_status,
      invoice_number = v_number,
      series = v_series,
      access_key = v_key,
      issue_date = v_issue,
      invoice_type = v_type,
      total_amount = v_total,
      delivery_id = COALESCE(v_delivery, v_existing.delivery_id)
    WHERE id = v_existing.id
    RETURNING id INTO v_id;
    v_action := 'FISCAL_INVOICE_UPDATED';
  ELSE
    INSERT INTO fiscal_invoices(
      receivable_id, delivery_id, invoice_type, invoice_number, series, access_key,
      issue_date, total_amount, status, created_by
    ) VALUES (
      p_receivable_id, v_delivery, v_type, v_number, v_series, v_key,
      v_issue, v_total, v_status, v_uid
    ) RETURNING id INTO v_id;
    v_action := 'FISCAL_INVOICE_CREATED';
  END IF;

  UPDATE accounts_receivable SET
    fiscal_invoice_status = CASE
      WHEN v_status = 'ISSUED' THEN 'ISSUED'
      WHEN v_status = 'CANCELED' THEN 'CANCELED'
      WHEN v_status = 'PENDING' THEN 'PENDING'
      ELSE accounts_receivable.fiscal_invoice_status
    END,
    fiscal_invoice_number = COALESCE(v_number, fiscal_invoice_number),
    fiscal_access_key     = COALESCE(v_key, fiscal_access_key),
    fiscal_issue_date     = COALESCE(v_issue, fiscal_issue_date)
  WHERE id = p_receivable_id;

  INSERT INTO financial_audit_log (entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES ('fiscal_invoices', v_id, v_action, v_old,
          jsonb_build_object('status', v_status, 'invoice_number', v_number, 'delivery_id', v_delivery),
          v_uid);

  RETURN jsonb_build_object('invoice_id', v_id, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_upsert_fiscal_invoice_manual(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_fiscal_invoice_manual(uuid, jsonb) TO authenticated;
