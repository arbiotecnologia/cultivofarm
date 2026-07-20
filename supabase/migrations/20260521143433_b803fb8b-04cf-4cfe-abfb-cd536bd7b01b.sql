
-- DROPs necessários (mudança de assinatura)
DROP FUNCTION IF EXISTS public.issue_financial_receipt(uuid, text);
DROP FUNCTION IF EXISTS public.cancel_financial_receipt(uuid, text);
DROP FUNCTION IF EXISTS public.get_report_delinquency(date);
DROP FUNCTION IF EXISTS public.get_report_nfe_pending(jsonb);

-- 1) financial_report_exports
ALTER TABLE public.financial_report_exports
  ADD COLUMN IF NOT EXISTS report_title text,
  ADD COLUMN IF NOT EXISTS file_format text;
UPDATE public.financial_report_exports
  SET file_format = COALESCE(file_format, format),
      report_title = COALESCE(report_title, report_type)
  WHERE file_format IS NULL OR report_title IS NULL;
ALTER TABLE public.financial_report_exports
  ALTER COLUMN report_title SET NOT NULL,
  ALTER COLUMN file_format SET NOT NULL;
ALTER TABLE public.financial_report_exports
  DROP CONSTRAINT IF EXISTS financial_report_exports_status_check;
ALTER TABLE public.financial_report_exports
  ADD CONSTRAINT financial_report_exports_status_check
  CHECK (status IN ('SUCCESS','ERROR','PENDING','FAILED','PROCESSING'));
ALTER TABLE public.financial_report_exports
  DROP CONSTRAINT IF EXISTS financial_report_exports_file_format_check;
ALTER TABLE public.financial_report_exports
  ADD CONSTRAINT financial_report_exports_file_format_check
  CHECK (file_format IN ('PDF','XLSX','CSV'));
CREATE INDEX IF NOT EXISTS idx_fre_file_format ON public.financial_report_exports(file_format);
CREATE INDEX IF NOT EXISTS idx_fre_status ON public.financial_report_exports(status);

CREATE OR REPLACE FUNCTION public.fn_sync_report_export_aliases()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.file_format IS NULL AND NEW.format IS NOT NULL THEN NEW.file_format := NEW.format; END IF;
  IF NEW.format IS NULL AND NEW.file_format IS NOT NULL THEN NEW.format := NEW.file_format; END IF;
  IF NEW.report_title IS NULL THEN NEW.report_title := NEW.report_type; END IF;
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS trg_sync_report_export_aliases ON public.financial_report_exports;
CREATE TRIGGER trg_sync_report_export_aliases
BEFORE INSERT OR UPDATE ON public.financial_report_exports
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_report_export_aliases();

-- 2) financial_receipts
ALTER TABLE public.financial_receipts
  ADD COLUMN IF NOT EXISTS receivable_id uuid REFERENCES public.accounts_receivable(id),
  ADD COLUMN IF NOT EXISTS receivable_payment_id uuid;
UPDATE public.financial_receipts
  SET receivable_payment_id = COALESCE(receivable_payment_id, payment_id);
CREATE INDEX IF NOT EXISTS idx_fr_receivable ON public.financial_receipts(receivable_id);
CREATE INDEX IF NOT EXISTS idx_fr_status ON public.financial_receipts(status);

CREATE OR REPLACE FUNCTION public.fn_sync_receipt_aliases()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.receivable_payment_id IS NULL AND NEW.payment_id IS NOT NULL THEN
    NEW.receivable_payment_id := NEW.payment_id;
  ELSIF NEW.payment_id IS NULL AND NEW.receivable_payment_id IS NOT NULL THEN
    NEW.payment_id := NEW.receivable_payment_id;
  END IF;
  IF NEW.description IS NULL OR length(trim(NEW.description)) = 0 THEN
    NEW.description := 'Recibo nº ' || COALESCE(NEW.receipt_number, '—');
  END IF;
  RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS trg_sync_receipt_aliases ON public.financial_receipts;
CREATE TRIGGER trg_sync_receipt_aliases
BEFORE INSERT OR UPDATE ON public.financial_receipts
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_receipt_aliases();

