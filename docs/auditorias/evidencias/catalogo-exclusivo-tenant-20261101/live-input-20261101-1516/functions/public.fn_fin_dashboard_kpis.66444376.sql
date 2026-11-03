CREATE OR REPLACE FUNCTION public.fn_fin_dashboard_kpis(_from date, _to date)
 RETURNS jsonb
 LANGUAGE plpgsql
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
END $function$
