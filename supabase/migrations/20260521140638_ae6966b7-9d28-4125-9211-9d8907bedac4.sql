
-- =====================================================================
-- FASE 5 — RPCs Gerenciais Financeiras + Auditoria DRE
-- =====================================================================

-- 1) get_financial_dashboard_summary --------------------------------------
CREATE OR REPLACE FUNCTION public.get_financial_dashboard_summary(
  p_start_date date,
  p_end_date date,
  p_cost_center_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- A receber (previsto: pelo vencimento no período)
  SELECT COALESCE(SUM(ari.original_amount),0),
         COALESCE(SUM(ari.original_amount - COALESCE(ari.received_amount,0) - COALESCE(ari.discount_amount,0))
           FILTER (WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE')),0),
         COALESCE(SUM(ari.original_amount - COALESCE(ari.received_amount,0) - COALESCE(ari.discount_amount,0))
           FILTER (WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < CURRENT_DATE),0),
         COALESCE(SUM(ari.original_amount - COALESCE(ari.received_amount,0) - COALESCE(ari.discount_amount,0))
           FILTER (WHERE ari.status = 'PARTIAL'),0),
         COUNT(*) FILTER (WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < CURRENT_DATE)::int,
         COALESCE(AVG(CURRENT_DATE - ari.due_date)
           FILTER (WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < CURRENT_DATE),0)::int
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
           FILTER (WHERE api.status IN ('OPEN','PARTIAL','OVERDUE') AND api.due_date < CURRENT_DATE),0),
         COALESCE(SUM(api.original_amount - COALESCE(api.paid_amount,0) - COALESCE(api.discount_amount,0))
           FILTER (WHERE api.status = 'PARTIAL'),0),
         COUNT(*) FILTER (WHERE api.status IN ('OPEN','PARTIAL','OVERDUE') AND api.due_date < CURRENT_DATE)::int
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
  SELECT COUNT(*)::int, COALESCE(SUM(e.quantidade_entregue * COALESCE(p.preco_venda,0)),0)
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
    FROM recurring_generation_log
   WHERE status = 'FAILED' AND created_at >= (CURRENT_DATE - INTERVAL '30 days');

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
END $$;

-- 2) get_financial_cashflow ----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_financial_cashflow(
  p_start_date date,
  p_end_date date,
  p_view_mode text DEFAULT 'PROJECTED',
  p_group_by text DEFAULT 'DAY'
) RETURNS TABLE(
  period_label text, period_start date,
  expected_inflows numeric, expected_outflows numeric,
  realized_inflows numeric, realized_outflows numeric,
  projected_balance numeric, realized_balance numeric,
  accumulated_projected_balance numeric, accumulated_realized_balance numeric
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trunc text; v_fmt text;
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  v_trunc := CASE upper(p_group_by) WHEN 'WEEK' THEN 'week' WHEN 'MONTH' THEN 'month' ELSE 'day' END;
  v_fmt := CASE upper(p_group_by) WHEN 'MONTH' THEN 'MM/YYYY' WHEN 'WEEK' THEN '"Sem" IW/YYYY' ELSE 'DD/MM' END;

  RETURN QUERY
  WITH proj_in AS (
    SELECT date_trunc(v_trunc, ari.due_date)::date b,
           SUM(ari.original_amount - COALESCE(ari.received_amount,0) - COALESCE(ari.discount_amount,0)) v
      FROM accounts_receivable_installments ari
     WHERE ari.due_date BETWEEN p_start_date AND p_end_date AND ari.status <> 'CANCELED'
     GROUP BY 1
  ), proj_out AS (
    SELECT date_trunc(v_trunc, api.due_date)::date b,
           SUM(api.original_amount - COALESCE(api.paid_amount,0) - COALESCE(api.discount_amount,0)) v
      FROM accounts_payable_installments api
     WHERE api.due_date BETWEEN p_start_date AND p_end_date AND api.status <> 'CANCELED'
     GROUP BY 1
  ), real_in AS (
    SELECT date_trunc(v_trunc, rp.payment_date)::date b, SUM(rp.amount_received) v
      FROM receivable_payments rp WHERE rp.payment_date BETWEEN p_start_date AND p_end_date GROUP BY 1
  ), real_out AS (
    SELECT date_trunc(v_trunc, pp.payment_date)::date b, SUM(pp.amount_paid) v
      FROM payable_payments pp WHERE pp.payment_date BETWEEN p_start_date AND p_end_date GROUP BY 1
  ), buckets AS (
    SELECT b FROM proj_in UNION SELECT b FROM proj_out
    UNION SELECT b FROM real_in UNION SELECT b FROM real_out
  ), combined AS (
    SELECT b.b AS bk,
           COALESCE(pi.v,0)::numeric ei, COALESCE(po.v,0)::numeric eo,
           COALESCE(ri.v,0)::numeric ri_v, COALESCE(ro.v,0)::numeric ro_v
      FROM buckets b
      LEFT JOIN proj_in pi ON pi.b = b.b
      LEFT JOIN proj_out po ON po.b = b.b
      LEFT JOIN real_in ri ON ri.b = b.b
      LEFT JOIN real_out ro ON ro.b = b.b
  )
  SELECT to_char(bk, v_fmt) AS period_label,
         bk AS period_start,
         CASE WHEN upper(p_view_mode)='REALIZED' THEN 0 ELSE ei END,
         CASE WHEN upper(p_view_mode)='REALIZED' THEN 0 ELSE eo END,
         CASE WHEN upper(p_view_mode)='PROJECTED' THEN 0 ELSE ri_v END,
         CASE WHEN upper(p_view_mode)='PROJECTED' THEN 0 ELSE ro_v END,
         (ei - eo)::numeric,
         (ri_v - ro_v)::numeric,
         SUM(ei - eo) OVER (ORDER BY bk)::numeric,
         SUM(ri_v - ro_v) OVER (ORDER BY bk)::numeric
    FROM combined
   ORDER BY bk;
END $$;

-- 3) get_financial_dre_summary -------------------------------------------
CREATE OR REPLACE FUNCTION public.get_financial_dre_summary(
  p_start_date date,
  p_end_date date,
  p_regime text DEFAULT 'CASH',
  p_cost_center_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; g RECORD;
  v_groups jsonb := '{}'::jsonb;
  v_unclassified jsonb := '[]'::jsonb;
  v_receita numeric := 0; v_deducoes numeric := 0;
  v_resultado numeric := 0; v_margem numeric := 0;
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  IF upper(p_regime) = 'ACCRUAL' THEN
    FOR g IN
      SELECT COALESCE(fc.dre_group,'SEM_CLASSIFICACAO') AS grp, SUM(ari.original_amount) AS total, COUNT(*) AS qtd
        FROM accounts_receivable_installments ari
        JOIN accounts_receivable ar ON ar.id = ari.receivable_id
        LEFT JOIN financial_categories fc ON fc.id = ar.category_id
       WHERE ari.due_date BETWEEN p_start_date AND p_end_date AND ari.status <> 'CANCELED'
         AND (p_cost_center_id IS NULL OR ar.cost_center_id = p_cost_center_id)
       GROUP BY 1
    LOOP v_groups := v_groups || jsonb_build_object(lower(g.grp), jsonb_build_object('total', g.total, 'qtd', g.qtd)); END LOOP;
    FOR g IN
      SELECT COALESCE(fc.dre_group,'SEM_CLASSIFICACAO') AS grp, SUM(api.original_amount) AS total, COUNT(*) AS qtd
        FROM accounts_payable_installments api
        JOIN accounts_payable ap ON ap.id = api.payable_id
        LEFT JOIN financial_categories fc ON fc.id = ap.category_id
       WHERE api.due_date BETWEEN p_start_date AND p_end_date AND api.status <> 'CANCELED'
         AND (p_cost_center_id IS NULL OR ap.cost_center_id = p_cost_center_id)
       GROUP BY 1
    LOOP
      v_groups := v_groups || jsonb_build_object(lower(g.grp),
        COALESCE(v_groups->lower(g.grp),'{}'::jsonb) || jsonb_build_object('total',
          COALESCE((v_groups->lower(g.grp)->>'total')::numeric,0) + g.total, 'qtd',
          COALESCE((v_groups->lower(g.grp)->>'qtd')::int,0) + g.qtd::int));
    END LOOP;
  ELSE
    FOR g IN
      SELECT COALESCE(fc.dre_group,'SEM_CLASSIFICACAO') AS grp, SUM(rp.amount_received) AS total, COUNT(*) AS qtd
        FROM receivable_payments rp
        JOIN accounts_receivable_installments ari ON ari.id = rp.installment_id
        JOIN accounts_receivable ar ON ar.id = ari.receivable_id
        LEFT JOIN financial_categories fc ON fc.id = ar.category_id
       WHERE rp.payment_date BETWEEN p_start_date AND p_end_date
         AND (p_cost_center_id IS NULL OR ar.cost_center_id = p_cost_center_id)
       GROUP BY 1
    LOOP v_groups := v_groups || jsonb_build_object(lower(g.grp), jsonb_build_object('total', g.total, 'qtd', g.qtd)); END LOOP;
    FOR g IN
      SELECT COALESCE(fc.dre_group,'SEM_CLASSIFICACAO') AS grp, SUM(pp.amount_paid) AS total, COUNT(*) AS qtd
        FROM payable_payments pp
        JOIN accounts_payable_installments api ON api.id = pp.installment_id
        JOIN accounts_payable ap ON ap.id = api.payable_id
        LEFT JOIN financial_categories fc ON fc.id = ap.category_id
       WHERE pp.payment_date BETWEEN p_start_date AND p_end_date
         AND (p_cost_center_id IS NULL OR ap.cost_center_id = p_cost_center_id)
       GROUP BY 1
    LOOP
      v_groups := v_groups || jsonb_build_object(lower(g.grp),
        COALESCE(v_groups->lower(g.grp),'{}'::jsonb) || jsonb_build_object('total',
          COALESCE((v_groups->lower(g.grp)->>'total')::numeric,0) + g.total, 'qtd',
          COALESCE((v_groups->lower(g.grp)->>'qtd')::int,0) + g.qtd::int));
    END LOOP;
  END IF;

  v_receita := COALESCE((v_groups->'receita_bruta'->>'total')::numeric,0) + COALESCE((v_groups->'outras_receitas'->>'total')::numeric,0);
  v_deducoes := COALESCE((v_groups->'deducoes'->>'total')::numeric,0)
              + COALESCE((v_groups->'custo_producao'->>'total')::numeric,0)
              + COALESCE((v_groups->'despesa_variavel'->>'total')::numeric,0)
              + COALESCE((v_groups->'despesa_fixa'->>'total')::numeric,0)
              + COALESCE((v_groups->'despesa_administrativa'->>'total')::numeric,0)
              + COALESCE((v_groups->'despesa_comercial'->>'total')::numeric,0)
              + COALESCE((v_groups->'despesa_financeira'->>'total')::numeric,0)
              + COALESCE((v_groups->'impostos'->>'total')::numeric,0)
              + COALESCE((v_groups->'outras_despesas'->>'total')::numeric,0);
  v_resultado := v_receita - v_deducoes;
  v_margem := CASE WHEN v_receita > 0 THEN ROUND((v_resultado / v_receita * 100)::numeric, 2) ELSE 0 END;

  -- Categorias sem classificação que tiveram movimento
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', fc.id, 'name', fc.name)),'[]'::jsonb)
    INTO v_unclassified
    FROM financial_categories fc
   WHERE fc.dre_group IS NULL
     AND (EXISTS (SELECT 1 FROM accounts_receivable ar WHERE ar.category_id = fc.id)
       OR EXISTS (SELECT 1 FROM accounts_payable ap WHERE ap.category_id = fc.id));

  r := v_groups || jsonb_build_object(
    'resultado_operacional', v_resultado,
    'margem_operacional_percentual', v_margem,
    'unclassified_categories', v_unclassified
  );
  RETURN r;
END $$;

-- 4) get_financial_alerts -----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_financial_alerts(
  p_reference_date date DEFAULT CURRENT_DATE
) RETURNS TABLE(alert_type text, severity text, title text, description text, amount numeric, count integer, action_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  -- 1 entregas sem faturamento
  RETURN QUERY
  SELECT 'DELIVERIES_PENDING_BILLING'::text, 'CRITICAL'::text,
         'Entregas confirmadas sem faturamento'::text,
         'Existem entregas concluídas que ainda não geraram conta a receber.'::text,
         COALESCE(SUM(e.quantidade_entregue * COALESCE(p.preco_venda,0)),0)::numeric,
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
    FROM recurring_generation_log
   WHERE status = 'FAILED' AND created_at >= (p_reference_date - INTERVAL '30 days')
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
END $$;

-- 5) get_top_financial_rankings ------------------------------------------
CREATE OR REPLACE FUNCTION public.get_top_financial_rankings(
  p_start_date date,
  p_end_date date,
  p_limit integer DEFAULT 10
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; v_top_clientes jsonb; v_top_rec_cat jsonb; v_top_desp_cat jsonb; v_top_inad jsonb;
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

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
           MAX(CURRENT_DATE - ari.due_date)::int AS max_days_overdue
      FROM accounts_receivable_installments ari
      JOIN accounts_receivable ar ON ar.id = ari.receivable_id
      JOIN clientes c ON c.id = ar.customer_id
     WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < CURRENT_DATE
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
END $$;

-- 6) Trigger auditoria DRE em financial_categories -----------------------
CREATE OR REPLACE FUNCTION public.fn_audit_category_dre()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.dre_group,'') IS DISTINCT FROM COALESCE(NEW.dre_group,'') THEN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, old_data, new_data, performed_by)
    VALUES ('FINANCIAL_CATEGORY', NEW.id, 'FINANCIAL_CATEGORY_DRE_UPDATED',
            jsonb_build_object('dre_group', OLD.dre_group),
            jsonb_build_object('dre_group', NEW.dre_group),
            auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_category_dre ON public.financial_categories;
CREATE TRIGGER trg_audit_category_dre
  AFTER UPDATE ON public.financial_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_category_dre();
