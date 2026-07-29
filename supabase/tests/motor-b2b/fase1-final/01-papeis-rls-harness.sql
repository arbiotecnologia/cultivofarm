-- =====================================================================
-- FASE 1 (correcao consolidada final) — HARNESS DE PAPEIS/RLS
-- Somente staging ikaauvsflpmamgxmkhoq.
-- Executa cada assert sob o papel `authenticated`/`anon` com claims JWT
-- do usuario real de staging. Nenhum dado operacional e criado:
-- as escritas de teste ocorrem em subtransacao sempre revertida.
-- =====================================================================
\set ON_ERROR_STOP on

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS NULL OR v_ref <> 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: ambiente nao autorizado (%)', COALESCE(v_ref,'null');
  END IF;
END $guard$;

DO $h$
DECLARE
  c_admin    uuid := 'b5c2ebd4-7cdf-4647-a585-6ec49f1b583a'; -- administrador
  c_fin      uuid := 'd56793fa-acb3-4862-a180-498c20f5317f'; -- financeiro
  c_com      uuid := '497b0307-0b64-42f4-a2b1-fd3e220fac3b'; -- gestor_comercial
  c_parc     uuid := '7d894a7d-cdc8-40f1-9df1-1649d2f16422'; -- parceiro_b2b
  c_tec      uuid := '08832541-8155-43d2-bc4f-6a6bc407f7ae'; -- parceiro_b2b_tecnico
  c_prod     uuid := '85998744-78fd-41ae-b74e-2b763e7f8089'; -- cliente_produtor
  v_fail text := '';
  v_n int;
  v_other uuid;
BEGIN
  SELECT id INTO v_other FROM public.partner_accounts ORDER BY created_at LIMIT 1;

  -- R1 admin nao consegue precificar no escopo produtor
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.rpc_resolve_commercial_prices('[]'::jsonb, NULL,
      current_date, jsonb_build_object('buyer_scope','customer','customer_id', gen_random_uuid()));
    v_fail := v_fail || 'R1 ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PRODUCER_DIRECT_NOT_ENABLED%' THEN v_fail := v_fail || 'R1(' || SQLERRM || ') '; END IF;
  END;
  RESET ROLE;

  -- R2 produtor nao acessa o motor de precos
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_prod, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.rpc_resolve_commercial_prices('[]'::jsonb, NULL, current_date, NULL);
    v_fail := v_fail || 'R2 ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PRODUCER_DIRECT_NOT_ENABLED%' THEN v_fail := v_fail || 'R2(' || SQLERRM || ') '; END IF;
  END;
  RESET ROLE;

  -- R3 tecnico de parceiro nao le credito
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_tec, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.rpc_b2b_partner_credit(v_other);
    v_fail := v_fail || 'R3 ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%forbidden%' THEN v_fail := v_fail || 'R3(' || SQLERRM || ') '; END IF;
  END;
  RESET ROLE;

  -- R4 produtor nao le credito de parceiro
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_prod, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.rpc_b2b_partner_credit(v_other);
    v_fail := v_fail || 'R4 ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%forbidden%' THEN v_fail := v_fail || 'R4(' || SQLERRM || ') '; END IF;
  END;
  RESET ROLE;

  -- R5 parceiro sem vinculo nao le credito de outro parceiro
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', c_parc, 'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    PERFORM public.rpc_b2b_partner_credit(gen_random_uuid());
    v_fail := v_fail || 'R5 ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%forbidden%' THEN v_fail := v_fail || 'R5(' || SQLERRM || ') '; END IF;
  END;
  RESET ROLE;

  -- R6 financeiro e gestor comercial leem credito (papel legitimo)
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

  -- R7 matriz de precos invisivel para tecnico e produtor
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

  -- R8 anon nao executa nenhuma funcao comercial B2B
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.rpc_b2b_partner_credit(v_other);
    v_fail := v_fail || 'R8 ';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%permission denied%' THEN v_fail := v_fail || 'R8(' || SQLERRM || ') '; END IF;
  END;
  RESET ROLE;

  -- R9 regra de preco no escopo produtor e recusada (subtransacao revertida)
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
  RAISE NOTICE 'HARNESS OK — 9/9 asserts de papel/RLS.';
END $h$;
