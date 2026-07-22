-- ============================================================================
-- Fase Fiscal 3.17.1 — 01-preflight.sql
-- ----------------------------------------------------------------------------
-- Preflight fail-fast para fixtures de homologação em STAGING.
--
-- Requisitos (todos obrigatórios):
--   1. tabela public._fiscal_staging_marker existe com uma linha
--      cujo marker = 'STAGING' e project_ref preenchido pelo operador.
--   2. GUC `app.fiscal_test_project_ref` está definido na sessão
--      (via `SET app.fiscal_test_project_ref = '<ref>';` no psql) e
--      coincide com o project_ref gravado no marker. Isso impede
--      execução acidental em outro projeto sem alteração explícita.
--   3. banco não parece produção pelo nome.
--   4. production_enabled em company_fiscal_settings NUNCA está true.
--   5. as migrations canônicas 20260724000000 e 20260725000000 estão
--      registradas em supabase_migrations.schema_migrations.
--
-- Este arquivo NUNCA cria o marker automaticamente. NUNCA insere
-- credenciais. NUNCA aceita fallback.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_marker_ref  text;
  v_session_ref text;
  v_prod_on     integer;
  v_mig_3_16    integer;
  v_mig_3_17    integer;
  v_mig_3_18    integer;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: tabela public._fiscal_staging_marker ausente. Crie o marker manualmente antes de rodar as fixtures.';
  END IF;

  SELECT project_ref
    INTO v_marker_ref
    FROM public._fiscal_staging_marker
   WHERE marker = 'STAGING'
   LIMIT 1;

  IF v_marker_ref IS NULL OR btrim(v_marker_ref) = '' THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: marker STAGING ausente ou sem project_ref.';
  END IF;

  BEGIN
    v_session_ref := current_setting('app.fiscal_test_project_ref', true);
  EXCEPTION WHEN OTHERS THEN
    v_session_ref := NULL;
  END;

  IF v_session_ref IS NULL OR btrim(v_session_ref) = '' THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: defina a GUC app.fiscal_test_project_ref na sessão psql antes das fixtures (SET app.fiscal_test_project_ref = ''<ref>'').';
  END IF;

  IF v_session_ref <> v_marker_ref THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: project_ref divergente entre sessão e marker. Execução bloqueada.';
  END IF;

  IF current_database() ILIKE '%prod%' OR current_database() ILIKE '%production%' THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: banco parece ser produção (%). Bloqueado.', current_database();
  END IF;

  -- production_enabled não pode estar true em nenhum registro.
  IF to_regclass('public.company_fiscal_settings') IS NOT NULL THEN
    SELECT count(*)::int INTO v_prod_on
      FROM public.company_fiscal_settings
     WHERE production_enabled = true;
    IF v_prod_on > 0 THEN
      RAISE EXCEPTION 'FISCAL_HML_ABORT: production_enabled=true detectado (% registros). Bloqueado.', v_prod_on;
    END IF;
  END IF;

  -- Migrations canônicas presentes.
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: tabela supabase_migrations.schema_migrations ausente.';
  END IF;

  EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = $1'
    INTO v_mig_3_16 USING '20260724000000';
  EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = $1'
    INTO v_mig_3_17 USING '20260725000000';
  EXECUTE 'SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = $1'
    INTO v_mig_3_18 USING '20260726000000';

  IF v_mig_3_16 = 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: migration 20260724000000 (Fase 3.16) não aplicada.';
  END IF;
  IF v_mig_3_17 = 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: migration 20260725000000 (Fase 3.17) não aplicada.';
  END IF;
  IF v_mig_3_18 = 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: migration 20260726000000 (Fase 3.18) não aplicada.';
  END IF;

  RAISE NOTICE 'FISCAL_HML preflight OK em % (project_ref=%).', current_database(), v_marker_ref;
END $$;

COMMIT;
