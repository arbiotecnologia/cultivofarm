-- H6e — POSTCHECK ESTRUTURAL (staging). Somente leitura.
\set ON_ERROR_STOP on
\pset pager off
WITH t(check_id, ok) AS (
  VALUES
  ('H6E-T01 5 trigger functions sem EXECUTE para PUBLIC/anon/authenticated',
   (SELECT bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE')
                AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
                AND NOT (p.proacl::text LIKE '%=X/%' AND p.proacl::text LIKE '%{=X%'))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('fn_h6_guard_ar_installment_snapshot','fn_h6_guard_ap_installment_snapshot',
        'fn_h6_guard_title_snapshot','fn_h6_payments_append_only','fn_h6d_block_hard_delete'))),
  ('H6E-T02 as 5 funcoes existem e retornam trigger',
   (SELECT count(*)=5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.prorettype='trigger'::regtype AND p.proname IN
       ('fn_h6_guard_ar_installment_snapshot','fn_h6_guard_ap_installment_snapshot',
        'fn_h6_guard_title_snapshot','fn_h6_payments_append_only','fn_h6d_block_hard_delete'))),
  ('H6E-T03 escotilha fn_h6d_hard_delete_allowed segue fechada',
   (SELECT NOT has_function_privilege('anon',p.oid,'EXECUTE')
       AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='fn_h6d_hard_delete_allowed')),
  ('H6E-T04 triggers H6/H6d continuam vinculados as 5 funcoes (10 esperados)',
   (SELECT count(*)=10 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
     WHERE NOT t.tgisinternal AND p.proname IN
       ('fn_h6_guard_ar_installment_snapshot','fn_h6_guard_ap_installment_snapshot',
        'fn_h6_guard_title_snapshot','fn_h6_payments_append_only','fn_h6d_block_hard_delete'))),
  ('H6E-T05 RPCs financeiras canonicas: anon sem EXECUTE',
   (SELECT bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE'))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('rpc_register_receivable_payment','rpc_register_payable_payment','fn_reverse_payment',
        'rpc_cancel_accounts_receivable','rpc_cancel_accounts_payable'))),
  ('H6E-T06 RPCs financeiras canonicas: SECURITY DEFINER + search_path',
   (SELECT bool_and(p.prosecdef AND p.proconfig::text ILIKE '%search_path%')
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN
       ('rpc_register_receivable_payment','rpc_register_payable_payment','fn_reverse_payment',
        'rpc_cancel_accounts_receivable','rpc_cancel_accounts_payable')))
)
SELECT check_id, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado FROM t ORDER BY check_id;
