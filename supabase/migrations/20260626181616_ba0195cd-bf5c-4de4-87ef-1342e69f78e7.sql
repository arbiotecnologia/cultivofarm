CREATE OR REPLACE FUNCTION public.get_financial_dre_summary(p_start_date date, p_end_date date, p_regime text DEFAULT 'CASH'::text, p_cost_center_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- CASH: NÃO filtrar is_reversal. O estorno tem valor negativo e cancela o pagamento original na soma.
    FOR g IN
      SELECT COALESCE(fc.dre_group,'SEM_CLASSIFICACAO') AS grp, SUM(rp.amount_received) AS total,
             COUNT(*) FILTER (WHERE COALESCE(rp.is_reversal,false) = false) AS qtd
        FROM receivable_payments rp
        JOIN accounts_receivable_installments ari ON ari.id = rp.installment_id
        JOIN accounts_receivable ar ON ar.id = ari.receivable_id
        LEFT JOIN financial_categories fc ON fc.id = ar.category_id
       WHERE rp.payment_date BETWEEN p_start_date AND p_end_date
         AND (p_cost_center_id IS NULL OR ar.cost_center_id = p_cost_center_id)
       GROUP BY 1
    LOOP v_groups := v_groups || jsonb_build_object(lower(g.grp), jsonb_build_object('total', g.total, 'qtd', g.qtd)); END LOOP;
    FOR g IN
      SELECT COALESCE(fc.dre_group,'SEM_CLASSIFICACAO') AS grp, SUM(pp.amount_paid) AS total,
             COUNT(*) FILTER (WHERE COALESCE(pp.is_reversal,false) = false) AS qtd
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

  SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name))
    INTO v_unclassified
    FROM financial_categories WHERE dre_group IS NULL AND active = true;

  v_receita := COALESCE((v_groups->'receita_bruta'->>'total')::numeric,0)
             + COALESCE((v_groups->'outras_receitas'->>'total')::numeric,0);
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
  v_margem := CASE WHEN v_receita > 0 THEN (v_resultado / v_receita) * 100 ELSE 0 END;

  r := v_groups
    || jsonb_build_object('resultado_operacional', v_resultado,
                          'margem_operacional_percentual', v_margem,
                          'unclassified_categories', COALESCE(v_unclassified, '[]'::jsonb));
  RETURN r;
END $function$;