
CREATE OR REPLACE FUNCTION public.get_report_receivables(_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(
  installment_id uuid, receivable_id uuid, customer_name text, description text,
  category text, due_date date, amount numeric, paid numeric, balance numeric, status text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _from date := (_filters->>'from')::date;
        _to date := (_filters->>'to')::date;
        _status text := _filters->>'status';
        _customer uuid := NULLIF(_filters->>'customer_id','')::uuid;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT i.id, ar.id, COALESCE(c.nome, c.razao_social, '—'), ar.description, fc.name,
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

CREATE OR REPLACE FUNCTION public.get_report_delinquency(_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE(
  installment_id uuid, customer_name text, description text, due_date date,
  amount numeric, balance numeric, days_overdue int
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT i.id, COALESCE(c.nome, c.razao_social, '—'), ar.description, i.due_date, i.amount,
    i.amount - COALESCE((SELECT SUM(rp.amount_received) FROM receivable_payments rp WHERE rp.installment_id = i.id AND rp.is_reversal=false),0),
    (_as_of - i.due_date)::int
  FROM accounts_receivable_installments i
  JOIN accounts_receivable ar ON ar.id = i.receivable_id
  JOIN clientes c ON c.id = ar.customer_id
  WHERE i.due_date < _as_of AND i.status IN ('OPEN','PARTIAL','OVERDUE')
    AND ar.status <> 'CANCELED'
  ORDER BY i.due_date;
END;$$;

CREATE OR REPLACE FUNCTION public.get_report_nfe_pending(_filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(
  receivable_id uuid, customer_name text, description text, total_amount numeric,
  issue_date date, fiscal_invoice_status text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT ar.id, COALESCE(c.nome, c.razao_social, '—'), ar.description, ar.total_amount,
         ar.issue_date, ar.fiscal_invoice_status
  FROM accounts_receivable ar
  JOIN clientes c ON c.id = ar.customer_id
  WHERE ar.fiscal_invoice_required = true
    AND ar.fiscal_invoice_status = 'PENDING'
    AND ar.status <> 'CANCELED'
  ORDER BY ar.issue_date;
END;$$;

CREATE OR REPLACE FUNCTION public.get_report_deliveries_billing_status(_from date, _to date)
RETURNS TABLE(
  delivery_id uuid, customer_name text, delivery_date date, total_value numeric,
  billed boolean, receivable_id uuid
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT e.id, COALESCE(c.nome, c.razao_social, '—'), e.data_entrega::date, COALESCE(e.valor_total,0),
         (e.receivable_id IS NOT NULL), e.receivable_id
  FROM entregas e
  JOIN clientes c ON c.id = e.cliente_id
  WHERE e.data_entrega::date BETWEEN _from AND _to
  ORDER BY e.data_entrega DESC;
END;$$;
