CREATE OR REPLACE FUNCTION public.get_financial_cashflow(p_start_date date, p_end_date date, p_view_mode text DEFAULT 'PROJECTED'::text, p_group_by text DEFAULT 'DAY'::text)
 RETURNS TABLE(period_label text, period_start date, expected_inflows numeric, expected_outflows numeric, realized_inflows numeric, realized_outflows numeric, projected_balance numeric, realized_balance numeric, accumulated_projected_balance numeric, accumulated_realized_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     GROUP BY 1
  ), real_out AS (
    SELECT date_trunc(v_trunc, pp.payment_date)::date b, SUM(pp.amount_paid) v
      FROM payable_payments pp
     WHERE pp.payment_date BETWEEN p_start_date AND p_end_date
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