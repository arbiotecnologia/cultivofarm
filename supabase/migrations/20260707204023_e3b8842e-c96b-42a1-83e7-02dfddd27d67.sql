
-- =====================================================================
-- FASE 3: Motor de Condições Comerciais B2B — integração com pedidos
-- =====================================================================

-- Drop old signature so we can widen it
DROP FUNCTION IF EXISTS public.create_partner_order_secure(uuid, text, jsonb, date);

CREATE OR REPLACE FUNCTION public.create_partner_order_secure(
  p_partner_id uuid,
  p_observacoes text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_requested_delivery_date date DEFAULT NULL,
  p_payment_plan_id uuid DEFAULT NULL,
  p_first_due_date date DEFAULT NULL,
  p_installment_count integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_user_partner uuid;
  v_order_id uuid;
  v_numero text;
  v_partner_desconto numeric(5,2);
  v_plan record;
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
  v_price record;
  v_prod_row record;
  v_micro_row record;
  v_preco_tabela numeric(12,2);
  v_preco_final_item numeric(12,2);
  v_line_table_total numeric(12,2);
  v_line_final numeric(12,2);
  v_table_amount numeric(14,2) := 0;
  v_discount_amount numeric(14,2);
  v_net_amount numeric(14,2);
  v_interest_amount numeric(14,2);
  v_final_amount numeric(14,2);
  v_plan_discount numeric(6,3);
  v_installments integer;
  v_first_due date;
  v_terms_id uuid;
  v_status partner_order_status;
  v_fin_status text;
  v_approval_status text;
  v_credit jsonb;
  v_installment_amount numeric(14,2);
  v_accum numeric(14,2) := 0;
  v_amount_i numeric(14,2);
  v_principal_i numeric(14,2);
  v_interest_i numeric(14,2);
  v_due_i date;
  v_admin record;
  i integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;
  IF p_payment_plan_id IS NULL THEN RAISE EXCEPTION 'payment_plan_required'; END IF;

  v_is_admin := has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial');
  v_user_partner := public.get_user_partner_id();
  IF NOT v_is_admin THEN
    IF NOT has_role(v_uid,'parceiro_b2b') OR v_user_partner IS NULL OR v_user_partner <> p_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  SELECT desconto_padrao INTO v_partner_desconto
    FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true;
  IF v_partner_desconto IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  -- Valida plano
  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_plan.active = false THEN RAISE EXCEPTION 'plan_inactive'; END IF;
  IF v_plan.monthly_interest_percent < 0 THEN RAISE EXCEPTION 'invalid_interest_rate'; END IF;
  IF v_plan.discount_percent > 40 AND NOT has_role(v_uid,'administrador') THEN
    RAISE EXCEPTION 'discount_exceeds_limit';
  END IF;

  -- Bloqueio de crédito
  BEGIN
    v_credit := public.rpc_b2b_partner_credit(p_partner_id);
    IF COALESCE((v_credit->>'tem_vencidos')::boolean, false) THEN
      RAISE EXCEPTION 'credit_blocked_overdue';
    END IF;
  EXCEPTION
    WHEN sqlstate 'P0001' THEN RAISE;
    WHEN OTHERS THEN NULL;
  END;

  v_plan_discount := v_plan.discount_percent;
  v_installments := GREATEST(COALESCE(p_installment_count, v_plan.installment_count, 1), 1);

  -- Cria pedido inicial (status ajustado depois)
  INSERT INTO public.partner_orders(
    partner_id, status, subtotal, desconto_total, total, observacoes, created_by,
    requested_delivery_date, ready_for_production, payment_plan_id, payment_condition_status
  )
  VALUES (
    p_partner_id, 'em_analise_comercial', 0, 0, 0, NULLIF(p_observacoes,''), v_uid,
    p_requested_delivery_date, false, p_payment_plan_id, 'defined'
  )
  RETURNING id, numero INTO v_order_id, v_numero;

  -- Itens
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
               THEN (v_prod_row.dose_ml_ha/100.0)*v_dose_base END)
        WHEN 'litro' THEN COALESCE(NULLIF(v_prod_row.valor_litro_brl,0), v_dose_base*10.0)
        WHEN 'dose'  THEN v_dose_base
        WHEN 'unidade' THEN (v_volume_ml/1000.0)*COALESCE(NULLIF(v_prod_row.valor_litro_brl,0), v_dose_base*10.0)
      END;
      SELECT preco_tabela INTO v_price
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
               THEN (v_micro_row.dose_ml_ha/100.0)*v_dose_base END
        WHEN 'litro' THEN COALESCE(NULLIF(v_micro_row.valor_litro_brl,0), v_dose_base*10.0)
        WHEN 'dose'  THEN v_dose_base
        WHEN 'unidade' THEN (v_volume_ml/1000.0)*COALESCE(NULLIF(v_micro_row.valor_litro_brl,0), v_dose_base*10.0)
      END;
      SELECT preco_tabela INTO v_price
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

    -- Desconto do plano prevalece sobre desconto do parceiro
    v_preco_final_item := ROUND(v_preco_tabela * (1 - v_plan_discount/100.0), 2);
    v_line_table_total := ROUND(v_preco_tabela * v_qty, 2);
    v_line_final := ROUND(v_preco_final_item * v_qty, 2);
    v_table_amount := v_table_amount + v_line_table_total;

    INSERT INTO public.partner_order_items(
      order_id, product_id, microrganismo_id, quantidade, preco_unitario,
      desconto_percentual, subtotal, unidade_medida, volume_ml,
      produto_nome_snapshot, produto_codigo_snapshot,
      preco_tabela_snapshot, desconto_percentual_snapshot, preco_unitario_final_snapshot
    ) VALUES (
      v_order_id,
      CASE WHEN v_itipo='produto' THEN v_iid END,
      CASE WHEN v_itipo='microrganismo' THEN v_iid END,
      v_qty, v_preco_final_item, v_plan_discount, v_line_final, v_unidade, v_volume_ml,
      v_nome, v_codigo,
      v_preco_tabela, v_plan_discount, v_preco_final_item
    );

    v_price := NULL;
  END LOOP;

  -- Fórmula oficial AR Bio
  v_discount_amount := ROUND(v_table_amount * (v_plan_discount/100.0), 2);
  v_net_amount := ROUND(v_table_amount - v_discount_amount, 2);
  IF v_plan.interest_type = 'none' OR v_plan.monthly_interest_percent = 0 OR v_plan.months_count = 0 THEN
    v_final_amount := v_net_amount;
  ELSIF v_plan.interest_type = 'simple' THEN
    v_final_amount := ROUND(v_net_amount * (1 + (v_plan.monthly_interest_percent/100.0)*v_plan.months_count), 2);
  ELSE
    v_final_amount := ROUND(v_net_amount * POWER(1 + (v_plan.monthly_interest_percent/100.0), v_plan.months_count), 2);
  END IF;
  v_interest_amount := ROUND(v_final_amount - v_net_amount, 2);

  -- Valor mínimo
  IF v_plan.minimum_order_amount IS NOT NULL AND v_table_amount < v_plan.minimum_order_amount THEN
    RAISE EXCEPTION 'below_minimum_order_amount';
  END IF;

  -- Aprovação
  IF v_plan.requires_financial_approval OR v_plan.requires_guarantee THEN
    v_fin_status := 'pending'; v_approval_status := 'pending';
  ELSE
    v_fin_status := 'not_required'; v_approval_status := 'not_required';
  END IF;
  v_status := 'em_analise_comercial'::partner_order_status;

  -- Primeiro vencimento
  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);
  IF v_first_due > current_date + v_plan.max_days AND v_plan.plan_type <> 'harvest' THEN
    v_first_due := current_date + v_plan.max_days;
  END IF;

  -- Snapshot de condição
  INSERT INTO public.partner_order_payment_terms(
    partner_order_id, payment_plan_id, plan_name_snapshot, plan_code_snapshot,
    discount_percent_snapshot, monthly_interest_percent_snapshot, months_count_snapshot,
    installment_count, first_due_date, interest_type_snapshot,
    table_amount, discount_amount, net_amount_after_discount,
    financial_interest_amount, final_amount, approval_status, created_by
  ) VALUES (
    v_order_id, v_plan.id, v_plan.name, v_plan.code,
    v_plan_discount, v_plan.monthly_interest_percent, v_plan.months_count,
    v_installments, v_first_due, v_plan.interest_type,
    v_table_amount, v_discount_amount, v_net_amount,
    v_interest_amount, v_final_amount, v_approval_status, v_uid
  ) RETURNING id INTO v_terms_id;

  -- Cronograma
  IF v_installments = 1 THEN
    INSERT INTO public.partner_order_payment_schedule(
      partner_order_id, payment_terms_id, installment_number, due_date,
      amount, principal_amount, interest_amount
    ) VALUES (v_order_id, v_terms_id, 1, v_first_due, v_final_amount, v_net_amount, v_interest_amount);
  ELSE
    v_installment_amount := ROUND(v_final_amount / v_installments, 2);
    FOR i IN 1..v_installments LOOP
      IF i < v_installments THEN v_amount_i := v_installment_amount;
      ELSE v_amount_i := ROUND(v_final_amount - v_accum, 2); END IF;
      v_accum := v_accum + v_amount_i;
      v_principal_i := ROUND(v_amount_i * (v_net_amount / NULLIF(v_final_amount,0)), 2);
      v_interest_i := ROUND(v_amount_i - v_principal_i, 2);
      v_due_i := v_first_due + ((i - 1) * 30);
      INSERT INTO public.partner_order_payment_schedule(
        partner_order_id, payment_terms_id, installment_number, due_date,
        amount, principal_amount, interest_amount
      ) VALUES (v_order_id, v_terms_id, i, v_due_i, v_amount_i, v_principal_i, v_interest_i);
    END LOOP;
  END IF;

  -- Atualiza pedido com totais e vínculos
  UPDATE public.partner_orders SET
    subtotal = v_table_amount,
    desconto_total = v_discount_amount,
    total = v_final_amount,
    status = v_status,
    payment_terms_id = v_terms_id,
    table_amount = v_table_amount,
    commercial_discount_amount = v_discount_amount,
    net_amount_after_discount = v_net_amount,
    financial_interest_amount = v_interest_amount,
    final_amount_with_interest = v_final_amount,
    requires_financial_approval = (v_plan.requires_financial_approval OR v_plan.requires_guarantee),
    financial_approval_status = v_fin_status
  WHERE id = v_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_order_id, p_partner_id, v_uid, 'created_via_rpc',
          jsonb_build_object('numero', v_numero, 'total', v_final_amount, 'items', jsonb_array_length(p_items),
                             'requested_delivery_date', p_requested_delivery_date));

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_order_id, p_partner_id, v_uid, 'payment_terms_defined',
          jsonb_build_object(
            'payment_plan_id', v_plan.id,
            'plan_code', v_plan.code,
            'table_amount', v_table_amount,
            'discount_amount', v_discount_amount,
            'net_amount_after_discount', v_net_amount,
            'financial_interest_amount', v_interest_amount,
            'final_amount', v_final_amount,
            'first_due_date', v_first_due,
            'installment_count', v_installments,
            'requires_financial_approval', (v_plan.requires_financial_approval OR v_plan.requires_guarantee)
          ));

  FOR v_admin IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
     WHERE ur.role IN ('administrador','gestor_comercial')
  LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_admin.user_id, 'pedido_b2b_novo',
            'Novo pedido B2B ' || v_numero,
            'Novo pedido B2B aguardando análise comercial. Total: R$ ' || to_char(v_final_amount,'FM999G999G990D00'),
            '/comercial/pedidos-b2b');
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_order_id, 'numero', v_numero,
    'subtotal', v_table_amount, 'desconto_total', v_discount_amount, 'total', v_final_amount,
    'payment_terms_id', v_terms_id,
    'requires_financial_approval', (v_plan.requires_financial_approval OR v_plan.requires_guarantee),
    'financial_approval_status', v_fin_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_partner_order_secure(uuid, text, jsonb, date, uuid, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partner_order_secure(uuid, text, jsonb, date, uuid, date, integer) TO authenticated, service_role;

-- ------------------------------------------------------------------------
-- convert_partner_simulation_to_order_secure — exige plano de pagamento
-- ------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.convert_partner_simulation_to_order_secure(uuid, text);

CREATE OR REPLACE FUNCTION public.convert_partner_simulation_to_order_secure(
  p_simulation_id uuid,
  p_observacoes text DEFAULT NULL,
  p_payment_plan_id uuid DEFAULT NULL,
  p_first_due_date date DEFAULT NULL,
  p_installment_count integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_partner_b2b boolean;
  v_is_tecnico boolean;
  v_user_partner uuid;
  v_sim record;
  v_partner_id uuid;
  v_items jsonb;
  v_result jsonb;
  v_order_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF p_payment_plan_id IS NULL THEN RAISE EXCEPTION 'payment_plan_required'; END IF;

  v_is_admin := has_role(v_uid, 'administrador') OR has_role(v_uid, 'gestor_comercial');
  v_is_partner_b2b := has_role(v_uid, 'parceiro_b2b');
  v_is_tecnico := has_role(v_uid, 'parceiro_b2b_tecnico');

  IF v_is_tecnico AND NOT v_is_admin AND NOT v_is_partner_b2b THEN
    RAISE EXCEPTION 'forbidden_role_tecnico_cannot_convert';
  END IF;
  IF NOT (v_is_admin OR v_is_partner_b2b) THEN
    RAISE EXCEPTION 'forbidden_role';
  END IF;

  SELECT * INTO v_sim FROM public.partner_simulations WHERE id = p_simulation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'simulation_not_found'; END IF;
  IF v_sim.status = 'convertida_pedido' THEN RAISE EXCEPTION 'already_converted'; END IF;
  IF v_sim.status NOT IN ('rascunho','enviada_gestor') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  v_partner_id := v_sim.partner_id;
  IF v_is_partner_b2b AND NOT v_is_admin THEN
    v_user_partner := get_user_partner_id();
    IF v_user_partner IS NULL OR v_user_partner <> v_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  -- Monta payload de itens no formato aceito por create_partner_order_secure
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'item_id', item_id,
           'item_tipo', item_tipo,
           'quantidade', quantidade,
           'unidade_medida', COALESCE(unidade_medida, 'hectare'),
           'volume_ml', volume_ml
         )), '[]'::jsonb) INTO v_items
  FROM public.partner_simulation_items WHERE simulation_id = p_simulation_id;

  IF v_items = '[]'::jsonb THEN RAISE EXCEPTION 'empty_simulation'; END IF;

  -- Reaproveita a RPC unificada — herda validações, cálculos, snapshot e cronograma
  v_result := public.create_partner_order_secure(
    v_partner_id,
    COALESCE(p_observacoes, v_sim.observacoes),
    v_items,
    NULL,
    p_payment_plan_id,
    p_first_due_date,
    p_installment_count
  );
  v_order_id := (v_result->>'id')::uuid;

  -- Marca origem e converte simulação
  UPDATE public.partner_orders
     SET origin_simulation_id = p_simulation_id,
         cliente_id = v_sim.cliente_id
   WHERE id = v_order_id;

  UPDATE public.partner_simulations
     SET status = 'convertida_pedido', converted_order_id = v_order_id,
         converted_by = v_uid, converted_at = now(), updated_at = now()
   WHERE id = p_simulation_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_order_id, v_partner_id, v_uid, 'converted_from_simulation',
          jsonb_build_object('simulation_id', p_simulation_id, 'numero', v_result->>'numero',
                             'cliente_id', v_sim.cliente_id, 'total', v_result->>'total'));

  PERFORM public.insert_partner_catalog_access_log_internal(
    'simulation_converted_to_order', v_partner_id, v_uid, v_sim.cliente_id,
    p_simulation_id, v_order_id, NULL,
    jsonb_build_object('total', v_result->>'total')
  );

  RETURN v_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_partner_simulation_to_order_secure(uuid, text, uuid, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_partner_simulation_to_order_secure(uuid, text, uuid, date, integer) TO authenticated, service_role;
