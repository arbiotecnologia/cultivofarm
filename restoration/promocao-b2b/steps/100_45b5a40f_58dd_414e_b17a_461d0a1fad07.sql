-- PACOTE DE PROMOCAO MOTOR B2B — passo 100
-- Idempotencia de checkout
-- Origem (historico, NAO modificado): supabase/migrations/20260729032021_45b5a40f-58dd-414e-b17a-461d0a1fad07.sql
-- sha256(origem) = 4a4da5b9a37d7753bac9c58e7755f4b9eb698156fd5b9cae39574ae009306325
-- Guarda de ambiente removida deste passo: a verificacao de destino e
-- centralizada e fail-closed em 000_preflight.sql (executado antes).
-- Forward-only. Nao contem fixtures, UUIDs de teste nem DROP destrutivo de dados.

-- ============ SIMULACAO ============
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
  v_financial_visible boolean;
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

  v_is_admin   := has_role(v_uid,'administrador'::app_role);
  v_is_finance := has_role(v_uid,'financeiro'::app_role);
  v_is_gestor  := has_role(v_uid,'gestor_comercial'::app_role);
  v_is_partner := has_role(v_uid,'parceiro_b2b'::app_role);
  v_is_tech    := has_role(v_uid,'parceiro_b2b_tecnico'::app_role);
  v_user_partner := public.get_user_partner_id();

  IF NOT (v_is_admin OR v_is_finance OR v_is_gestor) THEN
    IF NOT ((v_is_partner OR v_is_tech) AND v_user_partner IS NOT NULL AND v_user_partner = p_partner_id) THEN
      INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
      VALUES (NULL, p_partner_id, v_uid, 'simulate_payment_plan_forbidden',
              jsonb_build_object('plan_id', p_payment_plan_id));
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  -- tecnico de parceiro (sem papel comercial/financeiro) nao acessa dado financeiro de credito
  v_financial_visible := (v_is_admin OR v_is_finance OR v_is_gestor OR v_is_partner);

  SELECT id, ativo INTO v_partner FROM public.partner_accounts WHERE id = p_partner_id;
  IF NOT FOUND OR v_partner.ativo = false THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_plan.active = false THEN RAISE EXCEPTION 'plan_inactive'; END IF;
  IF v_plan.monthly_interest_percent < 0 THEN RAISE EXCEPTION 'invalid_interest_rate'; END IF;
  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;

  v_cart  := public.fn_resolve_b2b_cart(p_partner_id, p_payment_plan_id, p_items, current_date);
  v_quote := COALESCE((v_cart->>'quote_required')::boolean,false);
  v_table := (v_cart->>'table_amount')::numeric;
  v_disc  := (v_cart->>'discount_amount')::numeric;
  v_net   := (v_cart->>'net_amount')::numeric;

  IF v_quote THEN
    v_table := 0; v_disc := 0; v_net := 0;
  END IF;

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

  IF v_financial_visible THEN
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
  ELSE
    v_credit := NULL;
  END IF;

  RETURN jsonb_build_object(
    'partner_id', p_partner_id,
    'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
    'quote_required', v_quote,
    'items', v_cart->'lines',
    'cart_hash', public.fn_b2b_cart_hash(p_payment_plan_id, v_cart, v_final),
    'financial_visible', v_financial_visible,
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
END $function$;
REVOKE ALL ON FUNCTION public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date) TO authenticated, service_role;

