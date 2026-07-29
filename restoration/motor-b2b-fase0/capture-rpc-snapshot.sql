-- FASE 0 — Motor Unificado de Preços e Condições Comerciais B2B
-- Snapshot READ-ONLY dos corpos vigentes das RPCs do motor.
-- Uso: executar em staging (ikaauvsflpmamgxmkhoq) e salvar a saída como
--      restoration/motor-b2b-fase0/rollback-rpcs-<data>.sql
-- O resultado já é SQL executável (CREATE OR REPLACE FUNCTION) e serve como
-- rollback exato para qualquer alteração feita na Fase 1.
--
-- Nenhuma escrita. Não expõe secrets.

SELECT
  p.proname                                        AS funcao,
  pg_get_function_identity_arguments(p.oid)        AS assinatura,
  p.prosecdef                                      AS security_definer,
  md5(pg_get_functiondef(p.oid))                   AS hash_corpo,
  pg_get_functiondef(p.oid) || E';\n'              AS sql_rollback
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'simulate_b2b_payment_plan_secure',
    'create_partner_order_secure',
    'generate_b2b_receivable_secure',
    'convert_partner_simulation_to_order_secure',
    'approve_b2b_payment_terms_secure',
    'reject_b2b_payment_terms_secure',
    'request_b2b_payment_terms_adjustment_secure',
    'add_b2b_payment_terms_note_secure',
    'approve_b2b_credit',
    'cancel_b2b_receivable_secure'
  )
ORDER BY p.proname, assinatura;