-- 3) issue_financial_receipt
CREATE OR REPLACE FUNCTION public.issue_financial_receipt(
  _payment_id uuid,
  _description text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment record; v_installment record; v_receivable record;
  v_existing record; v_receipt_id uuid; v_desc text;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT * INTO v_payment FROM receivable_payments WHERE id = _payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recebimento não encontrado'; END IF;
  IF v_payment.is_reversal THEN RAISE EXCEPTION 'Não é possível emitir recibo para estorno'; END IF;
  SELECT * INTO v_installment FROM accounts_receivable_installments WHERE id = v_payment.installment_id;
  SELECT * INTO v_receivable FROM accounts_receivable WHERE id = v_installment.receivable_id;
  SELECT * INTO v_existing FROM financial_receipts
    WHERE payment_id = _payment_id AND status = 'ISSUED' LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'receipt_id', v_existing.id,
      'receipt_number', v_existing.receipt_number,
      'message', 'Recibo já emitido para este recebimento');
  END IF;
  v_desc := COALESCE(NULLIF(trim(_description), ''),
    'Recebimento ref. parcela ' || COALESCE(v_installment.installment_number::text, '—') ||
    ' de ' || COALESCE(v_receivable.description, 'título financeiro'));
  INSERT INTO financial_receipts(
    payment_id, receivable_payment_id, receivable_id, customer_id, amount,
    payment_date, payment_method_id, description, issued_by, status
  ) VALUES (
    _payment_id, _payment_id, v_installment.receivable_id, v_receivable.cliente_id,
    v_payment.amount_received, v_payment.payment_date, v_payment.payment_method_id,
    v_desc, auth.uid(), 'ISSUED'
  ) RETURNING id INTO v_receipt_id;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_receipts', v_receipt_id, 'FINANCIAL_RECEIPT_ISSUED',
          jsonb_build_object('payment_id', _payment_id, 'amount', v_payment.amount_received), auth.uid());
  RETURN jsonb_build_object('duplicate', false, 'receipt_id', v_receipt_id,
    'receipt_number', (SELECT receipt_number FROM financial_receipts WHERE id = v_receipt_id));
END$$;

