-- FASE H7j — Postcheck comportamental (staging). Transacional, sem efeitos colaterais.
\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE v_ok int:=0; v_fail int:=0; v_u uuid; v_inv uuid; v_it uuid; n int;
BEGIN
  SELECT id INTO v_u FROM auth.users ORDER BY created_at LIMIT 1;

  -- H7J-1 trigger presente
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.fiscal_invoices'::regclass
             AND tgname='trg_h7j_fiscal_invoice_delete_guard') THEN
    v_ok:=v_ok+1; RAISE NOTICE 'H7J-1 PASS trigger de delete presente';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'H7J-1 FAIL trigger ausente'; END IF;

  -- H7J-2 documento terminal SEM itens nao pode ser excluido
  INSERT INTO public.fiscal_invoices(invoice_type,status,total_amount,created_by)
  VALUES ('NFE','ISSUED',100,v_u) RETURNING id INTO v_inv;
  UPDATE public.fiscal_invoices SET status='CANCELED' WHERE id=v_inv;
  BEGIN
    DELETE FROM public.fiscal_invoices WHERE id=v_inv;
    v_fail:=v_fail+1; RAISE WARNING 'H7J-2 FAIL documento terminal deletavel';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FISCAL_DOCUMENT_DELETE_FORBIDDEN%' THEN
      v_ok:=v_ok+1; RAISE NOTICE 'H7J-2 PASS documento terminal indelevel';
    ELSE v_fail:=v_fail+1; RAISE WARNING 'H7J-2 FAIL erro inesperado: %', SQLERRM; END IF;
  END;

  -- H7J-3 documento com itens (trilha) nao pode ser excluido em cascata
  INSERT INTO public.fiscal_invoices(invoice_type,status,total_amount,created_by)
  VALUES ('NFE','DRAFT',100,v_u) RETURNING id INTO v_inv;
  INSERT INTO public.fiscal_invoice_items(fiscal_invoice_id,item_sequence,item_kind,description,quantity,unit_value,gross_value,net_value)
  VALUES (v_inv,1,'PRODUCT','X',1,100,100,100) RETURNING id INTO v_it;
  UPDATE public.fiscal_invoices SET status='ISSUED' WHERE id=v_inv;
  BEGIN
    DELETE FROM public.fiscal_invoices WHERE id=v_inv;
    v_fail:=v_fail+1; RAISE WARNING 'H7J-3 FAIL cascata apagou itens do documento autorizado';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FISCAL_DOCUMENT_DELETE_FORBIDDEN%' THEN
      v_ok:=v_ok+1; RAISE NOTICE 'H7J-3 PASS cascata bloqueada com codigo estavel';
    ELSE v_fail:=v_fail+1; RAISE WARNING 'H7J-3 FAIL erro inesperado: %', SQLERRM; END IF;
  END;

  -- H7J-4 rascunho sem trilha continua descartavel (nao criar regressao de UX)
  INSERT INTO public.fiscal_invoices(invoice_type,status,total_amount,created_by)
  VALUES ('NFE','DRAFT',10,v_u) RETURNING id INTO v_inv;
  DELETE FROM public.fiscal_invoices WHERE id=v_inv;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n=1 THEN v_ok:=v_ok+1; RAISE NOTICE 'H7J-4 PASS rascunho sem trilha descartavel';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'H7J-4 FAIL rascunho nao descartavel'; END IF;

  -- H7J-5 authenticated sem TRUNCATE nas tabelas do documento fiscal
  IF NOT has_table_privilege('authenticated','public.fiscal_invoices','TRUNCATE')
     AND NOT has_table_privilege('authenticated','public.fiscal_invoice_items','TRUNCATE') THEN
    v_ok:=v_ok+1; RAISE NOTICE 'H7J-5 PASS authenticated sem TRUNCATE';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'H7J-5 FAIL TRUNCATE ainda concedido'; END IF;

  -- H7J-6 guard com search_path fixo e sem EXECUTE para anon/authenticated
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid=p.pronamespace
             WHERE nsp.nspname='public' AND p.proname='fn_h7j_fiscal_invoice_delete_guard'
               AND p.proconfig @> ARRAY['search_path=public'])
     AND NOT has_function_privilege('anon','public.fn_h7j_fiscal_invoice_delete_guard()','EXECUTE')
     AND NOT has_function_privilege('authenticated','public.fn_h7j_fiscal_invoice_delete_guard()','EXECUTE') THEN
    v_ok:=v_ok+1; RAISE NOTICE 'H7J-6 PASS menor privilegio e search_path explicito';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'H7J-6 FAIL ACL/search_path do guard'; END IF;

  -- H7J-7 cancelamento fiscal NAO apaga financeiro/entrega (invariante H6)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
     WHERE t.tgrelid='public.fiscal_invoices'::regclass AND NOT t.tgisinternal
       AND pg_get_functiondef(p.oid) ~* 'delete[[:space:]]+from[[:space:]]+public\.(accounts_receivable|entregas)'
  ) THEN v_ok:=v_ok+1; RAISE NOTICE 'H7J-7 PASS nenhum gatilho fiscal apaga AR/entrega';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'H7J-7 FAIL gatilho fiscal remove financeiro/entrega'; END IF;

  RAISE NOTICE '== H7J POSTCHECK: % PASS / % FAIL ==', v_ok, v_fail;
  IF v_fail>0 THEN RAISE EXCEPTION 'H7J_POSTCHECK_FAIL: % falhas', v_fail; END IF;
END $$;
ROLLBACK;
