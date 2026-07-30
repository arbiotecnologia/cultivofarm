-- =====================================================================
-- PACOTE DE PROMOCAO MOTOR B2B — 090_postflight.sql
-- Verificação pós-aplicação. Somente leitura + RAISE em caso de falha.
-- Executar na MESMA transação do apply: se qualquer item falhar, o
-- --single-transaction reverte tudo (rollback natural, sem efeito colateral).
-- =====================================================================

DO $postflight$
DECLARE
  v_fail text[] := '{}';
  v_def  text;
  v_n    int;
BEGIN
  ---------------------------------------------------------------- 1
  IF to_regprocedure('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)') IS NULL THEN
    v_fail := v_fail || 'create_partner_order_secure/9 ausente';
  ELSE
    v_def := pg_get_functiondef('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'::regprocedure);
    IF position('reqfp_v2' in v_def) = 0 THEN
      v_fail := v_fail || 'create_partner_order_secure sem algoritmo reqfp_v2';
    END IF;
  END IF;

  ---------------------------------------------------------------- 2
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='create_partner_order_secure';
  IF v_n <> 1 THEN v_fail := v_fail || format('overloads de create_partner_order_secure = %s (esperado 1)', v_n); END IF;

  ---------------------------------------------------------------- 3
  IF to_regprocedure('public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric)') IS NULL THEN
    v_fail := v_fail || 'fn_b2b_cart_hash ausente';
  ELSIF position('v2|' in pg_get_functiondef('public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric)'::regprocedure)) = 0 THEN
    v_fail := v_fail || 'fn_b2b_cart_hash sem prefixo de versão v2|';
  END IF;

  ---------------------------------------------------------------- 4
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE NOT t.tgisinternal AND t.tgname='trg_b2b_block_receivable_before_approval'
  ) THEN v_fail := v_fail || 'trigger trg_b2b_block_receivable_before_approval ausente'; END IF;

  ---------------------------------------------------------------- 5
  IF to_regprocedure('public.fn_b2b_credit_exposure(uuid,numeric,uuid)') IS NULL THEN
    v_fail := v_fail || 'fn_b2b_credit_exposure ausente';
  ELSIF position('fn_b2b_status_is_approved_or_later' in
        pg_get_functiondef('public.fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure)) = 0 THEN
    v_fail := v_fail || 'fn_b2b_credit_exposure não usa o rank canônico de status aprovado';
  END IF;

  ---------------------------------------------------------------- 6
  IF has_table_privilege('authenticated','public.commercial_payment_plans','SELECT') THEN
    v_fail := v_fail || 'commercial_payment_plans legível por authenticated';
  END IF;

  ---------------------------------------------------------------- 7
  IF to_regclass('public.partner_order_idempotency') IS NULL THEN
    v_fail := v_fail || 'partner_order_idempotency ausente';
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='partner_order_idempotency'
       AND column_name='request_fingerprint'
  ) THEN v_fail := v_fail || 'partner_order_idempotency.request_fingerprint ausente'; END IF;

  ---------------------------------------------------------------- 8  ACL
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('create_partner_order_secure','approve_partner_order','reject_partner_order',
                       'generate_b2b_receivable_secure','fn_resolve_commercial_price',
                       'fn_b2b_resolve_base_unit_price','fn_b2b_cart_hash','rpc_b2b_partner_credit',
                       'fn_b2b_credit_exposure','fn_resolve_b2b_cart')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('public', p.oid, 'EXECUTE'));
  IF v_n > 0 THEN v_fail := v_fail || format('%s função(ões) B2B executáveis por anon/PUBLIC', v_n); END IF;

  ---------------------------------------------------------------- 9  RLS
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
     AND c.relname IN ('partner_orders','partner_order_items','partner_order_payment_terms',
                       'partner_order_payment_schedule','partner_simulations','partner_simulation_items',
                       'partner_product_prices','commercial_payment_plans','partner_order_idempotency');
  IF v_n > 0 THEN v_fail := v_fail || format('%s tabela(s) do motor B2B sem RLS habilitada', v_n); END IF;

  ---------------------------------------------------------------- 10 triggers habilitados
  SELECT count(*) INTO v_n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='D';
  IF v_n > 0 THEN v_fail := v_fail || format('%s trigger(s) desabilitado(s) em public', v_n); END IF;

  ---------------------------------------------------------------- 11 higiene
  IF to_regclass('public._motor_b2b_fase7_proofs') IS NOT NULL THEN
    v_fail := v_fail || 'tabela de provas _motor_b2b_fase7_proofs presente';
  END IF;

  ---------------------------------------------------------------- 12 gates de status
  IF to_regprocedure('public.fn_b2b_status_is_operational(partner_order_status)') IS NULL
     OR to_regprocedure('public.fn_b2b_status_is_approved_or_later(partner_order_status)') IS NULL THEN
    v_fail := v_fail || 'funções canônicas de rank de status ausentes';
  END IF;

  IF array_length(v_fail, 1) > 0 THEN
    RAISE EXCEPTION 'POSTFLIGHT_FAIL (% item(ns)): %', array_length(v_fail,1), array_to_string(v_fail, ' | ');
  END IF;
  RAISE NOTICE 'POSTFLIGHT_OK: 12/12 verificações aprovadas';
END
$postflight$;
