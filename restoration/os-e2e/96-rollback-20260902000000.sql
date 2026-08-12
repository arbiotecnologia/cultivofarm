-- Rollback exato da migration 20260902000000_os_guard_marker_canonico.
-- Alvo EXCLUSIVO staging ikaauvsflpmamgxmkhoq; produção RECUSADA.
DO $guard$
DECLARE v_marker text; v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: marcador ausente';
  END IF;
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_PRODUCAO: rollback proibido em navfzbwgwzruipouyfnk';
  END IF;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: alvo nao autorizado';
  END IF;
END
$guard$;

DROP FUNCTION IF EXISTS public.fn_os_assert_staging_exato();
