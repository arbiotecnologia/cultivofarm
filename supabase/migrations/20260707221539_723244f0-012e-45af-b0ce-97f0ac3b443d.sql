CREATE OR REPLACE FUNCTION public.simulate_b2b_payment_plan_secure(p_partner_id uuid, p_payment_plan_id uuid, p_items jsonb, p_first_due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_finance boolean;
  v_is_gestor boolean;
  v_is_partner boolean;
  v_is_tech boolean;
  v_user_partner uuid;
  v_partner record;
  v_plan record;
  v_partner_desconto numeric(5,2);
  v_item jsonb;
  v_iid uuid;
  v_itipo text;
  v_qty numeric(12,2);
  v_unidade text;
  v_volume_ml numeric(12,2);
  v_nome text;
  v_codigo text;
  v_base numeric(12,2);
  v_dose_base numeric(12,2);
  v_prod_row record;
  v_micro_row record;
  v_price record;
  v_preco_tabela numeric(12,2);
  v_desc numeric(5,2);
  v_preco_final numeric(12,2);
  v_table_amount numeric(14,2) := 0;
  v_discount_amount numeric(14,2);
  v_net_amount numeric(14,2);
  v_interest_amount numeric(14,2);
  v_final_amount numeric(14,2);
  v_first_due date;
  v_installments integer;
  v_schedule jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_credit jsonb;
  v_installment_amount numeric(14,2);
  v_accum numeric(14,2) := 0;
  v_amount_i numeric(14,2);
  v_principal_i numeric(14,2);
  v_interest_i numeric(14,2);
  v_due_i date;
  i integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  v_is_admin   := has_role(v_uid, 'administrador'::app_role);
  v_is_finance := has_role(v_uid, 'financeiro'::app_role);
  v_is_gestor  := has_role(v_uid, 'gestor_comercial'::app_role);
  v_is_partner := has_role(v_uid, 'parceiro_b2b'::app_role);
  v_is_tech    := has_role(v_uid, 'parceiro_b2b_tecnico'::app_role);
  v_user_partner := public.get_user_partner_id();

  IF NOT (v_is_admin OR v_is_finance OR v_is_gestor) THEN
    IF NOT ((v_is_partner OR v_is_tech) AND v_user_partner IS NOT NULL AND v_user_partner = p_partner_id) THEN
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
      VALUES (NULL, p_partner_id, v_uid, 'simulate_payment_plan_forbidden',
              jsonb_build_object('plan_id', p_payment_plan_id));
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  SELECT id, ativo, COALESCE(desconto_padrao,0) AS desconto_padrao
    INTO v_partner
  FROM public.partner_accounts WHERE id = p_partner_id;
  IF NOT FOUND OR v_partner.ativo = false THEN RAISE EXCEPTION 'partner_not_found'; END IF;
  v_partner_desconto := v_partner.desconto_padrao;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_plan.active = false THEN RAISE EXCEPTION 'plan_inactive'; END IF;
  IF v_plan.monthly_interest_percent < 0 THEN RAISE EXCEPTION 'invalid_interest_rate'; END IF;
  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN
    RAISE EXCEPTION 'discount_exceeds_limit';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_iid := COALESCE((v_item->>'item_id')::uuid, (v_item->>'product_id')::uuid);
    v_itipo := COALESCE(v_item->>'item_tipo', 'produto');
    v_qty := COALESCE((v_item->>'quantidade')::numeric, 0);
    v_unidade := COALESCE(NULLIF(v_item->>'unidade_medida', ''), 'hectare');
    v_volume_ml := NULLIF((v_item->>'volume_ml')::numeric, 0);
    v_base := NULL; v_dose_base := NULL; v_price := NULL;

    IF v_qty <= 0 THEN RAISE EXCEPTION 'invalid_qty'; END IF;
    IF v_unidade NOT IN ('hectare','litro','dose','unidade') THEN RAISE EXCEPTION 'invalid_unidade_medida'; END IF;
    IF v_unidade = 'unidade' AND (v_volume_ml IS NULL OR v_volume_ml <= 0) THEN RAISE EXCEPTION 'invalid_volume_ml'; END IF;

    IF v_itipo = 'produto' THEN
      SELECT id, nome, codigo, valor_ha_brl, valor_dose_brl, valor_litro_brl, dose_ml_ha,
             ativo, COALESCE(b2b_enabled, true) AS b2b_enabled
        INTO v_prod_row FROM public.produtos WHERE id = v_iid;
      IF NOT FOUND OR v_prod_row.ativo = false OR v_prod_row.b2b_enabled = false THEN
        RAISE EXCEPTION 'product_unavailable';
      END IF;
      v_nome := v_prod_row.nome; v_codigo := v_prod_row.codigo;
      v_dose_base := COALESCE(NULLIF(v_prod_row.valor_dose_brl,0), NULLIF(v_prod_row.valor_litro_brl,0)/10.0);
      v_base := CASE v_unidade
        WHEN 'hectare' THEN COALESCE(NULLIF(v_prod_row.valor_ha_brl,0),
          CASE WHEN v_prod_row.dose_ml_ha IS NOT NULL AND v_prod_row.dose_ml_ha > 0
               THEN (v_prod_row.dose_ml_ha / 100.0) * v_dose_base END)
        WHEN 'litro' THEN COALESCE(NULLIF(v_prod_row.valor_litro_brl,0), v_dose_base * 10.0)
        WHEN 'dose'  THEN v_dose_base
        WHEN 'unidade' THEN (v_volume_ml / 1000.0) * COALESCE(NULLIF(v_prod_row.valor_litro_brl,0), v_dose_base * 10.0)
      END;
      SELECT preco_tabela, desconto_percentual, preco_final INTO v_price
        FROM public.partner_product_prices
        WHERE partner_id = p_partner_id AND product_id = v_iid AND ativo = true;
    ELSIF v_itipo = 'microrganismo' THEN
      SELECT id, nome, codigo, valor_dose_brl, valor_litro_brl, dose_ml_ha,
             ativo, COALESCE(b2b_enabled, false) AS b2b_enabled
        INTO v_micro_row FROM public.microrganismos WHERE id = v_iid;
      IF NOT FOUND OR v_micro_row.ativo = false OR v_micro_row.b2b_enabled = false THEN
        RAISE EXCEPTION 'product_unavailable';
      END IF;
      v_nome := v_micro_row.nome; v_codigo := v_micro_row.codigo;
      v_dose_base := COALESCE(NULLIF(v_micro_row.valor_dose_brl,0), NULLIF(v_micro_row.valor_litro_brl,0)/10.0);
      v_base := CASE v_unidade
        WHEN 'hectare' THEN CASE WHEN v_micro_row.dose_ml_ha IS NOT NULL AND v_micro_row.dose_ml_ha > 0
               THEN (v_micro_row.dose_ml_ha / 100.0) * v_dose_base END
        WHEN 'litro' THEN COALESCE(NULLIF(v_micro_row.valor_litro_brl,0), v_dose_base * 10.0)
        WHEN 'dose'  THEN v_dose_base
        WHEN 'unidade' THEN (v_volume_ml / 1000.0) * COALESCE(NULLIF(v_micro_row.valor_litro_brl,0), v_dose_base * 10.0)
      END;
      SELECT preco_tabela, desconto_percentual, preco_final INTO v_price
        FROM public.partner_product_prices
        WHERE partner_id = p_partner_id AND microrganismo_id = v_iid AND ativo = true;
    ELSE
      RAISE EXCEPTION 'invalid_item_tipo';
    END IF;

    IF v_price.preco_tabela IS NOT NULL THEN
      v_preco_tabela := v_price.preco_tabela;
    ELSE
      IF v_base IS NULL OR v_base <= 0 THEN RAISE EXCEPTION 'price_unavailable'; END IF;
      v_preco_tabela := ROUND(v_base, 2);
    END IF;
    IF v_preco_tabela IS NULL OR v_preco_tabela <= 0 THEN RAISE EXCEPTION 'price_unavailable'; END IF;

    v_table_amount := v_table_amount + ROUND(v_preco_tabela * v_qty, 2);
  END LOOP;

  -- Fórmula oficial AR Bio
  v_discount_amount := ROUND(v_table_amount * (v_plan.discount_percent / 100.0), 2);
  v_net_amount := ROUND(v_table_amount - v_discount_amount, 2);

  IF v_plan.interest_type = 'none' OR v_plan.monthly_interest_percent = 0 OR v_plan.months_count = 0 THEN
    v_final_amount := v_net_amount;
  ELSIF v_plan.interest_type = 'simple' THEN
    v_final_amount := ROUND(v_net_amount * (1 + (v_plan.monthly_interest_percent / 100.0) * v_plan.months_count), 2);
  ELSE
    v_final_amount := ROUND(v_net_amount * POWER(1 + (v_plan.monthly_interest_percent / 100.0), v_plan.months_count), 2);
  END IF;
  v_interest_amount := ROUND(v_final_amount - v_net_amount, 2);

  -- FASE 11 blindagem vencimento simulacao
  IF p_first_due_date IS NOT NULL AND p_first_due_date < current_date THEN
    RAISE EXCEPTION 'invalid_due_date';
  END IF;
  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);
  IF v_first_due > current_date + v_plan.max_days THEN
    IF NOT (v_is_admin OR v_is_finance OR v_is_gestor) THEN
      v_first_due := current_date + v_plan.max_days;
      v_warnings := v_warnings || jsonb_build_array('Data de vencimento ajustada ao limite do plano.');
    END IF;
  END IF;

  v_installments := GREATEST(v_plan.installment_count, 1);

  IF v_installments = 1 THEN
    v_schedule := jsonb_build_array(jsonb_build_object(
      'installment_number', 1,
      'due_date', v_first_due,
      'amount', v_final_amount,
      'principal_amount', v_net_amount,
      'interest_amount', v_interest_amount
    ));
  ELSE
    v_installment_amount := ROUND(v_final_amount / v_installments, 2);
    FOR i IN 1..v_installments LOOP
      IF i < v_installments THEN
        v_amount_i := v_installment_amount;
      ELSE
        v_amount_i := ROUND(v_final_amount - v_accum, 2);
      END IF;
      v_accum := v_accum + v_amount_i;
      v_principal_i := ROUND(v_amount_i * (v_net_amount / NULLIF(v_final_amount,0)), 2);
      v_interest_i := ROUND(v_amount_i - v_principal_i, 2);
      v_due_i := v_first_due + ((i - 1) * 30);
      v_schedule := v_schedule || jsonb_build_array(jsonb_build_object(
        'installment_number', i,
        'due_date', v_due_i,
        'amount', v_amount_i,
        'principal_amount', v_principal_i,
        'interest_amount', v_interest_i
      ));
    END LOOP;
  END IF;

  IF v_plan.requires_financial_approval THEN
    v_warnings := v_warnings || to_jsonb('Plano exige aprovação financeira'::text);
  END IF;
  IF v_plan.requires_guarantee THEN
    v_warnings := v_warnings || to_jsonb('Plano exige garantia'::text);
  END IF;
  IF v_plan.requires_credit_approval THEN
    v_warnings := v_warnings || to_jsonb('Plano depende de limite de crédito'::text);
  END IF;
  IF v_plan.minimum_order_amount IS NOT NULL AND v_table_amount < v_plan.minimum_order_amount THEN
    v_warnings := v_warnings || to_jsonb('Pedido abaixo do valor mínimo para este plano'::text);
  END IF;

  BEGIN
    v_credit := public.rpc_b2b_partner_credit(p_partner_id);
    IF COALESCE((v_credit->>'tem_vencidos')::boolean, false)
       OR COALESCE((v_credit->>'saldo_vencido')::numeric, 0) > 0 THEN
      v_warnings := v_warnings || to_jsonb('Parceiro possui saldo vencido'::text);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'partner_id', p_partner_id,
    'payment_plan', jsonb_build_object(
      'id', v_plan.id,
      'name', v_plan.name,
      'code', v_plan.code,
      'discount_percent', v_plan.discount_percent,
      'monthly_interest_percent', v_plan.monthly_interest_percent,
      'months_count', v_plan.months_count,
      'installment_count', v_installments,
      'requires_financial_approval', v_plan.requires_financial_approval,
      'requires_credit_approval', v_plan.requires_credit_approval,
      'requires_guarantee', v_plan.requires_guarantee
    ),
    'amounts', jsonb_build_object(
      'table_amount', v_table_amount,
      'discount_amount', v_discount_amount,
      'net_amount_after_discount', v_net_amount,
      'financial_interest_amount', v_interest_amount,
      'final_amount', v_final_amount
    ),
    -- Retrocompatibilidade: mantém campos no nível raiz
    'table_amount', v_table_amount,
    'discount_amount', v_discount_amount,
    'net_amount_after_discount', v_net_amount,
    'financial_interest_amount', v_interest_amount,
    'final_amount', v_final_amount,
    'first_due_date', v_first_due,
    'schedule', v_schedule,
    'warnings', v_warnings
  );
END;
$function$;