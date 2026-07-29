-- =====================================================================
-- FASE 1 (correcao de gate) — VERIFY
-- Somente staging ikaauvsflpmamgxmkhoq. Read-only: apenas asserts.
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
  v_src  text;
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
      'fn_b2b_order_priceable','fn_b2b_cart_hash','fn_b2b_credit_exposure',
      'convert_partner_simulation_to_order_secure')
  LOOP
    IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
      v_fail := v_fail || 'V2(anon_exec:' || v_oid::regprocedure::text || ') ';
    END IF;
  END LOOP;

  -- V3: assinatura de carrinho v2 (partner + plano + carrinho + total) e deterministica
  IF public.fn_b2b_cart_hash(NULL, NULL, '{"lines":[]}'::jsonb, 0)
     IS DISTINCT FROM public.fn_b2b_cart_hash(NULL, NULL, '{"lines":[]}'::jsonb, 0) THEN
    v_fail := v_fail || 'V3(hash_nao_deterministico) ';
  END IF;
  -- hash sensivel ao total final
  IF public.fn_b2b_cart_hash(NULL, NULL, '{"lines":[]}'::jsonb, 0)
     = public.fn_b2b_cart_hash(NULL, NULL, '{"lines":[]}'::jsonb, 1) THEN
    v_fail := v_fail || 'V3(hash_insensivel_ao_total) ';
  END IF;

  -- V4: assinatura unica de create_partner_order_secure, com hash + idempotencia
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='create_partner_order_secure') <> 1 THEN
    v_fail := v_fail || 'V4(overload_residual) ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='create_partner_order_secure'
                   AND pg_get_function_identity_arguments(p.oid) LIKE '%p_expected_cart_hash text%'
                   AND pg_get_function_identity_arguments(p.oid) LIKE '%p_idempotency_key text%') THEN
    v_fail := v_fail || 'V4(assinatura_incompleta) ';
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_partner_order_secure' LIMIT 1;
  IF v_src NOT LIKE '%cart_hash_required%' THEN
    v_fail := v_fail || 'V4(hash_opcional) ';
  END IF;
  IF v_src NOT LIKE '%price_changed%' THEN
    v_fail := v_fail || 'V4(sem_recusa_price_changed) ';
  END IF;

  -- V5: inercia do produtor direto (ate a Fase 5)
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

  -- V7: cotacao com trava, duplicidade e reavaliacao de credito na mesma transacao
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='respond_b2b_order_quote_secure' LIMIT 1;
  IF v_src NOT LIKE '%pg_advisory_xact_lock%' THEN v_fail := v_fail || 'V7(cotacao_sem_lock) '; END IF;
  IF v_src NOT LIKE '%quote_duplicate_line%' THEN v_fail := v_fail || 'V7(cotacao_sem_duplicidade) '; END IF;
  IF v_src NOT LIKE '%fn_b2b_credit_exposure%' THEN v_fail := v_fail || 'V7(cotacao_sem_credito) '; END IF;
  IF v_src NOT LIKE '%aguardando_aprovacao_credito%' THEN v_fail := v_fail || 'V7(cotacao_sem_alcada_credito) '; END IF;

  -- V8: simulacao bloqueia tecnico-only antes de resolver preco
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='simulate_b2b_payment_plan_secure' LIMIT 1;
  IF v_src NOT LIKE '%forbidden_financial_terms%' THEN
    v_fail := v_fail || 'V8(simulacao_expoe_financeiro_ao_tecnico) ';
  END IF;

  -- V9: conversao de simulacao bloqueia tecnico-only e reenvia hash do servidor
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='convert_partner_simulation_to_order_secure' LIMIT 1;
  IF v_src NOT LIKE '%forbidden_role_tecnico_cannot_convert%' THEN
    v_fail := v_fail || 'V9(conversao_sem_bloqueio_tecnico) ';
  END IF;
  IF v_src NOT LIKE '%fn_b2b_cart_hash%' THEN
    v_fail := v_fail || 'V9(conversao_sem_hash_servidor) ';
  END IF;

  -- V10: tabela de idempotencia com unicidade por parceiro/chave e RLS
  IF to_regclass('public.partner_order_idempotency') IS NULL THEN
    v_fail := v_fail || 'V10(tabela_idempotencia_ausente) ';
  ELSE
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid
                   WHERE i.indrelid='public.partner_order_idempotency'::regclass AND i.indisunique) THEN
      v_fail := v_fail || 'V10(sem_indice_unico) ';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.partner_order_idempotency'::regclass) THEN
      v_fail := v_fail || 'V10(sem_rls) ';
    END IF;
    IF has_table_privilege('anon','public.partner_order_idempotency','SELECT')
       OR has_table_privilege('anon','public.partner_order_idempotency','INSERT') THEN
      v_fail := v_fail || 'V10(anon_com_acesso) ';
    END IF;
    IF has_table_privilege('authenticated','public.partner_order_idempotency','INSERT')
       OR has_table_privilege('authenticated','public.partner_order_idempotency','UPDATE')
       OR has_table_privilege('authenticated','public.partner_order_idempotency','DELETE') THEN
      v_fail := v_fail || 'V10(authenticated_escreve_direto) ';
    END IF;
  END IF;

  -- V11: matriz bruta de precos invisivel a tecnico/produtor (RLS ativa)
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.commercial_price_rules'::regclass) THEN
    v_fail := v_fail || 'V11(matriz_sem_rls) ';
  END IF;
  IF has_table_privilege('anon','public.commercial_price_rules','SELECT') THEN
    v_fail := v_fail || 'V11(matriz_visivel_anon) ';
  END IF;

  -- V12: nenhuma migration da cadeia canonica contem harness (checagem informativa
  --      complementar ao inventario em INVENTARIO-MIGRATIONS.md)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name LIKE '\_motor\_b2b\_%harness%') THEN
    v_fail := v_fail || 'V12(harness_no_schema) ';
  END IF;

  IF v_fail <> '' THEN
    RAISE EXCEPTION 'VERIFY_FAIL: %', v_fail;
  END IF;
  RAISE NOTICE 'VERIFY OK — 12/12 asserts da correcao de gate da Fase 1.';
END $verify$;
