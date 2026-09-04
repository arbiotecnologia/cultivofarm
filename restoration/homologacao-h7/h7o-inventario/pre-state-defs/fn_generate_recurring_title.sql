CREATE OR REPLACE FUNCTION public.fn_generate_recurring_title(_template_id uuid, _reference_date date, _is_manual boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.recurring_financial_templates%ROWTYPE;
  v_new_id UUID;
  v_user UUID;
BEGIN
  SELECT * INTO t FROM public.recurring_financial_templates WHERE id = _template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template não encontrado'; END IF;

  IF NOT t.active THEN
    INSERT INTO public.recurring_generation_log(template_id, reference_date, status, error_message, generated_by, generated_entity_type, amount)
    VALUES (_template_id, _reference_date, 'SKIPPED', 'Template inativo', auth.uid(), t.type, t.amount);
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
    VALUES ('RECURRING_TEMPLATE', _template_id, 'RECURRING_GENERATION_SKIPPED', jsonb_build_object('reference_date', _reference_date), auth.uid(), 'Template inativo');
    RETURN NULL;
  END IF;

  IF t.end_date IS NOT NULL AND _reference_date > t.end_date THEN
    INSERT INTO public.recurring_generation_log(template_id, reference_date, status, error_message, generated_by, generated_entity_type, amount)
    VALUES (_template_id, _reference_date, 'SKIPPED', 'Após data final', auth.uid(), t.type, t.amount);
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
    VALUES ('RECURRING_TEMPLATE', _template_id, 'RECURRING_GENERATION_SKIPPED', jsonb_build_object('reference_date', _reference_date), auth.uid(), 'Após data final');
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.recurring_generation_log WHERE template_id = _template_id AND reference_date = _reference_date AND status = 'SUCCESS') THEN
    INSERT INTO public.recurring_generation_log(template_id, reference_date, status, error_message, generated_by, generated_entity_type, amount)
    VALUES (_template_id, _reference_date, 'SKIPPED', 'Competência já gerada', auth.uid(), t.type, t.amount);
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
    VALUES ('RECURRING_TEMPLATE', _template_id, 'RECURRING_GENERATION_SKIPPED', jsonb_build_object('reference_date', _reference_date), auth.uid(), 'Competência já gerada');
    RETURN NULL;
  END IF;

  v_user := COALESCE(auth.uid(), t.created_by);

  IF t.type = 'RECEIVABLE' THEN
    INSERT INTO public.accounts_receivable(
      origin_type, customer_id, description, category_id, cost_center_id,
      total_amount, issue_date, first_due_date, installment_count, status,
      fiscal_invoice_required, fiscal_invoice_status, notes, created_by,
      recurring_template_id, reference_month, auto_generated, payment_method_id
    ) VALUES (
      'RECURRING', t.customer_id, t.description, t.category_id, t.cost_center_id,
      t.amount, CURRENT_DATE, _reference_date, 1, 'OPEN',
      COALESCE(t.fiscal_invoice_required, false),
      CASE WHEN COALESCE(t.fiscal_invoice_required, false) THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
      t.notes, v_user,
      t.id, date_trunc('month', _reference_date)::DATE, NOT _is_manual, t.payment_method_id
    ) RETURNING id INTO v_new_id;

    INSERT INTO public.recurring_generation_log(template_id, generated_entity_type, generated_entity_id, reference_date, amount, status, generated_by)
    VALUES (_template_id, 'RECEIVABLE', v_new_id, _reference_date, t.amount, 'SUCCESS', v_user);

    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
    VALUES ('RECURRING_TEMPLATE', _template_id, 'RECURRING_RECEIVABLE_GENERATED',
            jsonb_build_object('receivable_id', v_new_id, 'reference_date', _reference_date, 'amount', t.amount, 'manual', _is_manual),
            v_user);
  ELSE
    INSERT INTO public.accounts_payable(
      origin_type, supplier_name, description, category_id, cost_center_id,
      total_amount, issue_date, first_due_date, installment_count, status,
      notes, created_by,
      recurring_template_id, reference_month, auto_generated
    ) VALUES (
      'RECURRING', t.supplier_name, t.description, t.category_id, t.cost_center_id,
      t.amount, CURRENT_DATE, _reference_date, 1, 'OPEN',
      t.notes, v_user,
      t.id, date_trunc('month', _reference_date)::DATE, NOT _is_manual
    ) RETURNING id INTO v_new_id;

    INSERT INTO public.recurring_generation_log(template_id, generated_entity_type, generated_entity_id, reference_date, amount, status, generated_by)
    VALUES (_template_id, 'PAYABLE', v_new_id, _reference_date, t.amount, 'SUCCESS', v_user);

    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
    VALUES ('RECURRING_TEMPLATE', _template_id, 'RECURRING_PAYABLE_GENERATED',
            jsonb_build_object('payable_id', v_new_id, 'reference_date', _reference_date, 'amount', t.amount, 'manual', _is_manual),
            v_user);
  END IF;

  UPDATE public.recurring_financial_templates
    SET next_generation_date = public.fn_calc_next_generation_date(t.recurrence_frequency, _reference_date, t.due_day),
        updated_at = now()
    WHERE id = _template_id;

  UPDATE public.recurring_financial_templates
    SET active = false
    WHERE id = _template_id AND end_date IS NOT NULL AND next_generation_date > end_date;

  RETURN v_new_id;
END $function$

--ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--OWNER: postgres

