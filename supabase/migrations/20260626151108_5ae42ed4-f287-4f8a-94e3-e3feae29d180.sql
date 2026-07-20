-- Fase 9: corrigir DRE (CASH) e Fluxo de Caixa (REALIZED) para ignorar estornos
CREATE OR REPLACE FUNCTION public.get_financial_dre_summary(
  p_start_date date, p_end_date date,
  p_regime text DEFAULT 'CASH', p_cost_center_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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
         AND COALESCE(rp.is_reversal,false) = false
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
         AND COALESCE(pp.is_reversal,false) = false
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
END $function$;

CREATE OR REPLACE FUNCTION public.get_financial_cashflow(
  p_start_date date, p_end_date date,
  p_view_mode text DEFAULT 'PROJECTED', p_group_by text DEFAULT 'DAY'
) RETURNS TABLE(period_label text, period_start date,
  expected_inflows numeric, expected_outflows numeric,
  realized_inflows numeric, realized_outflows numeric,
  projected_balance numeric, realized_balance numeric,
  accumulated_projected_balance numeric, accumulated_realized_balance numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
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
      FROM receivable_payments rp
     WHERE rp.payment_date BETWEEN p_start_date AND p_end_date
       AND COALESCE(rp.is_reversal,false) = false
     GROUP BY 1
  ), real_out AS (
    SELECT date_trunc(v_trunc, pp.payment_date)::date b, SUM(pp.amount_paid) v
      FROM payable_payments pp
     WHERE pp.payment_date BETWEEN p_start_date AND p_end_date
       AND COALESCE(pp.is_reversal,false) = false
     GROUP BY 1
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
  SELECT to_char(bk, v_fmt),
         bk,
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
END $function$;