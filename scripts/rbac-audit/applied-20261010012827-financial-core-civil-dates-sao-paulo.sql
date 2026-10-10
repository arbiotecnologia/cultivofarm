-- Align core financial civil dates with the existing America/Sao_Paulo UI contract.
-- No historical data rewrite, new privilege, role, relation, or function signature.
CREATE OR REPLACE FUNCTION public.fn_recalc_payable_installment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst public.accounts_payable_installments%ROWTYPE;
  v_total_pago numeric(14,2);
  v_total_desc numeric(14,2);
  v_total_juros numeric(14,2);
  v_total_multa numeric(14,2);
  v_status text;
  v_inst_id uuid := COALESCE(NEW.installment_id, OLD.installment_id);
  v_parent_id uuid;
  v_open int; v_partial int; v_paid int; v_canc int; v_total int;
BEGIN
  SELECT * INTO v_inst FROM public.accounts_payable_installments WHERE id = v_inst_id;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(amount_paid),0), COALESCE(SUM(discount_amount),0),
         COALESCE(SUM(interest_amount),0), COALESCE(SUM(penalty_amount),0)
    INTO v_total_pago, v_total_desc, v_total_juros, v_total_multa
    FROM public.payable_payments WHERE installment_id = v_inst_id;

  IF (v_total_pago + v_total_desc) >= (v_inst.original_amount + v_total_juros + v_total_multa) THEN v_status := 'PAID';
  ELSIF v_total_pago > 0 THEN v_status := 'PARTIAL';
  ELSE v_status := CASE WHEN v_inst.due_date < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'OVERDUE' ELSE 'OPEN' END;
  END IF;

  UPDATE public.accounts_payable_installments
    SET paid_amount = v_total_pago, discount_amount = v_total_desc,
        interest_amount = v_total_juros, penalty_amount = v_total_multa,
        status = v_status,
        paid_at = CASE WHEN v_status='PAID' THEN now() ELSE NULL END
    WHERE id = v_inst_id;

  v_parent_id := v_inst.payable_id;
  SELECT count(*) FILTER (WHERE status='OPEN'),
         count(*) FILTER (WHERE status='PARTIAL'),
         count(*) FILTER (WHERE status='PAID'),
         count(*) FILTER (WHERE status='CANCELED'),
         count(*)
    INTO v_open, v_partial, v_paid, v_canc, v_total
    FROM public.accounts_payable_installments WHERE payable_id = v_parent_id;

  UPDATE public.accounts_payable SET status = CASE
    WHEN v_canc = v_total THEN 'CANCELED'
    WHEN (v_paid + v_canc) = v_total AND v_paid > 0 THEN 'PAID'
    WHEN v_paid > 0 OR v_partial > 0 THEN 'PARTIAL'
    WHEN EXISTS (SELECT 1 FROM public.accounts_payable_installments WHERE payable_id = v_parent_id AND status='OVERDUE') THEN 'OVERDUE'
    ELSE 'OPEN'
  END WHERE id = v_parent_id AND status <> 'CANCELED';

  RETURN COALESCE(NEW, OLD);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_recalc_receivable_installment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inst public.accounts_receivable_installments%ROWTYPE;
  v_total_recebido numeric(14,2);
  v_total_desc numeric(14,2);
  v_total_juros numeric(14,2);
  v_total_multa numeric(14,2);
  v_status text;
  v_inst_id uuid := COALESCE(NEW.installment_id, OLD.installment_id);
  v_parent_id uuid;
  v_open int;
  v_partial int;
  v_paid int;
  v_canc int;
  v_total int;
