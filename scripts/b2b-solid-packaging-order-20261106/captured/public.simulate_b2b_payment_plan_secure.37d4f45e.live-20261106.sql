CREATE OR REPLACE FUNCTION public.simulate_b2b_payment_plan_secure(p_partner_id uuid, p_payment_plan_id uuid, p_items jsonb, p_first_due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean; v_is_finance boolean; v_is_gestor boolean;
  v_is_partner boolean; v_is_tech boolean; v_user_partner uuid;
  v_partner record; v_plan record; v_cart jsonb;
  v_table numeric(14,2); v_disc numeric(14,2); v_net numeric(14,2);
  v_interest numeric(14,2); v_final numeric(14,2);
  v_first_due date; v_installments integer;
  v_schedule jsonb := '[]'::jsonb; v_warnings jsonb := '[]'::jsonb;
  v_credit jsonb; v_inst numeric(14,2); v_accum numeric(14,2) := 0;
  v_amount_i numeric(14,2); v_principal_i numeric(14,2); v_interest_i numeric(14,2);
  v_due_i date; v_quote boolean; i integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  PERFORM platform_private.c2_order_actor_scope(v_uid, p_partner_id); -- c2_ord_scope
  PERFORM platform_private.c2_owner_order_guard(v_uid, p_partner_id, p_payment_plan_id); -- c2_ord_guard

  v_is_admin   := has_role(v_uid,'administrador'::app_role);
  v_is_finance := has_role(v_uid,'financeiro'::app_role);
  v_is_gestor  := has_role(v_uid,'gestor_comercial'::app_role);
  v_is_partner := has_role(v_uid,'parceiro_b2b'::app_role);
  v_is_tech    := has_role(v_uid,'parceiro_b2b_tecnico'::app_role);
  v_user_partner := public.get_user_partner_id();

  IF has_role(v_uid,'cliente_produtor'::app_role)
     AND NOT (v_is_admin OR v_is_finance OR v_is_gestor OR v_is_partner) THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED';
  END IF;

  -- Esta RPC e exclusivamente financeira (condicao, desconto, juros, parcelas,
  -- totais e credito). Tecnico de parceiro sem alcada interna/gestora nao pode
  -- obter nenhum desses dados: bloqueio ANTES de qualquer resolucao de preco.
  IF v_is_tech AND NOT (v_is_admin OR v_is_finance OR v_is_gestor OR v_is_partner) THEN
    RAISE EXCEPTION 'forbidden_financial_terms';
  END IF;

  IF NOT (v_is_admin OR v_is_finance OR v_is_gestor) THEN
    IF NOT (v_is_partner AND v_user_partner IS NOT NULL AND v_user_partner = p_partner_id) THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  SELECT id, ativo INTO v_partner FROM public.partner_accounts WHERE id = p_partner_id;
  IF NOT FOUND OR v_partner.ativo = false THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF; IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;
  IF v_plan.active = false THEN RAISE EXCEPTION 'plan_inactive'; END IF;
  IF v_plan.monthly_interest_percent < 0 THEN RAISE EXCEPTION 'invalid_interest_rate'; END IF;
  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;

  v_cart  := public.fn_resolve_b2b_cart(p_partner_id, p_payment_plan_id, p_items, current_date);
  v_quote := COALESCE((v_cart->>'quote_required')::boolean,false);
  v_table := (v_cart->>'table_amount')::numeric;
  v_disc  := (v_cart->>'discount_amount')::numeric;
  v_net   := (v_cart->>'net_amount')::numeric;

  IF v_quote THEN v_table := 0; v_disc := 0; v_net := 0; END IF;

  v_final    := CASE WHEN v_quote THEN 0
                     ELSE public.fn_b2b_apply_interest(v_net, v_plan.interest_type,
                            v_plan.monthly_interest_percent, v_plan.months_count) END;
  v_interest := ROUND(v_final - v_net, 2);

  IF p_first_due_date IS NOT NULL AND p_first_due_date < current_date THEN
    RAISE EXCEPTION 'invalid_due_date';
  END IF;
  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);
  IF v_first_due > current_date + v_plan.max_days AND NOT (v_is_admin OR v_is_finance OR v_is_gestor) THEN
    v_first_due := current_date + v_plan.max_days;
    v_warnings := v_warnings || jsonb_build_array('Data de vencimento ajustada ao limite do plano.');
  END IF;

  v_installments := GREATEST(COALESCE(v_plan.installment_count,1), 1);

  IF v_quote THEN
    v_warnings := v_warnings || to_jsonb('Condicao sob consulta: preco sera definido em cotacao.'::text);
  ELSIF v_installments = 1 THEN
    v_schedule := jsonb_build_array(jsonb_build_object(
      'installment_number',1,'due_date',v_first_due,'amount',v_final,
      'principal_amount',v_net,'interest_amount',v_interest));
  ELSE
    v_inst := ROUND(v_final / v_installments, 2);
    FOR i IN 1..v_installments LOOP
      IF i < v_installments THEN v_amount_i := v_inst; ELSE v_amount_i := ROUND(v_final - v_accum,2); END IF;
      v_accum := v_accum + v_amount_i;
      v_principal_i := ROUND(v_amount_i * (v_net / NULLIF(v_final,0)), 2);
      v_interest_i  := ROUND(v_amount_i - v_principal_i, 2);
      v_due_i := v_first_due + ((i-1) * 30);
      v_schedule := v_schedule || jsonb_build_array(jsonb_build_object(
        'installment_number', i, 'due_date', v_due_i, 'amount', v_amount_i,
        'principal_amount', v_principal_i, 'interest_amount', v_interest_i));
    END LOOP;
  END IF;

  IF v_plan.requires_financial_approval THEN
    v_warnings := v_warnings || to_jsonb('Plano exige aprovação financeira'::text); END IF;
  IF v_plan.requires_guarantee THEN
    v_warnings := v_warnings || to_jsonb('Plano exige garantia'::text); END IF;
  IF v_plan.requires_credit_approval THEN
    v_warnings := v_warnings || to_jsonb('Plano depende de limite de crédito'::text); END IF;
  IF NOT v_quote AND v_plan.minimum_order_amount IS NOT NULL AND v_table < v_plan.minimum_order_amount THEN
    v_warnings := v_warnings || to_jsonb('Pedido abaixo do valor mínimo para este plano'::text); END IF;

  BEGIN
    v_credit := public.fn_b2b_credit_exposure(p_partner_id, v_final, NULL);
    IF COALESCE((v_credit->>'tem_vencidos')::boolean,false) THEN
      v_warnings := v_warnings || to_jsonb('Parceiro possui saldo vencido'::text);
    END IF;
    IF COALESCE((v_credit->>'credit_limit')::numeric,0) > 0
       AND (v_credit->>'exposicao_projetada')::numeric > (v_credit->>'credit_limit')::numeric THEN
      v_warnings := v_warnings || to_jsonb('Pedido excede o limite de crédito projetado'::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN v_credit := NULL; END;

  RETURN jsonb_build_object(
    'partner_id', p_partner_id,
    'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
    'quote_required', v_quote,
    'items', v_cart->'lines',
    'cart_hash', public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final),
    'financial_visible', true,
    'payment_plan', jsonb_build_object(
      'id', v_plan.id, 'name', v_plan.name, 'code', v_plan.code,
      'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
      'discount_percent', v_plan.discount_percent,
      'monthly_interest_percent', v_plan.monthly_interest_percent,
      'months_count', v_plan.months_count,
      'installment_count', v_installments,
      'requires_financial_approval', v_plan.requires_financial_approval,
      'requires_credit_approval', v_plan.requires_credit_approval,
      'requires_guarantee', v_plan.requires_guarantee),
    'amounts', jsonb_build_object(
      'table_amount', v_table, 'discount_amount', v_disc,
      'net_amount_after_discount', v_net,
      'financial_interest_amount', v_interest, 'final_amount', v_final),
    'table_amount', v_table, 'discount_amount', v_disc,
    'net_amount_after_discount', v_net,
    'financial_interest_amount', v_interest, 'final_amount', v_final,
    'first_due_date', v_first_due,
    'schedule', v_schedule,
    'credit', v_credit,
    'warnings', v_warnings);
END $function$
