-- H6c-002 — POSTCHECK DO ROLLBACK (somente leitura). Staging ikaauvsflpmamgxmkhoq.
-- Prova que a baseline H6 (anterior ao H6b/H6c) foi restaurada.
-- Uso: psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f restoration/homologacao-h6/53-h6b-rollback-postcheck.sql
\pset pager off
WITH checks AS (
  SELECT 'R01 fn_entrega_valor_faturavel_v1 removida' AS gate,
         NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_entrega_valor_faturavel_v1'
                       AND pronamespace='public'::regnamespace) AS ok
  UNION ALL SELECT 'R02 helpers fn_h6b_* removidos',
         NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('fn_h6b_num','fn_h6b_payment_fingerprint',
                                                             'fn_h6b_reconciliacao_valor_faturavel')
                       AND pronamespace='public'::regnamespace)
  UNION ALL SELECT 'R03 trigger de valor faturável removido',
         NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_h6b_reconciliacao_valor_faturavel'
                       AND NOT tgisinternal)
  UNION ALL SELECT 'R04 triggers H6c removidos',
         NOT EXISTS (SELECT 1 FROM pg_trigger
                      WHERE tgname IN ('trg_h6c_entrega_ar_b2b_link','trg_h6c_set_canonical_payment_terms')
                        AND NOT tgisinternal)
  UNION ALL SELECT 'R05 RPCs de baixa voltaram à baseline H6 (chave opcional)',
         (SELECT bool_and(prosrc NOT ILIKE '%FIN_IDEMPOTENCY_REQUIRED%')
            FROM pg_proc WHERE proname IN ('rpc_register_receivable_payment','rpc_register_payable_payment'))
  UNION ALL SELECT 'R06 RPCs de baixa mantêm replay idempotente do H6',
         (SELECT bool_and(prosrc ILIKE '%idempotency_key%')
            FROM pg_proc WHERE proname IN ('rpc_register_receivable_payment','rpc_register_payable_payment'))
  UNION ALL SELECT 'R07 guard voltou à baseline (sem valor canônico H6b/H6c)',
         (SELECT prosrc NOT ILIKE '%fn_entrega_valor_faturavel_v1%'
            FROM pg_proc WHERE proname='fn_entrega_guard_faturamento_v1' LIMIT 1)
  UNION ALL SELECT 'R08 gerador de AR voltou à baseline (sem valor_faturavel)',
         (SELECT prosrc NOT ILIKE '%fn_entrega_valor_faturavel_v1%'
            FROM pg_proc WHERE proname='fn_generate_receivable_from_entrega' LIMIT 1)
  UNION ALL SELECT 'R09 colunas aditivas preservadas (rollback lógico, sem perda de trilha)',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema='public'
             AND ((table_name='receivable_payments' AND column_name='request_fingerprint')
               OR (table_name='payable_payments' AND column_name='request_fingerprint')
               OR (table_name='entrega_reconciliacoes' AND column_name='valor_faturavel_origem')
               OR (table_name='entrega_reconciliacoes' AND column_name='valor_faturavel_metodo'))) = 4
  UNION ALL SELECT 'R10 anon sem EXECUTE nas funções financeiras da baseline',
         NOT EXISTS (SELECT 1 FROM pg_proc p
                      WHERE p.pronamespace='public'::regnamespace
                        AND p.proname IN ('rpc_register_receivable_payment','rpc_register_payable_payment',
                                          'fn_reverse_payment','fn_generate_receivable_from_entrega',
                                          'fn_entrega_guard_faturamento_v1')
                        AND has_function_privilege('anon', p.oid, 'EXECUTE'))
  UNION ALL SELECT 'R11 authenticated mantém EXECUTE (grants restaurados)',
         (SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
            FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
             AND p.proname IN ('rpc_register_receivable_payment','rpc_register_payable_payment',
                               'fn_reverse_payment','fn_generate_receivable_from_entrega',
                               'fn_entrega_guard_faturamento_v1'))
  UNION ALL SELECT 'R12 SECURITY DEFINER + search_path preservados',
         (SELECT bool_and(prosecdef AND array_to_string(coalesce(proconfig,'{}'),',') ILIKE '%search_path%')
            FROM pg_proc WHERE pronamespace='public'::regnamespace
             AND proname IN ('rpc_register_receivable_payment','rpc_register_payable_payment',
                             'fn_reverse_payment','fn_generate_receivable_from_entrega',
                             'fn_entrega_guard_faturamento_v1'))
  UNION ALL SELECT 'R13 razão de baixas append-only do H6 preservada',
         (SELECT count(*) FROM pg_trigger
           WHERE tgrelid IN ('public.receivable_payments'::regclass,'public.payable_payments'::regclass)
             AND NOT tgisinternal) >= 2
)
SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM checks ORDER BY gate;
