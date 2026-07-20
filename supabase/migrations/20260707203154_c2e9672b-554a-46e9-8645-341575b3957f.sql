
-- ============================================================
-- FASE 1: Motor de Condições Comerciais B2B — schema base
-- ============================================================

-- 1) commercial_payment_plans
CREATE TABLE IF NOT EXISTS public.commercial_payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  description text,
  plan_type text NOT NULL CHECK (plan_type IN ('cash','short_term','medium_term','extended_term','harvest','custom')),
  max_days integer NOT NULL DEFAULT 0,
  months_count numeric(6,2) NOT NULL DEFAULT 0,
  installment_count integer NOT NULL DEFAULT 1 CHECK (installment_count >= 1),
  discount_percent numeric(6,3) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  monthly_interest_percent numeric(6,3) NOT NULL DEFAULT 0 CHECK (monthly_interest_percent >= 0),
  interest_type text NOT NULL DEFAULT 'compound' CHECK (interest_type IN ('none','simple','compound')),
  requires_credit_approval boolean NOT NULL DEFAULT false,
  requires_guarantee boolean NOT NULL DEFAULT false,
  requires_financial_approval boolean NOT NULL DEFAULT false,
  minimum_order_amount numeric(14,2),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_payment_plans TO authenticated;
GRANT ALL ON public.commercial_payment_plans TO service_role;

ALTER TABLE public.commercial_payment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cpp_select" ON public.commercial_payment_plans
  FOR SELECT TO authenticated
  USING (
    active = true
    OR public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

CREATE POLICY "cpp_insert" ON public.commercial_payment_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

CREATE POLICY "cpp_update" ON public.commercial_payment_plans
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

CREATE POLICY "cpp_delete" ON public.commercial_payment_plans
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_payment_plans_active_sort
  ON public.commercial_payment_plans(active, sort_order);

-- 2) partner_order_payment_terms
CREATE TABLE IF NOT EXISTS public.partner_order_payment_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_order_id uuid NOT NULL REFERENCES public.partner_orders(id) ON DELETE CASCADE,
  payment_plan_id uuid REFERENCES public.commercial_payment_plans(id),
  plan_name_snapshot text NOT NULL,
  plan_code_snapshot text NOT NULL,
  discount_percent_snapshot numeric(6,3) NOT NULL,
  monthly_interest_percent_snapshot numeric(6,3) NOT NULL,
  months_count_snapshot numeric(6,2) NOT NULL,
  installment_count integer NOT NULL DEFAULT 1,
  first_due_date date NOT NULL,
  interest_type_snapshot text NOT NULL DEFAULT 'compound',
  table_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  net_amount_after_discount numeric(14,2) NOT NULL DEFAULT 0,
  financial_interest_amount numeric(14,2) NOT NULL DEFAULT 0,
  final_amount numeric(14,2) NOT NULL DEFAULT 0,
  approval_status text NOT NULL DEFAULT 'not_required' CHECK (approval_status IN ('not_required','pending','approved','rejected')),
  approved_by uuid,
  approved_at timestamptz,
  approval_notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_order_payment_terms TO authenticated;
GRANT ALL ON public.partner_order_payment_terms TO service_role;

ALTER TABLE public.partner_order_payment_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "popt_select" ON public.partner_order_payment_terms
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.partner_orders po
      JOIN public.partner_users pu ON pu.partner_id = po.partner_id
      WHERE po.id = partner_order_payment_terms.partner_order_id
        AND pu.user_id = auth.uid()
    )
  );

CREATE POLICY "popt_insert" ON public.partner_order_payment_terms
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

CREATE POLICY "popt_update" ON public.partner_order_payment_terms
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_payment_terms_order
  ON public.partner_order_payment_terms(partner_order_id);

-- 3) partner_order_payment_schedule
CREATE TABLE IF NOT EXISTS public.partner_order_payment_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_order_id uuid NOT NULL REFERENCES public.partner_orders(id) ON DELETE CASCADE,
  payment_terms_id uuid NOT NULL REFERENCES public.partner_order_payment_terms(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  due_date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  principal_amount numeric(14,2),
  interest_amount numeric(14,2),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','generated','canceled')),
  receivable_installment_id uuid REFERENCES public.accounts_receivable_installments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_order_payment_schedule TO authenticated;
GRANT ALL ON public.partner_order_payment_schedule TO service_role;

ALTER TABLE public.partner_order_payment_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pops_select" ON public.partner_order_payment_schedule
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.partner_orders po
      JOIN public.partner_users pu ON pu.partner_id = po.partner_id
      WHERE po.id = partner_order_payment_schedule.partner_order_id
        AND pu.user_id = auth.uid()
    )
  );

