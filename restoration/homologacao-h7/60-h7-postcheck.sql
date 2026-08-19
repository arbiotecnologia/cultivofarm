-- FASE H7 — Postcheck comportamental (somente staging). Idempotente e transacional.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_ok int := 0; v_fail int := 0; v_msg text;
  v_inv uuid; v_ar uuid; v_ev1 uuid; v_ev2 uuid; v_env text;
BEGIN
  -- T1: gate de ambiente é fonte única e existe.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='fn_fiscal_environment_gate_v1') THEN
    v_ok := v_ok+1; RAISE NOTICE 'T1 PASS gate v1 presente';
  ELSE v_fail := v_fail+1; RAISE WARNING 'T1 FAIL gate ausente'; END IF;

  -- T2: assert legado delega ao gate (mesmo comportamento observável).
  BEGIN
    PERFORM public.fn_fiscal_assert_environment_homologation();
    v_ok := v_ok+1; RAISE NOTICE 'T2 PASS ambiente homologacao liberado';
  EXCEPTION WHEN OTHERS THEN
    v_msg := SQLERRM;
    IF v_msg LIKE 'FISCAL_ENV_NOT_READY%' OR v_msg LIKE 'FISCAL_PRODUCTION_DISABLED%' THEN
      v_ok := v_ok+1; RAISE NOTICE 'T2 PASS fail-closed com codigo estavel: %', left(v_msg,60);
    ELSE v_fail := v_fail+1; RAISE WARNING 'T2 FAIL codigo instavel: %', v_msg; END IF;
  END;

  -- T3: produção bloqueada (simula tpAmb=1 dentro da transação, revertido).
  UPDATE public.company_fiscal_settings SET nfe_environment_code='1' WHERE is_active;
  BEGIN
    PERFORM public.fn_fiscal_environment_gate_v1('T3');
    v_fail := v_fail+1; RAISE WARNING 'T3 FAIL producao NAO bloqueada';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FISCAL_PRODUCTION_DISABLED%' OR SQLERRM LIKE 'FISCAL_ENV_NOT_READY%' THEN
      v_ok := v_ok+1; RAISE NOTICE 'T3 PASS producao bloqueada';
    ELSE v_fail := v_fail+1; RAISE WARNING 'T3 FAIL erro inesperado: %', SQLERRM; END IF;
  END;
  UPDATE public.company_fiscal_settings SET nfe_environment_code='2' WHERE is_active;

  -- T4: ISSUED normaliza para AUTHORIZED.
  SELECT id INTO v_ar FROM auth.users ORDER BY created_at LIMIT 1;
  INSERT INTO public.fiscal_invoices(invoice_type, status, total_amount, created_by)
  VALUES ('NFE','ISSUED',100.00, v_ar) RETURNING id INTO v_inv;
  SELECT normalized_status INTO v_msg FROM public.fiscal_invoices WHERE id=v_inv;
  IF v_msg='AUTHORIZED' THEN v_ok := v_ok+1; RAISE NOTICE 'T4 PASS ISSUED->AUTHORIZED';
  ELSE v_fail := v_fail+1; RAISE WARNING 'T4 FAIL normalized=%', v_msg; END IF;

  -- T5: documento terminal rejeita alteração econômica.
  BEGIN
    UPDATE public.fiscal_invoices SET total_amount=999.00 WHERE id=v_inv;
    v_fail := v_fail+1; RAISE WARNING 'T5 FAIL alteracao economica aceita em AUTHORIZED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FISCAL_DOCUMENT_LOCKED%' THEN v_ok := v_ok+1; RAISE NOTICE 'T5 PASS imutabilidade';
    ELSE v_fail := v_fail+1; RAISE WARNING 'T5 FAIL erro inesperado: %', SQLERRM; END IF;
  END;

  -- T6: transição inválida a partir de AUTHORIZED é rejeitada.
  BEGIN
    UPDATE public.fiscal_invoices SET status='PENDING' WHERE id=v_inv;
    v_fail := v_fail+1; RAISE WARNING 'T6 FAIL regressao AUTHORIZED->DRAFT aceita';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FISCAL_STATE_TRANSITION_INVALID%' THEN v_ok := v_ok+1; RAISE NOTICE 'T6 PASS transicao bloqueada';
    ELSE v_fail := v_fail+1; RAISE WARNING 'T6 FAIL erro inesperado: %', SQLERRM; END IF;
  END;

  -- T7: cancelamento continua permitido.
  BEGIN
    UPDATE public.fiscal_invoices SET status='CANCELED' WHERE id=v_inv;
    v_ok := v_ok+1; RAISE NOTICE 'T7 PASS AUTHORIZED->CANCELED permitido';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail+1; RAISE WARNING 'T7 FAIL cancelamento bloqueado: %', SQLERRM;
  END;

  -- T8: eventos fiscais são append-only.
  INSERT INTO public.fiscal_events(fiscal_invoice_id, event_type, event_source, idempotency_key)
  VALUES (v_inv,'MANUAL_UPDATED','USER','h7-postcheck-1') RETURNING id INTO v_ev1;
  BEGIN
    UPDATE public.fiscal_events SET notes='x' WHERE id=v_ev1;
    v_fail := v_fail+1; RAISE WARNING 'T8 FAIL evento alteravel';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FISCAL_EVENTS_APPEND_ONLY%' THEN v_ok := v_ok+1; RAISE NOTICE 'T8 PASS append-only';
    ELSE v_fail := v_fail+1; RAISE WARNING 'T8 FAIL erro inesperado: %', SQLERRM; END IF;
  END;

  -- T9: idempotência de evento (índice único impede replay duplicado).
  BEGIN
    INSERT INTO public.fiscal_events(fiscal_invoice_id, event_type, event_source, idempotency_key)
    VALUES (v_inv,'MANUAL_UPDATED','USER','h7-postcheck-1');
    v_fail := v_fail+1; RAISE WARNING 'T9 FAIL evento duplicado aceito';
  EXCEPTION WHEN unique_violation THEN
    v_ok := v_ok+1; RAISE NOTICE 'T9 PASS idempotencia de evento';
  END;

  -- T10: anon sem EXECUTE em qualquer função fiscal.
  SELECT count(*)::text INTO v_msg FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND (p.proname LIKE '%fiscal%' OR p.proname LIKE '%nfe%')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_msg='0' THEN v_ok := v_ok+1; RAISE NOTICE 'T10 PASS anon sem EXECUTE fiscal';
  ELSE v_fail := v_fail+1; RAISE WARNING 'T10 FAIL % funcoes fiscais executaveis por anon', v_msg; END IF;

  -- T11: RPC manual não possui mais assinatura sem idempotência.
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid::regprocedure::text='rpc_fiscal_event_manual(uuid,text,text)') THEN
    v_ok := v_ok+1; RAISE NOTICE 'T11 PASS assinatura legada removida';
  ELSE v_fail := v_fail+1; RAISE WARNING 'T11 FAIL assinatura legada presente'; END IF;

  RAISE NOTICE '== H7 POSTCHECK: % PASS / % FAIL ==', v_ok, v_fail;
  IF v_fail > 0 THEN RAISE EXCEPTION 'H7_POSTCHECK_FAIL: % falhas', v_fail; END IF;
END $$;

ROLLBACK;
