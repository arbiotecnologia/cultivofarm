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
DECLARE
  c_staging constant text := 'ikaauvsflpmamgxmkhoq';
  c_prod    constant text := 'navfzbwgwzruipouyfnk';
  v_ref  text;
  v_rows integer;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: tabela public._fiscal_staging_marker inexistente';
  END IF;
  SELECT count(*) INTO v_rows FROM public._fiscal_staging_marker WHERE marker = 'STAGING';
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'GUARD_ABORT: esperada exatamente 1 linha marker=STAGING, encontradas %', v_rows;
  END IF;
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker = 'STAGING';
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: project_ref nulo no marcador de staging';
  END IF;
  IF v_ref = c_prod THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente de producao recusado';
  END IF;
  IF v_ref IS DISTINCT FROM c_staging THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente % nao autorizado', v_ref;
  END IF;
END
$guard$;

\ir ../../supabase/migrations/20260805040000_visita_canonica_failclosed.sql
\ir ../../supabase/migrations/20260805041601_752b9122-f0e1-4646-9c4a-7c1393deae8d.sql
