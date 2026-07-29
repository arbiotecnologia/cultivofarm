-- =====================================================================
-- FASE 1 (correcao consolidada final) — VERIFY
-- Somente staging. Read-only: apenas asserts, sem alterar dados.
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

DO $verify$
DECLARE
  v_fail text := '';
  v_oid  oid;
BEGIN
  -- V1: higiene — nenhuma tabela de evidencia de teste no schema public
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name LIKE '\_motor\_b2b\_fase1%evidence') THEN
    v_fail := v_fail || 'V1(evidence_tables) ';
  END IF;

  -- V2: anon sem EXECUTE nas funcoes comerciais B2B
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

  -- V3: assinatura de carrinho existe e e deterministica
  IF public.fn_b2b_cart_hash(NULL, '{"lines":[]}'::jsonb, 0)
     IS DISTINCT FROM public.fn_b2b_cart_hash(NULL, '{"lines":[]}'::jsonb, 0) THEN
    v_fail := v_fail || 'V3(hash_nao_deterministico) ';
  END IF;

  -- V4: create_partner_order_secure aceita a assinatura da simulacao
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='create_partner_order_secure'
                   AND pg_get_function_identity_arguments(p.oid) LIKE '%p_expected_cart_hash text%') THEN
    v_fail := v_fail || 'V4(sem_hash_param) ';
  END IF;

  -- V5: inercia do produtor direto
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgname='trg_commercial_price_rules_producer_inert' AND NOT tgisinternal) THEN
    v_fail := v_fail || 'V5(trigger_produtor_ausente) ';
  END IF;
  IF pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='rpc_resolve_commercial_prices' LIMIT 1))
     NOT LIKE '%PRODUCER_DIRECT_NOT_ENABLED%' THEN
    v_fail := v_fail || 'V5(rpc_sem_guarda_produtor) ';
  END IF;

  -- V6: credito exige papel/vinculo
  IF pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='rpc_b2b_partner_credit' LIMIT 1))
     NOT LIKE '%auth_required%' THEN
    v_fail := v_fail || 'V6(credito_sem_auth) ';
  END IF;

  -- V7: cotacao com trava de concorrencia e validacao de duplicidade
  IF pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='respond_b2b_order_quote_secure' LIMIT 1))
     NOT LIKE '%pg_advisory_xact_lock%' THEN
    v_fail := v_fail || 'V7(cotacao_sem_lock) ';
  END IF;
  IF pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='respond_b2b_order_quote_secure' LIMIT 1))
     NOT LIKE '%quote_duplicate_line%' THEN
    v_fail := v_fail || 'V7(cotacao_sem_duplicidade) ';
  END IF;

  -- V8: simulacao esconde credito do tecnico de parceiro
  IF pg_get_functiondef((SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                          WHERE n.nspname='public' AND p.proname='simulate_b2b_payment_plan_secure' LIMIT 1))
     NOT LIKE '%v_financial_visible%' THEN
    v_fail := v_fail || 'V8(simulacao_expoe_credito) ';
  END IF;

  IF v_fail <> '' THEN
    RAISE EXCEPTION 'VERIFY_FAIL: %', v_fail;
  END IF;
  RAISE NOTICE 'VERIFY OK — 8/8 asserts da correcao consolidada da Fase 1.';
END $verify$;
