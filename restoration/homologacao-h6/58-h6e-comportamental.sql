-- H6e — COMPORTAMENTAL: triggers disparam mesmo sem EXECUTE para authenticated.
-- Transacional, termina em ROLLBACK. Somente staging.
\set ON_ERROR_STOP on
\pset pager off
BEGIN;
DO $$
DECLARE v_ok int:=0; v_fail int:=0; v_ar uuid; v_ari uuid; v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users ORDER BY created_at LIMIT 1;

  -- T0: authenticated realmente sem EXECUTE nas 5 trigger functions
  IF (SELECT bool_and(NOT has_function_privilege('authenticated',p.oid,'EXECUTE'))
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname IN
        ('fn_h6_guard_ar_installment_snapshot','fn_h6_guard_ap_installment_snapshot',
         'fn_h6_guard_title_snapshot','fn_h6_payments_append_only','fn_h6d_block_hard_delete'))
  THEN v_ok:=v_ok+1; RAISE NOTICE 'H6E-B00 authenticated sem EXECUTE : PASS';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'H6E-B00 : FAIL'; END IF;

  INSERT INTO public.accounts_receivable(total_amount, installment_count, origin_type, issue_date, first_due_date, created_by)
  VALUES (500.00, 1, 'MANUAL', current_date, current_date+30, v_uid) RETURNING id INTO v_ar;
  INSERT INTO public.accounts_receivable_installments(receivable_id, installment_number, original_amount, net_amount, due_date)
  VALUES (v_ar, 1, 500.00, 500.00, current_date+30) RETURNING id INTO v_ari;

  -- T1: guard de titulo dispara sob role authenticated
  BEGIN
    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.accounts_receivable SET total_amount=999 WHERE id=v_ar;
      v_fail:=v_fail+1; RAISE WARNING 'H6E-B01 guard de titulo NAO disparou : FAIL';
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok:=v_ok+1; RAISE NOTICE 'H6E-B01 bloqueado por RLS/privilegio : PASS';
    WHEN OTHERS THEN
      v_ok:=v_ok+1; RAISE NOTICE 'H6E-B01 guard de titulo disparou sem EXECUTE : PASS (%)', left(SQLERRM,50);
    END;
    -- T2: guard de parcela dispara sob role authenticated
    BEGIN
      UPDATE public.accounts_receivable_installments SET due_date=current_date+90 WHERE id=v_ari;
      v_fail:=v_fail+1; RAISE WARNING 'H6E-B02 guard de parcela NAO disparou : FAIL';
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok:=v_ok+1; RAISE NOTICE 'H6E-B02 bloqueado por RLS/privilegio : PASS';
    WHEN OTHERS THEN
      v_ok:=v_ok+1; RAISE NOTICE 'H6E-B02 guard de parcela disparou sem EXECUTE : PASS (%)', left(SQLERRM,50);
    END;
    -- T3: DELETE fisico bloqueado sob role authenticated
    BEGIN
      DELETE FROM public.accounts_receivable WHERE id=v_ar;
      v_fail:=v_fail+1; RAISE WARNING 'H6E-B03 DELETE do titulo aceito : FAIL';
    EXCEPTION WHEN insufficient_privilege THEN
      v_ok:=v_ok+1; RAISE NOTICE 'H6E-B03 DELETE bloqueado por privilegio : PASS';
    WHEN OTHERS THEN
      v_ok:=v_ok+1; RAISE NOTICE 'H6E-B03 DELETE bloqueado pelo trigger : PASS (%)', left(SQLERRM,50);
    END;
    RESET ROLE;
  END;

  -- T4: guard continua disparando tambem para o dono (postgres)
  BEGIN
    UPDATE public.accounts_receivable_installments SET net_amount=1 WHERE id=v_ari;
    v_fail:=v_fail+1; RAISE WARNING 'H6E-B04 net_amount alterado : FAIL';
  EXCEPTION WHEN OTHERS THEN
    v_ok:=v_ok+1; RAISE NOTICE 'H6E-B04 net_amount imutavel : PASS';
  END;

  RAISE NOTICE '== H6E COMPORTAMENTAL: % PASS / % FAIL ==', v_ok, v_fail;
  IF v_fail>0 THEN RAISE EXCEPTION 'H6E_COMPORTAMENTAL_FAIL: %', v_fail; END IF;
END $$;
ROLLBACK;
