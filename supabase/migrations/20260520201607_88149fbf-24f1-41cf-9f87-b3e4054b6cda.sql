
-- ============================================================
-- MÓDULO FINANCEIRO - BASE
-- ============================================================

-- 1.1 Categorias
CREATE TABLE public.financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('RECEITA','DESPESA','AMBOS')),
  parent_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1.2 Centros de custo
CREATE TABLE public.financial_cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1.3 Formas de pagamento
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.payment_methods (name) VALUES
  ('Pix'),('Dinheiro'),('Transferência Bancária'),('Boleto'),('Cartão'),('Outro');

-- 1.4 Contas bancárias
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bank_name text,
  agency text,
  account_number text,
  pix_key text,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1.5 Contas a receber
CREATE TABLE public.accounts_receivable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_type text NOT NULL CHECK (origin_type IN ('DELIVERY','SERVICE','MANUAL','RECURRING','CONTRACT')),
  origin_id uuid,
  customer_id uuid NOT NULL REFERENCES public.clientes(id),
  description text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.financial_categories(id),
  cost_center_id uuid REFERENCES public.financial_cost_centers(id),
  total_amount numeric(14,2) NOT NULL CHECK (total_amount >= 0),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  first_due_date date NOT NULL,
  installment_count integer NOT NULL DEFAULT 1 CHECK (installment_count >= 1),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','PAID','CANCELED','OVERDUE')),
  fiscal_invoice_required boolean NOT NULL DEFAULT false,
  fiscal_invoice_status text NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (fiscal_invoice_status IN ('NOT_REQUIRED','PENDING','ISSUED','CANCELED')),
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1.6 Parcelas a receber
CREATE TABLE public.accounts_receivable_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL REFERENCES public.accounts_receivable(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  due_date date NOT NULL,
  original_amount numeric(14,2) NOT NULL,
  received_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  interest_amount numeric(14,2) NOT NULL DEFAULT 0,
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0,
  net_amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','PAID','CANCELED','OVERDUE')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.7 Recebimentos
CREATE TABLE public.receivable_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id uuid NOT NULL REFERENCES public.accounts_receivable_installments(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_received numeric(14,2) NOT NULL CHECK (amount_received > 0),
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id),
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  interest_amount numeric(14,2) NOT NULL DEFAULT 0,
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.8 Contas a pagar
CREATE TABLE public.accounts_payable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid,
  supplier_name text,
  description text NOT NULL,
  category_id uuid NOT NULL REFERENCES public.financial_categories(id),
  cost_center_id uuid REFERENCES public.financial_cost_centers(id),
  total_amount numeric(14,2) NOT NULL CHECK (total_amount >= 0),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  first_due_date date NOT NULL,
  installment_count integer NOT NULL DEFAULT 1 CHECK (installment_count >= 1),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','PAID','CANCELED','OVERDUE')),
  origin_type text NOT NULL DEFAULT 'MANUAL' CHECK (origin_type IN ('MANUAL','PURCHASE','FREIGHT','COMMISSION','RECURRING','TAX')),
  origin_id uuid,
  fiscal_document_number text,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1.9 Parcelas a pagar
CREATE TABLE public.accounts_payable_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payable_id uuid NOT NULL REFERENCES public.accounts_payable(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  due_date date NOT NULL,
  original_amount numeric(14,2) NOT NULL,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  interest_amount numeric(14,2) NOT NULL DEFAULT 0,
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0,
  net_amount numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','PAID','CANCELED','OVERDUE')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.10 Pagamentos
CREATE TABLE public.payable_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id uuid NOT NULL REFERENCES public.accounts_payable_installments(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_paid numeric(14,2) NOT NULL CHECK (amount_paid > 0),
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id),
  bank_account_id uuid REFERENCES public.bank_accounts(id),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  interest_amount numeric(14,2) NOT NULL DEFAULT 0,
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 1.11 Documentos
CREATE TABLE public.financial_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('RECEIVABLE','PAYABLE','DELIVERY','FISCAL_INVOICE')),
  owner_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('COMPROVANTE','BOLETO','DANFE','XML_NFE','RECIBO','CONTRATO','OUTRO')),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size bigint,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- 1.12 Auditoria
