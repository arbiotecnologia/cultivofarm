-- =====================================================================
-- FASE F3.1-R2 — ROLLBACK SEGURO (CAMINHO PADRAO)
-- STAGING ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk PROIBIDA.
--
-- Reverte o COMPORTAMENTO introduzido por 20260821000000 (gate de ambiente
-- endurecido), restaurando a definicao anterior verbatim capturada via
-- pg_get_functiondef (md5 c2aa575a933e360682b413126af54002).
--
-- NUNCA reabre EXECUTE para PUBLIC/anon/authenticated: a superficie minima
-- e' mantida (falha fechado). Nao apaga dados, reservas, snapshots,
-- documentos nem historicos. Nao desabilita triggers.
--
-- Uso: psql "$STAGING_DSN" -X --single-transaction -v ON_ERROR_STOP=1 \
--        -f rollback-safe.sql
-- =====================================================================
\set ON_ERROR_STOP on

DO $g$
DECLARE v text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD: ambiente nao identificado';
  END IF;
  SELECT project_ref INTO v FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'GUARD: ambiente de PRODUCAO — execucao proibida';
  END IF;
  IF v IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'GUARD: somente staging ikaauvsflpmamgxmkhoq';
  END IF;
END $g$;

CREATE OR REPLACE FUNCTION public.fn_fiscal_assert_environment_homologation()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE env text;
BEGIN
  SELECT coalesce(cfs.nfe_environment_code,'2') INTO env
    FROM public.company_fiscal_settings cfs
   WHERE cfs.is_active
   ORDER BY cfs.updated_at DESC
   LIMIT 1;
  -- Fail-closed: ausencia de emitente ativo nao libera ambiente de producao.
  IF env IS NOT NULL AND env = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao (tpAmb=1) bloqueado na fase F3; teto READY_HOMOLOGATION.';
  END IF;
END;
$function$;

-- Superficie minima preservada deliberadamente (R1 concedia authenticated;
-- o rollback seguro NAO reabre esse grant).
REVOKE ALL ON FUNCTION public.fn_fiscal_assert_environment_homologation()
  FROM PUBLIC, anon, authenticated, service_role;

-- As revogacoes de PUBLIC/anon nas funcoes tg_fiscal% sao endurecimento puro
-- e permanecem aplicadas (rollback nao reabre vulnerabilidade conhecida).

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260821000000';

DO $$
BEGIN
  RAISE NOTICE 'ROLLBACK-SAFE F3.1-R2 aplicado. Grants PUBLIC/anon NAO foram reabertos. Nenhum dado removido.';
END $$;
