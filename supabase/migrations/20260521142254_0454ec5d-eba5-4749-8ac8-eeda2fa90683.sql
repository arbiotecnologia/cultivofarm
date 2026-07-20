
-- =========================================================
-- FASE 6: Relatórios Financeiros, Exportações e Recibos
-- =========================================================

-- ---------- TABLE: financial_report_exports ----------
CREATE TABLE public.financial_report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  format text NOT NULL CHECK (format IN ('PDF','XLSX','CSV')),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_bucket text,
  storage_path text,
  status text NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS','ERROR','PENDING')),
  error_message text,
  row_count integer,
  generated_by uuid NOT NULL REFERENCES auth.users(id),
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fre_type ON public.financial_report_exports(report_type);
CREATE INDEX idx_fre_user ON public.financial_report_exports(generated_by);
CREATE INDEX idx_fre_at ON public.financial_report_exports(generated_at DESC);

ALTER TABLE public.financial_report_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fre_financial_staff_all" ON public.financial_report_exports
  FOR ALL TO authenticated
  USING (is_financial_staff(auth.uid()))
  WITH CHECK (is_financial_staff(auth.uid()));

-- ---------- TABLE: financial_receipts ----------
CREATE TABLE public.financial_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text UNIQUE NOT NULL,
  receipt_year integer NOT NULL,
  receipt_seq integer NOT NULL,
  payment_id uuid NOT NULL REFERENCES public.receivable_payments(id) ON DELETE RESTRICT,
  customer_id uuid REFERENCES public.clientes(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL,
  payment_method_id uuid REFERENCES public.payment_methods(id),
  description text,
  status text NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','CANCELED')),
  cancel_reason text,
  canceled_by uuid REFERENCES auth.users(id),
  canceled_at timestamptz,
  storage_bucket text,
  storage_path text,
  authenticity_code text UNIQUE NOT NULL,
  public_verification_token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  qr_code_enabled boolean NOT NULL DEFAULT false,
  issued_by uuid NOT NULL REFERENCES auth.users(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(receipt_year, receipt_seq)
);
CREATE INDEX idx_fr_payment ON public.financial_receipts(payment_id);
CREATE INDEX idx_fr_customer ON public.financial_receipts(customer_id);
CREATE INDEX idx_fr_date ON public.financial_receipts(payment_date DESC);
CREATE INDEX idx_fr_token ON public.financial_receipts(public_verification_token);

ALTER TABLE public.financial_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fr_select_financial" ON public.financial_receipts
  FOR SELECT TO authenticated
  USING (is_financial_staff(auth.uid()));

CREATE POLICY "fr_insert_financial" ON public.financial_receipts
  FOR INSERT TO authenticated
  WITH CHECK (is_financial_staff(auth.uid()) AND issued_by = auth.uid());

CREATE POLICY "fr_update_financial" ON public.financial_receipts
  FOR UPDATE TO authenticated
  USING (
    is_financial_staff(auth.uid()) AND (
      has_role(auth.uid(), 'administrador'::app_role)
      OR has_role(auth.uid(), 'gestor'::app_role)
      OR (has_role(auth.uid(), 'financeiro'::app_role) AND issued_at::date = CURRENT_DATE)
    )
  )
  WITH CHECK (is_financial_staff(auth.uid()));

-- ---------- Function/trigger: numbering + auth code ----------
CREATE OR REPLACE FUNCTION public.fn_assign_receipt_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int;
  v_seq int;
  v_code text;
BEGIN
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.payment_date, CURRENT_DATE))::int;
  -- lock the table portion for this year and compute next seq
  PERFORM 1 FROM public.financial_receipts WHERE receipt_year = v_year FOR UPDATE;
  SELECT COALESCE(MAX(receipt_seq), 0) + 1 INTO v_seq
    FROM public.financial_receipts WHERE receipt_year = v_year;
  NEW.receipt_year := v_year;
  NEW.receipt_seq := v_seq;
  NEW.receipt_number := 'REC-' || v_year::text || '-' || lpad(v_seq::text, 6, '0');
  IF NEW.authenticity_code IS NULL THEN
    v_code := upper(substr(encode(digest(NEW.id::text || gen_random_uuid()::text || clock_timestamp()::text, 'sha256'), 'hex'), 1, 12));
    NEW.authenticity_code := substr(v_code,1,4) || '-' || substr(v_code,5,4) || '-' || substr(v_code,9,4);
  END IF;
  IF NEW.public_verification_token IS NULL THEN
    NEW.public_verification_token := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assign_receipt_metadata
