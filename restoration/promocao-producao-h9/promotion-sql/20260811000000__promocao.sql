-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260811000000_higienizacao_objetos_hml_sinteticos.sql
-- SHA-256 orig: 0208cb2928522898cc564d7153e6dff075f38a098e5b121d411f3f36e352c862
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-sql.py
-- Transformação: 1 bloco(s) DO de guarda removido(s); guarda canônica de promoção prefixada
--
-- A guarda de homologação foi REMOVIDA e substituída pela guarda canônica de
-- promoção. O runner valida o ref do alvo por canal externo (API/DSN) e só
-- então executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela
-- marcadora de homologação é consultada em produção.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- =====================================================================
-- MIGRATION CANÔNICA — HIGIENIZAÇÃO DE OBJETOS SINTÉTICOS DE HOMOLOGAÇÃO
-- Fonte canônica de supabase/migrations/20260811000000_higienizacao_objetos_hml_sinteticos.sql
--
-- Remove EXCLUSIVAMENTE objetos de teste/homologação comprovadamente
-- sintéticos, sem consumidor em fluxo real (auditoria de 2026-08-05):
--   * public.hml_b2b_e2e_evidence          (tabela de evidência de E2E)
--   * public.hml_fixture_registry          (+ trigger e função touch)
--   * public.rpc_hml_fiscal_emit_mock(...) (adapter fiscal SIMULADO)
--   * public._fiscal_hml_context           (contexto sintético de fixtures)
--   * public._fiscal_hml_inventory         (inventário de fixtures)
--   * public.ux_fi_one_mock_per_receivable (índice parcial do adapter mock)
--
-- NÃO REMOVE (consumidor real comprovado / infraestrutura de guarda):
--   * public._fiscal_staging_marker           -> guarda de ambiente
--   * public._motor_b2b_pre_phase1_snapshot   -> consumido por
--     restoration/motor-b2b-pre-phase1/restore-functions.sql (rollback)
--
-- Forward-only, idempotente, promovível. Nenhuma alteração de dados de
-- negócio; nenhuma fixture/harness é criada por esta migration.
-- Ambientes autorizados: STAGING/ikaauvsflpmamgxmkhoq e
--                        PRODUCTION/navfzbwgwzruipouyfnk
-- =====================================================================

-- ---------------------------------------------------------------------
-- GUARD FAIL-CLOSED DE AMBIENTE (PROMOVIVEL)
-- ---------------------------------------------------------------------
-- [guarda de homologação removida pelo gerador de promoção]


-- ---------------------------------------------------------------------
-- 1) Adapter fiscal SIMULADO — remove TODAS as assinaturas.
--    Fail-closed: aborta se existir qualquer nota fiscal emitida por ele.
-- ---------------------------------------------------------------------
DO $mock$
DECLARE
  r record;
  v_docs bigint;
BEGIN
  IF to_regclass('public.fiscal_invoices') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM public.fiscal_invoices WHERE provider = 'mock_homologation'$q$
      INTO v_docs;
    IF v_docs > 0 THEN
      RAISE EXCEPTION 'HML_ABORT: % documento(s) fiscais com provider=mock_homologation; remocao do adapter bloqueada', v_docs;
    END IF;
  END IF;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'rpc_hml_fiscal_emit_mock'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END
$mock$;

DROP INDEX IF EXISTS public.ux_fi_one_mock_per_receivable;

-- ---------------------------------------------------------------------
-- 2) Tabelas de evidência/inventário sintéticas.
--    _fiscal_hml_context e _fiscal_hml_inventory só podem cair vazias.
-- ---------------------------------------------------------------------
DO $tabs$
DECLARE
  v_n bigint;
BEGIN
  IF to_regclass('public._fiscal_hml_inventory') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public._fiscal_hml_inventory' INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'HML_ABORT: _fiscal_hml_inventory possui % linha(s); rode o cleanup do pacote antes', v_n;
    END IF;
  END IF;

  IF to_regclass('public._fiscal_hml_context') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public._fiscal_hml_context' INTO v_n;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'HML_ABORT: _fiscal_hml_context possui % linha(s); rode o cleanup do pacote antes', v_n;
    END IF;
  END IF;
END
$tabs$;

DROP TABLE IF EXISTS public._fiscal_hml_inventory;
DROP TABLE IF EXISTS public._fiscal_hml_context;
DROP TABLE IF EXISTS public.hml_b2b_e2e_evidence;

-- ---------------------------------------------------------------------
-- 3) Registro de fixtures de homologação (+ trigger e função de touch).
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_hml_fixture_registry_touch ON public.hml_fixture_registry;
DROP TABLE IF EXISTS public.hml_fixture_registry;
DROP FUNCTION IF EXISTS public.hml_fixture_registry_touch();
