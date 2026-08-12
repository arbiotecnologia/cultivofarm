-- =====================================================================
-- OS AR BIO — HARDENING RESIDUAL (Fase 6 / superfície da esteira)
-- Incremental sobre 20260829000000_os_e2e_reconciliacao_entrega_cq.sql
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq
--
-- ACHADOS DA REAUDITORIA
--   A. public.vw_os_integridade_esteira concede TODOS os privilégios a
--      `anon` (inclusive SELECT) e privilégios de escrita a `authenticated`.
--      A view expõe o retrato operacional completo de cada OS.
--   B. rpc_validar_integridade_esteira (ambas as sobrecargas) e
--      rpc_cockpit_metricas_v1/v2 estão sem `pg_temp` no search_path.
--
-- Não altera lógica de negócio, definição de view nem corpo de função.
-- FAIL-CLOSED: exige marcador STAGING/ikaauvsflpmamgxmkhoq.
-- Idempotente. Rollback: 90-rollback-20260830000000.sql
-- =====================================================================

DO $guard$
DECLARE v_marker text; v_ref text; v_n int;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'ENV_ABORT: marcador de ambiente ausente — execução recusada';
  END IF;
  SELECT count(*) INTO v_n FROM public._fiscal_staging_marker;
  IF v_n <> 1 THEN RAISE EXCEPTION 'ENV_ABORT: marcador ambíguo (% linhas)', v_n; END IF;
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ENV_ABORT: PRODUÇÃO detectada — execução proibida';
  END IF;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ENV_ABORT: ambiente não é o staging autorizado';
  END IF;
END
$guard$;

-- A. View de integridade: leitura autenticada apenas, sem escrita, sem anon.
REVOKE ALL ON TABLE public.vw_os_integridade_esteira FROM anon;
REVOKE ALL ON TABLE public.vw_os_integridade_esteira FROM authenticated;
GRANT SELECT ON TABLE public.vw_os_integridade_esteira TO authenticated;
GRANT SELECT ON TABLE public.vw_os_integridade_esteira TO service_role;

-- B. search_path canônico nas funções remanescentes da superfície.
ALTER FUNCTION public.rpc_validar_integridade_esteira(uuid, text, text)
  SET search_path = public, auth, pg_temp;
ALTER FUNCTION public.rpc_validar_integridade_esteira(text, uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_cockpit_metricas_v1()
  SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_cockpit_metricas_v2(text, text[], text[], text[], boolean, date, date)
  SET search_path = public, pg_temp;

