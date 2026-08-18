-- H6c postcheck — somente leitura/estático. Staging ikaauvsflpmamgxmkhoq.
\pset pager off
WITH src AS (
  SELECT proname, prosrc, p.oid, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
), t AS (
  SELECT 'T1 valor_faturavel usa payment_terms_id canonico' AS teste,
         (SELECT prosrc FROM src WHERE proname='fn_entrega_valor_faturavel_v1')
           LIKE '%v_po.payment_terms_id%' AS ok
  UNION ALL SELECT 'T2 valor_faturavel sem ORDER BY created_at DESC LIMIT 1',
         (SELECT prosrc FROM src WHERE proname='fn_entrega_valor_faturavel_v1')
           NOT LIKE '%ORDER BY created_at DESC LIMIT 1%'
  UNION ALL SELECT 'T3 fluxo oficial B2B usa termo canonico do gate',
         (SELECT prosrc FROM src WHERE proname='generate_b2b_receivable_secure_impl')
           LIKE '%payment_terms_not_canonical%'
  UNION ALL SELECT 'T4 elegibilidade bloqueia termo nao vinculado',
         (SELECT prosrc FROM src WHERE proname='fn_b2b_order_billing_eligibility')
           LIKE '%PAYMENT_TERMS_NOT_LINKED%'
  UNION ALL SELECT 'T5 elegibilidade fail-closed em nao aprovado',
         (SELECT prosrc FROM src WHERE proname='fn_b2b_order_billing_eligibility')
           LIKE '%PAYMENT_TERMS_NOT_APPROVED%'
  UNION ALL SELECT 'T6 guard bloqueia condicao B2B pendente',
         (SELECT prosrc FROM src WHERE proname='fn_entrega_guard_faturamento_v1')
           LIKE '%condicao_b2b_bloqueada%'
  UNION ALL SELECT 'T7 rateio economico por produto (parcial multi-item)',
         (SELECT prosrc FROM src WHERE proname='fn_entrega_valor_faturavel_v1')
           LIKE '%participacao_economica_aceita_x_snapshot%'
  UNION ALL SELECT 'T8 trigger de credito B2B instalado',
         EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_h6c_entrega_ar_b2b_link' AND NOT tgisinternal)
  UNION ALL SELECT 'T9 trigger idempotente (ON CONFLICT DO NOTHING)',
         (SELECT prosrc FROM src WHERE proname='fn_h6c_entrega_ar_b2b_link')
           LIKE '%ON CONFLICT (partner_order_id) DO NOTHING%'
  UNION ALL SELECT 'T10 trigger propaga partner_id ao recebivel',
         (SELECT prosrc FROM src WHERE proname='fn_h6c_entrega_ar_b2b_link')
           LIKE '%UPDATE public.accounts_receivable%'
  UNION ALL SELECT 'T11 search_path fixo nas funcoes H6c',
         NOT EXISTS (SELECT 1 FROM src WHERE proname IN (
             'fn_entrega_valor_faturavel_v1','fn_b2b_order_billing_eligibility',
             'fn_entrega_guard_faturamento_v1','fn_h6c_entrega_ar_b2b_link',
             'generate_b2b_receivable_secure_impl')
           AND NOT COALESCE(proconfig::text,'') LIKE '%search_path=public%')
  UNION ALL SELECT 'T12 anon sem EXECUTE nas funcoes H6c',
         NOT EXISTS (SELECT 1 FROM src WHERE proname IN (
             'fn_entrega_valor_faturavel_v1','fn_b2b_order_billing_eligibility',
             'fn_entrega_guard_faturamento_v1','generate_b2b_receivable_secure_impl')
           AND has_function_privilege('anon', oid, 'EXECUTE'))
  UNION ALL SELECT 'T13 idempotencia financeira H6b preservada',
         (SELECT prosrc FROM src WHERE proname='rpc_register_receivable_payment')
           LIKE '%FIN_IDEMPOTENCY_CONFLICT%'
)
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS r, teste FROM t ORDER BY teste;
