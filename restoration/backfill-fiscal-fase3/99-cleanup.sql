-- Fase Fiscal 3.0.1 — cleanup do ambiente de backfill isolado.
-- DROP total do banco fiscal_test/staging. NUNCA rodar em produção.
DROP SCHEMA IF EXISTS fiscal_backfill_audit CASCADE;
DROP TABLE IF EXISTS public._fiscal_staging_marker;
