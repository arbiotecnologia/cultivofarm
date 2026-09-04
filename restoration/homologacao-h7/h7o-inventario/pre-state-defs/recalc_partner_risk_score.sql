CREATE OR REPLACE FUNCTION public.recalc_partner_risk_score(p_partner_id uuid)
 RETURNS partner_risk_scores
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dias_atraso numeric := 0;
  v_vencidos int := 0;
  v_pct numeric := 0;
  v_freq int := 0;
  v_meses int := 0;
  v_limite numeric := 0;
  v_aberto numeric := 0;
  v_score int := 0;
  v_level text := 'baixo';
  v_row public.partner_risk_scores;
BEGIN
  IF p_partner_id IS NULL THEN RAISE EXCEPTION 'partner_id required'; END IF;

  SELECT COALESCE(AVG(GREATEST(0, CURRENT_DATE - ari.due_date)),0)::numeric,
         COUNT(*) FILTER (WHERE ari.status='OVERDUE' OR (ari.status IN ('OPEN','PARTIAL') AND ari.due_date < CURRENT_DATE))
    INTO v_dias_atraso, v_vencidos
  FROM accounts_receivable ar
  JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.origin_type='B2B_ORDER' AND ar.partner_id = p_partner_id
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  SELECT COALESCE(credit_limit,0) INTO v_limite FROM partner_financial_settings WHERE partner_id = p_partner_id;
  v_limite := COALESCE(v_limite,0);

  SELECT COALESCE(SUM(ari.original_amount - ari.received_amount),0) INTO v_aberto
  FROM accounts_receivable ar
  JOIN accounts_receivable_installments ari ON ari.receivable_id = ar.id
  WHERE ar.origin_type='B2B_ORDER' AND ar.partner_id = p_partner_id
    AND ari.status IN ('OPEN','PARTIAL','OVERDUE');

  v_pct := CASE WHEN v_limite > 0 THEN LEAST(100,(v_aberto/v_limite)*100) ELSE 0 END;

  SELECT COUNT(*) INTO v_freq FROM partner_orders
   WHERE partner_id = p_partner_id AND created_at >= now() - interval '30 days'
     AND status NOT IN ('cancelado','reprovado');

  SELECT GREATEST(0, EXTRACT(YEAR FROM age(now(), pa.created_at))*12 + EXTRACT(MONTH FROM age(now(), pa.created_at)))::int
    INTO v_meses FROM partner_accounts pa WHERE id = p_partner_id;

  -- score (peso): atraso 35, vencidos 25, util 20, freq -10, relacionamento -10
  v_score := LEAST(100, GREATEST(0,
      ROUND(LEAST(v_dias_atraso/90.0,1)*35)
    + ROUND(LEAST(v_vencidos/5.0,1)*25)
    + ROUND((v_pct/100.0)*20)
    - ROUND(LEAST(v_freq/10.0,1)*10)
    - ROUND(LEAST(COALESCE(v_meses,0)/24.0,1)*10)
  ));
  v_level := CASE
    WHEN v_score <= 30 THEN 'baixo'
    WHEN v_score <= 60 THEN 'medio'
    WHEN v_score <= 80 THEN 'alto'
    ELSE 'critico' END;

  INSERT INTO partner_risk_scores (partner_id, score, risk_level, dias_medio_atraso, titulos_vencidos, pct_credito_utilizado, freq_compras_30d, meses_relacionamento, calculado_em)
  VALUES (p_partner_id, v_score, v_level, v_dias_atraso, v_vencidos, v_pct, v_freq, COALESCE(v_meses,0), now())
  ON CONFLICT (partner_id) DO UPDATE SET
    score = EXCLUDED.score,
    risk_level = EXCLUDED.risk_level,
    dias_medio_atraso = EXCLUDED.dias_medio_atraso,
    titulos_vencidos = EXCLUDED.titulos_vencidos,
    pct_credito_utilizado = EXCLUDED.pct_credito_utilizado,
    freq_compras_30d = EXCLUDED.freq_compras_30d,
    meses_relacionamento = EXCLUDED.meses_relacionamento,
    calculado_em = now()
  RETURNING * INTO v_row;

  INSERT INTO financial_governance_audit_log(usuario_id, partner_id, acao, dados_novos)
  VALUES (auth.uid(), p_partner_id, 'score_recalculado', to_jsonb(v_row));

  RETURN v_row;
END;$function$

--ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--OWNER: postgres

