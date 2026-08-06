-- =====================================================================
-- FASE F3.1-R2 — RESTAURACAO HISTORICA EXATA (BLOQUEADA POR PADRAO)
-- STAGING ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk PROIBIDA.
--
-- !!! AVISO !!!
-- Este script restaura o estado ANTERIOR a toda a cadeia
--   20260818000000 + 20260819000000 + 20260820000000 + 20260821000000
-- incluindo funcoes, triggers, policies, grants, comments e URLs.
-- Ele REINTRODUZ VULNERABILIDADES CONHECIDAS (EXECUTE para anon em cinco
-- RPCs fiscais, ausencia do gate de ambiente e do guard de homologacao).
-- NAO e' o caminho de rollback operacional: use rollback-safe.sql.
--
-- Exige liberacao explicita:
--   psql "$STAGING_DSN" -X --single-transaction -v ON_ERROR_STOP=1 \
--     -v ALLOW_INSECURE_HISTORICAL_ROLLBACK=YES -f restore-historical-exact.sql
--
-- Nao apaga reservas, snapshots, documentos nem historicos.
-- =====================================================================
\set ON_ERROR_STOP on

\if :{?ALLOW_INSECURE_HISTORICAL_ROLLBACK}
\else
  \echo 'BLOQUEADO: defina -v ALLOW_INSECURE_HISTORICAL_ROLLBACK=YES para prosseguir.'
  \quit
\endif

SELECT CASE WHEN :'ALLOW_INSECURE_HISTORICAL_ROLLBACK' = 'YES' THEN 1
            ELSE (SELECT 1/0) END AS allow_flag_ok;

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
  RAISE WARNING 'RESTAURACAO HISTORICA INSEGURA AUTORIZADA EXPLICITAMENTE.';
END $g$;

-- 1) Objetos criados pela cadeia F3.1 (inexistentes antes de 20260818000000).
DROP TRIGGER IF EXISTS trg_fiscal_homologation_evidence_guard ON public.company_fiscal_settings;
DROP FUNCTION IF EXISTS public.tg_fiscal_homologation_evidence_guard();
DROP FUNCTION IF EXISTS public.fn_fiscal_assert_environment_homologation();

-- 2) Replay cronologico das migrations canonicas anteriores (CREATE OR REPLACE,
--    idempotentes). Restaura funcoes, triggers, policies e URLs pre-F3.1.
--    SHA-256 verificados no relatorio:
--      20260816000000 f1125b8aafdfdeb8e6034f8a79945a0e160356d3ed0cb7c2cbfc493ba2f9c511
--      20260816010000 709ddec895d83e9af0e7debfb5aed8b33cf1bb280079b2181a12ac298b4b8ce5
--      20260817000000 38a260755954eb61b9254e116a8fb421c5c517853e4133e4f346ceb2de9eebef
--      20260817010000 79e28504e27ed7f2f9c938c911a765983bd94fa1855bcbf9e0398aa22bd47d0c
--      20260817020000 8ac9412be78d93e63c0ff93a1d10116cd943e69e691d597a6babd7ee687ae1b0
--      20260817030000 07831bafbd071bd88db782312d9671a6ba92a0e00c8cbe3c3f90117edaf13191
\i supabase/migrations/20260816000000_fase_f3_prontidao_calculo_nfe.sql
\i supabase/migrations/20260816010000_fase_f3_politica_unicidade_destino.sql
\i supabase/migrations/20260817000000_fase_f3_correcao_auditoria.sql
\i supabase/migrations/20260817010000_fase_f3_correcao_fontes.sql
\i supabase/migrations/20260817020000_fase_f3_correcao_fcpst.sql
\i supabase/migrations/20260817030000_fase_f3_correcao_calcmode.sql

-- 3) Funcoes auxiliares introduzidas por 20260818000000, removidas apenas
--    depois do replay (as RPCs anteriores nao dependem delas).
DROP FUNCTION IF EXISTS public.fn_fiscal_rule_validate_synthetic(text, public.fiscal_tax_rules, jsonb);
DROP FUNCTION IF EXISTS public.fn_fiscal_assert_debtor_recipient(uuid);

-- 4) Grants historicos (INSEGUROS) revogados por 20260820000000.
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_company_settings_init() TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_draft_save(uuid, jsonb, jsonb, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_draft_validate_homologation(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_register_os(uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_revoke(uuid, text) TO anon;

-- 5) Ledger: remove a cadeia F3.1 completa.
DELETE FROM supabase_migrations.schema_migrations
 WHERE version IN ('20260818000000','20260819000000','20260820000000','20260821000000');

DO $$
BEGIN
  RAISE WARNING 'ESTADO HISTORICO RESTAURADO COM VULNERABILIDADES CONHECIDAS. Reaplique a cadeia F3.1 antes de qualquer uso.';
END $$;
