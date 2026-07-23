-- =====================================================================
-- Fase H2 — Hardening estrutural das tabelas fiscais
--
-- Motivação runtime (staging ikaauvsflpmamgxmkhoq, produção intocada):
-- a auditoria confirmou que o papel `authenticated` (e em alguns casos
-- `anon`) ainda possui TRUNCATE, REFERENCES e TRIGGER nas tabelas
-- fiscais. RLS não protege TRUNCATE nem criação de FKs/triggers, então
-- policies existentes não impedem esvaziamento físico ou anexação de
-- dependências indevidas.
--
-- Esta migration é ADITIVA e idempotente: apenas REVOKE de privilégios
-- estruturais que não deveriam ter sido concedidos. Nenhuma policy, RLS,
-- função, DML legítimo ou grant de service_role é alterado.
--
-- Hardening extra em `fiscal_idempotency_keys`: gravação passa a ser
-- exclusivamente server-side/service_role, mantendo apenas o SELECT
-- administrativo já governado por RLS.
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
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated',
      t
    );
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon',
      t
    );
  END LOOP;
END
$$;

-- Hardening específico da tabela de idempotência: gravação server-side.
-- SELECT continua governado pelas policies vigentes; grants de
-- service_role permanecem intactos (não são tocados aqui).
REVOKE INSERT, UPDATE, DELETE ON public.fiscal_idempotency_keys FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fiscal_idempotency_keys FROM anon;
