
-- 1) dre_group em financial_categories
ALTER TABLE public.financial_categories
  ADD COLUMN IF NOT EXISTS dre_group TEXT;

ALTER TABLE public.financial_categories
  DROP CONSTRAINT IF EXISTS chk_dre_group;
ALTER TABLE public.financial_categories
  ADD CONSTRAINT chk_dre_group CHECK (dre_group IS NULL OR dre_group IN (
    'RECEITA_BRUTA','DEDUCOES','CUSTO_PRODUCAO','DESPESA_VARIAVEL',
    'DESPESA_FIXA','DESPESA_ADMINISTRATIVA','DESPESA_COMERCIAL',
    'DESPESA_FINANCEIRA','IMPOSTOS','OUTRAS_RECEITAS','OUTRAS_DESPESAS'
  ));

CREATE INDEX IF NOT EXISTS idx_financial_categories_dre_group ON public.financial_categories(dre_group);

-- 2) Índices de performance
CREATE INDEX IF NOT EXISTS idx_ar_status ON public.accounts_receivable(status);
CREATE INDEX IF NOT EXISTS idx_ar_customer ON public.accounts_receivable(customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_refmonth ON public.accounts_receivable(reference_month);
CREATE INDEX IF NOT EXISTS idx_ari_due ON public.accounts_receivable_installments(due_date);
CREATE INDEX IF NOT EXISTS idx_ari_status ON public.accounts_receivable_installments(status);
CREATE INDEX IF NOT EXISTS idx_rp_date ON public.receivable_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_ap_status ON public.accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_ap_refmonth ON public.accounts_payable(reference_month);
CREATE INDEX IF NOT EXISTS idx_api_due ON public.accounts_payable_installments(due_date);
CREATE INDEX IF NOT EXISTS idx_api_status ON public.accounts_payable_installments(status);
CREATE INDEX IF NOT EXISTS idx_pp_date ON public.payable_payments(payment_date);

-- 3) RPCs
CREATE OR REPLACE FUNCTION public.fn_fin_dashboard_kpis(_from date, _to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
        FROM accounts_receivable_installments WHERE status IN ('OPEN','PARTIAL','OVERDUE') AND due_date < CURRENT_DATE),0),
    'pagar_vencidas', COALESCE((SELECT SUM(original_amount - COALESCE(paid_amount,0) - COALESCE(discount_amount,0))
        FROM accounts_payable_installments WHERE status IN ('OPEN','PARTIAL','OVERDUE') AND due_date < CURRENT_DATE),0),
    'entregas_nao_faturadas_qtd', COALESCE((SELECT COUNT(*) FROM entregas WHERE financial_status='PENDING_BILLING' AND receivable_id IS NULL),0),
    'entregas_nao_faturadas_valor', COALESCE((SELECT SUM(e.quantidade_entregue * p.preco_venda) FROM entregas e
        LEFT JOIN produtos p ON p.id = e.produto_id WHERE e.financial_status='PENDING_BILLING' AND e.receivable_id IS NULL),0),
    'nfe_pendente_qtd', COALESCE((SELECT COUNT(*) FROM accounts_receivable WHERE fiscal_invoice_required=true AND fiscal_invoice_status='PENDING'),0),
    'nfe_pendente_valor', COALESCE((SELECT SUM(total_amount) FROM accounts_receivable WHERE fiscal_invoice_required=true AND fiscal_invoice_status='PENDING'),0)
  ) INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fin_cashflow(_from date, _to date, _granularity text DEFAULT 'day', _mode text DEFAULT 'projected')
