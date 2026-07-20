
-- 1) Drop legacy duplicate table
DROP TABLE IF EXISTS public.recurring_generations_log CASCADE;

-- 2) Drop redundant ALL policy
DROP POLICY IF EXISTS rft_staff_all ON public.recurring_financial_templates;

-- 3) CHECK constraints
ALTER TABLE public.recurring_financial_templates
  DROP CONSTRAINT IF EXISTS chk_recurring_customer_required,
  DROP CONSTRAINT IF EXISTS chk_recurring_end_after_start;

ALTER TABLE public.recurring_financial_templates
  ADD CONSTRAINT chk_recurring_customer_required
    CHECK (type <> 'RECEIVABLE' OR customer_id IS NOT NULL),
  ADD CONSTRAINT chk_recurring_end_after_start
    CHECK (end_date IS NULL OR end_date >= start_date);

-- 4) Semantic audit trigger for templates (replaces generic fn_financial_audit on this table)
DROP TRIGGER IF EXISTS trg_rft_audit ON public.recurring_financial_templates;
DROP TRIGGER IF EXISTS trg_recurring_template_audit ON public.recurring_financial_templates;

CREATE OR REPLACE FUNCTION public.fn_recurring_template_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'RECURRING_TEMPLATE_CREATED';
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
    VALUES ('RECURRING_TEMPLATE', NEW.id, v_action, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.active = true AND NEW.active = false AND NEW.end_date IS NOT NULL AND (OLD.end_date IS NULL OR OLD.end_date <> NEW.end_date) THEN
      v_action := 'RECURRING_TEMPLATE_CLOSED';
    ELSIF OLD.active = true AND NEW.active = false THEN
      v_action := 'RECURRING_TEMPLATE_PAUSED';
    ELSIF OLD.active = false AND NEW.active = true THEN
      v_action := 'RECURRING_TEMPLATE_REACTIVATED';
    ELSE
      v_action := 'RECURRING_TEMPLATE_UPDATED';
    END IF;
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, old_data, new_data, performed_by)
    VALUES ('RECURRING_TEMPLATE', NEW.id, v_action, to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, old_data, performed_by)
    VALUES ('RECURRING_TEMPLATE', OLD.id, 'RECURRING_TEMPLATE_DELETED', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_recurring_template_audit
AFTER INSERT OR UPDATE OR DELETE ON public.recurring_financial_templates
FOR EACH ROW EXECUTE FUNCTION public.fn_recurring_template_audit();

-- 5) Refine fn_generate_recurring_title to emit semantic audit actions
CREATE OR REPLACE FUNCTION public.fn_generate_recurring_title(_template_id uuid, _reference_date date, _is_manual boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

-- 6) Refine fn_run_recurring_generation to log FAILED in audit
CREATE OR REPLACE FUNCTION public.fn_run_recurring_generation()
RETURNS TABLE(template_id uuid, status text, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD; v_id UUID;
BEGIN
  FOR r IN
    SELECT id, next_generation_date
    FROM public.recurring_financial_templates
    WHERE active = true AND auto_generate = true
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
END $$;
