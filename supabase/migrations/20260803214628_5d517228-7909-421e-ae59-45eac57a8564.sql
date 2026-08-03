
CREATE OR REPLACE FUNCTION public.fn_generate_receivable_from_entrega(_entrega_id uuid, _payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_entrega public.entregas%ROWTYPE;
  v_receivable_id uuid;
  v_total numeric(14,2);
  v_count integer;
  v_category uuid;
  v_cost_center uuid;
  v_payment_method uuid;
  v_first_due date;
  v_issue date;
  v_fiscal_required boolean;
  v_fiscal_status text;
  v_installments jsonb;
  v_sum numeric(14,2) := 0;
  v_inst jsonb;
  v_desc text;
  v_notes text;
  v_guard jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;

  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para faturar entregas.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_entrega FROM public.entregas WHERE id = _entrega_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrega não encontrada.';
  END IF;

  IF v_entrega.receivable_id IS NOT NULL THEN
    RAISE EXCEPTION 'Entrega já possui conta a receber.' USING ERRCODE='check_violation';
  END IF;

  IF v_entrega.status = 'cancelada' THEN
    RAISE EXCEPTION 'Entrega cancelada não pode ser faturada.' USING ERRCODE='check_violation';
  END IF;

  IF v_entrega.status <> 'entregue' THEN
    RAISE EXCEPTION 'Entrega precisa estar com status "entregue" para faturar.' USING ERRCODE='check_violation';
  END IF;

  IF v_entrega.cliente_id IS NULL THEN
    RAISE EXCEPTION 'Entrega sem cliente vinculado.' USING ERRCODE='check_violation';
  END IF;

  IF v_entrega.financial_status = 'NOT_BILLABLE' THEN
    RAISE EXCEPTION 'Entrega marcada como não faturável.' USING ERRCODE='check_violation';
  END IF;

  v_total           := COALESCE((_payload->>'total_amount')::numeric, 0);
  v_count           := COALESCE((_payload->>'installment_count')::integer, 1);
  v_category        := NULLIF(_payload->>'category_id','')::uuid;
  v_cost_center     := NULLIF(_payload->>'cost_center_id','')::uuid;
  v_payment_method  := NULLIF(_payload->>'payment_method_id','')::uuid;
  v_first_due       := COALESCE((_payload->>'first_due_date')::date, CURRENT_DATE);
  v_issue           := COALESCE((_payload->>'issue_date')::date, CURRENT_DATE);
  v_fiscal_required := COALESCE((_payload->>'fiscal_invoice_required')::boolean, false);
  v_fiscal_status   := CASE WHEN v_fiscal_required THEN 'PENDING' ELSE 'NOT_REQUIRED' END;
  v_installments    := _payload->'installments';
  v_desc            := COALESCE(NULLIF(_payload->>'description',''), 'Entrega ' || substr(_entrega_id::text,1,8));
  v_notes           := NULLIF(_payload->>'notes','');

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Valor total inválido.' USING ERRCODE='check_violation';
  END IF;
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'Categoria financeira é obrigatória.' USING ERRCODE='check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_categories WHERE id = v_category) THEN
    RAISE EXCEPTION 'Categoria financeira não encontrada.' USING ERRCODE='check_violation';
  END IF;
  IF v_count < 1 OR v_count > 36 THEN
    RAISE EXCEPTION 'Número de parcelas deve estar entre 1 e 36.' USING ERRCODE='check_violation';
  END IF;

  -- GATE: reconciliação obrigatória quando há conferência por item
  v_guard := public.fn_entrega_guard_faturamento_v1(_entrega_id, v_total);

  IF v_installments IS NOT NULL AND jsonb_array_length(v_installments) > 0 THEN
    IF jsonb_array_length(v_installments) <> v_count THEN
      RAISE EXCEPTION 'Quantidade de parcelas (%) diverge de installment_count (%).',
        jsonb_array_length(v_installments), v_count USING ERRCODE='check_violation';
    END IF;
    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_installments) LOOP
      v_sum := v_sum + COALESCE((v_inst->>'amount')::numeric, 0);
    END LOOP;
    IF abs(v_sum - v_total) > 0.01 THEN
      RAISE EXCEPTION 'Soma das parcelas (%) difere do total (%).', v_sum, v_total USING ERRCODE='check_violation';
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.accounts_receivable (
      origin_type, origin_id, customer_id, description, category_id, cost_center_id,
      total_amount, issue_date, first_due_date, installment_count,
      payment_method_id, fiscal_invoice_required, fiscal_invoice_status,
      notes, created_by
    ) VALUES (
      'DELIVERY', _entrega_id, v_entrega.cliente_id, v_desc, v_category, v_cost_center,
      v_total, v_issue, v_first_due, v_count,
      v_payment_method, v_fiscal_required, v_fiscal_status,
      v_notes, v_uid
    ) RETURNING id INTO v_receivable_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Entrega já possui conta a receber ativa.' USING ERRCODE='check_violation';
  END;

  IF v_installments IS NOT NULL AND jsonb_array_length(v_installments) > 0 THEN
    DELETE FROM public.accounts_receivable_installments WHERE receivable_id = v_receivable_id;
    FOR v_inst IN SELECT * FROM jsonb_array_elements(v_installments) LOOP
      INSERT INTO public.accounts_receivable_installments (
        receivable_id, installment_number, due_date, original_amount, net_amount, status
      ) VALUES (
        v_receivable_id,
        (v_inst->>'installment_number')::integer,
        (v_inst->>'due_date')::date,
        (v_inst->>'amount')::numeric,
        (v_inst->>'amount')::numeric,
        'OPEN'
      );
    END LOOP;
  END IF;

  UPDATE public.entregas
     SET receivable_id = v_receivable_id,
         financial_status = 'BILLED',
         billing_generated_at = now(),
         billing_generated_by = v_uid
   WHERE id = _entrega_id;

  INSERT INTO public.financial_audit_log (
    entity_type, entity_id, action, old_data, new_data, performed_by
  ) VALUES (
    'entregas', _entrega_id, 'DELIVERY_BILLED',
    jsonb_build_object(
      'receivable_id', v_entrega.receivable_id,
      'financial_status', v_entrega.financial_status
    ),
    jsonb_build_object(
      'receivable_id', v_receivable_id,
      'total_amount', v_total,
      'installment_count', v_count,
      'fiscal_invoice_required', v_fiscal_required,
      'payment_method_id', v_payment_method,
      'origem', 'entrega',
      'reconciliacao', v_guard
    ),
    v_uid
  );

  RETURN v_receivable_id;
END;
$function$;