-- 4) cancel_financial_receipt
CREATE OR REPLACE FUNCTION public.cancel_financial_receipt(_receipt_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rec record;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'Motivo do cancelamento é obrigatório (mín. 5 caracteres)';
  END IF;
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
END$$;

-- 5) get_report_delinquency
CREATE OR REPLACE FUNCTION public.get_report_delinquency(_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE(installment_id uuid, customer_name text, description text,
  due_date date, amount numeric, balance numeric, days_overdue integer,
  customer_phone text, customer_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT i.id, COALESCE(c.nome, c.razao_social, '—'), ar.description, i.due_date, i.amount,
    i.amount - COALESCE((SELECT SUM(rp.amount_received) FROM receivable_payments rp
                         WHERE rp.installment_id = i.id AND rp.is_reversal=false),0),
    (_as_of - i.due_date)::int,
    COALESCE(c.contato_financeiro_telefone, c.telefone),
    COALESCE(c.contato_financeiro_email, c.email)
  FROM accounts_receivable_installments i
  JOIN accounts_receivable ar ON ar.id = i.receivable_id
  LEFT JOIN clientes c ON c.id = ar.cliente_id
  WHERE i.status IN ('OPEN','PARTIAL','OVERDUE') AND i.due_date < _as_of
  ORDER BY i.due_date;
END$$;

-- 6) get_report_nfe_pending
CREATE OR REPLACE FUNCTION public.get_report_nfe_pending(_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(receivable_id uuid, customer_name text, description text,
  total_amount numeric, issue_date date, fiscal_invoice_status text,
  fiscal_invoice_required boolean, origin_type text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT ar.id, COALESCE(c.nome, c.razao_social, '—'), ar.description,
         ar.total_amount, ar.issue_date,
         COALESCE(ar.fiscal_invoice_status, 'PENDING'),
         COALESCE(ar.fiscal_invoice_required, false),
         COALESCE(ar.origin_type, 'MANUAL')
  FROM accounts_receivable ar
  LEFT JOIN clientes c ON c.id = ar.cliente_id
  WHERE ar.status <> 'CANCELED'
    AND (ar.fiscal_invoice_status = 'PENDING'
         OR (COALESCE(ar.fiscal_invoice_required,false)=true
             AND COALESCE(ar.fiscal_invoice_status,'PENDING') <> 'ISSUED'))
  ORDER BY ar.issue_date DESC NULLS LAST;
END$$;

-- 7) get_report_monthly_financial enriquecido
CREATE OR REPLACE FUNCTION public.get_report_monthly_financial(
  _from date, _to date, _cost_center uuid DEFAULT NULL, _regime text DEFAULT 'CASH'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  WITH rec AS (
    SELECT COALESCE(SUM(rp.amount_received),0) AS total
    FROM receivable_payments rp
    JOIN accounts_receivable_installments i ON i.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE rp.payment_date BETWEEN _from AND _to AND rp.is_reversal=false
      AND (_cost_center IS NULL OR ar.cost_center_id = _cost_center)
  ),
  pag AS (
    SELECT COALESCE(SUM(pp.amount_paid),0) AS total
    FROM payable_payments pp
    JOIN accounts_payable_installments i ON i.id = pp.installment_id
    JOIN accounts_payable ap ON ap.id = i.payable_id
    WHERE pp.payment_date BETWEEN _from AND _to AND pp.is_reversal=false
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
  ),
  overdue_rec AS (
    SELECT COALESCE(SUM(i.amount - COALESCE((SELECT SUM(rp.amount_received) FROM receivable_payments rp
      WHERE rp.installment_id = i.id AND rp.is_reversal=false),0)),0) AS total,
      COUNT(*) AS qty
    FROM accounts_receivable_installments i
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE i.status IN ('OPEN','PARTIAL','OVERDUE') AND i.due_date < CURRENT_DATE
      AND (_cost_center IS NULL OR ar.cost_center_id = _cost_center)
  ),
  overdue_pay AS (
    SELECT COUNT(*) AS qty FROM accounts_payable_installments i
    JOIN accounts_payable ap ON ap.id = i.payable_id
    WHERE i.status IN ('OPEN','PARTIAL','OVERDUE') AND i.due_date < CURRENT_DATE
      AND (_cost_center IS NULL OR ap.cost_center_id = _cost_center)
  ),
  nfe_pend AS (
    SELECT COUNT(*) AS qty FROM accounts_receivable ar
    WHERE ar.status <> 'CANCELED' AND (
      ar.fiscal_invoice_status = 'PENDING'
      OR (COALESCE(ar.fiscal_invoice_required,false)=true
          AND COALESCE(ar.fiscal_invoice_status,'PENDING') <> 'ISSUED'))
  ),
  by_cat AS (
    SELECT fc.name AS category, COALESCE(SUM(rp.amount_received),0) AS received
    FROM receivable_payments rp
    JOIN accounts_receivable_installments i ON i.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    LEFT JOIN financial_categories fc ON fc.id = ar.category_id
    WHERE rp.payment_date BETWEEN _from AND _to AND rp.is_reversal=false
      AND (_cost_center IS NULL OR ar.cost_center_id = _cost_center)
    GROUP BY fc.name
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', _from, 'to', _to),
    'regime', _regime,
    'received', (SELECT total FROM rec),
    'paid', (SELECT total FROM pag),
    'expected_receivable', (SELECT total FROM prev_rec),
    'expected_payable', (SELECT total FROM prev_pag),
    'net_cash', (SELECT total FROM rec) - (SELECT total FROM pag),
    'overdue_receivable_total', (SELECT total FROM overdue_rec),
    'overdue_receivable_count', (SELECT qty FROM overdue_rec),
    'overdue_payable_count', (SELECT qty FROM overdue_pay),
    'nfe_pending_count', (SELECT qty FROM nfe_pend),
    'by_category', COALESCE((SELECT jsonb_agg(jsonb_build_object('category',category,'received',received)) FROM by_cat), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END$$;

-- 8) register_financial_report_export
CREATE OR REPLACE FUNCTION public.register_financial_report_export(
  p_report_type text, p_report_title text, p_filters jsonb,
  p_file_format text, p_storage_path text DEFAULT NULL,
  p_status text DEFAULT 'SUCCESS', p_error_message text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  INSERT INTO financial_report_exports(
    report_type, report_title, filters, format, file_format,
    storage_bucket, storage_path, status, error_message, generated_by
  ) VALUES (
    p_report_type, COALESCE(p_report_title, p_report_type), COALESCE(p_filters,'{}'::jsonb),
    p_file_format, p_file_format,
    CASE WHEN p_storage_path IS NULL THEN NULL ELSE 'financial-reports' END,
    p_storage_path, p_status, p_error_message, auth.uid()
  ) RETURNING id INTO v_id;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_report_exports', v_id, 'FINANCIAL_REPORT_EXPORTED',
          jsonb_build_object('report_type', p_report_type, 'format', p_file_format,
                             'title', p_report_title, 'status', p_status), auth.uid());
  RETURN v_id;
END$$;

-- 9) log_report_view
CREATE OR REPLACE FUNCTION public.log_report_view(
  p_report_type text, p_filters jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RETURN; END IF;
  INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_report', gen_random_uuid(), 'FINANCIAL_REPORT_VIEWED',
          jsonb_build_object('report_type', p_report_type, 'filters', p_filters), auth.uid());
END$$;

-- 10) get_financial_report_data (entry point unificado)
CREATE OR REPLACE FUNCTION public.get_financial_report_data(
  p_report_type text, p_start_date date, p_end_date date,
  p_customer_id uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL,
  p_cost_center_id uuid DEFAULT NULL, p_status text DEFAULT NULL,
  p_regime text DEFAULT 'CASH'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_filters jsonb; v_rows jsonb; v_summary jsonb;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Datas inicial e final são obrigatórias'; END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Data final não pode ser menor que data inicial'; END IF;
  v_filters := jsonb_build_object(
    'start_date', p_start_date, 'end_date', p_end_date,
    'customer_id', p_customer_id, 'category_id', p_category_id,
    'cost_center_id', p_cost_center_id, 'status', p_status, 'regime', p_regime
  );
  CASE upper(p_report_type)
    WHEN 'MONTHLY_FINANCIAL' THEN
      v_summary := get_report_monthly_financial(p_start_date, p_end_date, p_cost_center_id, p_regime);
    WHEN 'ACCOUNTS_RECEIVABLE' THEN
      SELECT jsonb_agg(to_jsonb(t)) INTO v_rows FROM get_report_receivables(v_filters) t;
    WHEN 'ACCOUNTS_PAYABLE' THEN
      SELECT jsonb_agg(to_jsonb(t)) INTO v_rows FROM get_report_payables(v_filters) t;
    WHEN 'CASHFLOW' THEN
      v_summary := get_financial_cashflow(p_start_date, p_end_date, 'PROJECTED', 'DAY');
    WHEN 'DRE' THEN
      v_summary := get_financial_dre_summary(p_start_date, p_end_date, p_regime, p_cost_center_id);
    WHEN 'INADIMPLENCIA' THEN
      SELECT jsonb_agg(to_jsonb(t)) INTO v_rows FROM get_report_delinquency(p_end_date) t;
    WHEN 'FISCAL_PENDING' THEN
      SELECT jsonb_agg(to_jsonb(t)) INTO v_rows FROM get_report_nfe_pending(v_filters) t;
    WHEN 'DELIVERY_BILLING' THEN
      v_summary := (SELECT to_jsonb(x) FROM get_report_deliveries_billing_status(p_start_date, p_end_date) x);
    WHEN 'CUSTOMER_STATEMENT' THEN
      IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Cliente é obrigatório para extrato'; END IF;
      v_summary := get_report_customer_statement(p_customer_id, p_start_date, p_end_date);
    WHEN 'ACCOUNTABILITY_STATEMENT' THEN
      IF p_customer_id IS NULL THEN RAISE EXCEPTION 'Cliente é obrigatório para prestação de contas'; END IF;
      v_summary := get_report_accountability(jsonb_build_object(
        'customer_id', p_customer_id, 'from', p_start_date, 'to', p_end_date));
    ELSE RAISE EXCEPTION 'Tipo de relatório inválido: %', p_report_type;
  END CASE;
  PERFORM log_report_view(p_report_type, v_filters);
  RETURN jsonb_build_object(
    'report_type', p_report_type, 'filters', v_filters,
    'summary', COALESCE(v_summary, '{}'::jsonb),
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'generated_at', now()
  );
END$$;
