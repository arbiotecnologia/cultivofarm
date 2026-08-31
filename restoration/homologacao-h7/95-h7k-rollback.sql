-- FASE H7k — Rollback (reverte apenas o que o apply criou).
-- A função `rpc_fiscal_preflight_v1` NÃO é derrubada: ela é canônica e
-- pré-existente. Para reverter a versão h7k-v1, reaplique o script da fase
-- anterior que a definiu. Aqui removemos somente o que é aditivo.
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE public.fiscal_invoice_items
  DROP CONSTRAINT IF EXISTS h7k_fii_quantity_positive,
  DROP CONSTRAINT IF EXISTS h7k_fii_values_non_negative,
  DROP CONSTRAINT IF EXISTS h7k_fii_commercial_unit_present;

DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_fiscal_assert_staging_marker'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $do$;

COMMIT;
