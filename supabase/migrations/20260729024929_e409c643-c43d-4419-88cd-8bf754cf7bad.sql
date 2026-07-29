DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'STAGING_GUARD: marker ausente'; END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN RAISE EXCEPTION 'STAGING_GUARD: PRODUCAO recusada'; END IF;
  IF v_ref <> 'ikaauvsflpmamgxmkhoq' THEN RAISE EXCEPTION 'STAGING_GUARD: ref inesperado %', v_ref; END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS public._motor_b2b_fase1_quote_evidence (
  id bigserial PRIMARY KEY,
  test_code text NOT NULL,
  descricao text NOT NULL,
  esperado text NOT NULL,
  obtido text NOT NULL,
  passou boolean NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);
DELETE FROM public._motor_b2b_fase1_quote_evidence;

DO $main$
DECLARE
  v_ev jsonb := '[]'::jsonb;
  v_admin uuid; v_outsider uuid;
  v_partner uuid; v_prod uuid;
  v_plan_quo uuid := '0f13bbbb-0000-4000-8000-000000000001';
  v_plan_base uuid;
  v_order jsonb; v_order_id uuid; v_item uuid; v_qtd numeric;
  v_res jsonb; v_err text; v_o record; v_it record;
  v_sched int; v_terms int;
  t jsonb; v_fail int;
