-- ============================================================================
-- Fase Fiscal 3.17 — 03-verify.sql
-- ----------------------------------------------------------------------------
-- Provas de integridade das fixtures de homologação. Aborta com erro se
-- qualquer invariante falhar.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_bad_env    integer;
  v_bad_status integer;
  v_missing    integer;
  v_no_snap    integer;
  v_outside    integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker WHERE marker = 'STAGING') THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: marker STAGING ausente.';
  END IF;

  -- Zero produção nas fixtures.
  SELECT count(*) INTO v_bad_env
    FROM public.fiscal_invoices
   WHERE internal_reference LIKE 'FISCAL_HML_%'
     AND environment <> 'HOMOLOGATION';
  IF v_bad_env > 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: % rascunhos fora de HOMOLOGATION.', v_bad_env;
  END IF;

  -- Zero AUTHORIZED/ISSUED.
  SELECT count(*) INTO v_bad_status
    FROM public.fiscal_invoices
   WHERE internal_reference LIKE 'FISCAL_HML_%'
     AND status IN ('AUTHORIZED','ISSUED','TRANSMITTED');
  IF v_bad_status > 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: % rascunhos com status proibido.', v_bad_status;
  END IF;

  -- Existência mínima.
  SELECT count(*) INTO v_missing
    FROM public.fiscal_invoices
   WHERE internal_reference IN ('FISCAL_HML_NFE_OK','FISCAL_HML_NFSE_OK','FISCAL_HML_NFE_INCOMPLETO');
  IF v_missing < 3 THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: fixtures esperadas ausentes (%/3).', v_missing;
  END IF;

  -- Snapshots presentes nos rascunhos válidos.
  SELECT count(*) INTO v_no_snap
    FROM public.fiscal_invoices
   WHERE internal_reference IN ('FISCAL_HML_NFE_OK','FISCAL_HML_NFSE_OK')
     AND (fiscal_profile_snapshot = '{}'::jsonb OR fiscal_profile_snapshot IS NULL);
  IF v_no_snap > 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: % rascunhos válidos sem snapshot.', v_no_snap;
  END IF;

  -- Nenhuma fixture fora do escopo.
  SELECT count(*) INTO v_outside
    FROM public.clientes
   WHERE nome LIKE 'FISCAL_HML_%'
     AND nome NOT IN ('FISCAL_HML_CLIENTE_A','FISCAL_HML_CLIENTE_B');
  IF v_outside > 0 THEN
    RAISE EXCEPTION 'FISCAL_HML_VERIFY: % clientes com prefixo fora do inventário.', v_outside;
  END IF;

  RAISE NOTICE 'FISCAL_HML verify OK.';
END $$;

COMMIT;