CREATE POLICY "pops_insert" ON public.partner_order_payment_schedule
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

CREATE POLICY "pops_update" ON public.partner_order_payment_schedule
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'financeiro'::app_role)
    OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_payment_schedule_order
  ON public.partner_order_payment_schedule(partner_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_schedule_due
  ON public.partner_order_payment_schedule(due_date);

-- 4) Alterações em partner_orders
ALTER TABLE public.partner_orders
  ADD COLUMN IF NOT EXISTS payment_plan_id uuid REFERENCES public.commercial_payment_plans(id),
  ADD COLUMN IF NOT EXISTS payment_terms_id uuid REFERENCES public.partner_order_payment_terms(id),
  ADD COLUMN IF NOT EXISTS payment_condition_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS table_amount numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commercial_discount_amount numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount_after_discount numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS financial_interest_amount numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_amount_with_interest numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_financial_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS financial_approval_status text NOT NULL DEFAULT 'not_required';

CREATE INDEX IF NOT EXISTS idx_partner_orders_payment_plan
  ON public.partner_orders(payment_plan_id);
CREATE INDEX IF NOT EXISTS idx_partner_orders_payment_status
  ON public.partner_orders(payment_condition_status, financial_approval_status);

-- 5) Triggers de updated_at
DROP TRIGGER IF EXISTS trg_cpp_updated_at ON public.commercial_payment_plans;
CREATE TRIGGER trg_cpp_updated_at
  BEFORE UPDATE ON public.commercial_payment_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_popt_updated_at ON public.partner_order_payment_terms;
CREATE TRIGGER trg_popt_updated_at
  BEFORE UPDATE ON public.partner_order_payment_terms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Trigger de auditoria em partner_order_payment_terms
CREATE OR REPLACE FUNCTION public.audit_partner_order_payment_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  SELECT partner_id INTO v_partner_id FROM public.partner_orders WHERE id = NEW.partner_order_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (NEW.partner_order_id, v_partner_id, auth.uid(), 'payment_terms_created', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.partner_order_audit_logs (order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
    VALUES (NEW.partner_order_id, v_partner_id, auth.uid(), 'payment_terms_updated', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_popt_audit ON public.partner_order_payment_terms;
CREATE TRIGGER trg_popt_audit
  AFTER INSERT OR UPDATE ON public.partner_order_payment_terms
  FOR EACH ROW EXECUTE FUNCTION public.audit_partner_order_payment_terms();

-- 7) Seed dos 8 planos iniciais
INSERT INTO public.commercial_payment_plans
  (name, code, plan_type, max_days, months_count, installment_count, discount_percent, monthly_interest_percent, interest_type, requires_credit_approval, requires_guarantee, requires_financial_approval, sort_order)
VALUES
  ('À vista / antecipado (7 dias)', 'cash_7d', 'cash', 7, 0, 1, 40, 0, 'none', false, false, false, 1),
  ('Prazo curto 30 dias', 'short_30d', 'short_term', 30, 1, 1, 35, 0, 'none', false, false, false, 2),
  ('Prazo médio 60 dias', 'medium_60d', 'medium_term', 60, 2, 1, 30, 1.5, 'compound', false, false, false, 3),
  ('Prazo estendido 90 dias', 'extended_90d', 'extended_term', 90, 3, 1, 25, 2.0, 'compound', true, false, false, 4),
  ('Safra aprovada 6 meses', 'harvest_6m_approved', 'harvest', 180, 6, 1, 20, 2.0, 'compound', true, true, true, 5),
  ('Safra aprovada 8 meses', 'harvest_8m_approved', 'harvest', 240, 8, 1, 20, 2.0, 'compound', true, true, true, 6),
  ('Safra risco médio 8 meses', 'harvest_8m_medium_risk', 'harvest', 240, 8, 1, 20, 2.5, 'compound', true, true, true, 7),
  ('Safra sem garantia forte 8 meses', 'harvest_8m_no_strong_guarantee', 'harvest', 240, 8, 1, 15, 3.0, 'compound', true, true, true, 8)
ON CONFLICT (code) DO NOTHING;
