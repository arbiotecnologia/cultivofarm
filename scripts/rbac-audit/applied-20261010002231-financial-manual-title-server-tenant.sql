CREATE OR REPLACE FUNCTION public.rpc_create_financial_title(p_kind text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := platform_private.h15_actor_organization();
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

  IF v_org IS NULL THEN RAISE EXCEPTION 'FINANCIAL_TENANT_REQUIRED' USING ERRCODE='42501'; END IF;
  IF (p_payload ? 'organization_id' AND NULLIF(p_payload->>'organization_id','')::uuid IS DISTINCT FROM v_org)
     OR (p_payload ? 'tenant_id' AND NULLIF(p_payload->>'tenant_id','')::uuid IS DISTINCT FROM v_org) THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_MISMATCH' USING ERRCODE='42501';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('receivable','payable') THEN
    RAISE EXCEPTION 'Tipo de título inválido: %', p_kind USING ERRCODE='check_violation';
  END IF;

  IF p_kind = 'payable' THEN
 IF NULLIF(btrim(p_payload->>'supplier_name'),'') IS NULL AND NULLIF(p_payload->>'supplier_id','') IS NULL THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_SUPPLIER' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR NULLIF(btrim(p_payload->>'description'),'') IS NULL THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_DESCRIPTION' USING ERRCODE='23514'; END IF;
 IF COALESCE((p_payload->>'total_amount')::numeric,0) <= 0 OR (p_payload->>'total_amount')::numeric::text IN ('NaN','Infinity','-Infinity') OR (p_payload->>'total_amount')::numeric <> round((p_payload->>'total_amount')::numeric,2) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_AMOUNT' USING ERRCODE='23514'; END IF;
 IF COALESCE((p_payload->>'installment_count')::numeric,1) NOT BETWEEN 1 AND 36 OR COALESCE((p_payload->>'installment_count')::numeric,1) <> trunc(COALESCE((p_payload->>'installment_count')::numeric,1)) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_COUNT' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE id=NULLIF(p_payload->>'category_id','')::uuid AND active AND type IN ('DESPESA','AMBOS')) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_CATEGORY' USING ERRCODE='23514'; END IF;
 IF NULLIF(p_payload->>'cost_center_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.financial_cost_centers WHERE id=(p_payload->>'cost_center_id')::uuid AND active) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_COST_CENTER' USING ERRCODE='23514'; END IF;
 IF p_payload ? 'installments' THEN
 IF jsonb_typeof(p_payload->'installments') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_INSTALLMENTS' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(p_payload->'installments') <> COALESCE((p_payload->>'installment_count')::int,1) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_COUNT' USING ERRCODE='23514'; END IF;
 FOR v_inst IN SELECT * FROM jsonb_array_elements(p_payload->'installments') LOOP
 IF jsonb_typeof(v_inst) IS DISTINCT FROM 'object' OR COALESCE((v_inst->>'amount')::numeric,0) <= 0 OR (v_inst->>'amount')::numeric::text IN ('NaN','Infinity','-Infinity') OR (v_inst->>'amount')::numeric <> round((v_inst->>'amount')::numeric,2) OR NULLIF(v_inst->>'due_date','')::date IS NULL THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_INSTALLMENT' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'installments') WITH ORDINALITY AS x(item,seq) WHERE (item->>'installment_number')::numeric IS DISTINCT FROM seq::numeric) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_SEQUENCE' USING ERRCODE='23514'; END IF;
 IF (SELECT sum((x->>'amount')::numeric) FROM jsonb_array_elements(p_payload->'installments') x) IS DISTINCT FROM (p_payload->>'total_amount')::numeric THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_SUM' USING ERRCODE='23514'; END IF;
 END IF;
 END IF;
 
 v_desc := NULLIF(p_payload->>'description','');
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

  IF p_kind = 'receivable' THEN
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR NULLIF(btrim(p_payload->>'description'),'') IS NULL THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_DESCRIPTION' USING ERRCODE='23514'; END IF;
 IF COALESCE((p_payload->>'total_amount')::numeric,0) <= 0 OR (p_payload->>'total_amount')::numeric::text IN ('NaN','Infinity','-Infinity') OR (p_payload->>'total_amount')::numeric <> round((p_payload->>'total_amount')::numeric,2) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_AMOUNT' USING ERRCODE='23514'; END IF;
 IF COALESCE((p_payload->>'installment_count')::numeric,1) NOT BETWEEN 1 AND 36 OR COALESCE((p_payload->>'installment_count')::numeric,1) <> trunc(COALESCE((p_payload->>'installment_count')::numeric,1)) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_COUNT' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE id=NULLIF(p_payload->>'category_id','')::uuid AND active AND type IN ('RECEITA','AMBOS')) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_CATEGORY' USING ERRCODE='23514'; END IF;
 IF NULLIF(p_payload->>'cost_center_id','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.financial_cost_centers WHERE id=(p_payload->>'cost_center_id')::uuid AND active) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_COST_CENTER' USING ERRCODE='23514'; END IF;
 IF p_payload ? 'installments' THEN
 IF jsonb_typeof(p_payload->'installments') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_INSTALLMENTS' USING ERRCODE='23514'; END IF;
 IF jsonb_array_length(p_payload->'installments') <> COALESCE((p_payload->>'installment_count')::int,1) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_COUNT' USING ERRCODE='23514'; END IF;
 FOR v_inst IN SELECT * FROM jsonb_array_elements(p_payload->'installments') LOOP
 IF jsonb_typeof(v_inst) IS DISTINCT FROM 'object' OR COALESCE((v_inst->>'amount')::numeric,0) <= 0 OR (v_inst->>'amount')::numeric::text IN ('NaN','Infinity','-Infinity') OR (v_inst->>'amount')::numeric <> round((v_inst->>'amount')::numeric,2) OR NULLIF(v_inst->>'due_date','')::date IS NULL THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_INSTALLMENT' USING ERRCODE='23514'; END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'installments') WITH ORDINALITY AS x(item,seq) WHERE (item->>'installment_number')::numeric IS DISTINCT FROM seq::numeric) THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_SEQUENCE' USING ERRCODE='23514'; END IF;
 IF (SELECT sum((x->>'amount')::numeric) FROM jsonb_array_elements(p_payload->'installments') x) IS DISTINCT FROM (p_payload->>'total_amount')::numeric THEN RAISE EXCEPTION 'FIN_TITLE_INVALID_SUM' USING ERRCODE='23514'; END IF;
 END IF;
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
      organization_id, customer_id, description, category_id, cost_center_id,
      total_amount, issue_date, first_due_date, installment_count,
      notes, created_by, origin_type,
      fiscal_invoice_required, fiscal_invoice_status, payment_method_id
    ) VALUES (
      v_org, v_customer, v_desc, v_category, v_cc,
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
      organization_id, supplier_id, supplier_name, description, category_id, cost_center_id,
      total_amount, issue_date, first_due_date, installment_count,
      notes, created_by, origin_type, supplier_invoice_date
    ) VALUES (
      v_org, v_supplier_id, v_supplier_name, v_desc, v_category, v_cc,
      v_total, v_issue, v_first_due, v_count,
      v_notes, v_uid, 'MANUAL', v_supplier_invoice_date
    ) RETURNING id INTO v_title_id;

    v_table  := 'accounts_payable_installments';
    v_fk_col := 'payable_id';
  END IF;

  -- Substituir parcelas geradas pelo trigger quando o cliente envia customizadas
  IF v_installments IS NOT NULL AND jsonb_typeof(v_installments) = 'array' THEN
    -- Preserve generated installments; update below without hard deletion.
    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_installments) LOOP
      EXECUTE format(
        'UPDATE %I SET due_date=$3, original_amount=$4, net_amount=$4 WHERE %I=$1 AND installment_number=$2',
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
$function$;