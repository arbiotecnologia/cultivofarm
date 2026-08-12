-- =====================================================================
-- FASE 6 — Guard canônico por MARKER EXATO (remediação incremental).
--
-- Contexto: a migration 20260831000000_os_e2e_fase5_idempotencia.sql usa
-- apenas assinatura estrutural (existência de funções) como guard, sem
-- conferir o marker exato do staging. Esta migration NÃO reescreve aquela:
-- cria o guard canônico reutilizável e o aplica de forma auditável.
--
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq.
-- Produção navfzbwgwzruipouyfnk: explicitamente RECUSADA.
-- =====================================================================

-- Guard fail-closed desta própria migration (marker exato).
DO $guard$
DECLARE v_marker text; v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: marcador de ambiente ausente';
  END IF;
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_PRODUCAO: migration proibida em navfzbwgwzruipouyfnk';
  END IF;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: alvo nao e o staging ikaauvsflpmamgxmkhoq';
  END IF;
END
$guard$;

-- Guard canônico reutilizável pelas próximas migrations/harnesses.
CREATE OR REPLACE FUNCTION public.fn_os_assert_staging_exato()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_marker text; v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: marcador de ambiente ausente';
  END IF;
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_PRODUCAO: operacao proibida em navfzbwgwzruipouyfnk';
  END IF;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: alvo nao e o staging ikaauvsflpmamgxmkhoq';
  END IF;
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_os_assert_staging_exato() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_os_assert_staging_exato() FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_os_assert_staging_exato() TO service_role;

-- Registro auditável da remediação da 20260831000000.
COMMENT ON FUNCTION public.fn_os_assert_staging_exato() IS
  'Guard canonico por marker exato (STAGING/ikaauvsflpmamgxmkhoq). Remedia a '
  'ausencia de marker exato no guard da migration 20260831000000_os_e2e_fase5_idempotencia.';

-- Reafirmação: os objetos da Fase 5 existem e estão neste staging.
DO $post$
DECLARE v_faltando text;
BEGIN
  PERFORM public.fn_os_assert_staging_exato();
  SELECT string_agg(x, ', ') INTO v_faltando
    FROM unnest(ARRAY['_rpc_avancar_esteira_laboratorio_internal',
                      'fn_entrega_confirmar_engine_v1',
                      'fn_cq_ultimo_resultado']) AS x
   WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                      WHERE n.nspname='public' AND p.proname=x);
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'POSTCHECK_FALHOU: objetos ausentes: %', v_faltando;
  END IF;
  RAISE NOTICE 'POSTCHECK_OK: guard canonico criado e Fase 5/6 integra.';
END
$post$;
