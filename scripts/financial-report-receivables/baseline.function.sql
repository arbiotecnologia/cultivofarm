CREATE OR REPLACE FUNCTION public.get_report_receivables(_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(installment_id uuid, receivable_id uuid, customer_name text, description text, category text, due_date date, amount numeric, paid numeric, balance numeric, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _from date := (_filters->>'from')::date;
        _to date := (_filters->>'to')::date;
        _status text := _filters->>'status';
        _customer uuid := NULLIF(_filters->>'customer_id','')::uuid;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT i.id, ar.id, COALESCE(c.nome, c.razao_social, '—'), ar.description, fc.name,
         i.due_date, i.original_amount,
         COALESCE(i.received_amount,0),
         i.original_amount - COALESCE(i.received_amount,0) - COALESCE(i.discount_amount,0),
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
END;$function$
