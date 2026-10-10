-- P1 legacy finance RPCs must honor caller RLS; align active report dates to Sao Paulo.
CREATE OR REPLACE FUNCTION public.fn_fin_aging(_type text DEFAULT 'RECEIVABLE'::text)
 RETURNS TABLE(bucket text, total numeric, qtd integer)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _type = 'PAYABLE' THEN
    RETURN QUERY
    SELECT CASE WHEN (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date - due_date <= 0 THEN 'A vencer'
                WHEN (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date - due_date <= 30 THEN '1-30'
                WHEN (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date - due_date <= 60 THEN '31-60'
                WHEN (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date - due_date <= 90 THEN '61-90'
                ELSE '90+' END,
           SUM(original_amount - COALESCE(paid_amount,0) - COALESCE(discount_amount,0))::numeric,
           COUNT(*)::int
    FROM accounts_payable_installments
    WHERE status IN ('OPEN','PARTIAL','OVERDUE')
    GROUP BY 1 ORDER BY 1;
  ELSE
    RETURN QUERY
    SELECT CASE WHEN (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date - due_date <= 0 THEN 'A vencer'
                WHEN (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date - due_date <= 30 THEN '1-30'
                WHEN (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date - due_date <= 60 THEN '31-60'
                WHEN (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date - due_date <= 90 THEN '61-90'
                ELSE '90+' END,
           SUM(original_amount - COALESCE(received_amount,0) - COALESCE(discount_amount,0))::numeric,
           COUNT(*)::int
    FROM accounts_receivable_installments
    WHERE status IN ('OPEN','PARTIAL','OVERDUE')
    GROUP BY 1 ORDER BY 1;
  END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_fin_dashboard_kpis(_from date, _to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  SELECT jsonb_build_object(
    'receitas_previstas', COALESCE((SELECT SUM(original_amount - COALESCE(received_amount,0) - COALESCE(discount_amount,0))
        FROM accounts_receivable_installments WHERE status IN ('OPEN','PARTIAL','OVERDUE') AND due_date BETWEEN _from AND _to),0),
    'receitas_realizadas', COALESCE((SELECT SUM(amount_received) FROM receivable_payments WHERE payment_date BETWEEN _from AND _to),0),
    'despesas_previstas', COALESCE((SELECT SUM(original_amount - COALESCE(paid_amount,0) - COALESCE(discount_amount,0))
        FROM accounts_payable_installments WHERE status IN ('OPEN','PARTIAL','OVERDUE') AND due_date BETWEEN _from AND _to),0),
    'despesas_realizadas', COALESCE((SELECT SUM(amount_paid) FROM payable_payments WHERE payment_date BETWEEN _from AND _to),0),
    'inadimplencia_total', COALESCE((SELECT SUM(original_amount - COALESCE(received_amount,0) - COALESCE(discount_amount,0))
        FROM accounts_receivable_installments WHERE status IN ('OPEN','PARTIAL','OVERDUE') AND due_date < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date),0),
    'pagar_vencidas', COALESCE((SELECT SUM(original_amount - COALESCE(paid_amount,0) - COALESCE(discount_amount,0))
        FROM accounts_payable_installments WHERE status IN ('OPEN','PARTIAL','OVERDUE') AND due_date < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date),0),
    'entregas_nao_faturadas_qtd', COALESCE((SELECT COUNT(*) FROM entregas WHERE financial_status='PENDING_BILLING' AND receivable_id IS NULL),0),
    'entregas_nao_faturadas_valor', COALESCE((SELECT SUM(e.quantidade_entregue * p.valor_litro_brl) FROM entregas e
        LEFT JOIN produtos p ON p.id = e.produto_id WHERE e.financial_status='PENDING_BILLING' AND e.receivable_id IS NULL),0),
    'nfe_pendente_qtd', COALESCE((SELECT COUNT(*) FROM accounts_receivable WHERE fiscal_invoice_required=true AND fiscal_invoice_status='PENDING'),0),
    'nfe_pendente_valor', COALESCE((SELECT SUM(total_amount) FROM accounts_receivable WHERE fiscal_invoice_required=true AND fiscal_invoice_status='PENDING'),0)
  ) INTO r;
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_fin_inadimplencia()
 RETURNS TABLE(installment_id uuid, receivable_id uuid, customer_id uuid, customer_name text, due_date date, amount numeric, dias_atraso integer)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT ari.id, ar.id, ar.customer_id, c.nome, ari.due_date,
         (ari.original_amount - COALESCE(ari.received_amount,0) - COALESCE(ari.discount_amount,0))::numeric,
         ((pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date - ari.due_date)::int
  FROM accounts_receivable_installments ari
  JOIN accounts_receivable ar ON ar.id = ari.receivable_id
  JOIN clientes c ON c.id = ar.customer_id
  WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date
  ORDER BY ari.due_date ASC;
END $function$;

CREATE OR REPLACE FUNCTION public.get_financial_dashboard_summary(p_start_date date, p_end_date date, p_cost_center_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb;
  v_rec_expected numeric := 0; v_rec_received numeric := 0;
  v_rec_open numeric := 0; v_rec_overdue numeric := 0; v_rec_partial numeric := 0;
  v_rec_overdue_count int := 0; v_rec_avg_days int := 0;
  v_pay_expected numeric := 0; v_pay_paid numeric := 0;
  v_pay_open numeric := 0; v_pay_overdue numeric := 0; v_pay_partial numeric := 0;
  v_pay_overdue_count int := 0;
  v_nfe_count int := 0; v_nfe_amount numeric := 0;
  v_deliv_count int := 0; v_deliv_amount numeric := 0;
  v_rec_recurring numeric := 0; v_pay_recurring numeric := 0;
  v_rec_errors int := 0;
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Periodo invalido: informe datas inicial e final em ordem.' USING ERRCODE = '22023';
  END IF;

  -- A receber (previsto: pelo vencimento no período)
  SELECT COALESCE(SUM(ari.original_amount),0),
         COALESCE(SUM(ari.original_amount - COALESCE(ari.received_amount,0) - COALESCE(ari.discount_amount,0))
           FILTER (WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE')),0),
         COALESCE(SUM(ari.original_amount - COALESCE(ari.received_amount,0) - COALESCE(ari.discount_amount,0))
           FILTER (WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date),0),
         COALESCE(SUM(ari.original_amount - COALESCE(ari.received_amount,0) - COALESCE(ari.discount_amount,0))
           FILTER (WHERE ari.status = 'PARTIAL'),0),
         COUNT(*) FILTER (WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date)::int,
         COALESCE(AVG((pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date - ari.due_date)
           FILTER (WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date),0)::int
    INTO v_rec_expected, v_rec_open, v_rec_overdue, v_rec_partial, v_rec_overdue_count, v_rec_avg_days
    FROM accounts_receivable_installments ari
    JOIN accounts_receivable ar ON ar.id = ari.receivable_id
   WHERE ari.due_date BETWEEN p_start_date AND p_end_date
     AND ari.status <> 'CANCELED'
     AND (p_customer_id IS NULL OR ar.customer_id = p_customer_id)
     AND (p_category_id IS NULL OR ar.category_id = p_category_id)
     AND (p_cost_center_id IS NULL OR ar.cost_center_id = p_cost_center_id);

  -- A receber (realizado: por payment_date)
  SELECT COALESCE(SUM(rp.amount_received),0)
    INTO v_rec_received
    FROM receivable_payments rp
    JOIN accounts_receivable_installments ari ON ari.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = ari.receivable_id
   WHERE rp.payment_date BETWEEN p_start_date AND p_end_date
     AND (p_customer_id IS NULL OR ar.customer_id = p_customer_id)
     AND (p_category_id IS NULL OR ar.category_id = p_category_id)
     AND (p_cost_center_id IS NULL OR ar.cost_center_id = p_cost_center_id);

  -- A pagar (previsto)
  SELECT COALESCE(SUM(api.original_amount),0),
         COALESCE(SUM(api.original_amount - COALESCE(api.paid_amount,0) - COALESCE(api.discount_amount,0))
           FILTER (WHERE api.status IN ('OPEN','PARTIAL','OVERDUE')),0),
         COALESCE(SUM(api.original_amount - COALESCE(api.paid_amount,0) - COALESCE(api.discount_amount,0))
           FILTER (WHERE api.status IN ('OPEN','PARTIAL','OVERDUE') AND api.due_date < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date),0),
         COALESCE(SUM(api.original_amount - COALESCE(api.paid_amount,0) - COALESCE(api.discount_amount,0))
           FILTER (WHERE api.status = 'PARTIAL'),0),
         COUNT(*) FILTER (WHERE api.status IN ('OPEN','PARTIAL','OVERDUE') AND api.due_date < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date)::int
    INTO v_pay_expected, v_pay_open, v_pay_overdue, v_pay_partial, v_pay_overdue_count
    FROM accounts_payable_installments api
    JOIN accounts_payable ap ON ap.id = api.payable_id
   WHERE api.due_date BETWEEN p_start_date AND p_end_date
     AND api.status <> 'CANCELED'
     AND (p_category_id IS NULL OR ap.category_id = p_category_id)
     AND (p_cost_center_id IS NULL OR ap.cost_center_id = p_cost_center_id);

  -- A pagar (realizado)
  SELECT COALESCE(SUM(pp.amount_paid),0)
    INTO v_pay_paid
    FROM payable_payments pp
    JOIN accounts_payable_installments api ON api.id = pp.installment_id
    JOIN accounts_payable ap ON ap.id = api.payable_id
   WHERE pp.payment_date BETWEEN p_start_date AND p_end_date
     AND (p_category_id IS NULL OR ap.category_id = p_category_id)
     AND (p_cost_center_id IS NULL OR ap.cost_center_id = p_cost_center_id);

  -- NF-e pendente
  SELECT COUNT(*)::int, COALESCE(SUM(total_amount),0)
    INTO v_nfe_count, v_nfe_amount
    FROM accounts_receivable
   WHERE fiscal_invoice_required = true
     AND fiscal_invoice_status = 'PENDING';

  -- Entregas pendentes faturamento
  SELECT COUNT(*)::int, COALESCE(SUM(e.quantidade_entregue * COALESCE(p.valor_litro_brl,0)),0)
    INTO v_deliv_count, v_deliv_amount
    FROM entregas e LEFT JOIN produtos p ON p.id = e.produto_id
   WHERE e.financial_status = 'PENDING_BILLING' AND e.receivable_id IS NULL;

  -- Recorrências ativas
  SELECT COALESCE(SUM(amount) FILTER (WHERE type='RECEIVABLE'),0),
         COALESCE(SUM(amount) FILTER (WHERE type='PAYABLE'),0)
    INTO v_rec_recurring, v_pay_recurring
    FROM recurring_financial_templates
   WHERE active = true;

  SELECT COUNT(*)::int INTO v_rec_errors
    FROM recurring_generation_log WHERE status = 'FAILED' AND generated_at >= ((pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '30 days');

  r := jsonb_build_object(
    'total_receivable_expected', v_rec_expected,
    'total_receivable_received', v_rec_received,
    'total_receivable_open', v_rec_open,
    'total_receivable_overdue', v_rec_overdue,
    'total_receivable_partial', v_rec_partial,
    'overdue_receivables_count', v_rec_overdue_count,
    'average_days_overdue', v_rec_avg_days,
    'total_payable_expected', v_pay_expected,
    'total_payable_paid', v_pay_paid,
    'total_payable_open', v_pay_open,
    'total_payable_overdue', v_pay_overdue,
    'total_payable_partial', v_pay_partial,
    'overdue_payables_count', v_pay_overdue_count,
    'projected_balance', v_rec_expected - v_pay_expected,
    'realized_balance', v_rec_received - v_pay_paid,
    'collection_rate', CASE WHEN v_rec_expected > 0 THEN ROUND((v_rec_received / v_rec_expected)::numeric, 4) ELSE 0 END,
    'payment_rate', CASE WHEN v_pay_expected > 0 THEN ROUND((v_pay_paid / v_pay_expected)::numeric, 4) ELSE 0 END,
    'pending_fiscal_invoice_count', v_nfe_count,
    'pending_fiscal_invoice_amount', v_nfe_amount,
    'pending_billing_deliveries_count', v_deliv_count,
    'pending_billing_deliveries_amount', v_deliv_amount,
    'active_recurring_receivables_amount', v_rec_recurring,
    'active_recurring_payables_amount', v_pay_recurring,
    'recurring_net_balance', v_rec_recurring - v_pay_recurring,
    'recurring_generation_errors_count', v_rec_errors
  );
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.get_top_financial_rankings(p_start_date date, p_end_date date, p_limit integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb; v_top_clientes jsonb; v_top_rec_cat jsonb; v_top_desp_cat jsonb; v_top_inad jsonb;
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Periodo invalido: informe datas inicial e final em ordem.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(t),'[]'::jsonb) INTO v_top_clientes FROM (
    SELECT ar.customer_id, c.nome AS customer_name,
           SUM(ari.original_amount)::numeric AS total_revenue,
           COALESCE(SUM(ari.received_amount),0)::numeric AS received_amount,
           COALESCE(SUM(ari.original_amount - COALESCE(ari.received_amount,0) - COALESCE(ari.discount_amount,0))
             FILTER (WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE')),0)::numeric AS open_amount
      FROM accounts_receivable_installments ari
      JOIN accounts_receivable ar ON ar.id = ari.receivable_id
      JOIN clientes c ON c.id = ar.customer_id
     WHERE ari.due_date BETWEEN p_start_date AND p_end_date AND ari.status <> 'CANCELED'
     GROUP BY ar.customer_id, c.nome
     ORDER BY total_revenue DESC LIMIT p_limit
  ) t;

  SELECT COALESCE(jsonb_agg(t),'[]'::jsonb) INTO v_top_rec_cat FROM (
    SELECT fc.id AS category_id, fc.name AS category_name, SUM(ari.original_amount)::numeric AS total_amount
      FROM accounts_receivable_installments ari
      JOIN accounts_receivable ar ON ar.id = ari.receivable_id
      JOIN financial_categories fc ON fc.id = ar.category_id
     WHERE ari.due_date BETWEEN p_start_date AND p_end_date AND ari.status <> 'CANCELED'
     GROUP BY fc.id, fc.name ORDER BY total_amount DESC LIMIT p_limit
  ) t;

  SELECT COALESCE(jsonb_agg(t),'[]'::jsonb) INTO v_top_desp_cat FROM (
    SELECT fc.id AS category_id, fc.name AS category_name, SUM(api.original_amount)::numeric AS total_amount
      FROM accounts_payable_installments api
      JOIN accounts_payable ap ON ap.id = api.payable_id
      JOIN financial_categories fc ON fc.id = ap.category_id
     WHERE api.due_date BETWEEN p_start_date AND p_end_date AND api.status <> 'CANCELED'
     GROUP BY fc.id, fc.name ORDER BY total_amount DESC LIMIT p_limit
  ) t;

  SELECT COALESCE(jsonb_agg(t),'[]'::jsonb) INTO v_top_inad FROM (
    SELECT ar.customer_id, c.nome AS customer_name,
           SUM(ari.original_amount - COALESCE(ari.received_amount,0) - COALESCE(ari.discount_amount,0))::numeric AS overdue_amount,
           COUNT(*)::int AS overdue_count,
           MAX((pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date - ari.due_date)::int AS max_days_overdue
      FROM accounts_receivable_installments ari
      JOIN accounts_receivable ar ON ar.id = ari.receivable_id
      JOIN clientes c ON c.id = ar.customer_id
     WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date
     GROUP BY ar.customer_id, c.nome
     ORDER BY overdue_amount DESC LIMIT p_limit
  ) t;

  r := jsonb_build_object(
    'top_customers_revenue', v_top_clientes,
    'top_revenue_categories', v_top_rec_cat,
    'top_expense_categories', v_top_desp_cat,
    'top_overdue_customers', v_top_inad
  );
  RETURN r;
END $function$;