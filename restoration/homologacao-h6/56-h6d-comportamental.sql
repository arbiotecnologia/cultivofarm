-- H6d — TESTES COMPORTAMENTAIS (staging). Toda a execucao termina em ROLLBACK:
-- as fixtures nao persistem (zero residuo).
\set ON_ERROR_STOP on
\pset pager off

BEGIN;

DO $outer$
DECLARE
  v_admin uuid;
  v_cli   uuid;
  v_pm    uuid;
  v_cat_r uuid;
  v_cat_d uuid;
  v_ar    uuid;
  v_ari   uuid;
  v_ap    uuid;
  v_api   uuid;
  v_pay   uuid;
  v_pay2  uuid;
  v_rev   uuid;
  v_rev2  uuid;
  v_ok    boolean;
  v_cnt   int;
  v_claims text;
BEGIN
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role='administrador' LIMIT 1;
  SELECT id INTO v_cli FROM public.clientes LIMIT 1;
  SELECT id INTO v_pm  FROM public.payment_methods WHERE active LIMIT 1;
  SELECT id INTO v_cat_r FROM public.financial_categories WHERE type='RECEITA' LIMIT 1;
  SELECT id INTO v_cat_d FROM public.financial_categories WHERE type='DESPESA' LIMIT 1;
  v_claims := json_build_object('sub', v_admin, 'role', 'authenticated')::text;
  PERFORM set_config('request.jwt.claims', v_claims, true);
  PERFORM set_config('role', 'authenticated', true);

  -- ---------------- Fixtures ----------------
  INSERT INTO public.accounts_receivable
    (origin_type, customer_id, description, category_id, total_amount, issue_date, first_due_date,
     installment_count, status, payment_method_id, created_by)
  VALUES ('MANUAL', v_cli, 'H6D-FIXTURE AR', v_cat_r, 1000, CURRENT_DATE, CURRENT_DATE + 30,
          1, 'OPEN', v_pm, v_admin)
  RETURNING id INTO v_ar;
  SELECT id INTO v_ari FROM public.accounts_receivable_installments WHERE receivable_id = v_ar LIMIT 1;

  INSERT INTO public.accounts_payable
    (supplier_name, description, category_id, total_amount, issue_date, first_due_date,
     installment_count, status, origin_type, created_by)
  VALUES ('H6D-FIXTURE FORNECEDOR', 'H6D-FIXTURE AP', v_cat_d, 500, CURRENT_DATE, CURRENT_DATE + 30,
          1, 'OPEN', 'MANUAL', v_admin)
  RETURNING id INTO v_ap;
  SELECT id INTO v_api FROM public.accounts_payable_installments WHERE payable_id = v_ap LIMIT 1;

  RAISE NOTICE 'FIXTURES AR=% ARI=% AP=% API=%', v_ar, v_ari, v_ap, v_api;

  -- ---------------- A) baixa AR ----------------
  v_pay := public.rpc_register_receivable_payment(v_ari, jsonb_build_object(
    'idempotency_key','H6D-AR-0000001','amount_received',400,
    'payment_method_id',v_pm,'payment_date',CURRENT_DATE,'has_receipt',true));
  RAISE NOTICE 'H6D-A01 baixa AR registrada : %', CASE WHEN v_pay IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;

  v_ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.receivable_payments SET amount_received = amount_received + 1 WHERE id = v_pay;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_ok := (v_cnt = 0);   -- RLS sem policy de UPDATE: nenhuma linha afetada
  EXCEPTION WHEN OTHERS THEN v_ok := true;  -- ou trigger append-only
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'H6D-A02 UPDATE direto da baixa AR rejeitado : %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;

  v_ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    DELETE FROM public.receivable_payments WHERE id = v_pay;
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_cnt FROM public.receivable_payments WHERE id = v_pay;
  RAISE NOTICE 'H6D-A03 DELETE da baixa AR (admin/authenticated) rejeitado : %',
    CASE WHEN v_ok AND v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END;

  v_rev := public.fn_reverse_payment(v_pay, 'receivable', 'H6D estorno de teste');
  v_rev2 := NULL;
  BEGIN
    v_rev2 := public.fn_reverse_payment(v_pay, 'receivable', 'H6D estorno de teste');
  EXCEPTION WHEN OTHERS THEN v_rev2 := NULL;
  END;
  RAISE NOTICE 'H6D-A04 estorno AR funciona : %', CASE WHEN v_rev IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE 'H6D-A05 replay do estorno AR estavel (sem duplicar) : %',
    CASE WHEN (SELECT count(*) FROM public.receivable_payments WHERE reversed_payment_id = v_pay) = 1
         THEN 'PASS' ELSE 'FAIL' END;

  -- ---------------- B) equivalente AP ----------------
  v_pay2 := public.rpc_register_payable_payment(v_api, jsonb_build_object(
    'idempotency_key','H6D-AP-0000001','amount_paid',200,
    'payment_method_id',v_pm,'payment_date',CURRENT_DATE,'has_receipt',true));
  RAISE NOTICE 'H6D-B01 baixa AP registrada : %', CASE WHEN v_pay2 IS NOT NULL THEN 'PASS' ELSE 'FAIL' END;

  v_ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    DELETE FROM public.payable_payments WHERE id = v_pay2;
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_cnt FROM public.payable_payments WHERE id = v_pay2;
  RAISE NOTICE 'H6D-B02 DELETE da baixa AP rejeitado : %',
    CASE WHEN v_ok AND v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END;

  v_ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.payable_payments SET amount_paid = amount_paid + 1 WHERE id = v_pay2;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_ok := (v_cnt = 0);
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'H6D-B03 UPDATE direto da baixa AP rejeitado : %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;

  PERFORM public.fn_reverse_payment(v_pay2, 'payable', 'H6D estorno AP de teste');
  RAISE NOTICE 'H6D-B04 estorno AP funciona : %',
    CASE WHEN (SELECT count(*) FROM public.payable_payments WHERE reversed_payment_id = v_pay2) = 1
         THEN 'PASS' ELSE 'FAIL' END;

  -- ---------------- C) DELETE fisico de titulos ----------------
  v_ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    DELETE FROM public.accounts_receivable WHERE id = v_ar;
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_cnt FROM public.accounts_receivable_installments WHERE receivable_id = v_ar;
  RAISE NOTICE 'H6D-C01 DELETE do titulo AR rejeitado e parcelas preservadas : %',
    CASE WHEN v_ok AND v_cnt >= 1 AND EXISTS (SELECT 1 FROM public.accounts_receivable WHERE id = v_ar)
         THEN 'PASS' ELSE 'FAIL' END;

  v_ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    DELETE FROM public.accounts_payable WHERE id = v_ap;
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'H6D-C02 DELETE do titulo AP rejeitado e parcelas preservadas : %',
    CASE WHEN v_ok AND EXISTS (SELECT 1 FROM public.accounts_payable_installments WHERE payable_id = v_ap)
         THEN 'PASS' ELSE 'FAIL' END;

  v_ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    DELETE FROM public.accounts_receivable_installments WHERE id = v_ari;
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'H6D-C03 DELETE direto da parcela AR rejeitado : %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;

  -- ---------------- D) cancelamento canonico ----------------
  PERFORM public.rpc_cancel_accounts_receivable(v_ar, 'H6D cancelamento de teste');
  PERFORM public.rpc_cancel_accounts_payable(v_ap, 'H6D cancelamento de teste');
  RAISE NOTICE 'H6D-D01 cancelamento AR/AP preserva registros : %',
    CASE WHEN (SELECT status FROM public.accounts_receivable WHERE id=v_ar)='CANCELED'
          AND (SELECT status FROM public.accounts_payable   WHERE id=v_ap)='CANCELED'
          AND EXISTS (SELECT 1 FROM public.accounts_receivable_installments WHERE id=v_ari)
          AND EXISTS (SELECT 1 FROM public.receivable_payments WHERE id=v_pay)
         THEN 'PASS' ELSE 'FAIL' END;

  -- ---------------- E) due_date / net_amount ----------------
  v_ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.accounts_receivable_installments SET due_date = due_date + 30 WHERE id = v_ari;
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'H6D-E01 UPDATE de due_date (AR) rejeitado : %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;

  v_ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.accounts_receivable_installments SET net_amount = COALESCE(net_amount,0) + 10 WHERE id = v_ari;
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'H6D-E02 UPDATE de net_amount (AR) rejeitado : %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;

  v_ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.accounts_payable_installments SET due_date = due_date + 30 WHERE id = v_api;
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'H6D-E03 UPDATE de due_date (AP) rejeitado : %', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;

  v_ok := true;
  BEGIN
    UPDATE public.accounts_receivable_installments
       SET status = status, interest_amount = COALESCE(interest_amount,0)
     WHERE id = v_ari;
  EXCEPTION WHEN OTHERS THEN v_ok := false;
  END;
  RAISE NOTICE 'H6D-E04 campos derivados de baixa/estorno continuam atualizaveis : %',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;

  -- ---------------- F) payment_method_id do titulo ----------------
  v_ok := false;
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.accounts_receivable
       SET payment_method_id = (SELECT id FROM public.payment_methods WHERE active AND id <> v_pm LIMIT 1)
     WHERE id = v_ar;
  EXCEPTION WHEN OTHERS THEN v_ok := true;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'H6D-F01 UPDATE de payment_method_id do titulo rejeitado : %',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE 'H6D-F02 metodo da baixa individual preservado : %',
    CASE WHEN (SELECT payment_method_id FROM public.receivable_payments WHERE id = v_pay) = v_pm
         THEN 'PASS' ELSE 'FAIL' END;

  -- ---------------- G) escotilha de manutencao fail-closed ----------------
  RAISE NOTICE 'H6D-G01 escotilha desligada por padrao : %',
    CASE WHEN public.fn_h6d_hard_delete_allowed() = false THEN 'PASS' ELSE 'FAIL' END;
END $outer$;

ROLLBACK;

-- Zero residuo de fixture (fora da transacao revertida)
SELECT 'H6D-H01 zero residuo de fixtures' AS check_id,
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.accounts_receivable WHERE description LIKE 'H6D-FIXTURE%')
             AND NOT EXISTS (SELECT 1 FROM public.accounts_payable   WHERE description LIKE 'H6D-FIXTURE%')
            THEN 'PASS' ELSE 'FAIL' END AS resultado;
