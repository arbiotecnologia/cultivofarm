CREATE OR REPLACE FUNCTION public.create_partner_order_secure(p_partner_id uuid, p_observacoes text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb, p_requested_delivery_date date DEFAULT NULL::date, p_payment_plan_id uuid DEFAULT NULL::uuid, p_first_due_date date DEFAULT NULL::date, p_installment_count integer DEFAULT NULL::integer, p_expected_cart_hash text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean; v_is_finance boolean; v_is_gestor boolean; v_is_internal boolean;
  v_is_partner boolean; v_is_partner_tech boolean; v_user_partner uuid;
  v_order_id uuid; v_numero text; v_plan record; v_cart jsonb; v_line jsonb;
  v_quote boolean; v_table numeric(14,2); v_disc numeric(14,2); v_net numeric(14,2);
  v_interest numeric(14,2); v_final numeric(14,2); v_hash text;
  v_installments integer; v_first_due date; v_terms_id uuid;
  v_status partner_order_status; v_fin_status text; v_approval_status text;
  v_credit jsonb; v_block_reason text := NULL;
  v_inst numeric(14,2); v_accum numeric(14,2) := 0;
  v_amount_i numeric(14,2); v_principal_i numeric(14,2); v_interest_i numeric(14,2);
  v_due_i date; v_admin record; i integer;
  v_idem text; v_prev_idem record; v_result jsonb;
  v_items_canon text; v_req_fp text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  PERFORM platform_private.c2_order_actor_scope(v_uid, p_partner_id); -- c2_ord_scope
  PERFORM platform_private.c2_owner_order_guard(v_uid, p_partner_id, p_payment_plan_id); -- c2_ord_guard
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;
  IF p_payment_plan_id IS NULL THEN RAISE EXCEPTION 'payment_plan_required'; END IF;

  -- assinatura autoritativa obrigatoria para TODOS os chamadores
  IF NULLIF(btrim(COALESCE(p_expected_cart_hash,'')),'') IS NULL THEN
    RAISE EXCEPTION 'cart_hash_required';
  END IF;
  v_idem := NULLIF(btrim(COALESCE(p_idempotency_key,'')),'');
  IF v_idem IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF length(v_idem) > 120 THEN RAISE EXCEPTION 'invalid_idempotency_key'; END IF;

  -- ---------------------------------------------------------------
  -- request fingerprint canônico: reqfp_v2
  -- Cobre todos os parâmetros materialmente capazes de alterar o
  -- pedido resultante. Itens são normalizados (tipo|id|quantidade
  -- numérica canônica) e ordenados deterministicamente; textos são
  -- normalizados por btrim. cart_hash continua validado à parte.
  -- ---------------------------------------------------------------
  SELECT COALESCE(string_agg(t, ';' ORDER BY t), '')
    INTO v_items_canon
    FROM (
      SELECT lower(COALESCE(btrim(l->>'item_tipo'), '-')) || '|' ||
             lower(COALESCE(btrim(l->>'item_id'), '-'))   || '|' ||
             COALESCE(trim(to_char(COALESCE(NULLIF(btrim(l->>'quantidade'),'')::numeric, 0),
                                   'FM9999999990.000000')), '0')
             || CASE WHEN jsonb_typeof(l) = 'object' AND l ? 'packaging_id' THEN '|pk=' || lower(COALESCE(btrim(l->>'packaging_id'),'-')) ELSE '' END AS t
        FROM jsonb_array_elements(COALESCE(p_items,'[]'::jsonb)) AS l
    ) s;

  v_req_fp := encode(sha256(convert_to(
      'reqfp_v2'
      || '|partner='   || p_partner_id::text
      || '|plan='      || COALESCE(p_payment_plan_id::text,'-')
      || '|delivery='  || COALESCE(p_requested_delivery_date::text,'-')
      || '|firstdue='  || COALESCE(p_first_due_date::text,'-')
      || '|inst='      || COALESCE(p_installment_count::text,'-')
      || '|obs='       || COALESCE(btrim(p_observacoes),'-')
      || '|items='     || v_items_canon
    ,'UTF8')),'hex');

  v_is_admin        := has_role(v_uid,'administrador'::app_role);
  v_is_finance      := has_role(v_uid,'financeiro'::app_role);
  v_is_gestor       := has_role(v_uid,'gestor_comercial'::app_role);
  v_is_internal     := v_is_admin OR v_is_finance OR v_is_gestor;
  v_is_partner      := has_role(v_uid,'parceiro_b2b'::app_role);
  v_is_partner_tech := has_role(v_uid,'parceiro_b2b_tecnico'::app_role);
  v_user_partner    := public.get_user_partner_id();

  IF has_role(v_uid,'cliente_produtor'::app_role) AND NOT (v_is_internal OR v_is_partner) THEN
    RAISE EXCEPTION 'PRODUCER_DIRECT_NOT_ENABLED';
  END IF;

  IF v_is_partner_tech AND NOT (v_is_internal OR v_is_partner) THEN
    RAISE EXCEPTION 'partner_tech_cannot_create_order';
  END IF;

  IF NOT v_is_internal THEN
    IF NOT v_is_partner OR v_user_partner IS NULL OR v_user_partner <> p_partner_id THEN
      RAISE EXCEPTION 'forbidden_partner';
    END IF;
  END IF;

  PERFORM 1 FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  -- idempotencia (lock deterministico #1: parceiro+chave)
  PERFORM platform_private.c2_attempt_dispatch_guard(v_uid,p_partner_id,v_idem);
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_idem:' || p_partner_id::text || ':' || v_idem, 0));
  -- c2_attempt_closure_v2: a espera no lock pode atravessar revogações; revalida a
  -- autorização canônica APÓS o lock e antes de revelar replay ou criar (ponto de
  -- linearização = esta instrução; revogação confirmada depois dela não é observada).
  PERFORM platform_private.c2_partner_order_attempt_authz(v_uid, p_partner_id);
  IF NOT EXISTS(SELECT 1 FROM platform_private.partner_order_attempt_journal j JOIN public.profiles p ON p.user_id=j.actor_id AND p.organization_id=j.organization_id AND p.ativo WHERE j.actor_id=v_uid AND j.partner_id=p_partner_id AND j.idempotency_key=v_idem) THEN RAISE EXCEPTION 'C2DJ_SCOPE_CHANGED' USING ERRCODE='42501'; END IF;
  -- Fechamento durável sob ESTE MESMO lock: recusa envio tardio antes de qualquer efeito.
  -- (Corpos antigos em voo são cobertos pelo trigger c2_attempt_closure_guard.)
  IF EXISTS (SELECT 1 FROM platform_private.partner_order_idempotency_closures c
              WHERE c.partner_id = p_partner_id AND c.idempotency_key = v_idem) THEN
    RAISE EXCEPTION 'idempotency_key_closed';
  END IF;
  SELECT * INTO v_prev_idem FROM public.partner_order_idempotency
   WHERE partner_id = p_partner_id AND idempotency_key = v_idem;
  IF FOUND THEN
    -- linhas históricas sem fingerprint não podem ser reexecutadas em
    -- silêncio apenas com cart_hash: fail-safe, sem criar pedido.
    IF v_prev_idem.request_fingerprint IS NULL THEN
      RAISE EXCEPTION 'idempotency_legacy_unverifiable';
    END IF;
    IF v_prev_idem.cart_hash IS DISTINCT FROM p_expected_cart_hash THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    IF v_prev_idem.request_fingerprint IS DISTINCT FROM v_req_fp THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN v_prev_idem.result_snapshot;
  END IF;

  SELECT * INTO v_plan FROM public.commercial_payment_plans WHERE id = p_payment_plan_id;
  IF NOT FOUND OR NOT platform_private.commercial_plan_partner_visible(p_payment_plan_id,p_partner_id) THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF NOT public.fn_b2b_plan_selectable(v_plan.id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;
  IF v_plan.active = false THEN RAISE EXCEPTION 'plan_inactive'; END IF;
  IF v_plan.monthly_interest_percent < 0 THEN RAISE EXCEPTION 'invalid_interest_rate'; END IF;
  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;

  v_credit := public.fn_b2b_credit_exposure(p_partner_id, 0, NULL);
  IF COALESCE((v_credit->>'block_if_overdue')::boolean,false)
     AND COALESCE((v_credit->>'tem_vencidos')::boolean,false) THEN
    RAISE EXCEPTION 'credit_blocked_overdue';
  END IF;

  IF NOT v_is_internal THEN
    v_installments := GREATEST(COALESCE(v_plan.installment_count,1),1);
  ELSE
    IF p_installment_count IS NOT NULL AND p_installment_count <= 0 THEN
      RAISE EXCEPTION 'invalid_installment_count';
    END IF;
    v_installments := GREATEST(COALESCE(p_installment_count, v_plan.installment_count, 1), 1);
  END IF;

  PERFORM platform_private.b2b_packaging_lock(p_items); -- b2b_pack_v1
  v_cart  := public.fn_resolve_b2b_cart(p_partner_id, p_payment_plan_id, p_items, current_date);
  v_quote := COALESCE((v_cart->>'quote_required')::boolean,false);
  v_table := (v_cart->>'table_amount')::numeric;
  v_disc  := (v_cart->>'discount_amount')::numeric;
  v_net   := (v_cart->>'net_amount')::numeric;
  v_final := CASE WHEN v_quote THEN 0
                  ELSE public.fn_b2b_apply_interest(v_net, v_plan.interest_type,
                         v_plan.monthly_interest_percent, v_plan.months_count) END;

  v_hash := public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final);
  IF p_expected_cart_hash <> v_hash THEN
    RAISE EXCEPTION 'price_changed';
  END IF;

  IF v_quote THEN v_table := 0; v_disc := 0; v_net := 0; END IF;
  v_interest := ROUND(v_final - v_net, 2);

  IF NOT v_quote AND v_plan.minimum_order_amount IS NOT NULL AND v_table < v_plan.minimum_order_amount THEN
    RAISE EXCEPTION 'below_minimum_order_amount';
  END IF;

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
    IF NOT v_is_internal OR NOT (v_plan.requires_financial_approval OR v_plan.requires_guarantee) THEN
      v_first_due := current_date + v_plan.max_days;
    ELSE
      v_fin_status := 'pending'; v_approval_status := 'pending';
    END IF;
  END IF;

  IF v_quote THEN
    v_status := 'aguardando_cotacao'::partner_order_status;
  ELSE
    -- lock deterministico #2: credito do parceiro
    PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || p_partner_id::text, 0));
    v_credit := public.fn_b2b_credit_exposure(p_partner_id, v_final, NULL);

    IF COALESCE((v_credit->>'block_if_overdue')::boolean,false)
       AND COALESCE((v_credit->>'tem_vencidos')::boolean,false) THEN
      RAISE EXCEPTION 'credit_blocked_overdue';
    END IF;

    IF COALESCE((v_credit->>'credit_limit')::numeric,0) > 0
       AND (v_credit->>'exposicao_projetada')::numeric > (v_credit->>'credit_limit')::numeric THEN
      IF COALESCE(v_credit->>'credit_limit_action','block') = 'approval_required' THEN
        v_status := 'aguardando_aprovacao_credito'::partner_order_status;
        v_block_reason := 'limite_excedido';
      ELSE
        RAISE EXCEPTION 'credit_limit_exceeded';
      END IF;
    ELSE
      v_status := 'em_analise_comercial'::partner_order_status;
    END IF;
  END IF;

  -- Issue only after canonical role/partner/plan/cart/hash/credit checks and idempotent replay.
  IF NOT v_is_internal AND platform_private.c2_owner_order_create_allowed(v_uid,p_partner_id) THEN
    PERFORM platform_private.issue_ticket('c2_external_order_create',p_partner_id);
  END IF;
  INSERT INTO public.partner_orders(
    partner_id, status, subtotal, desconto_total, total, observacoes, created_by,
    requested_delivery_date, ready_for_production, payment_plan_id, payment_condition_status,
    credit_block_reason
  ) VALUES (
    p_partner_id, v_status, 0, 0, 0, NULLIF(p_observacoes,''), v_uid,
    p_requested_delivery_date, false, p_payment_plan_id,
    CASE WHEN v_quote THEN 'quote_required' ELSE 'defined' END,
    v_block_reason
  ) RETURNING id, numero INTO v_order_id, v_numero;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_cart->'lines') LOOP
    INSERT INTO public.partner_order_items(
      order_id, product_id, microrganismo_id, quantidade, preco_unitario,
      desconto_percentual, subtotal, unidade_medida, volume_ml,
      produto_nome_snapshot, produto_codigo_snapshot,
      preco_tabela_snapshot, desconto_percentual_snapshot, preco_unitario_final_snapshot,
      pricing_mode_snapshot, price_source_snapshot, base_price_snapshot,
      condition_price_snapshot, plan_discount_percent_snapshot,
      unit_type_snapshot, volume_ml_snapshot, price_rule_id_snapshot,
      packaging_id_snapshot, packaging_codigo_snapshot, packaging_version_snapshot,
      packaging_peso_liquido_kg_snapshot, packaging_unidade_conteudo_snapshot, packaging_price_id_snapshot
    ) VALUES (
      v_order_id,
      CASE WHEN v_line->>'item_tipo'='produto' THEN (v_line->>'item_id')::uuid END,
      CASE WHEN v_line->>'item_tipo'='microrganismo' THEN (v_line->>'item_id')::uuid END,
      (v_line->>'quantidade')::numeric,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'final_unit_price')::numeric, 0) END,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'plan_discount_percent')::numeric, 0) END,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'line_final_amount')::numeric, 0) END,
      v_line->>'unidade_medida',
      NULLIF(v_line->>'volume_ml','')::numeric,
      v_line->>'nome', v_line->>'codigo',
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'base_price')::numeric, 0) END,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'plan_discount_percent')::numeric, 0) END,
      CASE WHEN v_quote THEN 0 ELSE COALESCE((v_line->>'final_unit_price')::numeric, 0) END,
      v_line->>'pricing_mode', v_line->>'price_source',
      CASE WHEN v_quote THEN NULL ELSE NULLIF(v_line->>'base_price','')::numeric END,
      CASE WHEN v_quote THEN NULL ELSE NULLIF(v_line->>'condition_price','')::numeric END,
      CASE WHEN v_quote THEN NULL ELSE NULLIF(v_line->>'plan_discount_percent','')::numeric END,
      v_line->>'unidade_medida',
      NULLIF(v_line->>'volume_ml','')::numeric,
      NULLIF(v_line->>'rule_id','')::uuid,
      NULLIF(v_line->>'packaging_id','')::uuid, v_line->>'packaging_codigo', NULLIF(v_line->>'packaging_version','')::integer,
      NULLIF(v_line->>'peso_liquido_kg','')::numeric, v_line->>'unidade_conteudo', NULLIF(v_line->>'packaging_price_id','')::uuid
    );
  END LOOP;

  IF NOT v_quote THEN
    INSERT INTO public.partner_order_payment_terms(
      partner_order_id, payment_plan_id, plan_name_snapshot, plan_code_snapshot,
      discount_percent_snapshot, monthly_interest_percent_snapshot, months_count_snapshot,
      installment_count, first_due_date, interest_type_snapshot,
      table_amount, discount_amount, net_amount_after_discount,
      financial_interest_amount, final_amount, approval_status, created_by,
      pricing_mode_snapshot, credit_decision_snapshot
    ) VALUES (
      v_order_id, v_plan.id, v_plan.name, v_plan.code,
      v_plan.discount_percent, v_plan.monthly_interest_percent, v_plan.months_count,
      v_installments, v_first_due, v_plan.interest_type,
      v_table, v_disc, v_net, v_interest, v_final, v_approval_status, v_uid,
      COALESCE(v_plan.pricing_mode,'discount_from_base'), v_credit
    ) RETURNING id INTO v_terms_id;

    IF v_installments = 1 THEN
      INSERT INTO public.partner_order_payment_schedule(
        partner_order_id, payment_terms_id, installment_number, due_date,
        amount, principal_amount, interest_amount)
      VALUES (v_order_id, v_terms_id, 1, v_first_due, v_final, v_net, v_interest);
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
        VALUES (v_order_id, v_terms_id, i, v_due_i, v_amount_i, v_principal_i, v_interest_i);
      END LOOP;
    END IF;
  END IF;

  UPDATE public.partner_orders SET
    subtotal = v_table, desconto_total = v_disc, total = v_final,
    payment_terms_id = v_terms_id,
    table_amount = v_table, commercial_discount_amount = v_disc,
    net_amount_after_discount = v_net, financial_interest_amount = v_interest,
    final_amount_with_interest = v_final,
    requires_financial_approval = (NOT v_quote AND (v_plan.requires_financial_approval OR v_plan.requires_guarantee)),
    financial_approval_status = CASE WHEN v_quote THEN 'not_required' ELSE v_fin_status END
  WHERE id = v_order_id;

  INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
  VALUES (v_order_id, p_partner_id, v_uid, 'created_via_rpc',
          jsonb_build_object('numero', v_numero, 'total', v_final,
                             'items', jsonb_array_length(p_items),
                             'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
                             'quote_required', v_quote,
                             'cart_hash', v_hash,
                             'hash_validated', true,
                             'idempotency_key', v_idem,
                             'fingerprint_algo', 'reqfp_v2',
                             'credit_reason_code', v_credit->>'reason_code',
                             'requested_delivery_date', p_requested_delivery_date));

  IF NOT v_quote THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
    VALUES (v_order_id, p_partner_id, v_uid, 'payment_terms_defined',
            jsonb_build_object('payment_plan_id', v_plan.id, 'plan_code', v_plan.code,
              'table_amount', v_table, 'discount_amount', v_disc,
              'net_amount_after_discount', v_net, 'financial_interest_amount', v_interest,
              'final_amount', v_final, 'first_due_date', v_first_due,
              'installment_count', v_installments,
              'requires_financial_approval', (v_plan.requires_financial_approval OR v_plan.requires_guarantee)));
  END IF;

  IF COALESCE((v_credit->>'credit_limit')::numeric,0) <= 0 THEN
    INSERT INTO public.partner_order_audit_logs(order_id, partner_id, usuario_id, acao, dados_novos)
    VALUES (v_order_id, p_partner_id, v_uid, 'credit_limit_not_defined',
            jsonb_build_object('reason_code', v_credit->>'reason_code',
                               'exposicao_projetada', v_credit->>'exposicao_projetada'));
  END IF;

  FOR v_admin IN
    SELECT r AS user_id FROM platform_private.c2_order_internal_recipients(p_partner_id) r -- c2_ord_recipients
  LOOP
    INSERT INTO public.notificacoes_operacionais(usuario_id, tipo, titulo, mensagem, link)
    VALUES (v_admin.user_id,
            CASE WHEN v_quote THEN 'pedido_b2b_cotacao' ELSE 'pedido_b2b_novo' END,
            CASE WHEN v_quote THEN 'Cotação B2B ' || v_numero ELSE 'Novo pedido B2B ' || v_numero END,
            CASE WHEN v_quote THEN 'Pedido sob consulta aguardando cotação comercial.'
                 ELSE 'Novo pedido B2B aguardando análise comercial. Total: R$ ' || to_char(v_final,'FM999G999G990D00') END,
            '/comercial/pedidos-b2b');
  END LOOP;

  v_result := jsonb_build_object(
    'id', v_order_id, 'numero', v_numero,
    'status', v_status::text,
    'pricing_mode', COALESCE(v_plan.pricing_mode,'discount_from_base'),
    'quote_required', v_quote,
    'cart_hash', v_hash,
    'idempotency_key', v_idem,
    'subtotal', v_table, 'desconto_total', v_disc, 'total', v_final,
    'table_amount', v_table, 'discount_amount', v_disc,
    'net_amount_after_discount', v_net, 'financial_interest_amount', v_interest,
    'final_amount', v_final,
    'payment_terms_id', v_terms_id,
    'credit_reason_code', v_credit->>'reason_code',
    'credit_block_reason', v_block_reason,
    'requires_financial_approval', (NOT v_quote AND (v_plan.requires_financial_approval OR v_plan.requires_guarantee)),
    'financial_approval_status', CASE WHEN v_quote THEN 'not_required' ELSE v_fin_status END);

  INSERT INTO public.partner_order_idempotency(
    partner_id, idempotency_key, cart_hash, order_id, result_snapshot, created_by, request_fingerprint)
  VALUES (p_partner_id, v_idem, p_expected_cart_hash, v_order_id, v_result, v_uid, v_req_fp);

  DELETE FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope='c2_external_order_create' AND target=p_partner_id;
  RETURN v_result;
END
$function$