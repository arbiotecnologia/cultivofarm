-- H4b postcheck comportamental (transacional, ROLLBACK ao final)
-- Exercita credit_limit_action='approval_required' fim-a-fim.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_admin uuid;
  v_partner uuid; v_order uuid; v_prod uuid;
  v_pass int := 0; v_fail int := 0; v_msg text;
  v_status text; v_ready boolean; v_credit_at timestamptz;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role = 'administrador' LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'sem usuario administrador para o harness'; END IF;
  -- garante papel financeiro para approve_b2b_credit (removido no rollback)
  INSERT INTO public.user_roles(user_id, role) VALUES (v_admin, 'financeiro')
    ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  SELECT id INTO v_prod FROM public.produtos WHERE ativo LIMIT 1;

  INSERT INTO public.partner_accounts(razao_social, ativo)
  VALUES ('H4B-POSTCHECK PARCEIRO', true) RETURNING id INTO v_partner;

  INSERT INTO public.partner_financial_settings(partner_id, credit_limit, credit_limit_action, block_if_overdue)
  VALUES (v_partner, 1000, 'approval_required', false)
  ON CONFLICT (partner_id) DO UPDATE
    SET credit_limit = 1000, credit_limit_action = 'approval_required', block_if_overdue = false;

  ---------------------------------------------------------------------------
  -- Cenario A: pedido acima do limite, em_analise_comercial, SEM credit_approved_at
  ---------------------------------------------------------------------------
  INSERT INTO public.partner_orders(partner_id, status, total, final_amount_with_interest, numero)
  VALUES (v_partner, 'em_analise_comercial', 5000, 5000, 'H4B-A') RETURNING id INTO v_order;
  INSERT INTO public.partner_order_items(order_id, product_id, quantidade, preco_unitario, subtotal)
  VALUES (v_order, v_prod, 1, 5000, 5000);
  INSERT INTO public.partner_order_payment_terms(
    partner_order_id, plan_name_snapshot, plan_code_snapshot, discount_percent_snapshot,
    monthly_interest_percent_snapshot, months_count_snapshot, installment_count, first_due_date,
    interest_type_snapshot, table_amount, discount_amount, net_amount_after_discount,
    financial_interest_amount, final_amount, approval_status)
  VALUES (v_order, 'AVISTA', 'AVISTA', 0, 0, 0, 1, current_date, 'compound',
          5000, 0, 5000, 0, 5000, 'approved');
  -- normaliza status caso gatilhos tenham roteado o pedido
  -- simula deriva administrativa: pedido acima do limite parado em em_analise_comercial
  ALTER TABLE public.partner_orders DISABLE TRIGGER trg_partner_orders_credit_guard;
  UPDATE public.partner_orders SET status='em_analise_comercial', credit_block_reason=NULL WHERE id=v_order;
  ALTER TABLE public.partner_orders ENABLE TRIGGER trg_partner_orders_credit_guard;

  BEGIN
    PERFORM public.approve_partner_order(v_order, 'harness A', NULL);
    v_fail := v_fail+1; RAISE WARNING 'A FAIL: aprovacao permitida sem credito formal';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'credit_approval_required%' THEN v_pass := v_pass+1;
    ELSE v_fail := v_fail+1; RAISE WARNING 'A FAIL msg=%', v_msg; END IF;
  END;

  SELECT status::text, ready_for_production INTO v_status, v_ready
    FROM public.partner_orders WHERE id = v_order;
  IF v_status <> 'aprovado' AND COALESCE(v_ready,false) = false THEN v_pass := v_pass+1;
  ELSE v_fail := v_fail+1; RAISE WARNING 'A2 FAIL status=% ready=%', v_status, v_ready; END IF;

  -- A3: gravacao direta de credit_approved_at fora de approve_b2b_credit e bloqueada
  BEGIN
    UPDATE public.partner_orders SET credit_approved_at = now(), credit_approved_by = v_admin
     WHERE id = v_order;
    v_fail := v_fail+1; RAISE WARNING 'A3 FAIL: gravacao direta permitida';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'credit_approval_fields_immutable%' THEN v_pass := v_pass+1;
    ELSE v_fail := v_fail+1; RAISE WARNING 'A3 FAIL msg=%', v_msg; END IF;
  END;

  ---------------------------------------------------------------------------
  -- Cenario B: fluxo formal aguardando_aprovacao_credito -> approve_b2b_credit -> aprovacao
  ---------------------------------------------------------------------------
  UPDATE public.partner_orders SET status='aguardando_aprovacao_credito', credit_block_reason='limite_excedido'
   WHERE id = v_order;
  PERFORM public.approve_b2b_credit(v_order, 'harness B');

  SELECT status::text, credit_approved_at INTO v_status, v_credit_at
    FROM public.partner_orders WHERE id = v_order;
  IF v_status = 'em_analise_comercial' AND v_credit_at IS NOT NULL THEN v_pass := v_pass+1;
  ELSE v_fail := v_fail+1; RAISE WARNING 'B1 FAIL status=% credit_at=%', v_status, v_credit_at; END IF;

  BEGIN
    PERFORM public.approve_partner_order(v_order, 'harness B', NULL);
    SELECT status::text, ready_for_production INTO v_status, v_ready
      FROM public.partner_orders WHERE id = v_order;
    IF v_status = 'aprovado' AND v_ready THEN v_pass := v_pass+1;
    ELSE v_fail := v_fail+1; RAISE WARNING 'B2 FAIL status=% ready=%', v_status, v_ready; END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_fail := v_fail+1; RAISE WARNING 'B2 FAIL msg=%', v_msg;
  END;

  ---------------------------------------------------------------------------
  -- Cenario C: credit_limit_action='block' continua bloqueando acima do limite
  ---------------------------------------------------------------------------
  UPDATE public.partner_financial_settings SET credit_limit_action='block' WHERE partner_id = v_partner;

  INSERT INTO public.partner_orders(partner_id, status, total, final_amount_with_interest, numero)
  VALUES (v_partner, 'em_analise_comercial', 5000, 5000, 'H4B-C') RETURNING id INTO v_order;
  INSERT INTO public.partner_order_items(order_id, product_id, quantidade, preco_unitario, subtotal)
  VALUES (v_order, v_prod, 1, 5000, 5000);
  INSERT INTO public.partner_order_payment_terms(
    partner_order_id, plan_name_snapshot, plan_code_snapshot, discount_percent_snapshot,
    monthly_interest_percent_snapshot, months_count_snapshot, installment_count, first_due_date,
    interest_type_snapshot, table_amount, discount_amount, net_amount_after_discount,
    financial_interest_amount, final_amount, approval_status)
  VALUES (v_order, 'AVISTA', 'AVISTA', 0, 0, 0, 1, current_date, 'compound',
          5000, 0, 5000, 0, 5000, 'approved');
  -- simula deriva administrativa: pedido acima do limite parado em em_analise_comercial
  ALTER TABLE public.partner_orders DISABLE TRIGGER trg_partner_orders_credit_guard;
  UPDATE public.partner_orders SET status='em_analise_comercial', credit_block_reason=NULL WHERE id=v_order;
  ALTER TABLE public.partner_orders ENABLE TRIGGER trg_partner_orders_credit_guard;

  BEGIN
    PERFORM public.approve_partner_order(v_order, 'harness C', NULL);
    v_fail := v_fail+1; RAISE WARNING 'C FAIL: aprovacao permitida em modo block';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'credit_block_on_approval: LIMIT_EXCEEDED_BLOCK%' THEN v_pass := v_pass+1;
    ELSE v_fail := v_fail+1; RAISE WARNING 'C FAIL msg=%', v_msg; END IF;
  END;

  ---------------------------------------------------------------------------
  -- Cenario D: pedido dentro do limite continua aprovavel
  ---------------------------------------------------------------------------
  UPDATE public.partner_orders SET status='cancelado' WHERE partner_id = v_partner AND numero IN ('H4B-A','H4B-C');
  UPDATE public.partner_financial_settings SET credit_limit = 100000 WHERE partner_id = v_partner;

  INSERT INTO public.partner_orders(partner_id, status, total, final_amount_with_interest, numero)
  VALUES (v_partner, 'em_analise_comercial', 100, 100, 'H4B-D') RETURNING id INTO v_order;
  INSERT INTO public.partner_order_items(order_id, product_id, quantidade, preco_unitario, subtotal)
  VALUES (v_order, v_prod, 1, 100, 100);
  INSERT INTO public.partner_order_payment_terms(
    partner_order_id, plan_name_snapshot, plan_code_snapshot, discount_percent_snapshot,
    monthly_interest_percent_snapshot, months_count_snapshot, installment_count, first_due_date,
    interest_type_snapshot, table_amount, discount_amount, net_amount_after_discount,
    financial_interest_amount, final_amount, approval_status)
  VALUES (v_order, 'AVISTA', 'AVISTA', 0, 0, 0, 1, current_date, 'compound',
          100, 0, 100, 0, 100, 'approved');
  -- simula deriva administrativa: pedido acima do limite parado em em_analise_comercial
  ALTER TABLE public.partner_orders DISABLE TRIGGER trg_partner_orders_credit_guard;
  UPDATE public.partner_orders SET status='em_analise_comercial', credit_block_reason=NULL WHERE id=v_order;
  ALTER TABLE public.partner_orders ENABLE TRIGGER trg_partner_orders_credit_guard;

  BEGIN
    PERFORM public.approve_partner_order(v_order, 'harness D', NULL);
    SELECT status::text, ready_for_production INTO v_status, v_ready
      FROM public.partner_orders WHERE id = v_order;
    IF v_status = 'aprovado' AND v_ready THEN v_pass := v_pass+1;
    ELSE v_fail := v_fail+1; RAISE WARNING 'D FAIL status=% ready=%', v_status, v_ready; END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_fail := v_fail+1; RAISE WARNING 'D FAIL msg=%', v_msg;
  END;

  RAISE NOTICE 'H4B POSTCHECK: % PASS / % FAIL', v_pass, v_fail;
  IF v_fail > 0 THEN RAISE EXCEPTION 'FAIL_H4B_POSTCHECK'; END IF;
END $$;

ROLLBACK;