RETURNS TABLE(bucket date, entradas numeric, saidas numeric, saldo numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trunc text;
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  v_trunc := CASE _granularity WHEN 'week' THEN 'week' WHEN 'month' THEN 'month' ELSE 'day' END;

  IF _mode = 'realized' THEN
    RETURN QUERY
    WITH ent AS (SELECT date_trunc(v_trunc, payment_date)::date AS b, SUM(amount_received) AS v
                 FROM receivable_payments WHERE payment_date BETWEEN _from AND _to GROUP BY 1),
         sai AS (SELECT date_trunc(v_trunc, payment_date)::date AS b, SUM(amount_paid) AS v
                 FROM payable_payments WHERE payment_date BETWEEN _from AND _to GROUP BY 1)
    SELECT COALESCE(e.b, s.b),
           COALESCE(e.v,0)::numeric,
           COALESCE(s.v,0)::numeric,
           (COALESCE(e.v,0) - COALESCE(s.v,0))::numeric
    FROM ent e FULL JOIN sai s ON s.b = e.b
    ORDER BY 1;
  ELSE
    RETURN QUERY
    WITH ent AS (SELECT date_trunc(v_trunc, due_date)::date AS b,
                        SUM(original_amount - COALESCE(received_amount,0) - COALESCE(discount_amount,0)) AS v
                 FROM accounts_receivable_installments
                 WHERE status IN ('OPEN','PARTIAL','OVERDUE') AND due_date BETWEEN _from AND _to GROUP BY 1),
         sai AS (SELECT date_trunc(v_trunc, due_date)::date AS b,
                        SUM(original_amount - COALESCE(paid_amount,0) - COALESCE(discount_amount,0)) AS v
                 FROM accounts_payable_installments
                 WHERE status IN ('OPEN','PARTIAL','OVERDUE') AND due_date BETWEEN _from AND _to GROUP BY 1)
    SELECT COALESCE(e.b, s.b),
           COALESCE(e.v,0)::numeric,
           COALESCE(s.v,0)::numeric,
           (COALESCE(e.v,0) - COALESCE(s.v,0))::numeric
    FROM ent e FULL JOIN sai s ON s.b = e.b
    ORDER BY 1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fin_revenue_by_customer(_from date, _to date, _regime text DEFAULT 'COMPETENCIA', _limit int DEFAULT 10)
RETURNS TABLE(customer_id uuid, customer_name text, total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _regime = 'CAIXA' THEN
    RETURN QUERY
    SELECT ar.customer_id, c.nome, SUM(rp.amount_received)::numeric
    FROM receivable_payments rp
    JOIN accounts_receivable_installments ari ON ari.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = ari.receivable_id
    JOIN clientes c ON c.id = ar.customer_id
    WHERE rp.payment_date BETWEEN _from AND _to
    GROUP BY ar.customer_id, c.nome
    ORDER BY 3 DESC LIMIT _limit;
  ELSE
    RETURN QUERY
    SELECT ar.customer_id, c.nome, SUM(ari.original_amount)::numeric
    FROM accounts_receivable_installments ari
    JOIN accounts_receivable ar ON ar.id = ari.receivable_id
    JOIN clientes c ON c.id = ar.customer_id
    WHERE ari.due_date BETWEEN _from AND _to AND ari.status <> 'CANCELED'
    GROUP BY ar.customer_id, c.nome
    ORDER BY 3 DESC LIMIT _limit;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fin_expense_by_category(_from date, _to date, _regime text DEFAULT 'COMPETENCIA', _limit int DEFAULT 10)
RETURNS TABLE(category_id uuid, category_name text, dre_group text, total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _regime = 'CAIXA' THEN
    RETURN QUERY
    SELECT fc.id, fc.name, fc.dre_group, SUM(pp.amount_paid)::numeric
    FROM payable_payments pp
    JOIN accounts_payable_installments api ON api.id = pp.installment_id
    JOIN accounts_payable ap ON ap.id = api.payable_id
    JOIN financial_categories fc ON fc.id = ap.category_id
    WHERE pp.payment_date BETWEEN _from AND _to
    GROUP BY fc.id, fc.name, fc.dre_group
    ORDER BY 4 DESC LIMIT _limit;
  ELSE
    RETURN QUERY
    SELECT fc.id, fc.name, fc.dre_group, SUM(api.original_amount)::numeric
    FROM accounts_payable_installments api
    JOIN accounts_payable ap ON ap.id = api.payable_id
    JOIN financial_categories fc ON fc.id = ap.category_id
    WHERE api.due_date BETWEEN _from AND _to AND api.status <> 'CANCELED'
    GROUP BY fc.id, fc.name, fc.dre_group
    ORDER BY 4 DESC LIMIT _limit;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fin_revenue_by_category(_from date, _to date, _regime text DEFAULT 'COMPETENCIA', _limit int DEFAULT 10)
RETURNS TABLE(category_id uuid, category_name text, dre_group text, total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _regime = 'CAIXA' THEN
    RETURN QUERY
    SELECT fc.id, fc.name, fc.dre_group, SUM(rp.amount_received)::numeric
    FROM receivable_payments rp
    JOIN accounts_receivable_installments ari ON ari.id = rp.installment_id
    JOIN accounts_receivable ar ON ar.id = ari.receivable_id
    JOIN financial_categories fc ON fc.id = ar.category_id
    WHERE rp.payment_date BETWEEN _from AND _to
    GROUP BY fc.id, fc.name, fc.dre_group
    ORDER BY 4 DESC LIMIT _limit;
  ELSE
    RETURN QUERY
    SELECT fc.id, fc.name, fc.dre_group, SUM(ari.original_amount)::numeric
    FROM accounts_receivable_installments ari
    JOIN accounts_receivable ar ON ar.id = ari.receivable_id
    JOIN financial_categories fc ON fc.id = ar.category_id
    WHERE ari.due_date BETWEEN _from AND _to AND ari.status <> 'CANCELED'
    GROUP BY fc.id, fc.name, fc.dre_group
    ORDER BY 4 DESC LIMIT _limit;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fin_aging(_type text DEFAULT 'RECEIVABLE')
RETURNS TABLE(bucket text, total numeric, qtd int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _type = 'PAYABLE' THEN
    RETURN QUERY
    SELECT CASE WHEN CURRENT_DATE - due_date <= 0 THEN 'A vencer'
                WHEN CURRENT_DATE - due_date <= 30 THEN '1-30'
                WHEN CURRENT_DATE - due_date <= 60 THEN '31-60'
                WHEN CURRENT_DATE - due_date <= 90 THEN '61-90'
                ELSE '90+' END,
           SUM(original_amount - COALESCE(paid_amount,0) - COALESCE(discount_amount,0))::numeric,
           COUNT(*)::int
    FROM accounts_payable_installments
    WHERE status IN ('OPEN','PARTIAL','OVERDUE')
    GROUP BY 1 ORDER BY 1;
  ELSE
    RETURN QUERY
    SELECT CASE WHEN CURRENT_DATE - due_date <= 0 THEN 'A vencer'
                WHEN CURRENT_DATE - due_date <= 30 THEN '1-30'
                WHEN CURRENT_DATE - due_date <= 60 THEN '31-60'
                WHEN CURRENT_DATE - due_date <= 90 THEN '61-90'
                ELSE '90+' END,
           SUM(original_amount - COALESCE(received_amount,0) - COALESCE(discount_amount,0))::numeric,
           COUNT(*)::int
    FROM accounts_receivable_installments
    WHERE status IN ('OPEN','PARTIAL','OVERDUE')
    GROUP BY 1 ORDER BY 1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fin_dre_summary(_from date, _to date, _regime text DEFAULT 'COMPETENCIA')
RETURNS TABLE(dre_group text, total numeric, qtd int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  IF _regime = 'CAIXA' THEN
    RETURN QUERY
    WITH receitas AS (
      SELECT COALESCE(fc.dre_group, 'NAO_CLASSIFICADO') AS g, SUM(rp.amount_received) AS v, COUNT(*) AS q
      FROM receivable_payments rp
      JOIN accounts_receivable_installments ari ON ari.id = rp.installment_id
      JOIN accounts_receivable ar ON ar.id = ari.receivable_id
      LEFT JOIN financial_categories fc ON fc.id = ar.category_id
      WHERE rp.payment_date BETWEEN _from AND _to
      GROUP BY 1
    ),
    despesas AS (
      SELECT COALESCE(fc.dre_group, 'NAO_CLASSIFICADO') AS g, SUM(pp.amount_paid) AS v, COUNT(*) AS q
      FROM payable_payments pp
      JOIN accounts_payable_installments api ON api.id = pp.installment_id
      JOIN accounts_payable ap ON ap.id = api.payable_id
      LEFT JOIN financial_categories fc ON fc.id = ap.category_id
      WHERE pp.payment_date BETWEEN _from AND _to
      GROUP BY 1
    )
    SELECT g, v::numeric, q::int FROM receitas
    UNION ALL
    SELECT g, v::numeric, q::int FROM despesas;
  ELSE
    RETURN QUERY
    WITH receitas AS (
      SELECT COALESCE(fc.dre_group, 'NAO_CLASSIFICADO') AS g, SUM(ari.original_amount) AS v, COUNT(*) AS q
      FROM accounts_receivable_installments ari
      JOIN accounts_receivable ar ON ar.id = ari.receivable_id
      LEFT JOIN financial_categories fc ON fc.id = ar.category_id
      WHERE ari.due_date BETWEEN _from AND _to AND ari.status <> 'CANCELED'
      GROUP BY 1
    ),
    despesas AS (
      SELECT COALESCE(fc.dre_group, 'NAO_CLASSIFICADO') AS g, SUM(api.original_amount) AS v, COUNT(*) AS q
      FROM accounts_payable_installments api
      JOIN accounts_payable ap ON ap.id = api.payable_id
      LEFT JOIN financial_categories fc ON fc.id = ap.category_id
      WHERE api.due_date BETWEEN _from AND _to AND api.status <> 'CANCELED'
      GROUP BY 1
    )
    SELECT g, v::numeric, q::int FROM receitas
    UNION ALL
    SELECT g, v::numeric, q::int FROM despesas;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fin_inadimplencia()
RETURNS TABLE(installment_id uuid, receivable_id uuid, customer_id uuid, customer_name text, due_date date, amount numeric, dias_atraso int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  RETURN QUERY
  SELECT ari.id, ar.id, ar.customer_id, c.nome, ari.due_date,
         (ari.original_amount - COALESCE(ari.received_amount,0) - COALESCE(ari.discount_amount,0))::numeric,
         (CURRENT_DATE - ari.due_date)::int
  FROM accounts_receivable_installments ari
  JOIN accounts_receivable ar ON ar.id = ari.receivable_id
  JOIN clientes c ON c.id = ar.customer_id
  WHERE ari.status IN ('OPEN','PARTIAL','OVERDUE') AND ari.due_date < CURRENT_DATE
  ORDER BY ari.due_date ASC;
END $$;
