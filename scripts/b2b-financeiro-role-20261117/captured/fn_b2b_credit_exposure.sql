CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure(p_partner_id uuid, p_new_order_amount numeric DEFAULT 0, p_exclude_order_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_settings_json jsonb;
  v_fc record; v_b4_residual numeric; v_effective numeric; v_owner uuid;
  v_limit numeric(14,2); v_open numeric(14,2); v_overdue numeric(14,2);
  v_committed numeric(14,2); v_pending numeric(14,2);
  v_new numeric(14,2) := ROUND(COALESCE(p_new_order_amount,0),2);
  v_proj numeric(14,2); v_disp numeric(14,2); v_pct numeric;
  v_tolerance int; v_block boolean; v_action text; v_reason text;
BEGIN
  PERFORM platform_private.b2b_integration_actor(p_partner_id);
  IF p_new_order_amount IS NULL OR p_new_order_amount<0 OR p_new_order_amount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'CREDIT_AMOUNT_INVALID' USING ERRCODE='23514'; END IF;
  IF platform_private.b2b_credit_config_block(p_partner_id) IS NOT NULL THEN RAISE EXCEPTION 'CREDIT_SETTINGS_INCOMPLETE' USING ERRCODE='PT409'; END IF;
  SELECT COALESCE(credit_limit,0), COALESCE(overdue_tolerance_days,0),
         COALESCE(block_if_overdue,false), COALESCE(credit_limit_action,'block')
    INTO v_limit, v_tolerance, v_block, v_action
  FROM public.partner_financial_settings WHERE partner_id = p_partner_id;
  v_limit := COALESCE(v_limit,0); v_tolerance := COALESCE(v_tolerance,0);
  v_block := COALESCE(v_block,false); v_action := COALESCE(v_action,'block');

  v_settings_json:=platform_private.b2b_credit_balances(p_partner_id,p_exclude_order_id);
  v_open:=(v_settings_json->>'saldo_em_aberto')::numeric;
  v_overdue:=(v_settings_json->>'saldo_vencido')::numeric;
  v_committed:=(v_settings_json->>'comprometido_nao_faturado')::numeric;
  v_pending:=(v_settings_json->>'comprometido_pendente')::numeric;
  -- B4+previsão (corpo único; ordem B4 -> 09-12): o residual B4 (total menos
  -- alocações de NF autorizadas não estornadas) segue como única base e títulos
  -- abertos entram só por saldo_em_aberto. A previsão nunca é aditiva: apenas zera
  -- residual formalmente cancelado e, nos demais estados, precisa coincidir com o
  -- residual B4. Divergência, tenant ou parceiro conflitante falham fechados.
  SELECT pa.commercial_owner_organization_id INTO v_owner FROM public.partner_accounts pa WHERE pa.id=p_partner_id;
  FOR v_fc IN SELECT f.order_id,f.state,f.residual_amount,f.organization_id,f.partner_id AS forecast_partner,
      po.partner_id AS order_partner,po.status::text AS status
    FROM platform_private.b2b_financial_forecasts f JOIN public.partner_orders po ON po.id=f.order_id
    WHERE (po.partner_id=p_partner_id OR f.partner_id=p_partner_id)
      AND po.id IS DISTINCT FROM p_exclude_order_id
      AND po.status::text IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','pendente','solicitado','em_analise_comercial','aguardando_aprovacao_credito','aguardando_ajuste_comercial','aguardando_itens')
  LOOP
    IF v_fc.forecast_partner IS DISTINCT FROM v_fc.order_partner OR v_fc.organization_id IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION 'CREDIT_FORECAST_SCOPE_CONFLICT' USING ERRCODE='23514'; END IF;
    v_b4_residual:=platform_private.b2b_order_residual(v_fc.order_id);
    IF v_fc.state IN ('cancelado_antes_nf','cancelado_residual') THEN v_effective:=0;
    ELSIF v_fc.residual_amount IS DISTINCT FROM v_b4_residual THEN
      RAISE EXCEPTION 'CREDIT_FORECAST_RESIDUAL_DIVERGENCE' USING ERRCODE='23514';
    ELSE v_effective:=v_b4_residual; END IF;
    IF v_fc.status IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue') THEN v_committed:=v_committed-v_b4_residual+v_effective;
    ELSE v_pending:=v_pending-v_b4_residual+v_effective; END IF;
  END LOOP;
  v_proj := ROUND(v_open + v_committed + v_pending + v_new, 2);
  v_disp := GREATEST(v_limit - v_proj, 0);
  v_pct  := CASE WHEN v_limit > 0 THEN ROUND((v_proj / v_limit) * 100, 2) ELSE 0 END;

  v_reason := CASE
    WHEN v_block AND v_overdue > 0 THEN 'OVERDUE_BLOCK'
    WHEN v_proj > v_limit AND v_action = 'approval_required' THEN 'LIMIT_EXCEEDED_APPROVAL'
    WHEN v_proj > v_limit THEN 'LIMIT_EXCEEDED_BLOCK'
    ELSE 'OK' END;

  RETURN jsonb_build_object(
    'partner_id', p_partner_id,
    'credit_limit', v_limit,
    'saldo_em_aberto', v_open,
    'saldo_vencido', v_overdue,
    'comprometido_nao_faturado', v_committed,
    'comprometido_pendente', v_pending,
    'novo_pedido', v_new,
    'exposicao_atual', ROUND(v_open + v_committed + v_pending, 2),
    'exposicao_projetada', v_proj,
    'credito_disponivel', v_disp,
    'percentual_utilizado', v_pct,
    'overdue_tolerance_days', v_tolerance,
    'block_if_overdue', v_block,
    'credit_limit_action', v_action,
    'tem_vencidos', v_overdue > 0,
    'reason_code', v_reason
  );
END $function$