BEGIN
  SELECT * INTO v_inst FROM public.accounts_receivable_installments WHERE id = v_inst_id;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(amount_received),0), COALESCE(SUM(discount_amount),0),
         COALESCE(SUM(interest_amount),0), COALESCE(SUM(penalty_amount),0)
    INTO v_total_recebido, v_total_desc, v_total_juros, v_total_multa
    FROM public.receivable_payments WHERE installment_id = v_inst_id;

  IF (v_total_recebido + v_total_desc) >= (v_inst.original_amount + v_total_juros + v_total_multa) THEN
    v_status := 'PAID';
  ELSIF v_total_recebido > 0 THEN
    v_status := 'PARTIAL';
  ELSE
    v_status := CASE WHEN v_inst.due_date < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'OVERDUE' ELSE 'OPEN' END;
  END IF;

  UPDATE public.accounts_receivable_installments
    SET received_amount = v_total_recebido,
        discount_amount = v_total_desc,
        interest_amount = v_total_juros,
        penalty_amount = v_total_multa,
        status = v_status,
        paid_at = CASE WHEN v_status = 'PAID' THEN now() ELSE NULL END
    WHERE id = v_inst_id;

  -- Recalcular pai
  v_parent_id := v_inst.receivable_id;
  SELECT count(*) FILTER (WHERE status='OPEN'),
         count(*) FILTER (WHERE status='PARTIAL'),
         count(*) FILTER (WHERE status='PAID'),
         count(*) FILTER (WHERE status='CANCELED'),
         count(*)
    INTO v_open, v_partial, v_paid, v_canc, v_total
    FROM public.accounts_receivable_installments WHERE receivable_id = v_parent_id;

  UPDATE public.accounts_receivable SET status = CASE
    WHEN v_canc = v_total THEN 'CANCELED'
    WHEN (v_paid + v_canc) = v_total AND v_paid > 0 THEN 'PAID'
    WHEN v_paid > 0 OR v_partial > 0 THEN 'PARTIAL'
    WHEN EXISTS (SELECT 1 FROM public.accounts_receivable_installments WHERE receivable_id = v_parent_id AND status='OVERDUE') THEN 'OVERDUE'
    ELSE 'OPEN'
  END WHERE id = v_parent_id AND status <> 'CANCELED';

  RETURN COALESCE(NEW, OLD);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_reverse_payment(_payment_id uuid, _kind text, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := platform_private.h15_actor_organization();
  v_new_id uuid;
  v_row record;
  v_inst_status text;
  v_prev record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão obrigatória.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Apenas administrador, gestor ou financeiro podem estornar uma baixa.'
      USING ERRCODE='insufficient_privilege';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Informe um motivo (mín. 5 caracteres) para o estorno.'
      USING ERRCODE='check_violation';
  END IF;
  IF _kind IS NULL OR _kind NOT IN ('receivable','payable') THEN
    RAISE EXCEPTION 'Tipo inválido: %', _kind;
  END IF;

  IF v_org IS NULL THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  IF _kind='receivable' THEN
    IF NOT EXISTS (SELECT 1 FROM public.receivable_payments WHERE id=_payment_id AND organization_id=v_org) THEN
      RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.payable_payments WHERE id=_payment_id AND organization_id=v_org) THEN
      RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501';
    END IF;
  END IF;
  -- lock determinístico por intencao de reversao (mesma baixa original)
  PERFORM pg_advisory_xact_lock(hashtextextended('fin_reverse:' || _kind || ':' || _payment_id::text, 0));

  IF _kind = 'receivable' THEN
    SELECT * INTO v_row FROM public.receivable_payments WHERE id = _payment_id AND organization_id=v_org FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
    IF v_row.is_reversal THEN RAISE EXCEPTION 'Não é possível estornar um registro de estorno.'; END IF;

    -- replay estavel: mesma intencao -> devolve reversao existente
    SELECT id, reversal_reason INTO v_prev FROM public.receivable_payments
     WHERE reversed_payment_id = _payment_id AND is_reversal = true;
    IF v_prev.id IS NOT NULL THEN
      IF trim(COALESCE(v_prev.reversal_reason,'')) IS DISTINCT FROM trim(_reason) THEN
        RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: baixa já estornada com motivo divergente.'
          USING ERRCODE='check_violation';
      END IF;
      RETURN v_prev.id;
    END IF;

    SELECT status INTO v_inst_status FROM public.accounts_receivable_installments WHERE id = v_row.installment_id;
    IF v_inst_status = 'CANCELED' THEN
      RAISE EXCEPTION 'Não é possível estornar baixa de parcela cancelada.';
    END IF;

    INSERT INTO public.receivable_payments(
      organization_id, installment_id, payment_date, payment_method_id, bank_account_id,
      amount_received, discount_amount, interest_amount, penalty_amount,
      notes, created_by, is_reversal, reversed_payment_id, reversal_reason
    ) VALUES (
      v_org, v_row.installment_id, (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date, v_row.payment_method_id, v_row.bank_account_id,
      -v_row.amount_received, -COALESCE(v_row.discount_amount,0),
      -COALESCE(v_row.interest_amount,0), -COALESCE(v_row.penalty_amount,0),
      '[ESTORNO] '||_reason, v_uid, true, _payment_id, _reason
    ) RETURNING id INTO v_new_id;

  ELSE
    SELECT * INTO v_row FROM public.payable_payments WHERE id = _payment_id AND organization_id=v_org FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;
    IF v_row.is_reversal THEN RAISE EXCEPTION 'Não é possível estornar um registro de estorno.'; END IF;

    SELECT id, reversal_reason INTO v_prev FROM public.payable_payments
     WHERE reversed_payment_id = _payment_id AND is_reversal = true;
    IF v_prev.id IS NOT NULL THEN
      IF trim(COALESCE(v_prev.reversal_reason,'')) IS DISTINCT FROM trim(_reason) THEN
        RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: baixa já estornada com motivo divergente.'
          USING ERRCODE='check_violation';
      END IF;
      RETURN v_prev.id;
    END IF;

    SELECT status INTO v_inst_status FROM public.accounts_payable_installments WHERE id = v_row.installment_id;
    IF v_inst_status = 'CANCELED' THEN
      RAISE EXCEPTION 'Não é possível estornar baixa de parcela cancelada.';
    END IF;

    INSERT INTO public.payable_payments(
      organization_id, installment_id, payment_date, payment_method_id, bank_account_id,
      amount_paid, discount_amount, interest_amount, penalty_amount,
      notes, created_by, is_reversal, reversed_payment_id, reversal_reason
    ) VALUES (
      v_org, v_row.installment_id, (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date, v_row.payment_method_id, v_row.bank_account_id,
      -v_row.amount_paid, -COALESCE(v_row.discount_amount,0),
      -COALESCE(v_row.interest_amount,0), -COALESCE(v_row.penalty_amount,0),
      '[ESTORNO] '||_reason, v_uid, true, _payment_id, _reason
    ) RETURNING id INTO v_new_id;
  END IF;

  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES (
    CASE WHEN _kind='receivable' THEN 'receivable_payments' ELSE 'payable_payments' END,
    v_new_id, 'PAYMENT_REVERSAL_CREATED',
    jsonb_build_object('reversed_payment_id', _payment_id, 'reason', _reason),
    v_uid
  );

  RETURN v_new_id;
END $function$;

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
  v_issue      := COALESCE(NULLIF(p_payload->>'issue_date','')::date, (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date);
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

CREATE OR REPLACE FUNCTION public.rpc_register_payable_payment(p_installment_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := platform_private.h15_actor_organization();
  v_inst public.accounts_payable_installments%ROWTYPE;
  v_amount numeric; v_disc numeric; v_int numeric; v_pen numeric; v_saldo numeric;
  v_pm uuid; v_ba uuid; v_pay_date date; v_notes text;
  v_has_receipt boolean; v_require_receipt boolean;
  v_payment_id uuid; v_idem text; v_fp text; v_existing record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para registrar pagamento.' USING ERRCODE='insufficient_privilege';
  END IF;

  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts_payable_installments WHERE id=p_installment_id AND organization_id=v_org) THEN
    RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
  IF (p_payload ? 'organization_id' AND NULLIF(p_payload->>'organization_id','')::uuid IS DISTINCT FROM v_org)
     OR (p_payload ? 'tenant_id' AND NULLIF(p_payload->>'tenant_id','')::uuid IS DISTINCT FROM v_org) THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_MISMATCH' USING ERRCODE='42501';
  END IF;
  v_idem := NULLIF(trim(p_payload->>'idempotency_key'), '');
  IF v_idem IS NULL OR length(v_idem) < 8 THEN
    RAISE EXCEPTION 'FIN_IDEMPOTENCY_REQUIRED: idempotency_key obrigatória (mín. 8 caracteres).'
      USING ERRCODE='check_violation';
  END IF;

  v_fp := public.fn_h6b_payment_fingerprint('payable', p_installment_id, p_payload);

  PERFORM pg_advisory_xact_lock(
    hashtextextended('fin_pay:payable:' || p_installment_id::text || ':' || v_idem, 0));

  SELECT * INTO v_inst FROM public.accounts_payable_installments
   WHERE id = p_installment_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;

  SELECT id, request_fingerprint INTO v_existing FROM public.payable_payments
   WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
  END IF;

  IF v_inst.status = 'CANCELED' THEN
    RAISE EXCEPTION 'Parcela cancelada.' USING ERRCODE='check_violation';
  END IF;
  IF v_inst.status = 'PAID' THEN
    RAISE EXCEPTION 'Parcela já quitada.' USING ERRCODE='check_violation';
  END IF;

  v_amount   := COALESCE((p_payload->>'amount_paid')::numeric, 0);
  v_disc     := COALESCE((p_payload->>'discount_amount')::numeric, 0);
  v_int      := COALESCE((p_payload->>'interest_amount')::numeric, 0);
  v_pen      := COALESCE((p_payload->>'penalty_amount')::numeric, 0);
  v_pm       := NULLIF(p_payload->>'payment_method_id','')::uuid;
  v_ba       := NULLIF(p_payload->>'bank_account_id','')::uuid;
  v_pay_date := COALESCE((p_payload->>'payment_date')::date, (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_notes    := NULLIF(p_payload->>'notes','');
  v_has_receipt := COALESCE((p_payload->>'has_receipt')::boolean, false);

  IF v_amount::text IN ('NaN','Infinity','-Infinity') OR v_disc::text IN ('NaN','Infinity','-Infinity') OR v_int::text IN ('NaN','Infinity','-Infinity') OR v_pen::text IN ('NaN','Infinity','-Infinity') OR v_disc < 0 OR v_int < 0 OR v_pen < 0 OR v_amount <> round(v_amount,2) OR v_disc <> round(v_disc,2) OR v_int <> round(v_int,2) OR v_pen <> round(v_pen,2) THEN
 RAISE EXCEPTION 'FIN_INVALID_AMOUNT: valores monetários inválidos.' USING ERRCODE='23514';
 END IF;
 IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido.' USING ERRCODE='check_violation';
  END IF;
  IF v_pm IS NULL OR NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = v_pm AND active) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;
  IF v_ba IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = v_ba AND active) THEN
    RAISE EXCEPTION 'Conta bancária inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;

  v_saldo := v_inst.original_amount + COALESCE(v_inst.interest_amount,0) + COALESCE(v_inst.penalty_amount,0) - COALESCE(v_inst.discount_amount,0) - COALESCE(v_inst.paid_amount,0) + v_int + v_pen - v_disc;
  IF v_amount - v_saldo > 0.005 THEN
    RAISE EXCEPTION 'Valor excede o saldo da parcela (saldo: %).', v_saldo USING ERRCODE='check_violation';
  END IF;

  SELECT require_receipt_on_payable_payment INTO v_require_receipt
    FROM public.financial_settings LIMIT 1;
  IF COALESCE(v_require_receipt,false) AND NOT v_has_receipt THEN
    RAISE EXCEPTION 'Comprovante de pagamento é obrigatório.' USING ERRCODE='check_violation';
  END IF;

  BEGIN
    INSERT INTO public.payable_payments (
      organization_id, installment_id, payment_date, amount_paid, payment_method_id, bank_account_id,
      discount_amount, interest_amount, penalty_amount, notes, created_by,
      idempotency_key, request_fingerprint
    ) VALUES (
      v_org, p_installment_id, v_pay_date, v_amount, v_pm, v_ba,
      v_disc, v_int, v_pen, v_notes, v_uid, v_idem, v_fp
    ) RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id, request_fingerprint INTO v_existing FROM public.payable_payments
     WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
  END;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('payable_payments', v_payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object('installment_id', p_installment_id, 'amount', v_amount,
      'payment_method_id', v_pm, 'bank_account_id', v_ba, 'payment_date', v_pay_date,
      'idempotency_key', v_idem, 'request_fingerprint', v_fp), v_uid);

  RETURN v_payment_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_mark_financial_overdue()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_org uuid := platform_private.h15_actor_organization();
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL OR NOT COALESCE(public.is_financial_staff(auth.uid()),false) THEN
  RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501';
 END IF;
 UPDATE public.accounts_receivable_installments i SET status='OVERDUE'
 WHERE i.organization_id=v_org AND i.status='OPEN' AND i.due_date<(pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date
 AND EXISTS (SELECT 1 FROM public.accounts_receivable p WHERE p.id=i.receivable_id AND p.organization_id=v_org);
 UPDATE public.accounts_payable_installments i SET status='OVERDUE'
 WHERE i.organization_id=v_org AND i.status='OPEN' AND i.due_date<(pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date
 AND EXISTS (SELECT 1 FROM public.accounts_payable p WHERE p.id=i.payable_id AND p.organization_id=v_org);
 UPDATE public.accounts_receivable p SET status='OVERDUE'
 WHERE p.organization_id=v_org AND p.status IN ('OPEN','PARTIAL')
 AND EXISTS (SELECT 1 FROM public.accounts_receivable_installments i WHERE i.receivable_id=p.id AND i.organization_id=v_org AND i.status='OVERDUE');
 UPDATE public.accounts_payable p SET status='OVERDUE'
 WHERE p.organization_id=v_org AND p.status IN ('OPEN','PARTIAL')
 AND EXISTS (SELECT 1 FROM public.accounts_payable_installments i WHERE i.payable_id=p.id AND i.organization_id=v_org AND i.status='OVERDUE');
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_register_receivable_payment(p_installment_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := platform_private.h15_actor_organization();
  v_inst public.accounts_receivable_installments%ROWTYPE;
  v_amount numeric; v_disc numeric; v_int numeric; v_pen numeric; v_saldo numeric;
  v_pm uuid; v_ba uuid; v_pay_date date; v_notes text;
  v_has_receipt boolean; v_require_receipt boolean;
  v_payment_id uuid; v_idem text; v_fp text; v_existing record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT public.is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para registrar recebimento.' USING ERRCODE='insufficient_privilege';
  END IF;

  -- H6-001: idempotency_key obrigatoria (fail-closed)
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.accounts_receivable_installments WHERE id=p_installment_id AND organization_id=v_org) THEN
    RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
  IF (p_payload ? 'organization_id' AND NULLIF(p_payload->>'organization_id','')::uuid IS DISTINCT FROM v_org)
     OR (p_payload ? 'tenant_id' AND NULLIF(p_payload->>'tenant_id','')::uuid IS DISTINCT FROM v_org) THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_MISMATCH' USING ERRCODE='42501';
  END IF;
  v_idem := NULLIF(trim(p_payload->>'idempotency_key'), '');
  IF v_idem IS NULL OR length(v_idem) < 8 THEN
    RAISE EXCEPTION 'FIN_IDEMPOTENCY_REQUIRED: idempotency_key obrigatória (mín. 8 caracteres).'
      USING ERRCODE='check_violation';
  END IF;

  v_fp := public.fn_h6b_payment_fingerprint('receivable', p_installment_id, p_payload);

  -- lock determinístico por tipo + parcela + chave, ANTES da decisao de replay
  PERFORM pg_advisory_xact_lock(
    hashtextextended('fin_pay:receivable:' || p_installment_id::text || ':' || v_idem, 0));

  SELECT * INTO v_inst FROM public.accounts_receivable_installments
   WHERE id = p_installment_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada.'; END IF;

  SELECT id, request_fingerprint INTO v_existing FROM public.receivable_payments
   WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
  END IF;

  IF v_inst.status = 'CANCELED' THEN
    RAISE EXCEPTION 'Parcela cancelada.' USING ERRCODE='check_violation';
  END IF;
  IF v_inst.status = 'PAID' THEN
    RAISE EXCEPTION 'Parcela já quitada.' USING ERRCODE='check_violation';
  END IF;

  v_amount   := COALESCE((p_payload->>'amount_received')::numeric, 0);
  v_disc     := COALESCE((p_payload->>'discount_amount')::numeric, 0);
  v_int      := COALESCE((p_payload->>'interest_amount')::numeric, 0);
  v_pen      := COALESCE((p_payload->>'penalty_amount')::numeric, 0);
  v_pm       := NULLIF(p_payload->>'payment_method_id','')::uuid;
  v_ba       := NULLIF(p_payload->>'bank_account_id','')::uuid;
  v_pay_date := COALESCE((p_payload->>'payment_date')::date, (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_notes    := NULLIF(p_payload->>'notes','');
  v_has_receipt := COALESCE((p_payload->>'has_receipt')::boolean, false);

  IF v_amount::text IN ('NaN','Infinity','-Infinity') OR v_disc::text IN ('NaN','Infinity','-Infinity') OR v_int::text IN ('NaN','Infinity','-Infinity') OR v_pen::text IN ('NaN','Infinity','-Infinity') OR v_disc < 0 OR v_int < 0 OR v_pen < 0 OR v_amount <> round(v_amount,2) OR v_disc <> round(v_disc,2) OR v_int <> round(v_int,2) OR v_pen <> round(v_pen,2) THEN
 RAISE EXCEPTION 'FIN_INVALID_AMOUNT: valores monetários inválidos.' USING ERRCODE='23514';
 END IF;
 IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido.' USING ERRCODE='check_violation';
  END IF;
  IF v_pm IS NULL OR NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE id = v_pm AND active) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;
  IF v_ba IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = v_ba AND active) THEN
    RAISE EXCEPTION 'Conta bancária inválida ou inativa.' USING ERRCODE='check_violation';
  END IF;

  v_saldo := v_inst.original_amount + COALESCE(v_inst.interest_amount,0) + COALESCE(v_inst.penalty_amount,0) - COALESCE(v_inst.discount_amount,0) - COALESCE(v_inst.received_amount,0) + v_int + v_pen - v_disc;
  IF v_amount - v_saldo > 0.005 THEN
    RAISE EXCEPTION 'Valor excede o saldo da parcela (saldo: %).', v_saldo USING ERRCODE='check_violation';
  END IF;

  SELECT require_receipt_on_receivable_payment INTO v_require_receipt
    FROM public.financial_settings LIMIT 1;
  IF COALESCE(v_require_receipt,false) AND NOT v_has_receipt THEN
    RAISE EXCEPTION 'Comprovante de recebimento é obrigatório.' USING ERRCODE='check_violation';
  END IF;

  BEGIN
    INSERT INTO public.receivable_payments (
      organization_id, installment_id, payment_date, amount_received, payment_method_id, bank_account_id,
      discount_amount, interest_amount, penalty_amount, notes, created_by,
      idempotency_key, request_fingerprint
    ) VALUES (
      v_org, p_installment_id, v_pay_date, v_amount, v_pm, v_ba,
      v_disc, v_int, v_pen, v_notes, v_uid, v_idem, v_fp
    ) RETURNING id INTO v_payment_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id, request_fingerprint INTO v_existing FROM public.receivable_payments
     WHERE installment_id = p_installment_id AND idempotency_key = v_idem;
    IF v_existing.request_fingerprint IS NOT NULL AND v_existing.request_fingerprint <> v_fp THEN
      RAISE EXCEPTION 'FIN_IDEMPOTENCY_CONFLICT: mesma idempotency_key com payload divergente.'
        USING ERRCODE='check_violation';
    END IF;
    RETURN v_existing.id;
  END;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('receivable_payments', v_payment_id, 'PAYMENT_REGISTERED',
    jsonb_build_object('installment_id', p_installment_id, 'amount', v_amount,
      'payment_method_id', v_pm, 'bank_account_id', v_ba, 'payment_date', v_pay_date,
      'idempotency_key', v_idem, 'request_fingerprint', v_fp), v_uid);

  RETURN v_payment_id;
END $function$;
