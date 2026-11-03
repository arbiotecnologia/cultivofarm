CREATE OR REPLACE FUNCTION public.get_financial_alerts(p_reference_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(alert_type text, severity text, title text, description text, amount numeric, count integer, action_key text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  -- 1 entregas sem faturamento
  RETURN QUERY
  SELECT 'DELIVERIES_PENDING_BILLING'::text, 'CRITICAL'::text,
         'Entregas confirmadas sem faturamento'::text,
         'Existem entregas concluídas que ainda não geraram conta a receber.'::text,
         COALESCE(SUM(e.quantidade_entregue * COALESCE(p.valor_litro_brl,0)),0)::numeric,
         COUNT(*)::int, 'entregas-nao-faturadas'::text
    FROM entregas e LEFT JOIN produtos p ON p.id = e.produto_id
   WHERE e.financial_status = 'PENDING_BILLING' AND e.receivable_id IS NULL
  HAVING COUNT(*) > 0;

  -- 2 recebimentos vencidos
  RETURN QUERY
  SELECT 'OVERDUE_RECEIVABLES'::text, 'CRITICAL'::text,
         'Recebimentos vencidos'::text,
         'Parcelas a receber em atraso.'::text,
         COALESCE(SUM(ari.original_amount - COALESCE(ari.received_amount,0) - COALESCE(ari.discount_amount,0)),0)::numeric,
         COUNT(*)::int, 'receber-vencidos'::text
    FROM accounts_receivable_installments ari
   WHERE ari.due_date < p_reference_date AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
  HAVING COUNT(*) > 0;

  -- 3 pagamentos vencidos
  RETURN QUERY
  SELECT 'OVERDUE_PAYABLES'::text, 'CRITICAL'::text,
         'Pagamentos vencidos'::text,
         'Parcelas a pagar em atraso.'::text,
         COALESCE(SUM(api.original_amount - COALESCE(api.paid_amount,0) - COALESCE(api.discount_amount,0)),0)::numeric,
         COUNT(*)::int, 'pagar-vencidos'::text
    FROM accounts_payable_installments api
   WHERE api.due_date < p_reference_date AND api.status IN ('OPEN','PARTIAL','OVERDUE')
  HAVING COUNT(*) > 0;

  -- 4 NF-e pendente
  RETURN QUERY
  SELECT 'PENDING_FISCAL_INVOICE'::text, 'HIGH'::text,
         'NF-e pendente'::text,
         'Contas a receber aguardando emissão de NF-e.'::text,
         COALESCE(SUM(total_amount),0)::numeric, COUNT(*)::int, 'nfe-pendente'::text
    FROM accounts_receivable
   WHERE fiscal_invoice_required = true AND fiscal_invoice_status = 'PENDING'
  HAVING COUNT(*) > 0;

  -- 5 categorias sem DRE
  RETURN QUERY
  SELECT 'UNCLASSIFIED_DRE'::text, 'MEDIUM'::text,
         'Categorias sem classificação DRE'::text,
         'Algumas categorias usadas em títulos não têm grupo DRE definido.'::text,
         0::numeric, COUNT(*)::int, 'categorias-dre'::text
    FROM financial_categories fc
   WHERE fc.dre_group IS NULL
     AND (EXISTS (SELECT 1 FROM accounts_receivable ar WHERE ar.category_id = fc.id)
       OR EXISTS (SELECT 1 FROM accounts_payable ap WHERE ap.category_id = fc.id))
  HAVING COUNT(*) > 0;

  -- 6 recorrências com falha
  RETURN QUERY
  SELECT 'RECURRING_FAILED'::text, 'HIGH'::text,
         'Recorrências com falha'::text,
         'Erros recentes na geração automática de títulos recorrentes.'::text,
         0::numeric, COUNT(*)::int, 'recorrencias'::text
    FROM recurring_generation_log WHERE status = 'FAILED' AND generated_at >= (p_reference_date - INTERVAL '30 days')
  HAVING COUNT(*) > 0;

  -- 7 recorrências atrasadas
  RETURN QUERY
  SELECT 'RECURRING_DUE'::text, 'HIGH'::text,
         'Recorrências atrasadas para geração'::text,
         'Modelos recorrentes ativos com geração pendente.'::text,
         0::numeric, COUNT(*)::int, 'recorrencias'::text
    FROM recurring_financial_templates
   WHERE active = true AND auto_generate = true
     AND next_generation_date IS NOT NULL AND next_generation_date < p_reference_date
  HAVING COUNT(*) > 0;

  -- 8 contas sem centro de custo
  RETURN QUERY
  SELECT 'MISSING_COST_CENTER'::text, 'MEDIUM'::text,
         'Contas sem centro de custo'::text,
         'Títulos financeiros sem centro de custo associado.'::text,
         0::numeric,
         ((SELECT COUNT(*) FROM accounts_receivable WHERE cost_center_id IS NULL AND status <> 'CANCELED')
        + (SELECT COUNT(*) FROM accounts_payable WHERE cost_center_id IS NULL AND status <> 'CANCELED'))::int,
         'centros-custo'::text
   WHERE EXISTS (SELECT 1 FROM accounts_receivable WHERE cost_center_id IS NULL AND status <> 'CANCELED')
      OR EXISTS (SELECT 1 FROM accounts_payable WHERE cost_center_id IS NULL AND status <> 'CANCELED');
END $function$
