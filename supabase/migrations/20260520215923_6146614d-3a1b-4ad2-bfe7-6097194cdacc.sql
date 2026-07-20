
-- Adicionar colunas faltantes em recurring_financial_templates
ALTER TABLE public.recurring_financial_templates
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fiscal_invoice_required BOOLEAN DEFAULT false;

-- Migrar name -> description quando vazio
UPDATE public.recurring_financial_templates SET description = name WHERE description IS NULL;

-- Tornar description obrigatório
ALTER TABLE public.recurring_financial_templates ALTER COLUMN description SET NOT NULL;

-- Tabela de log
CREATE TABLE IF NOT EXISTS public.recurring_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.recurring_financial_templates(id) ON DELETE CASCADE,
  generated_entity_type TEXT CHECK (generated_entity_type IN ('RECEIVABLE','PAYABLE')),
  generated_entity_id UUID,
  reference_date DATE NOT NULL,
  amount NUMERIC(14,2),
  status TEXT NOT NULL CHECK (status IN ('SUCCESS','FAILED','SKIPPED')),
  error_message TEXT,
  generated_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_log_success ON public.recurring_generation_log(template_id, reference_date) WHERE status = 'SUCCESS';
CREATE INDEX IF NOT EXISTS idx_recurring_log_template ON public.recurring_generation_log(template_id, generated_at DESC);

-- Campos em AR/AP
ALTER TABLE public.accounts_receivable
  ADD COLUMN IF NOT EXISTS recurring_template_id UUID REFERENCES public.recurring_financial_templates(id),
  ADD COLUMN IF NOT EXISTS reference_month DATE,
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.accounts_payable
  ADD COLUMN IF NOT EXISTS recurring_template_id UUID REFERENCES public.recurring_financial_templates(id),
  ADD COLUMN IF NOT EXISTS reference_month DATE,
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT false;

-- Função: calcular próxima data
CREATE OR REPLACE FUNCTION public.fn_calc_next_generation_date(
  _freq TEXT, _from_date DATE, _due_day INTEGER
) RETURNS DATE
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE v_next DATE;
BEGIN
  CASE _freq
    WHEN 'MONTHLY' THEN v_next := (_from_date + INTERVAL '1 month')::DATE;
    WHEN 'WEEKLY' THEN v_next := (_from_date + INTERVAL '1 week')::DATE;
    WHEN 'BIWEEKLY' THEN v_next := (_from_date + INTERVAL '2 weeks')::DATE;
    WHEN 'QUARTERLY' THEN v_next := (_from_date + INTERVAL '3 months')::DATE;
    WHEN 'YEARLY' THEN v_next := (_from_date + INTERVAL '1 year')::DATE;
    ELSE v_next := (_from_date + INTERVAL '1 month')::DATE;
  END CASE;
  IF _due_day IS NOT NULL AND _freq IN ('MONTHLY','QUARTERLY','YEARLY') THEN
    BEGIN
      v_next := make_date(EXTRACT(YEAR FROM v_next)::INT, EXTRACT(MONTH FROM v_next)::INT,
        LEAST(_due_day, EXTRACT(DAY FROM (date_trunc('month', v_next) + INTERVAL '1 month - 1 day'))::INT));
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN v_next;
END $$;

-- Trigger: data inicial
CREATE OR REPLACE FUNCTION public.fn_set_initial_next_generation()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_initial DATE;
BEGIN
  IF NEW.next_generation_date IS NULL THEN
    v_initial := NEW.start_date;
    IF NEW.due_day IS NOT NULL AND NEW.recurrence_frequency IN ('MONTHLY','QUARTERLY','YEARLY') THEN
      BEGIN
        v_initial := make_date(EXTRACT(YEAR FROM v_initial)::INT, EXTRACT(MONTH FROM v_initial)::INT,
          LEAST(NEW.due_day, EXTRACT(DAY FROM (date_trunc('month', v_initial) + INTERVAL '1 month - 1 day'))::INT));
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
    NEW.next_generation_date := v_initial;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_recurring_set_initial ON public.recurring_financial_templates;
CREATE TRIGGER trg_recurring_set_initial
  BEFORE INSERT ON public.recurring_financial_templates
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_initial_next_generation();

DROP TRIGGER IF EXISTS trg_recurring_updated_at ON public.recurring_financial_templates;
CREATE TRIGGER trg_recurring_updated_at
  BEFORE UPDATE ON public.recurring_financial_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função: gerar UM título
CREATE OR REPLACE FUNCTION public.fn_generate_recurring_title(
  _template_id UUID, _reference_date DATE, _is_manual BOOLEAN DEFAULT false
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
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
    INSERT INTO public.recurring_generation_log(template_id, reference_date, status, error_message, generated_by)
    VALUES (_template_id, _reference_date, 'SKIPPED', 'Template inativo', auth.uid());
    RETURN NULL;
  END IF;

  IF t.end_date IS NOT NULL AND _reference_date > t.end_date THEN
    INSERT INTO public.recurring_generation_log(template_id, reference_date, status, error_message, generated_by)
    VALUES (_template_id, _reference_date, 'SKIPPED', 'Após data final', auth.uid());
    RETURN NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM public.recurring_generation_log WHERE template_id = _template_id AND reference_date = _reference_date AND status = 'SUCCESS') THEN
    INSERT INTO public.recurring_generation_log(template_id, reference_date, status, error_message, generated_by)
    VALUES (_template_id, _reference_date, 'SKIPPED', 'Competência já gerada', auth.uid());
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

-- Função: rotina diária
CREATE OR REPLACE FUNCTION public.fn_run_recurring_generation()
RETURNS TABLE(template_id UUID, status TEXT, message TEXT)
LANGUAGE plpgsql SECURITY DEFINER
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
      template_id := r.id; status := 'FAILED'; message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END $$;

-- RLS
ALTER TABLE public.recurring_financial_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_generation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff financeiro pode ver templates" ON public.recurring_financial_templates;
CREATE POLICY "Staff financeiro pode ver templates"
  ON public.recurring_financial_templates FOR SELECT
  USING (public.is_financial_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin/Gestor/Financeiro podem criar templates" ON public.recurring_financial_templates;
CREATE POLICY "Admin/Gestor/Financeiro podem criar templates"
  ON public.recurring_financial_templates FOR INSERT
  WITH CHECK (public.is_financial_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin/Gestor/Financeiro podem atualizar templates" ON public.recurring_financial_templates;
CREATE POLICY "Admin/Gestor/Financeiro podem atualizar templates"
  ON public.recurring_financial_templates FOR UPDATE
  USING (public.is_financial_staff(auth.uid()));

DROP POLICY IF EXISTS "Apenas admin pode deletar templates" ON public.recurring_financial_templates;
CREATE POLICY "Apenas admin pode deletar templates"
  ON public.recurring_financial_templates FOR DELETE
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

DROP POLICY IF EXISTS "Staff financeiro pode ver logs" ON public.recurring_generation_log;
CREATE POLICY "Staff financeiro pode ver logs"
  ON public.recurring_generation_log FOR SELECT
  USING (public.is_financial_staff(auth.uid()));

DROP POLICY IF EXISTS "Sistema pode inserir logs" ON public.recurring_generation_log;
CREATE POLICY "Sistema pode inserir logs"
  ON public.recurring_generation_log FOR INSERT
  WITH CHECK (true);

-- Auditoria
DROP TRIGGER IF EXISTS trg_recurring_template_audit ON public.recurring_financial_templates;
CREATE TRIGGER trg_recurring_template_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.recurring_financial_templates
  FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();
