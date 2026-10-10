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
  -- H7O: sessão interna/cron (sem JWT) preservada; chamada autenticada exige staff financeiro.
  IF auth.uid() IS NOT NULL AND NOT public.is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501',
      HINT = 'H7O: geração de título recorrente restrita ao staff financeiro.';
  END IF;

  SELECT * INTO t FROM public.recurring_financial_templates
  WHERE id = _template_id AND organization_id IS NOT NULL
    AND (auth.uid() IS NULL OR organization_id = platform_private.h15_actor_organization())
  FOR UPDATE;
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
      organization_id, origin_type, customer_id, description, category_id, cost_center_id,
      total_amount, issue_date, first_due_date, installment_count, status,
      fiscal_invoice_required, fiscal_invoice_status, notes, created_by,
      recurring_template_id, reference_month, auto_generated, payment_method_id
    ) VALUES (
      t.organization_id, 'RECURRING', t.customer_id, t.description, t.category_id, t.cost_center_id,
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
      organization_id, origin_type, supplier_name, description, category_id, cost_center_id,
      total_amount, issue_date, first_due_date, installment_count, status,
      notes, created_by,
      recurring_template_id, reference_month, auto_generated
    ) VALUES (
      t.organization_id, 'RECURRING', t.supplier_name, t.description, t.category_id, t.cost_center_id,
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
END $function$;

CREATE OR REPLACE FUNCTION public.fn_revert_recurring_generation(p_log_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_log public.recurring_generation_log%ROWTYPE;
  v_status TEXT;
BEGIN
  -- 1. Verifica permissão
  IF NOT public.is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- 2. Busca o log
  SELECT * INTO v_log FROM public.recurring_generation_log l WHERE l.id = p_log_id
    AND EXISTS (SELECT 1 FROM public.recurring_financial_templates t WHERE t.id=l.template_id
      AND t.organization_id=platform_private.h15_actor_organization()) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Log de geração não encontrado';
  END IF;

  IF v_log.status <> 'SUCCESS' THEN
    RAISE EXCEPTION 'Apenas gerações com sucesso podem ser revertidas';
  END IF;

  -- 3. Verifica se o título gerado ainda pode ser excluído (status deve ser OPEN)
  IF v_log.generated_entity_type = 'RECEIVABLE' THEN
    SELECT status INTO v_status FROM public.accounts_receivable WHERE id = v_log.generated_entity_id;
    IF v_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Título de receita não pode ser revertido pois não está mais Aberto (Status: %)', v_status;
    END IF;
    
    -- Deleta o título (o trigger de auditoria do accounts_receivable cuidará do log de DELETE)
    DELETE FROM public.accounts_receivable WHERE id = v_log.generated_entity_id;
    
  ELSIF v_log.generated_entity_type = 'PAYABLE' THEN
    SELECT status INTO v_status FROM public.accounts_payable WHERE id = v_log.generated_entity_id;
    IF v_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Título de despesa não pode ser revertido pois não está mais Aberto (Status: %)', v_status;
    END IF;

    DELETE FROM public.accounts_payable WHERE id = v_log.generated_entity_id;
  END IF;

  -- 4. Log de auditoria da reversão
  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, old_data, performed_by, reason)
  VALUES ('RECURRING_TEMPLATE', v_log.template_id, 'RECURRING_GENERATION_REVERSED', to_jsonb(v_log), auth.uid(), 'Reversão manual solicitada pelo gestor');

  -- 5. Remove o log para permitir nova geração na mesma data (o trigger de log_audit registrará DELETED)
  DELETE FROM public.recurring_generation_log WHERE id = p_log_id;

END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_run_recurring_generation()
 RETURNS TABLE(template_id uuid, status text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r RECORD; v_id UUID;
BEGIN
  -- H9-D1: sessão interna/cron (sem JWT) preservada; chamada autenticada exige staff financeiro.
  IF auth.uid() IS NOT NULL AND NOT public.is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501',
      HINT = 'H9-D1: execução da geração recorrente restrita ao staff financeiro.';
  END IF;

  FOR r IN
    SELECT id, next_generation_date
    FROM public.recurring_financial_templates
    WHERE organization_id IS NOT NULL
      AND (auth.uid() IS NULL OR organization_id = platform_private.h15_actor_organization())
      AND active = true AND auto_generate = true
      AND next_generation_date IS NOT NULL
      AND next_generation_date <= CURRENT_DATE
      AND (end_date IS NULL OR next_generation_date <= end_date)
  LOOP
    BEGIN
      v_id := public.fn_generate_recurring_title(r.id, r.next_generation_date, false);
      template_id := r.id;
      status := CASE WHEN v_id IS NULL THEN 'SKIPPED' ELSE 'SUCCESS' END;
      message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.recurring_generation_log(template_id, reference_date, status, error_message)
      VALUES (r.id, r.next_generation_date, 'FAILED', SQLERRM);
      INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
      VALUES ('RECURRING_TEMPLATE', r.id, 'RECURRING_GENERATION_FAILED',
              jsonb_build_object('reference_date', r.next_generation_date), auth.uid(), SQLERRM);
      template_id := r.id; status := 'FAILED'; message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END $function$;