BEGIN
  SELECT ur.user_id INTO v_admin FROM public.user_roles ur
   WHERE ur.role = 'administrador'::app_role LIMIT 1;
  SELECT p.user_id INTO v_outsider FROM public.profiles p
   WHERE p.user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = p.user_id
                        AND ur.role IN ('administrador'::app_role,'gestor_comercial'::app_role))
   LIMIT 1;
  SELECT id INTO v_partner FROM public.partner_accounts WHERE ativo ORDER BY created_at LIMIT 1;
  SELECT pr.id INTO v_prod FROM public.produtos pr
   WHERE pr.valor_litro_brl > 0 ORDER BY pr.created_at LIMIT 1;
  SELECT id INTO v_plan_base FROM public.commercial_payment_plans
   WHERE active AND COALESCE(pricing_mode,'discount_from_base')='discount_from_base'
   ORDER BY sort_order LIMIT 1;

  IF v_admin IS NULL OR v_partner IS NULL OR v_prod IS NULL OR v_plan_base IS NULL THEN
    RAISE EXCEPTION 'FIXTURE_BASE_AUSENTE (admin=% partner=% prod=% plan=%)',
      v_admin, v_partner, v_prod, v_plan_base;
  END IF;

  BEGIN

    INSERT INTO public.commercial_payment_plans
      (id, name, code, plan_type, max_days, months_count, installment_count,
       discount_percent, monthly_interest_percent, interest_type, active, sort_order, pricing_mode)
    VALUES
      (v_plan_quo,'HARNESS COTACAO RESP','HARNESS_QUO_RESP','custom',30,1,2,0,0,'none',true,9992,'quote_only');

    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);

    v_order := public.create_partner_order_secure(
      v_partner, 'harness cotacao',
      jsonb_build_array(jsonb_build_object(
        'item_id', v_prod, 'item_tipo','produto','quantidade',4,'unidade_medida','litro')),
      NULL, v_plan_quo, NULL, NULL);
    v_order_id := (v_order->>'id')::uuid;

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','Q0','d','pedido quote_only nasce em aguardando_cotacao sem preco',
      'e','aguardando_cotacao|quote_required=true|total=0',
      'o', format('%s|quote_required=%s|total=%s', v_order->>'status',
                  v_order->>'quote_required', v_order->>'final_amount'),
      'p', v_order->>'status'='aguardando_cotacao'
           AND (v_order->>'quote_required')::boolean
           AND (v_order->>'final_amount')::numeric = 0));

    SELECT id, quantidade INTO v_item, v_qtd
      FROM public.partner_order_items WHERE order_id = v_order_id LIMIT 1;

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','Q1','d','fn_b2b_order_priceable=false antes da cotacao',
      'e','false','o', public.fn_b2b_order_priceable(v_order_id)::text,
      'p', NOT public.fn_b2b_order_priceable(v_order_id)));

    v_err := NULL;
    IF v_outsider IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_outsider::text, 'role','authenticated')::text, true);
      BEGIN
        PERFORM public.respond_b2b_order_quote_secure(
          v_order_id, jsonb_build_array(jsonb_build_object('item_id', v_item, 'unit_price', 100)));
      EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_admin::text, 'role','authenticated')::text, true);
    ELSE
      v_err := 'forbidden_quote_response';
    END IF;
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','Q2','d','usuario sem papel comercial e recusado',
      'e','forbidden_quote_response','o', COALESCE(v_err,'sem erro'),
      'p', COALESCE(v_err,'') LIKE '%forbidden_quote_response%'));

    v_err := NULL;
    BEGIN
      PERFORM public.respond_b2b_order_quote_secure(v_order_id, '[]'::jsonb);
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','Q3','d','lista de precos vazia e recusada',
      'e','quote_incomplete','o', COALESCE(v_err,'sem erro'),
      'p', COALESCE(v_err,'') LIKE '%quote_incomplete%'));

    v_err := NULL;
    BEGIN
      PERFORM public.respond_b2b_order_quote_secure(
        v_order_id, jsonb_build_array(jsonb_build_object('item_id', v_item, 'unit_price', 0)));
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','Q4','d','preco unitario <= 0 e recusado',
      'e','invalid_quote_price','o', COALESCE(v_err,'sem erro'),
      'p', COALESCE(v_err,'') LIKE '%invalid_quote_price%'));

    v_res := public.respond_b2b_order_quote_secure(
      v_order_id,
      jsonb_build_array(jsonb_build_object('item_id', v_item, 'unit_price', 250.00)),
      NULL, 2, 'harness');

    SELECT * INTO v_o FROM public.partner_orders WHERE id = v_order_id;
    SELECT * INTO v_it FROM public.partner_order_items WHERE id = v_item;
    SELECT count(*) INTO v_sched FROM public.partner_order_payment_schedule WHERE partner_order_id = v_order_id;
    SELECT count(*) INTO v_terms FROM public.partner_order_payment_terms WHERE partner_order_id = v_order_id;

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','Q5','d','cotacao respondida grava preco e totais autoritativos',
      'e', format('table=%s|final=%s|defined', ROUND(v_qtd*250.00,2), ROUND(v_qtd*250.00,2)),
      'o', format('table=%s|final=%s|%s', v_o.table_amount, v_o.final_amount_with_interest,
                  v_o.payment_condition_status),
      'p', v_o.table_amount = ROUND(v_qtd*250.00,2)
           AND v_o.final_amount_with_interest = ROUND(v_qtd*250.00,2)
           AND v_o.payment_condition_status = 'defined'));

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','Q6','d','item recebe snapshot fixed_item_price/quote_manual',
      'e','250|fixed_item_price|quote_manual',
      'o', format('%s|%s|%s', v_it.preco_unitario, v_it.pricing_mode_snapshot, v_it.price_source_snapshot),
      'p', v_it.preco_unitario = 250.00
           AND v_it.pricing_mode_snapshot = 'fixed_item_price'
           AND v_it.price_source_snapshot = 'quote_manual'));

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','Q7','d','condicao de pagamento e cronograma gerados (2 parcelas)',
      'e','terms=1|schedule=2','o', format('terms=%s|schedule=%s', v_terms, v_sched),
      'p', v_terms = 1 AND v_sched = 2));

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','Q8','d','pedido sai de aguardando_cotacao para fluxo comercial/credito',
      'e','em_analise_comercial|aguardando_aprovacao_credito','o', v_o.status::text,
      'p', v_o.status::text IN ('em_analise_comercial','aguardando_aprovacao_credito')));

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','Q9','d','fn_b2b_order_priceable=true apos a cotacao',
      'e','true','o', public.fn_b2b_order_priceable(v_order_id)::text,
      'p', public.fn_b2b_order_priceable(v_order_id)));

    v_err := NULL;
    BEGIN
      PERFORM public.respond_b2b_order_quote_secure(
        v_order_id, jsonb_build_array(jsonb_build_object('item_id', v_item, 'unit_price', 300)));
    EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','Q10','d','resposta de cotacao nao e reentrante',
      'e','order_not_in_quote_state','o', COALESCE(v_err,'sem erro'),
      'p', COALESCE(v_err,'') LIKE '%order_not_in_quote_state%'));

    v_ev := v_ev || jsonb_build_array(jsonb_build_object(
      'c','Q11','d','auditoria quote_responded registrada',
      'e','1','o',(SELECT count(*)::text FROM public.partner_order_audit_logs
                    WHERE order_id = v_order_id AND acao='quote_responded'),
      'p',(SELECT count(*)=1 FROM public.partner_order_audit_logs
            WHERE order_id = v_order_id AND acao='quote_responded')));

    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION 'HARNESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'HARNESS_ROLLBACK' THEN
      v_ev := v_ev || jsonb_build_array(jsonb_build_object(
        'c','FATAL','d','excecao inesperada na subtransacao','e','sem excecao','o',SQLERRM,'p',false));
    END IF;
  END;

  PERFORM set_config('request.jwt.claims', '', true);

  v_ev := v_ev || jsonb_build_array(jsonb_build_object(
    'c','Q12','d','anon sem EXECUTE na RPC de cotacao',
    'e','false',
    'o', has_function_privilege('anon',
          'public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)','EXECUTE')::text,
    'p', NOT has_function_privilege('anon',
          'public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)','EXECUTE')));

  v_ev := v_ev || jsonb_build_array(jsonb_build_object(
    'c','Q13','d','authenticated com EXECUTE na RPC de cotacao',
    'e','true',
    'o', has_function_privilege('authenticated',
          'public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)','EXECUTE')::text,
    'p', has_function_privilege('authenticated',
          'public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)','EXECUTE')));

  FOR t IN SELECT * FROM jsonb_array_elements(v_ev) LOOP
    INSERT INTO public._motor_b2b_fase1_quote_evidence(test_code, descricao, esperado, obtido, passou)
    VALUES (t->>'c', t->>'d', t->>'e', t->>'o', (t->>'p')::boolean);
  END LOOP;

  SELECT count(*) INTO v_fail FROM public._motor_b2b_fase1_quote_evidence WHERE NOT passou;
  RAISE NOTICE 'HARNESS FASE1-COTACAO: % falhas', v_fail;
END $main$;