CREATE TABLE public.financial_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  performed_by uuid REFERENCES auth.users(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_ar_customer ON public.accounts_receivable(customer_id);
CREATE INDEX idx_ar_status ON public.accounts_receivable(status);
CREATE INDEX idx_ari_due ON public.accounts_receivable_installments(due_date);
CREATE INDEX idx_ari_status ON public.accounts_receivable_installments(status);
CREATE INDEX idx_ap_status ON public.accounts_payable(status);
CREATE INDEX idx_api_due ON public.accounts_payable_installments(due_date);
CREATE INDEX idx_api_status ON public.accounts_payable_installments(status);
CREATE INDEX idx_fd_owner ON public.financial_documents(owner_type, owner_id);
CREATE INDEX idx_fal_entity ON public.financial_audit_log(entity_type, entity_id);

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================
CREATE TRIGGER trg_fc_uat BEFORE UPDATE ON public.financial_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fcc_uat BEFORE UPDATE ON public.financial_cost_centers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ba_uat BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ar_uat BEFORE UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ap_uat BEFORE UPDATE ON public.accounts_payable FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- HELPERS
-- ============================================================

-- Helper: papel financeiro
CREATE OR REPLACE FUNCTION public.is_financial_staff(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT has_role(_uid,'administrador'::app_role)
      OR has_role(_uid,'gestor'::app_role)
      OR has_role(_uid,'administrativo'::app_role)
$$;

-- ============================================================
-- GERAÇÃO AUTOMÁTICA DE PARCELAS
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_generate_receivable_installments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i int;
  v_qtd int := NEW.installment_count;
  v_base numeric(14,2) := ROUND(NEW.total_amount / v_qtd, 2);
  v_acc numeric(14,2) := 0;
  v_amt numeric(14,2);
BEGIN
  FOR i IN 1..v_qtd LOOP
    IF i < v_qtd THEN
      v_amt := v_base;
      v_acc := v_acc + v_amt;
    ELSE
      v_amt := NEW.total_amount - v_acc; -- ajuste de centavos
    END IF;
    INSERT INTO public.accounts_receivable_installments
      (receivable_id, installment_number, due_date, original_amount, net_amount, status)
    VALUES
      (NEW.id, i, (NEW.first_due_date + ((i-1) || ' months')::interval)::date, v_amt, v_amt, 'OPEN');
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_ar_gen_installments AFTER INSERT ON public.accounts_receivable
FOR EACH ROW EXECUTE FUNCTION public.fn_generate_receivable_installments();

CREATE OR REPLACE FUNCTION public.fn_generate_payable_installments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i int;
  v_qtd int := NEW.installment_count;
  v_base numeric(14,2) := ROUND(NEW.total_amount / v_qtd, 2);
  v_acc numeric(14,2) := 0;
  v_amt numeric(14,2);
BEGIN
  FOR i IN 1..v_qtd LOOP
    IF i < v_qtd THEN
      v_amt := v_base;
      v_acc := v_acc + v_amt;
    ELSE
      v_amt := NEW.total_amount - v_acc;
    END IF;
    INSERT INTO public.accounts_payable_installments
      (payable_id, installment_number, due_date, original_amount, net_amount, status)
    VALUES
      (NEW.id, i, (NEW.first_due_date + ((i-1) || ' months')::interval)::date, v_amt, v_amt, 'OPEN');
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_ap_gen_installments AFTER INSERT ON public.accounts_payable
FOR EACH ROW EXECUTE FUNCTION public.fn_generate_payable_installments();

-- ============================================================
-- RECÁLCULO DE STATUS / SALDOS
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_recalc_receivable_installment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  IF (v_total_recebido + v_total_desc) >= v_inst.original_amount THEN
    v_status := 'PAID';
  ELSIF v_total_recebido > 0 THEN
    v_status := 'PARTIAL';
  ELSE
    v_status := CASE WHEN v_inst.due_date < CURRENT_DATE THEN 'OVERDUE' ELSE 'OPEN' END;
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
END $$;

CREATE TRIGGER trg_recalc_ar_inst AFTER INSERT OR UPDATE OR DELETE ON public.receivable_payments
FOR EACH ROW EXECUTE FUNCTION public.fn_recalc_receivable_installment();

CREATE OR REPLACE FUNCTION public.fn_recalc_payable_installment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  IF (v_total_pago + v_total_desc) >= v_inst.original_amount THEN v_status := 'PAID';
  ELSIF v_total_pago > 0 THEN v_status := 'PARTIAL';
  ELSE v_status := CASE WHEN v_inst.due_date < CURRENT_DATE THEN 'OVERDUE' ELSE 'OPEN' END;
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
END $$;

CREATE TRIGGER trg_recalc_ap_inst AFTER INSERT OR UPDATE OR DELETE ON public.payable_payments
FOR EACH ROW EXECUTE FUNCTION public.fn_recalc_payable_installment();

-- ============================================================
-- AUDITORIA GENÉRICA
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_financial_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb; v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN v_old := to_jsonb(OLD);
  END IF;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES (TG_TABLE_NAME, COALESCE((NEW).id, (OLD).id), TG_OP, v_old, v_new, auth.uid());

  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER trg_audit_ar AFTER INSERT OR UPDATE OR DELETE ON public.accounts_receivable
FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();
CREATE TRIGGER trg_audit_ap AFTER INSERT OR UPDATE OR DELETE ON public.accounts_payable
FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();
CREATE TRIGGER trg_audit_rp AFTER INSERT OR UPDATE OR DELETE ON public.receivable_payments
FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();
CREATE TRIGGER trg_audit_pp AFTER INSERT OR UPDATE OR DELETE ON public.payable_payments
FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();

-- ============================================================
-- MARCAÇÃO DE VENCIDOS
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_mark_financial_overdue()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.accounts_receivable_installments
    SET status='OVERDUE'
    WHERE status='OPEN' AND due_date < CURRENT_DATE;
  UPDATE public.accounts_payable_installments
    SET status='OVERDUE'
    WHERE status='OPEN' AND due_date < CURRENT_DATE;

  UPDATE public.accounts_receivable ar SET status='OVERDUE'
    WHERE status IN ('OPEN','PARTIAL')
      AND EXISTS (SELECT 1 FROM public.accounts_receivable_installments WHERE receivable_id = ar.id AND status='OVERDUE');
  UPDATE public.accounts_payable ap SET status='OVERDUE'
    WHERE status IN ('OPEN','PARTIAL')
      AND EXISTS (SELECT 1 FROM public.accounts_payable_installments WHERE payable_id = ap.id AND status='OVERDUE');
END $$;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_receivable_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts_payable_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payable_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;

-- Política universal para tabelas operacionais
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'financial_categories','financial_cost_centers','payment_methods','bank_accounts',
    'accounts_receivable','accounts_receivable_installments','receivable_payments',
    'accounts_payable','accounts_payable_installments','payable_payments','financial_documents'
  ]) LOOP
    EXECUTE format($f$
      CREATE POLICY "Financial staff full access" ON public.%I
      FOR ALL TO authenticated
      USING (public.is_financial_staff(auth.uid()))
      WITH CHECK (public.is_financial_staff(auth.uid()))
    $f$, t);
  END LOOP;
END $$;

-- Audit log: somente SELECT (insert é via trigger SECURITY DEFINER)
CREATE POLICY "Financial staff read audit" ON public.financial_audit_log
  FOR SELECT TO authenticated USING (public.is_financial_staff(auth.uid()));

-- ============================================================
-- SEED CATEGORIAS
-- ============================================================
INSERT INTO public.financial_categories (name, type) VALUES
  ('Vendas de Bioinsumos','RECEITA'),
  ('Serviços Técnicos','RECEITA'),
  ('Insumos / Matéria-Prima','DESPESA'),
  ('Despesas Operacionais','DESPESA'),
  ('Impostos','DESPESA');

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('financial-docs','financial-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Financial staff read docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='financial-docs' AND public.is_financial_staff(auth.uid()));
CREATE POLICY "Financial staff upload docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='financial-docs' AND public.is_financial_staff(auth.uid()));
CREATE POLICY "Financial staff update docs" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='financial-docs' AND public.is_financial_staff(auth.uid()));
CREATE POLICY "Financial staff delete docs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='financial-docs' AND public.is_financial_staff(auth.uid()));
