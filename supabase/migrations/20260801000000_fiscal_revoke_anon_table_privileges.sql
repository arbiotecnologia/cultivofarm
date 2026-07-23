-- =====================================================================
-- Fase H2 — Revogação total de privilégios de tabela do role `anon`
--
-- Evidência runtime (staging ikaauvsflpmamgxmkhoq, produção intocada):
-- após 20260731000000, `authenticated`/`anon` ficaram sem
-- TRUNCATE/REFERENCES/TRIGGER e `fiscal_idempotency_keys` ficou
-- somente-SELECT. Auditoria complementar confirma que `anon` NÃO deve
-- ter qualquer privilégio de tabela nas superfícies fiscais — todo
-- acesso legítimo passa por sessão autenticada + RLS + RPCs.
--
-- Esta migration é ADITIVA e idempotente: apenas `REVOKE ALL` no role
-- `anon`. Não altera `authenticated`, `service_role`, policies, RLS,
-- funções, DML legítimo nem frontend. Zero regra de negócio afetada.
-- =====================================================================

DO $$
DECLARE
  t text;
  fiscal_tables text[] := ARRAY[
    'company_fiscal_settings',
    'product_fiscal_profiles',
    'service_fiscal_profiles',
    'customer_fiscal_profiles',
    'fiscal_invoices',
    'fiscal_invoice_items',
    'fiscal_events',
    'fiscal_idempotency_keys',
    'fiscal_audit_log',
    'financial_documents'
  ];
BEGIN
  FOREACH t IN ARRAY fiscal_tables LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon',
      t
    );
  END LOOP;
END
$$;
