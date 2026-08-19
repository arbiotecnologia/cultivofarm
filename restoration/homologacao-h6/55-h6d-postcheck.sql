-- H6d — POSTCHECK ESTRUTURAL (staging). Somente leitura.
\set ON_ERROR_STOP on
\pset pager off

WITH t(check_id, ok) AS (
  VALUES
  ('H6D-T01 trigger de baixa AR cobre UPDATE e DELETE',
   (SELECT (tgtype & 8) > 0 AND (tgtype & 16) > 0 FROM pg_trigger WHERE tgname='trg_h6_rp_append_only' AND NOT tgisinternal)),
  ('H6D-T02 trigger de baixa AP cobre UPDATE e DELETE',
   (SELECT (tgtype & 8) > 0 AND (tgtype & 16) > 0 FROM pg_trigger WHERE tgname='trg_h6_pp_append_only' AND NOT tgisinternal)),
  ('H6D-T03 policies de delete admin removidas das baixas',
   (SELECT count(*)=0 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
     WHERE c.relname IN ('receivable_payments','payable_payments') AND p.polcmd IN ('d','*'))),
  ('H6D-T04 authenticated/anon sem DELETE nas baixas',
   (SELECT NOT bool_or(has_table_privilege(r, tb, 'DELETE'))
      FROM unnest(ARRAY['anon','authenticated']) r,
           unnest(ARRAY['public.receivable_payments','public.payable_payments']) tb)),
  ('H6D-T05 triggers de bloqueio de DELETE em titulos e parcelas',
   (SELECT count(*)=4 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
     ('trg_h6d_ar_no_delete','trg_h6d_ap_no_delete','trg_h6d_ari_no_delete','trg_h6d_api_no_delete'))),
  ('H6D-T06 sem policy ALL/DELETE em titulos e parcelas',
   (SELECT count(*)=0 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
     WHERE c.relname IN ('accounts_receivable','accounts_payable',
                         'accounts_receivable_installments','accounts_payable_installments')
       AND p.polcmd IN ('d','*'))),
  ('H6D-T07 policies SELECT/INSERT/UPDATE financeiras recriadas',
   (SELECT count(*)=12 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
     WHERE c.relname IN ('accounts_receivable','accounts_payable',
                         'accounts_receivable_installments','accounts_payable_installments')
       AND p.polname LIKE '%\_select\_financial' ESCAPE '\'
        OR (c.relname IN ('accounts_receivable','accounts_payable',
                          'accounts_receivable_installments','accounts_payable_installments')
            AND (p.polname LIKE '%\_insert\_financial' ESCAPE '\' OR p.polname LIKE '%\_update\_financial' ESCAPE '\')))),
  ('H6D-T08 authenticated/anon sem DELETE em titulos e parcelas',
   (SELECT NOT bool_or(has_table_privilege(r, tb, 'DELETE'))
      FROM unnest(ARRAY['anon','authenticated']) r,
           unnest(ARRAY['public.accounts_receivable','public.accounts_payable',
                        'public.accounts_receivable_installments','public.accounts_payable_installments']) tb)),
  ('H6D-T09 guard de parcela AR cobre due_date e net_amount',
   (SELECT pg_get_functiondef(oid) ILIKE '%due_date%' AND pg_get_functiondef(oid) ILIKE '%net_amount%'
      FROM pg_proc WHERE proname='fn_h6_guard_ar_installment_snapshot')),
  ('H6D-T10 guard de parcela AP cobre due_date e net_amount',
   (SELECT pg_get_functiondef(oid) ILIKE '%due_date%' AND pg_get_functiondef(oid) ILIKE '%net_amount%'
      FROM pg_proc WHERE proname='fn_h6_guard_ap_installment_snapshot')),
  ('H6D-T11 guard de titulo cobre payment_method_id',
   (SELECT pg_get_functiondef(oid) ILIKE '%payment_method_id%'
      FROM pg_proc WHERE proname='fn_h6_guard_title_snapshot')),
  ('H6D-T12 escotilha de manutencao fail-closed e sem EXECUTE publico',
   (SELECT NOT has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='fn_h6d_hard_delete_allowed')),
  ('H6D-T13 funcoes H6d com search_path explicito',
   (SELECT bool_and(p.proconfig::text ILIKE '%search_path%')
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN ('fn_h6d_hard_delete_allowed','fn_h6d_block_hard_delete',
       'fn_h6_payments_append_only','fn_h6_guard_title_snapshot',
       'fn_h6_guard_ar_installment_snapshot','fn_h6_guard_ap_installment_snapshot'))),
  ('H6D-T14 RPCs canonicas de baixa/estorno/cancelamento preservadas',
   (SELECT count(*)=5 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN ('rpc_register_receivable_payment','rpc_register_payable_payment',
       'fn_reverse_payment','rpc_cancel_accounts_receivable','rpc_cancel_accounts_payable'))),
  ('H6D-T15 idempotencia H6b preservada',
   (SELECT count(*)=2 FROM pg_indexes WHERE schemaname='public'
      AND indexname IN ('ux_rp_idempotency','ux_pp_idempotency'))),
  ('H6D-T16 unicidade de faturamento H5/H6 preservada',
   (SELECT count(*)=2 FROM pg_indexes WHERE schemaname='public'
      AND indexname IN ('ux_ar_one_per_delivery','ux_ar_one_active_per_b2b_order')))
)
SELECT check_id, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado FROM t ORDER BY check_id;
