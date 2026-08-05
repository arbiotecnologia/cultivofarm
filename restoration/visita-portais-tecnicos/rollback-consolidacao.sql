-- ============================================================================
-- ROLLBACK LÓGICO DA CONSOLIDAÇÃO FINAL — VISITA TÉCNICA
-- Forward-safe, transacional, não destrutivo: reaplica o baseline anterior
-- (migrations 20260805040000 + 20260805041601) por CREATE OR REPLACE,
-- preservando assinaturas, owner, search_path e grants. Nada é removido.
--
-- Uso: psql "$STAGING_DSN" -v ON_ERROR_STOP=1 --single-transaction \
--        -f restoration/visita-portais-tecnicos/rollback-consolidacao.sql
-- ============================================================================
\set ON_ERROR_STOP on

DO $guard$
DECLARE v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: marcador de staging inexistente';
  END IF;
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente % nao autorizado', coalesce(v_ref, '<null>');
  END IF;
END
$guard$;

\ir ../../supabase/migrations/20260805040000_visita_canonica_failclosed.sql
\ir ../../supabase/migrations/20260805041601_752b9122-f0e1-4646-9c4a-7c1393deae8d.sql
