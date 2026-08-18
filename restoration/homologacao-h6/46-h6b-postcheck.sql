-- H6b — POSTCHECK ESTRUTURAL (somente leitura). Staging ikaauvsflpmamgxmkhoq.
-- Uso: psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f restoration/homologacao-h6/46-h6b-postcheck.sql
\pset pager off
WITH checks AS (
  SELECT 'H6B-S01 receivable_payments.request_fingerprint' AS gate,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='receivable_payments'
                    AND column_name='request_fingerprint') AS ok
  UNION ALL SELECT 'H6B-S02 payable_payments.request_fingerprint',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='payable_payments'
                    AND column_name='request_fingerprint')
  UNION ALL SELECT 'H6B-S03 unique installment+idempotency_key (AR)',
         EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                   AND tablename='receivable_payments' AND indexdef ILIKE '%UNIQUE%'
                   AND indexdef ILIKE '%idempotency_key%')
  UNION ALL SELECT 'H6B-S04 unique installment+idempotency_key (AP)',
         EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
                   AND tablename='payable_payments' AND indexdef ILIKE '%UNIQUE%'
                   AND indexdef ILIKE '%idempotency_key%')
  UNION ALL SELECT 'H6B-S05 fn_entrega_valor_faturavel_v1 existe',
         EXISTS (SELECT 1 FROM pg_proc WHERE proname='fn_entrega_valor_faturavel_v1'
                   AND pronamespace='public'::regnamespace)
  UNION ALL SELECT 'H6B-S06 entrega_reconciliacoes.valor_faturavel_origem',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='entrega_reconciliacoes'
                    AND column_name='valor_faturavel_origem')
  UNION ALL SELECT 'H6B-S07 idempotência obrigatória nas RPCs de baixa',
         (SELECT bool_and(prosrc ILIKE '%idempotency_key_obrigatoria%')
            FROM pg_proc WHERE proname IN ('rpc_register_receivable_payment','rpc_register_payable_payment'))
  UNION ALL SELECT 'H6B-S08 fingerprint/conflito estável nas RPCs de baixa',
         (SELECT bool_and(prosrc ILIKE '%FIN_IDEMPOTENCY_CONFLICT%')
            FROM pg_proc WHERE proname IN ('rpc_register_receivable_payment','rpc_register_payable_payment'))
  UNION ALL SELECT 'H6B-S09 estorno com replay idempotente',
         (SELECT prosrc ILIKE '%FIN_IDEMPOTENCY_CONFLICT%' FROM pg_proc WHERE proname='fn_reverse_payment' LIMIT 1)
  UNION ALL SELECT 'H6B-S10 guard de faturamento derivando valor server-side',
         (SELECT prosrc ILIKE '%fn_entrega_valor_faturavel_v1%'
            FROM pg_proc WHERE proname='fn_entrega_guard_faturamento_v1' LIMIT 1)
  UNION ALL SELECT 'H6B-S11 geração de AR valida total contra valor canônico',
         (SELECT prosrc ILIKE '%valor_faturavel%'
            FROM pg_proc WHERE proname='fn_generate_receivable_from_entrega' LIMIT 1)
  UNION ALL SELECT 'H6B-S12 SECURITY DEFINER + search_path fixo',
         (SELECT bool_and(prosecdef AND array_to_string(coalesce(proconfig,'{}'),',') ILIKE '%search_path%')
            FROM pg_proc WHERE proname IN ('rpc_register_receivable_payment','rpc_register_payable_payment',
                                           'fn_reverse_payment','fn_generate_receivable_from_entrega',
                                           'fn_entrega_valor_faturavel_v1'))
  UNION ALL SELECT 'H6B-S13 anon sem EXECUTE nas RPCs financeiras',
         NOT EXISTS (SELECT 1 FROM pg_proc p
                      WHERE p.pronamespace='public'::regnamespace
                        AND p.proname IN ('rpc_register_receivable_payment','rpc_register_payable_payment',
                                          'fn_reverse_payment','fn_generate_receivable_from_entrega',
                                          'fn_entrega_valor_faturavel_v1')
                        AND has_function_privilege('anon', p.oid, 'EXECUTE'))
  UNION ALL SELECT 'H6B-S14 razão de baixas append-only (AR)',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.receivable_payments'::regclass
                   AND NOT t.tgisinternal)
  UNION ALL SELECT 'H6B-S15 razão de baixas append-only (AP)',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.payable_payments'::regclass
                   AND NOT t.tgisinternal)
  UNION ALL SELECT 'H6B-S16 snapshot de títulos imutável (AR)',
         EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.accounts_receivable'::regclass
                   AND NOT t.tgisinternal)
)
SELECT gate, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status FROM checks ORDER BY gate;
