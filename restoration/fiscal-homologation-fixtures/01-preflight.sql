-- ============================================================================
-- Fase Fiscal 3.17 — 01-preflight.sql
-- ----------------------------------------------------------------------------
-- Preflight fail-fast para fixtures de homologação. Aborta se o marker
-- STAGING não estiver presente na tabela public._fiscal_staging_marker.
-- Este arquivo NUNCA cria o marker automaticamente.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_marker_exists boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM public._fiscal_staging_marker
     WHERE marker = 'STAGING'
  ) INTO v_marker_exists;

  IF NOT v_marker_exists THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: marker STAGING ausente. Execução bloqueada por segurança.';
  END IF;

  IF current_database() ILIKE '%prod%' OR current_database() ILIKE '%production%' THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: banco parece ser produção (%). Bloqueado.', current_database();
  END IF;

  RAISE NOTICE 'FISCAL_HML preflight OK em %.', current_database();
END $$;

COMMIT;
