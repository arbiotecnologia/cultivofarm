CREATE OR REPLACE FUNCTION public.respond_b2b_order_quote_secure(p_order_id uuid, p_lines jsonb, p_first_due_date date DEFAULT NULL::date, p_installment_count integer DEFAULT NULL::integer, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean; v_is_gestor boolean;
  v_order record; v_plan record;
  v_line jsonb; v_item record; v_price numeric(14,4);
  v_count_lines integer; v_count_distinct integer; v_count_items integer;
  v_prev jsonb;
  v_table numeric(14,2); v_net numeric(14,2); v_final numeric(14,2); v_interest numeric(14,2);
  v_installments integer; v_first_due date; v_terms_id uuid;
  v_fin_status text; v_approval_status text;
  v_inst numeric(14,2); v_accum numeric(14,2) := 0;
  v_amount_i numeric(14,2); v_principal_i numeric(14,2); v_interest_i numeric(14,2);
  v_due_i date; i integer; v_final_status text; v_block_reason text := NULL;
  v_partner_user record; v_credit jsonb; v_new_status partner_order_status;
  v_pack public.partner_order_item_mass_snapshots; v_is_pack boolean; v_seller uuid; -- SOLID_PACK_QUOTE_V1
BEGIN

  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF; PERFORM platform_private.solid_quote_respond_authz(p_order_id); -- EXTERNAL_BUYER_QUOTE_V1
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  v_is_admin  := has_role(v_uid,'administrador'::app_role);
  v_is_gestor := has_role(v_uid,'gestor_comercial'::app_role);
  IF (v_is_admin OR v_is_gestor) IS NOT TRUE THEN  -- FAIL_CLOSED_V1
    RAISE EXCEPTION 'forbidden_quote_response';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'quote_incomplete';
  END IF;

  -- locks em ordem deterministica: (1) pedido/cotacao
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_quote:' || p_order_id::text, 0));

  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  PERFORM platform_private.solid_quote_respond_authz(p_order_id); -- reautoriza após lock do pedido
  IF v_order.status <> 'aguardando_cotacao'::partner_order_status THEN
    RAISE EXCEPTION 'order_not_in_quote_state';
  END IF;
  IF EXISTS(SELECT 1 FROM public.partner_order_payment_terms WHERE partner_order_id=p_order_id) THEN RAISE EXCEPTION 'B2B_INTERNAL_QUOTE_REVISION_UNAVAILABLE' USING ERRCODE='42501'; END IF; IF v_order.payment_plan_id IS NULL THEN RAISE EXCEPTION 'payment_plan_required'; END IF;

  -- (2) credito do parceiro
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || v_order.partner_id::text, 0));
  PERFORM platform_private.solid_quote_respond_authz(p_order_id); -- reautoriza após lock de crédito

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = v_order.payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF; IF public.fn_b2b_plan_selectable(v_plan.id) IS NOT TRUE THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;
  IF v_plan.active = false THEN RAISE EXCEPTION 'plan_inactive'; END IF;

  SELECT count(*) INTO v_count_items FROM public.partner_order_items WHERE order_id = p_order_id;
  IF v_count_items = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;

  SELECT count(*), count(DISTINCT (l->>'item_id')::uuid)
    INTO v_count_lines, v_count_distinct
    FROM jsonb_array_elements(p_lines) l;
  IF v_count_lines <> v_count_distinct THEN RAISE EXCEPTION 'quote_duplicate_line'; END IF;
  IF v_count_distinct <> v_count_items THEN RAISE EXCEPTION 'quote_incomplete'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'item_id', poi.id, 'preco_unitario', poi.preco_unitario,
           'subtotal', poi.subtotal,
           'pricing_mode_snapshot', poi.pricing_mode_snapshot,
           'price_source_snapshot', poi.price_source_snapshot)), '[]'::jsonb)
    INTO v_prev
    FROM public.partner_order_items poi WHERE poi.order_id = p_order_id;

  SELECT pa.commercial_owner_organization_id INTO v_seller FROM public.partner_accounts pa WHERE pa.id = v_order.partner_id;
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    -- SOLID_PACK_QUOTE_V1: a cotação só define preço; quantidade/unidade/embalagem do pedido original são imutáveis
    IF jsonb_typeof(v_line) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_line) k WHERE k NOT IN ('item_id','unit_price')) THEN
      RAISE EXCEPTION 'quote_line_immutable_field' USING ERRCODE='22023';
    END IF;
    BEGIN
      v_price := NULLIF(v_line->>'unit_price','')::numeric;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid_quote_price'; END;
    IF v_price IS NULL OR v_price <= 0 OR v_price > 10000000 THEN
      RAISE EXCEPTION 'invalid_quote_price';
    END IF;
    IF v_price <> ROUND(v_price, 4) THEN RAISE EXCEPTION 'invalid_quote_price_scale'; END IF;

    SELECT * INTO v_item FROM public.partner_order_items
     WHERE id = (v_line->>'item_id')::uuid AND order_id = p_order_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'quote_item_not_found'; END IF;
    SELECT * INTO v_pack FROM public.partner_order_item_mass_snapshots WHERE order_item_id = v_item.id;
    v_is_pack := FOUND;
    IF v_is_pack THEN  -- linha por EMBALAGEM inteira: preço em centavos, quantidade do contrato original
      IF v_pack.order_id IS DISTINCT FROM p_order_id OR v_pack.seller_organization_id IS DISTINCT FROM v_seller THEN
        RAISE EXCEPTION 'order_item_scope' USING ERRCODE='42501'; END IF;
      IF v_price <> ROUND(v_price, 2) THEN RAISE EXCEPTION 'invalid_quote_price_scale'; END IF;
      IF v_item.quantidade IS DISTINCT FROM v_pack.quantidade_venda OR v_item.unidade_medida IS DISTINCT FROM 'embalagem' THEN
        RAISE EXCEPTION 'quote_pack_quantity_mismatch' USING ERRCODE='22023'; END IF;
      -- LINE_AMOUNT_CAPACITY_V1: subtotal cabe em partner_order_items.subtotal numeric(12,2) — verificado antes do cast
      IF round(v_item.quantidade * v_price, 2) >= 10000000000 THEN
        RAISE EXCEPTION 'order_line_amount_out_of_range' USING ERRCODE='22023'; END IF;
    END IF;

    UPDATE public.partner_order_items SET
      preco_unitario                 = v_price,
      desconto_percentual            = 0,
      subtotal                       = ROUND(v_item.quantidade * v_price, 2),
      preco_tabela_snapshot          = v_price,
      desconto_percentual_snapshot   = 0,
      preco_unitario_final_snapshot  = v_price,
      pricing_mode_snapshot          = 'fixed_item_price',
      price_source_snapshot          = 'quote_manual',
      base_price_snapshot            = v_price,
      condition_price_snapshot       = v_price,
      plan_discount_percent_snapshot = 0
    WHERE id = v_item.id;
    IF v_is_pack THEN  -- preço aceito em registro próprio imutável; snapshot original (preço 0) intocado
      PERFORM platform_private.solid_mass_accept_quote_price(v_item.id, v_seller, v_price);
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(subtotal),0)::numeric(14,2) INTO v_table
    FROM public.partner_order_items WHERE order_id = p_order_id;
  v_net := v_table;

  IF v_plan.minimum_order_amount IS NOT NULL AND v_table < v_plan.minimum_order_amount THEN
    RAISE EXCEPTION 'below_minimum_order_amount';
  END IF;

  v_final := public.fn_b2b_apply_interest(v_net, v_plan.interest_type,
               v_plan.monthly_interest_percent, v_plan.months_count);
  v_interest := ROUND(v_final - v_net, 2);

  IF p_installment_count IS NOT NULL AND p_installment_count <= 0 THEN
    RAISE EXCEPTION 'invalid_installment_count';
  END IF;
  v_installments := GREATEST(COALESCE(p_installment_count, v_plan.installment_count, 1), 1);

  IF p_first_due_date IS NOT NULL AND p_first_due_date < current_date THEN
    RAISE EXCEPTION 'invalid_due_date';
  END IF;
  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);

  IF v_plan.requires_financial_approval OR v_plan.requires_guarantee THEN
    v_fin_status := 'pending'; v_approval_status := 'pending';
  ELSE
    v_fin_status := 'not_required'; v_approval_status := 'not_required';
  END IF;

  IF v_first_due > current_date + v_plan.max_days THEN
    IF NOT (v_plan.requires_financial_approval OR v_plan.requires_guarantee) THEN
      v_first_due := current_date + v_plan.max_days;
    ELSE
      v_fin_status := 'pending'; v_approval_status := 'pending';
    END IF;
  END IF;

  -- ---- DECISAO DE CREDITO SOBRE O TOTAL RECEM-COTADO -----------------
  -- o proprio pedido e excluido da exposicao para nao ser contado duas vezes
  v_credit := public.fn_b2b_credit_exposure(v_order.partner_id, v_final, p_order_id);

  IF COALESCE((v_credit->>'block_if_overdue')::boolean,false)
     AND COALESCE((v_credit->>'tem_vencidos')::boolean,false) THEN
    RAISE EXCEPTION 'credit_blocked_overdue';
  END IF;

  IF COALESCE((v_credit->>'credit_limit')::numeric,0) > 0
     AND (v_credit->>'exposicao_projetada')::numeric > (v_credit->>'credit_limit')::numeric THEN
    IF COALESCE(v_credit->>'credit_limit_action','block') = 'approval_required' THEN
      v_new_status := 'aguardando_aprovacao_credito'::partner_order_status;
      v_block_reason := 'limite_excedido';
    ELSE
      RAISE EXCEPTION 'credit_limit_exceeded';
    END IF;
  ELSE
    v_new_status := 'em_analise_comercial'::partner_order_status;
  END IF;

  DELETE FROM public.partner_order_payment_schedule WHERE partner_order_id = p_order_id;
  DELETE FROM public.partner_order_payment_terms WHERE partner_order_id = p_order_id;

  INSERT INTO public.partner_order_payment_terms(
    partner_order_id, payment_plan_id, plan_name_snapshot, plan_code_snapshot,
    discount_percent_snapshot, monthly_interest_percent_snapshot, months_count_snapshot,
    installment_count, first_due_date, interest_type_snapshot,
    table_amount, discount_amount, net_amount_after_discount,
    financial_interest_amount, final_amount, approval_status, created_by,
    pricing_mode_snapshot, credit_decision_snapshot
  ) VALUES (
    p_order_id, v_plan.id, v_plan.name, v_plan.code,
    0, v_plan.monthly_interest_percent, v_plan.months_count,
    v_installments, v_first_due, v_plan.interest_type,
    v_table, 0, v_net, v_interest, v_final, v_approval_status, v_uid,
    'fixed_item_price', v_credit
  ) RETURNING id INTO v_terms_id;

  IF v_installments = 1 THEN
    INSERT INTO public.partner_order_payment_schedule(
      partner_order_id, payment_terms_id, installment_number, due_date,
      amount, principal_amount, interest_amount)
    VALUES (p_order_id, v_terms_id, 1, v_first_due, v_final, v_net, v_interest);
  ELSE
    v_inst := ROUND(v_final / v_installments, 2);
    FOR i IN 1..v_installments LOOP
      IF i < v_installments THEN v_amount_i := v_inst; ELSE v_amount_i := ROUND(v_final - v_accum,2); END IF;
      v_accum := v_accum + v_amount_i;
      v_principal_i := ROUND(v_amount_i * (v_net / NULLIF(v_final,0)), 2);
      v_interest_i  := ROUND(v_amount_i - v_principal_i, 2);
      v_due_i := v_first_due + ((i-1)*30);
      INSERT INTO public.partner_order_payment_schedule(
        partner_order_id, payment_terms_id, installment_number, due_date,
        amount, principal_amount, interest_amount)
      VALUES (p_order_id, v_terms_id, i, v_due_i, v_amount_i, v_principal_i, v_interest_i);
    END LOOP;
  END IF;

  UPDATE public.partner_orders SET
    status = v_new_status,
    payment_condition_status = 'defined',
    credit_block_reason = v_block_reason,
    subtotal = v_table, desconto_total = 0, total = v_final,
    payment_terms_id = v_terms_id,
    table_amount = v_table, commercial_discount_amount = 0,
    net_amount_after_discount = v_net, financial_interest_amount = v_interest,
    final_amount_with_interest = v_final,
    requires_financial_approval = (v_plan.requires_financial_approval OR v_plan.requires_guarantee),
    financial_approval_status = v_fin_status
  WHERE id = p_order_id;

  SELECT status::text INTO v_final_status FROM public.partner_orders WHERE id = p_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (p_order_id, v_order.partner_id, v_uid, 'quote_responded',
          jsonb_build_object('items', v_prev,
                             'table_amount', v_order.table_amount,
                             'total', v_order.total,
                             'status', 'aguardando_cotacao'),
          jsonb_build_object('table_amount', v_table, 'final_amount', v_final,
                             'installment_count', v_installments,
                             'first_due_date', v_first_due,
                             'status', v_final_status,
                             'credit_block_reason', v_block_reason,
                             'credit_decision', v_credit,
                             'motivo', NULLIF(p_motivo,'')));

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (p_order_id, v_order.partner_id, v_uid, 'payment_terms_defined',
          jsonb_build_object('payment_plan_id', v_plan.id, 'plan_code', v_plan.code,
            'table_amount', v_table, 'discount_amount', 0,
            'net_amount_after_discount', v_net, 'financial_interest_amount', v_interest,
            'final_amount', v_final, 'first_due_date', v_first_due,
            'installment_count', v_installments,
            'credit_reason_code', v_credit->>'reason_code',
            'source', 'quote_response'));

  FOR v_partner_user IN
    SELECT pu.user_id FROM public.partner_users pu WHERE pu.partner_id = v_order.partner_id AND pu.revoked_at IS NULL
  LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_partner_user.user_id, 'pedido_b2b_cotacao_respondida',
            'Cotação respondida — pedido ' || v_order.numero,
            'A cotação do seu pedido foi respondida. Total: R$ ' || to_char(v_final,'FM999G999G990D00'),
            '/portal-parceiro/pedidos');
  END LOOP;

  RETURN jsonb_build_object(
    'id', p_order_id,
    'numero', v_order.numero,
    'status', v_final_status,
    'credit_block_reason', v_block_reason,
    'credit_reason_code', v_credit->>'reason_code',
    'table_amount', v_table,
    'net_amount_after_discount', v_net,
    'financial_interest_amount', v_interest,
    'final_amount', v_final,
    'installment_count', v_installments,
    'first_due_date', v_first_due,
    'payment_terms_id', v_terms_id,
    'requires_financial_approval', (v_plan.requires_financial_approval OR v_plan.requires_guarantee),
    'financial_approval_status', v_fin_status);
END $function$
;
