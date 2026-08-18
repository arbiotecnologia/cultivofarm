-- H6c — harness comportamental. TRANSACIONAL com ROLLBACK: não persiste dados.
-- Staging ikaauvsflpmamgxmkhoq.
\set ON_ERROR_STOP on
\pset pager off
BEGIN;

CREATE TEMP TABLE h6c_res(teste text, ok boolean, detalhe text) ON COMMIT DROP;

DO $harness$
DECLARE
  v_partner uuid; v_prod_a uuid; v_prod_b uuid; v_lote uuid;
  v_order uuid; v_terms uuid; v_ent uuid;
  v_emb_a uuid; v_emb_b uuid;
  v_ar uuid; v_estq uuid; v_cat uuid; v_user uuid; v_cli uuid; v_res jsonb; v_num numeric; v_links int; v_ok boolean; v_txt text;
BEGIN
  SELECT id INTO v_partner FROM public.partner_accounts ORDER BY created_at LIMIT 1;
  SELECT id INTO v_prod_a FROM public.produtos ORDER BY created_at LIMIT 1;
  SELECT id INTO v_prod_b FROM public.produtos WHERE id <> v_prod_a ORDER BY created_at LIMIT 1;
  SELECT id INTO v_lote FROM public.lotes ORDER BY created_at LIMIT 1;

  -- pedido B2B com 2 produtos: A = 1000, B = 400 (base 1400), total com juros 1470
  INSERT INTO public.partner_orders(partner_id, status, subtotal, total,
      financial_approval_status, requires_financial_approval)
    VALUES (v_partner, 'pendente', 1400, 1470, 'not_required', false)
    RETURNING id INTO v_order;

  INSERT INTO public.partner_order_items(order_id, product_id, quantidade, preco_unitario, subtotal)
    VALUES (v_order, v_prod_a, 10, 100, 1000), (v_order, v_prod_b, 4, 100, 400);

  UPDATE public.partner_orders SET status = 'aprovado' WHERE id = v_order;

  INSERT INTO public.partner_order_payment_terms(partner_order_id, plan_name_snapshot,
      plan_code_snapshot, discount_percent_snapshot, monthly_interest_percent_snapshot,
      months_count_snapshot, first_due_date, table_amount, net_amount_after_discount,
      financial_interest_amount, final_amount, approval_status)
    VALUES (v_order, 'H6C 30/60', 'H6C', 0, 2.5, 2, current_date + 30, 1400, 1400, 70, 1470, 'pending')
    RETURNING id INTO v_terms;

  -- T-B0: trigger de vínculo canônico preencheu payment_terms_id
  SELECT payment_terms_id = v_terms INTO v_ok FROM public.partner_orders WHERE id = v_order;
  INSERT INTO h6c_res VALUES ('B0 vinculo canonico automatico do termo', COALESCE(v_ok,false), v_terms::text);

  -- entrega vinculada ao pedido
  SELECT id INTO v_estq FROM public.estoque_produto WHERE quantidade > 0 ORDER BY created_at LIMIT 1;
  INSERT INTO public.entregas(partner_order_id, status, estoque_produto_id, quantidade_entregue)
    VALUES (v_order, 'em_rota', v_estq, 0)
    RETURNING id INTO v_ent;

  -- T-B1: termo pendente => bloqueado (H6C-001 fail-closed, sem fallback)
  v_res := public.fn_entrega_valor_faturavel_v1(v_ent);
  INSERT INTO h6c_res VALUES ('B1 termo pending bloqueia faturamento',
    (v_res->>'origem') = 'bloqueado' AND (v_res->>'motivo') = 'condicao_b2b_nao_liberada', v_res::text);

  -- T-B2: guard rejeita mesmo em modo manual
  BEGIN
    PERFORM public.fn_entrega_guard_faturamento_v1(v_ent, 1);
    INSERT INTO h6c_res VALUES ('B2 guard bloqueia condicao pendente', false, 'nao levantou excecao');
  EXCEPTION WHEN others THEN
    INSERT INTO h6c_res VALUES ('B2 guard bloqueia condicao pendente',
      SQLERRM LIKE '%condicao_b2b_bloqueada%', SQLERRM);
  END;

  -- aprova o termo canônico
  UPDATE public.partner_order_payment_terms SET approval_status = 'approved' WHERE id = v_terms;

  -- T-B3: sem conferência => valor integral do snapshot canônico (1470)
  v_res := public.fn_entrega_valor_faturavel_v1(v_ent);
  INSERT INTO h6c_res VALUES ('B3 integral usa final_amount do termo canonico',
    (v_res->>'origem') = 'B2B_PAYMENT_TERMS_SNAPSHOT' AND (v_res->>'valor')::numeric = 1470, v_res::text);

  -- conferência multiproduto: produto A aceito, produto B recusado
  INSERT INTO public.estoque_embalagens(codigo_embalagem, lote_id, produto_id, volume, quantidade)
    VALUES ('H6C-A', v_lote, v_prod_a, 10, 1) RETURNING id INTO v_emb_a;
  INSERT INTO public.estoque_embalagens(codigo_embalagem, lote_id, produto_id, volume, quantidade)
    VALUES ('H6C-B', v_lote, v_prod_b, 10, 1) RETURNING id INTO v_emb_b;
  INSERT INTO public.entrega_conferencia_itens(entrega_id, embalagem_id, status, quantidade, motivo)
    VALUES (v_ent, v_emb_a, 'aceito', 1, NULL),
           (v_ent, v_emb_b, 'recusado', 1, 'harness h6c recusa');

  -- T-B4 (H6C-002): rateio econômico por produto, não por volume global.
  -- aceito = 1000/1400 => 1470 * 0,714286 = 1050,00
  v_res := public.fn_entrega_valor_faturavel_v1(v_ent);
  v_num := (v_res->>'valor')::numeric;
  INSERT INTO h6c_res VALUES ('B4 parcial multiproduto rateia por preco do item',
    v_num = 1050.00, v_res::text);

  -- T-B5: valor parcial nunca excede o snapshot integral
  INSERT INTO h6c_res VALUES ('B5 parcial <= integral', v_num < 1470, 'valor=' || v_num);

  -- T-B6 (H6C-003): entrega -> AR entra no ciclo de crédito B2B
  SELECT id INTO v_cat FROM public.financial_categories ORDER BY created_at LIMIT 1;
  SELECT user_id INTO v_user FROM public.profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cli FROM public.clientes ORDER BY nome LIMIT 1;
  INSERT INTO public.accounts_receivable(origin_type, origin_id, description, category_id,
      total_amount, first_due_date, created_by, customer_id)
    VALUES ('DELIVERY', v_ent, 'H6C harness', v_cat, v_num, current_date + 30, v_user, v_cli)
    RETURNING id INTO v_ar;
  UPDATE public.entregas SET receivable_id = v_ar WHERE id = v_ent;

  SELECT partner_id = (SELECT partner_id FROM public.partner_orders WHERE id = v_order)
    INTO v_ok FROM public.accounts_receivable WHERE id = v_ar;
  INSERT INTO h6c_res VALUES ('B6 recebivel recebe partner_id do pedido', COALESCE(v_ok,false), v_ar::text);

  SELECT count(*)::int INTO v_links FROM public.partner_order_financial_links WHERE partner_order_id = v_order;
  INSERT INTO h6c_res VALUES ('B7 vinculo financeiro criado', v_links = 1, 'links=' || v_links);

  SELECT receivable_generated INTO v_ok FROM public.partner_orders WHERE id = v_order;
  INSERT INTO h6c_res VALUES ('B8 pedido deixa de ser comprometido nao faturado', COALESCE(v_ok,false), '');

  -- T-B9 (H6C-004): replay do faturamento não duplica vínculo
  BEGIN
    UPDATE public.entregas SET receivable_id = NULL WHERE id = v_ent;
    v_txt := 'faturamento da entrega pode ser desfeito (sem guarda)';
    v_ok := false;
  EXCEPTION WHEN others THEN v_ok := true; v_txt := SQLERRM;
  END;
  INSERT INTO h6c_res VALUES ('B9 replay/estorno do faturamento bloqueado na entrega', v_ok, v_txt);
  SELECT count(*)::int INTO v_links FROM public.partner_order_financial_links WHERE partner_order_id = v_order;
  INSERT INTO h6c_res VALUES ('B9b vinculo unico apos tentativa de replay', v_links = 1, 'links=' || v_links);

  -- T-B10 (H6C-003): exposição de crédito não conta em dobro
  BEGIN
    v_res := public.fn_b2b_credit_exposure(v_partner);
    v_txt := v_res::text;
    v_ok := NOT ((v_res ? 'comprometido_nao_faturado')
                 AND (v_res->>'comprometido_nao_faturado')::numeric > 0
                 AND (v_res->>'saldo_em_aberto')::numeric > 0
                 AND (v_res->>'comprometido_nao_faturado')::numeric = v_num
                 AND (v_res->>'saldo_em_aberto')::numeric = v_num);
  EXCEPTION WHEN others THEN v_ok := false; v_txt := SQLERRM;
  END;
  INSERT INTO h6c_res VALUES ('B10 exposicao de credito sem dupla contagem', v_ok, v_txt);
END
$harness$;

SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS r, teste, detalhe FROM h6c_res ORDER BY teste;

ROLLBACK;