-- ============ RESPOSTA DE COTACAO ============
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
  v_due_i date; i integer; v_final_status text; v_block_reason text;
  v_partner_user record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;

  v_is_admin  := has_role(v_uid,'administrador'::app_role);
  v_is_gestor := has_role(v_uid,'gestor_comercial'::app_role);
  IF NOT (v_is_admin OR v_is_gestor) THEN
    RAISE EXCEPTION 'forbidden_quote_response';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'quote_incomplete';
  END IF;

  -- serializa respostas concorrentes para o mesmo pedido
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_quote:' || p_order_id::text, 0));

  SELECT * INTO v_order FROM public.partner_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF v_order.status <> 'aguardando_cotacao'::partner_order_status THEN
    RAISE EXCEPTION 'order_not_in_quote_state';
  END IF;
  IF v_order.payment_plan_id IS NULL THEN RAISE EXCEPTION 'payment_plan_required'; END IF;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = v_order.payment_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF v_plan.active = false THEN RAISE EXCEPTION 'plan_inactive'; END IF;

  SELECT count(*) INTO v_count_items FROM public.partner_order_items WHERE order_id = p_order_id;
  IF v_count_items = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;

  SELECT count(*), count(DISTINCT (l->>'item_id')::uuid)
    INTO v_count_lines, v_count_distinct
    FROM jsonb_array_elements(p_lines) l;
  IF v_count_lines <> v_count_distinct THEN RAISE EXCEPTION 'quote_duplicate_line'; END IF;
  IF v_count_distinct <> v_count_items THEN RAISE EXCEPTION 'quote_incomplete'; END IF;

  -- snapshot anterior dos itens (auditoria)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'item_id', poi.id, 'preco_unitario', poi.preco_unitario,
           'subtotal', poi.subtotal,
           'pricing_mode_snapshot', poi.pricing_mode_snapshot,
           'price_source_snapshot', poi.price_source_snapshot)), '[]'::jsonb)
    INTO v_prev
    FROM public.partner_order_items poi WHERE poi.order_id = p_order_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
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

  DELETE FROM public.partner_order_payment_schedule WHERE partner_order_id = p_order_id;
  DELETE FROM public.partner_order_payment_terms WHERE partner_order_id = p_order_id;

  INSERT INTO public.partner_order_payment_terms(
    partner_order_id, payment_plan_id, plan_name_snapshot, plan_code_snapshot,
    discount_percent_snapshot, monthly_interest_percent_snapshot, months_count_snapshot,
    installment_count, first_due_date, interest_type_snapshot,
    table_amount, discount_amount, net_amount_after_discount,
    financial_interest_amount, final_amount, approval_status, created_by,
    pricing_mode_snapshot
  ) VALUES (
    p_order_id, v_plan.id, v_plan.name, v_plan.code,
    0, v_plan.monthly_interest_percent, v_plan.months_count,
    v_installments, v_first_due, v_plan.interest_type,
    v_table, 0, v_net, v_interest, v_final, v_approval_status, v_uid,
    'fixed_item_price'
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
    status = 'em_analise_comercial'::partner_order_status,
    payment_condition_status = 'defined',
    subtotal = v_table, desconto_total = 0, total = v_final,
    payment_terms_id = v_terms_id,
    table_amount = v_table, commercial_discount_amount = 0,
    net_amount_after_discount = v_net, financial_interest_amount = v_interest,
    final_amount_with_interest = v_final,
    requires_financial_approval = (v_plan.requires_financial_approval OR v_plan.requires_guarantee),
    financial_approval_status = v_fin_status
  WHERE id = p_order_id;

  SELECT status::text, credit_block_reason INTO v_final_status, v_block_reason
    FROM public.partner_orders WHERE id = p_order_id;

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
                             'motivo', NULLIF(p_motivo,'')));

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (p_order_id, v_order.partner_id, v_uid, 'payment_terms_defined',
          jsonb_build_object('payment_plan_id', v_plan.id, 'plan_code', v_plan.code,
            'table_amount', v_table, 'discount_amount', 0,
            'net_amount_after_discount', v_net, 'financial_interest_amount', v_interest,
            'final_amount', v_final, 'first_due_date', v_first_due,
            'installment_count', v_installments,
            'source', 'quote_response'));

  FOR v_partner_user IN
    SELECT pu.user_id FROM public.partner_users pu WHERE pu.partner_id = v_order.partner_id
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
    'table_amount', v_table,
    'net_amount_after_discount', v_net,
    'financial_interest_amount', v_interest,
    'final_amount', v_final,
    'installment_count', v_installments,
    'first_due_date', v_first_due,
    'payment_terms_id', v_terms_id,
    'requires_financial_approval', (v_plan.requires_financial_approval OR v_plan.requires_guarantee),
    'financial_approval_status', v_fin_status);
END $function$;
REVOKE ALL ON FUNCTION public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text) TO authenticated, service_role;
