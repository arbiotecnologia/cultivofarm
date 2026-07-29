DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS NULL OR v_ref <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: ambiente nao autorizado (%)', COALESCE(v_ref,'null');
  END IF;
END $guard$;

DO $verify$
DECLARE v_fail text := ''; v_oid oid;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name LIKE '\_motor\_b2b\_fase1%evidence') THEN
    v_fail := v_fail || 'V1(evidence_tables) ';
  END IF;
  FOR v_oid IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'create_partner_order_secure','simulate_b2b_payment_plan_secure',
      'respond_b2b_order_quote_secure','rpc_b2b_partner_credit',
      'rpc_b2b_credit_exposure','rpc_resolve_commercial_prices',
      'fn_resolve_b2b_cart','fn_resolve_commercial_price',
      'fn_b2b_order_priceable','fn_b2b_cart_hash',
      'convert_partner_simulation_to_order_secure')
  LOOP
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      v_fail := v_fail || 'V2(anon_exec:' || v_oid::regprocedure::text || ') ';
    END IF;
  END LOOP;
  IF public.fn_b2b_cart_hash(NULL, '{"lines":[]}'::jsonb, 0)
     IS DISTINCT FROM public.fn_b2b_cart_hash(NULL, '{"lines":[]}'::jsonb, 0) THEN
    v_fail := v_fail || 'V3 ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='create_partner_order_secure'
                   AND pg_get_function_identity_arguments(p.oid) LIKE '%p_expected_cart_hash text%') THEN
    v_fail := v_fail || 'V4 ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_commercial_price_rules_producer_inert' AND NOT tgisinternal) THEN
    v_fail := v_fail || 'V5a ';
  END IF;
  IF pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='rpc_resolve_commercial_prices' LIMIT 1))
     NOT LIKE '%PRODUCER_DIRECT_NOT_ENABLED%' THEN v_fail := v_fail || 'V5b '; END IF;
  IF pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='rpc_b2b_partner_credit' LIMIT 1))
     NOT LIKE '%auth_required%' THEN v_fail := v_fail || 'V6 '; END IF;
  IF pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='respond_b2b_order_quote_secure' LIMIT 1))
     NOT LIKE '%pg_advisory_xact_lock%' THEN v_fail := v_fail || 'V7a '; END IF;
  IF pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='respond_b2b_order_quote_secure' LIMIT 1))
     NOT LIKE '%quote_duplicate_line%' THEN v_fail := v_fail || 'V7b '; END IF;
  IF pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='simulate_b2b_payment_plan_secure' LIMIT 1))
     NOT LIKE '%v_financial_visible%' THEN v_fail := v_fail || 'V8 '; END IF;
  IF v_fail <> '' THEN RAISE EXCEPTION 'VERIFY_FAIL: %', v_fail; END IF;
  RAISE NOTICE 'VERIFY OK';
END $verify$;

DO $h$
DECLARE
  c_admin uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a';
  c_fin   uuid := 'd56793fa-acb3-4862-a180-498c20f5317f';
  c_com   uuid := '497b0307-0b64-42f4-a2b1-fd3e220fac3b';
  c_parc  uuid := '7d894a7d-cdc8-40f1-9df1-1649d2f16422';
  c_tec   uuid := '08832541-8155-43d2-bc4f-6a6bc407f7ae';
  c_prod  uuid := '85998744-78fd-41ae-b74e-2b763e7f8089';
  v_fail text := ''; v_n int; v_other uuid;
BEGIN
  SELECT id INTO v_other FROM public.partner_accounts LIMIT 1;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.rpc_resolve_commercial_prices('[]'::jsonb, NULL, current_date,
      jsonb_build_object('buyer_scope','customer','customer_id', gen_random_uuid()));
    v_fail := v_fail || 'R1 ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PRODUCER_DIRECT_NOT_ENABLED%' THEN v_fail := v_fail || 'R1(' || SQLERRM || ') '; END IF;
  END;
  RESET ROLE;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_prod, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.rpc_resolve_commercial_prices('[]'::jsonb, NULL, current_date, NULL);
    v_fail := v_fail || 'R2 ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PRODUCER_DIRECT_NOT_ENABLED%' THEN v_fail := v_fail || 'R2(' || SQLERRM || ') '; END IF;
  END;
  RESET ROLE;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_tec, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.rpc_b2b_partner_credit(v_other);
    v_fail := v_fail || 'R3 ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%forbidden%' THEN v_fail := v_fail || 'R3(' || SQLERRM || ') '; END IF;
  END;
  RESET ROLE;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_prod, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.rpc_b2b_partner_credit(v_other);
    v_fail := v_fail || 'R4 ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%forbidden%' THEN v_fail := v_fail || 'R4(' || SQLERRM || ') '; END IF;
  END;
  RESET ROLE;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_parc, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.rpc_b2b_partner_credit(gen_random_uuid());
    v_fail := v_fail || 'R5 ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%forbidden%' THEN v_fail := v_fail || 'R5(' || SQLERRM || ') '; END IF;
  END;
  RESET ROLE;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_fin, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.rpc_b2b_partner_credit(v_other);
  EXCEPTION WHEN OTHERS THEN v_fail := v_fail || 'R6fin(' || SQLERRM || ') ';
  END;
  RESET ROLE;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_com, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.rpc_b2b_partner_credit(v_other);
  EXCEPTION WHEN OTHERS THEN v_fail := v_fail || 'R6com(' || SQLERRM || ') ';
  END;
  RESET ROLE;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_tec, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.commercial_price_rules;
    IF v_n <> 0 THEN v_fail := v_fail || 'R7tec(' || v_n || ') '; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_prod, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_n FROM public.commercial_price_rules;
    IF v_n <> 0 THEN v_fail := v_fail || 'R7prod(' || v_n || ') '; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.rpc_b2b_partner_credit(v_other);
    v_fail := v_fail || 'R8 ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%permission denied%' THEN v_fail := v_fail || 'R8(' || SQLERRM || ') '; END IF;
  END;
  RESET ROLE;

  BEGIN
    INSERT INTO public.commercial_price_rules(buyer_scope, customer_id, unit_type, pricing_mode,
                                              condition_price, valid_from, active)
    VALUES ('customer', gen_random_uuid(), 'litro', 'fixed_item_price', 10, current_date, true);
    v_fail := v_fail || 'R9 ';
    RAISE EXCEPTION 'ROLLBACK_R9';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PRODUCER_DIRECT_NOT_ENABLED%' AND SQLERRM <> 'ROLLBACK_R9' THEN
      v_fail := v_fail || 'R9(' || SQLERRM || ') ';
    END IF;
  END;

  IF v_fail <> '' THEN RAISE EXCEPTION 'HARNESS_FAIL: %', v_fail; END IF;
  RAISE NOTICE 'HARNESS OK';
END $h$;