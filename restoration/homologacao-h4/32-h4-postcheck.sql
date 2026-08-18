-- H4 postcheck comportamental (transacional, ROLLBACK ao final)
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_partner uuid; v_order uuid; v_exp jsonb; v_pass int := 0; v_fail int := 0;
  v_msg text;
BEGIN
  INSERT INTO public.partner_accounts(razao_social, ativo)
  VALUES ('H4-POSTCHECK PARCEIRO', true) RETURNING id INTO v_partner;

  INSERT INTO public.partner_financial_settings(partner_id, credit_limit, credit_limit_action, block_if_overdue)
  VALUES (v_partner, 1000, 'block', false)
  ON CONFLICT (partner_id) DO UPDATE
    SET credit_limit = 1000, credit_limit_action = 'block', block_if_overdue = false;

  -- T1: sem pedidos, exposicao zero
  v_exp := public.fn_b2b_credit_exposure(v_partner, 0, NULL);
  IF (v_exp->>'exposicao_projetada')::numeric = 0 THEN v_pass := v_pass+1;
  ELSE v_fail := v_fail+1; RAISE WARNING 'T1 FAIL %', v_exp; END IF;

  -- Pedido pendente de 800 (em_analise_comercial)
  INSERT INTO public.partner_orders(partner_id, status, total, final_amount_with_interest, numero)
  VALUES (v_partner, 'em_analise_comercial', 800, 800, 'H4-PC-1') RETURNING id INTO v_order;

  -- T2: pedido pendente entra em comprometido_pendente
  v_exp := public.fn_b2b_credit_exposure(v_partner, 0, NULL);
  IF (v_exp->>'comprometido_pendente')::numeric = 800 THEN v_pass := v_pass+1;
  ELSE v_fail := v_fail+1; RAISE WARNING 'T2 FAIL %', v_exp; END IF;

  -- T3: novo pedido de 500 estoura o limite (antes passava)
  v_exp := public.fn_b2b_credit_exposure(v_partner, 500, NULL);
  IF v_exp->>'reason_code' = 'LIMIT_EXCEEDED_BLOCK' THEN v_pass := v_pass+1;
  ELSE v_fail := v_fail+1; RAISE WARNING 'T3 FAIL %', v_exp; END IF;

  -- T4: exclude_order_id continua honrado
  v_exp := public.fn_b2b_credit_exposure(v_partner, 0, v_order);
  IF (v_exp->>'exposicao_projetada')::numeric = 0 THEN v_pass := v_pass+1;
  ELSE v_fail := v_fail+1; RAISE WARNING 'T4 FAIL %', v_exp; END IF;

  -- T5: pedido cancelado nao consome limite
  UPDATE public.partner_orders SET status = 'cancelado' WHERE id = v_order;
  v_exp := public.fn_b2b_credit_exposure(v_partner, 0, NULL);
  IF (v_exp->>'exposicao_projetada')::numeric = 0 THEN v_pass := v_pass+1;
  ELSE v_fail := v_fail+1; RAISE WARNING 'T5 FAIL %', v_exp; END IF;

  -- T7: itens gravaveis antes da aprovacao
  UPDATE public.partner_orders SET status = 'em_analise_comercial' WHERE id = v_order;
  BEGIN
    INSERT INTO public.partner_order_items(order_id, quantidade, preco_unitario, subtotal)
    VALUES (v_order, 1, 10, 10);
    v_pass := v_pass+1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_fail := v_fail+1; RAISE WARNING 'T7 FAIL msg=%', v_msg;
  END;

  -- T6: itens imutaveis apos aprovacao
  UPDATE public.partner_orders SET status = 'aprovado' WHERE id = v_order;
  BEGIN
    UPDATE public.partner_order_items SET preco_unitario = 1 WHERE order_id = v_order;
    v_fail := v_fail+1; RAISE WARNING 'T6 FAIL: update permitido em pedido aprovado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'order_items_immutable_after_approval%' THEN v_pass := v_pass+1;
    ELSE v_fail := v_fail+1; RAISE WARNING 'T6 FAIL msg=%', v_msg; END IF;
  END;

  -- T8: exclusao de item tambem bloqueada apos aprovacao
  BEGIN
    DELETE FROM public.partner_order_items WHERE order_id = v_order;
    v_fail := v_fail+1; RAISE WARNING 'T8 FAIL: delete permitido em pedido aprovado';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'order_items_immutable_after_approval%' THEN v_pass := v_pass+1;
    ELSE v_fail := v_fail+1; RAISE WARNING 'T8 FAIL msg=%', v_msg; END IF;
  END;

  RAISE NOTICE 'H4 POSTCHECK: % PASS / % FAIL', v_pass, v_fail;
  IF v_fail > 0 THEN RAISE EXCEPTION 'FAIL_H4_POSTCHECK'; END IF;
END $$;

ROLLBACK;