BEFORE INSERT ON public.financial_receipts
FOR EACH ROW EXECUTE FUNCTION public.fn_assign_receipt_metadata();

-- ---------- Storage buckets (private) ----------
INSERT INTO storage.buckets (id, name, public)
  VALUES ('financial-reports', 'financial-reports', false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
  VALUES ('financial-receipts', 'financial-receipts', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "fin_reports_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'financial-reports' AND is_financial_staff(auth.uid()));

CREATE POLICY "fin_reports_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'financial-reports' AND is_financial_staff(auth.uid()));

CREATE POLICY "fin_receipts_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'financial-receipts' AND is_financial_staff(auth.uid()));

CREATE POLICY "fin_receipts_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'financial-receipts' AND is_financial_staff(auth.uid()));

-- =========================================================
-- RPCs (SECURITY DEFINER + role gate)
-- =========================================================

-- 1) Monthly financial report
CREATE OR REPLACE FUNCTION public.get_report_monthly_financial(
  _from date, _to date, _cost_center uuid DEFAULT NULL, _regime text DEFAULT 'CASH'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  WITH rec AS (
    SELECT COALESCE(SUM(rp.amount_received),0) AS total
    FROM receivable_payments rp
    JOIN accounts_receivable_installments i ON i.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE rp.payment_date BETWEEN _from AND _to AND rp.is_reversal = false
      AND (_cost_center IS NULL OR ar.cost_center_id = _cost_center)
  ),
  pag AS (
    SELECT COALESCE(SUM(pp.amount_paid),0) AS total
    FROM payable_payments pp
    JOIN accounts_payable_installments i ON i.id = pp.installment_id
    JOIN accounts_payable ap ON ap.id = i.payable_id
    WHERE pp.payment_date BETWEEN _from AND _to AND pp.is_reversal = false
      AND (_cost_center IS NULL OR ap.cost_center_id = _cost_center)
  ),
  prev_rec AS (
    SELECT COALESCE(SUM(i.amount),0) AS total
    FROM accounts_receivable_installments i
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE i.due_date BETWEEN _from AND _to AND ar.status <> 'CANCELED'
      AND (_cost_center IS NULL OR ar.cost_center_id = _cost_center)
  ),
  prev_pag AS (
    SELECT COALESCE(SUM(i.amount),0) AS total
    FROM accounts_payable_installments i
    JOIN accounts_payable ap ON ap.id = i.payable_id
    WHERE i.due_date BETWEEN _from AND _to AND ap.status <> 'CANCELED'
      AND (_cost_center IS NULL OR ap.cost_center_id = _cost_center)
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', _from, 'to', _to),
    'regime', _regime,
    'received', (SELECT total FROM rec),
    'paid', (SELECT total FROM pag),
    'expected_receivable', (SELECT total FROM prev_rec),
    'expected_payable', (SELECT total FROM prev_pag),
    'net_cash', (SELECT total FROM rec) - (SELECT total FROM pag)
  ) INTO r;
  RETURN r;
END;$$;

-- 2) Receivables detail
CREATE OR REPLACE FUNCTION public.get_report_receivables(_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(
  installment_id uuid, receivable_id uuid, customer_name text, description text,
  category text, due_date date, amount numeric, paid numeric, balance numeric, status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _from date := (_filters->>'from')::date;
        _to date := (_filters->>'to')::date;
        _status text := _filters->>'status';
        _customer uuid := NULLIF(_filters->>'customer_id','')::uuid;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT i.id, ar.id, c.nome_razao_social, ar.description, fc.name,
         i.due_date, i.amount,
         COALESCE((SELECT SUM(rp.amount_received) FROM receivable_payments rp WHERE rp.installment_id = i.id AND rp.is_reversal=false),0),
         i.amount - COALESCE((SELECT SUM(rp.amount_received) FROM receivable_payments rp WHERE rp.installment_id = i.id AND rp.is_reversal=false),0),
         i.status
  FROM accounts_receivable_installments i
  JOIN accounts_receivable ar ON ar.id = i.receivable_id
  JOIN clientes c ON c.id = ar.customer_id
  LEFT JOIN financial_categories fc ON fc.id = ar.category_id
  WHERE (_from IS NULL OR i.due_date >= _from)
    AND (_to IS NULL OR i.due_date <= _to)
    AND (_status IS NULL OR i.status = _status)
    AND (_customer IS NULL OR ar.customer_id = _customer)
    AND ar.status <> 'CANCELED'
  ORDER BY i.due_date;
END;$$;

-- 3) Payables detail
CREATE OR REPLACE FUNCTION public.get_report_payables(_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(
  installment_id uuid, payable_id uuid, supplier text, description text,
  category text, due_date date, amount numeric, paid numeric, balance numeric, status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _from date := (_filters->>'from')::date;
        _to date := (_filters->>'to')::date;
        _status text := _filters->>'status';
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT i.id, ap.id, COALESCE(ap.supplier_name,'—'), ap.description, fc.name,
         i.due_date, i.amount,
         COALESCE((SELECT SUM(pp.amount_paid) FROM payable_payments pp WHERE pp.installment_id = i.id AND pp.is_reversal=false),0),
         i.amount - COALESCE((SELECT SUM(pp.amount_paid) FROM payable_payments pp WHERE pp.installment_id = i.id AND pp.is_reversal=false),0),
         i.status
  FROM accounts_payable_installments i
  JOIN accounts_payable ap ON ap.id = i.payable_id
  LEFT JOIN financial_categories fc ON fc.id = ap.category_id
  WHERE (_from IS NULL OR i.due_date >= _from)
    AND (_to IS NULL OR i.due_date <= _to)
    AND (_status IS NULL OR i.status = _status)
    AND ap.status <> 'CANCELED'
  ORDER BY i.due_date;
END;$$;

-- 4) Delinquency
CREATE OR REPLACE FUNCTION public.get_report_delinquency(_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  installment_id uuid, customer_name text, description text, due_date date,
  amount numeric, balance numeric, days_overdue int
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT i.id, c.nome_razao_social, ar.description, i.due_date, i.amount,
    i.amount - COALESCE((SELECT SUM(rp.amount_received) FROM receivable_payments rp WHERE rp.installment_id = i.id AND rp.is_reversal=false),0) AS balance,
    (_as_of - i.due_date)::int
  FROM accounts_receivable_installments i
  JOIN accounts_receivable ar ON ar.id = i.receivable_id
  JOIN clientes c ON c.id = ar.customer_id
  WHERE i.due_date < _as_of AND i.status IN ('OPEN','PARTIAL','OVERDUE')
    AND ar.status <> 'CANCELED'
  ORDER BY i.due_date;
END;$$;

-- 5) NFe pending
CREATE OR REPLACE FUNCTION public.get_report_nfe_pending(_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(
  receivable_id uuid, customer_name text, description text, total_amount numeric,
  issue_date date, fiscal_invoice_status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT ar.id, c.nome_razao_social, ar.description, ar.total_amount,
         ar.issue_date, ar.fiscal_invoice_status
  FROM accounts_receivable ar
  JOIN clientes c ON c.id = ar.customer_id
  WHERE ar.fiscal_invoice_required = true
    AND ar.fiscal_invoice_status = 'PENDING'
    AND ar.status <> 'CANCELED'
  ORDER BY ar.issue_date;
END;$$;

-- 6) Deliveries billing status
CREATE OR REPLACE FUNCTION public.get_report_deliveries_billing_status(_from date, _to date)
RETURNS TABLE(
  delivery_id uuid, customer_name text, delivery_date date, total_value numeric,
  billed boolean, receivable_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT e.id, c.nome_razao_social, e.data_entrega::date, COALESCE(e.valor_total,0),
         (e.receivable_id IS NOT NULL), e.receivable_id
  FROM entregas e
  JOIN clientes c ON c.id = e.cliente_id
  WHERE e.data_entrega::date BETWEEN _from AND _to
  ORDER BY e.data_entrega DESC;
END;$$;

-- 7) Customer statement
CREATE OR REPLACE FUNCTION public.get_report_customer_statement(_customer_id uuid, _from date, _to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  WITH delivered AS (
    SELECT COALESCE(SUM(valor_total),0) AS total
    FROM entregas WHERE cliente_id = _customer_id AND data_entrega::date BETWEEN _from AND _to
  ),
  billed AS (
    SELECT COALESCE(SUM(total_amount),0) AS total
    FROM accounts_receivable
    WHERE customer_id = _customer_id AND issue_date BETWEEN _from AND _to AND status <> 'CANCELED'
  ),
  received AS (
    SELECT COALESCE(SUM(rp.amount_received),0) AS total
    FROM receivable_payments rp
    JOIN accounts_receivable_installments i ON i.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE ar.customer_id = _customer_id AND rp.payment_date BETWEEN _from AND _to AND rp.is_reversal=false
  ),
  open_bal AS (
    SELECT COALESCE(SUM(i.amount - COALESCE((SELECT SUM(rp.amount_received) FROM receivable_payments rp WHERE rp.installment_id = i.id AND rp.is_reversal=false),0)),0) AS total
    FROM accounts_receivable_installments i
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE ar.customer_id = _customer_id AND i.status IN ('OPEN','PARTIAL','OVERDUE') AND ar.status <> 'CANCELED'
  )
  SELECT jsonb_build_object(
    'customer_id', _customer_id,
    'period', jsonb_build_object('from', _from, 'to', _to),
    'delivered', (SELECT total FROM delivered),
    'billed', (SELECT total FROM billed),
    'received', (SELECT total FROM received),
    'open_balance', (SELECT total FROM open_bal)
  ) INTO r;
  RETURN r;
END;$$;

-- 8) Accountability (prestação de contas)
CREATE OR REPLACE FUNCTION public.get_report_accountability(_scope jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb;
        _customer uuid := NULLIF(_scope->>'customer_id','')::uuid;
        _from date := (_scope->>'from')::date;
        _to date := (_scope->>'to')::date;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT jsonb_build_object(
    'scope', _scope,
    'summary', public.get_report_customer_statement(_customer, _from, _to)
  ) INTO r;
  RETURN r;
END;$$;

-- 9) Issue receipt
CREATE OR REPLACE FUNCTION public.issue_financial_receipt(_payment_id uuid, _description text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_payment record;
  v_customer uuid;
  v_id uuid;
  v_number text;
  v_code text;
  v_token uuid;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT rp.*, ar.customer_id AS cust
    INTO v_payment
    FROM receivable_payments rp
    JOIN accounts_receivable_installments i ON i.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
   WHERE rp.id = _payment_id AND rp.is_reversal = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento não encontrado ou estornado'; END IF;

  INSERT INTO financial_receipts(
    payment_id, customer_id, amount, payment_date, payment_method_id,
    description, issued_by, receipt_number, receipt_year, receipt_seq, authenticity_code
  ) VALUES (
    _payment_id, v_payment.cust, v_payment.amount_received, v_payment.payment_date, v_payment.payment_method_id,
    _description, auth.uid(), '', 0, 0, NULL
  ) RETURNING id, receipt_number, authenticity_code, public_verification_token
    INTO v_id, v_number, v_code, v_token;

  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_receipts', v_id, 'FINANCIAL_RECEIPT_ISSUED',
          jsonb_build_object('receipt_number', v_number, 'payment_id', _payment_id), auth.uid());

  RETURN jsonb_build_object(
    'id', v_id, 'receipt_number', v_number,
    'authenticity_code', v_code, 'public_verification_token', v_token
  );
END;$$;

-- 10) Cancel receipt
CREATE OR REPLACE FUNCTION public.cancel_financial_receipt(_receipt_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rec record;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT * INTO v_rec FROM financial_receipts WHERE id = _receipt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recibo não encontrado'; END IF;
  IF v_rec.status = 'CANCELED' THEN RAISE EXCEPTION 'Recibo já cancelado'; END IF;
  IF NOT (has_role(auth.uid(),'administrador'::app_role) OR has_role(auth.uid(),'gestor'::app_role))
     AND v_rec.issued_at::date <> CURRENT_DATE THEN
    RAISE EXCEPTION 'Apenas administrador/gestor podem cancelar recibos de outros dias';
  END IF;
  UPDATE financial_receipts
     SET status='CANCELED', cancel_reason=_reason, canceled_by=auth.uid(), canceled_at=now()
   WHERE id=_receipt_id;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_receipts', _receipt_id, 'FINANCIAL_RECEIPT_CANCELED',
          jsonb_build_object('reason', _reason), auth.uid());
END;$$;

-- 11) Log report export
CREATE OR REPLACE FUNCTION public.log_report_export(
  _report_type text, _filters jsonb, _format text,
  _storage_bucket text, _storage_path text,
  _status text DEFAULT 'SUCCESS', _error text DEFAULT NULL, _row_count int DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  INSERT INTO financial_report_exports(report_type, filters, format, storage_bucket, storage_path, status, error_message, row_count, generated_by)
  VALUES (_report_type, _filters, _format, _storage_bucket, _storage_path, _status, _error, _row_count, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_report_exports', v_id, 'FINANCIAL_REPORT_EXPORTED',
          jsonb_build_object('report_type', _report_type, 'format', _format, 'status', _status), auth.uid());
  RETURN v_id;
END;$$;
