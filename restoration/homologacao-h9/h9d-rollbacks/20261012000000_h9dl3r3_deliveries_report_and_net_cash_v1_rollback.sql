-- H9-D-L3 R3 ROLLBACK 20261012000000 — restaura definições anteriores (ledger 667)
BEGIN;
CREATE OR REPLACE FUNCTION public.get_report_deliveries_billing_status(_from date, _to date)
 RETURNS TABLE(delivery_id uuid, customer_name text, delivery_date date, total_value numeric, billed boolean, receivable_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT e.id, COALESCE(c.nome, c.razao_social, '—'), e.data_entrega::date, COALESCE(e.valor_total,0),
         (e.receivable_id IS NOT NULL), e.receivable_id
  FROM entregas e
  JOIN clientes c ON c.id = e.cliente_id
  WHERE e.data_entrega::date BETWEEN _from AND _to
  ORDER BY e.data_entrega DESC;
END;$function$

;
CREATE OR REPLACE FUNCTION public.get_report_monthly_financial(_from date, _to date, _cost_center uuid DEFAULT NULL::uuid, _regime text DEFAULT 'CASH'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT COALESCE(SUM(i.original_amount),0) AS total
    FROM accounts_receivable_installments i
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE i.due_date BETWEEN _from AND _to AND ar.status <> 'CANCELED'
      AND (_cost_center IS NULL OR ar.cost_center_id = _cost_center)
  ),
  prev_pag AS (
    SELECT COALESCE(SUM(i.original_amount),0) AS total
    FROM accounts_payable_installments i
    JOIN accounts_payable ap ON ap.id = i.payable_id
    WHERE i.due_date BETWEEN _from AND _to AND ap.status <> 'CANCELED'
      AND (_cost_center IS NULL OR ap.cost_center_id = _cost_center)
  ),
  overdue_rec AS (
    SELECT COALESCE(SUM(i.original_amount - COALESCE(i.received_amount,0) - COALESCE(i.discount_amount,0)),0) AS total,
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
END$function$

;
CREATE OR REPLACE FUNCTION public.get_report_customer_statement(_customer_id uuid, _from date, _to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF NOT is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  IF _from IS NULL OR _to IS NULL THEN
    RAISE EXCEPTION 'Período inválido' USING ERRCODE = '22023';
  END IF;
  IF _to < _from THEN
    RAISE EXCEPTION 'Período inválido' USING ERRCODE = '22023';
  END IF;

  WITH entregas_periodo AS (
    SELECT e.id, e.receivable_id
    FROM entregas e
    WHERE e.cliente_id = _customer_id
      AND e.status = 'entregue'::status_entrega
      AND COALESCE(e.entregue_em::date, e.data_saida) BETWEEN _from AND _to
  ),
  delivered_links AS (
    SELECT DISTINCT ep.receivable_id
    FROM entregas_periodo ep
    WHERE ep.receivable_id IS NOT NULL
  ),
  delivered AS (
    SELECT COALESCE(SUM(ar.total_amount),0) AS total
    FROM delivered_links dl
    JOIN accounts_receivable ar ON ar.id = dl.receivable_id
    WHERE ar.status <> 'CANCELED'
  ),
  delivered_meta AS (
    SELECT COUNT(*) AS total_deliveries,
           COUNT(*) FILTER (WHERE ep.receivable_id IS NULL) AS unlinked
    FROM entregas_periodo ep
  ),
  billed AS (
    SELECT COALESCE(SUM(ar.total_amount),0) AS total
    FROM accounts_receivable ar
    WHERE ar.customer_id = _customer_id
      AND ar.issue_date BETWEEN _from AND _to
      AND ar.status <> 'CANCELED'
  ),
  pagamentos AS (
    SELECT COALESCE(SUM(rp.amount_received) FILTER (WHERE rp.is_reversal = false),0) AS bruto,
           COALESCE(SUM(rp.amount_received),0) AS liquido
    FROM receivable_payments rp
    JOIN accounts_receivable_installments i ON i.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE ar.customer_id = _customer_id
      AND rp.payment_date BETWEEN _from AND _to
  ),
  open_bal AS (
    SELECT COALESCE(SUM(i.original_amount - COALESCE(i.received_amount,0) - COALESCE(i.discount_amount,0)),0) AS total
    FROM accounts_receivable_installments i
    JOIN accounts_receivable ar ON ar.id = i.receivable_id
    WHERE ar.customer_id = _customer_id
      AND i.status IN ('OPEN','PARTIAL','OVERDUE')
      AND ar.status <> 'CANCELED'
  )
  SELECT jsonb_build_object(
    'customer_id', _customer_id,
    'period', jsonb_build_object('from', _from, 'to', _to),
    'delivered', (SELECT total FROM delivered),
    'delivered_basis', 'accounts_receivable_linked_to_confirmed_deliveries',
    'delivered_deliveries_count', (SELECT total_deliveries FROM delivered_meta),
    'delivered_unlinked_count', (SELECT unlinked FROM delivered_meta),
    'billed', (SELECT total FROM billed),
    'received', (SELECT bruto FROM pagamentos),
    'received_net_of_reversals', (SELECT liquido FROM pagamentos),
    'open_balance', (SELECT total FROM open_bal)
  ) INTO r;
  RETURN r;
END;$function$

;
REVOKE ALL ON FUNCTION public.get_report_deliveries_billing_status(date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_deliveries_billing_status(date,date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_report_monthly_financial(date,date,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_monthly_financial(date,date,uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_report_customer_statement(uuid,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_customer_statement(uuid,date,date) TO authenticated, service_role;
COMMIT;
