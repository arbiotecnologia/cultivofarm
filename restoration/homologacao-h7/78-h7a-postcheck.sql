-- H7A — POSTCHECK comportamental do guard de certificate_ref (staging apenas).
-- Transacional e idempotente: termina em ROLLBACK. Nenhum segredo é manipulado.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_ok int := 0; v_fail int := 0; v_settings uuid;
BEGIN
  -- Pré-condição: staging autorizado.
  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_environment_marker
    WHERE project_ref = 'ikaauvsflpmamgxmkhoq'
      AND environment_label = 'STAGING'
      AND production_emission_allowed = false
  ) THEN
    RAISE EXCEPTION 'H7A_POSTCHECK: ambiente nao autorizado';
  END IF;

  SELECT id INTO v_settings FROM public.company_fiscal_settings WHERE is_active LIMIT 1;

  -- P1: trigger instalado.
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_fiscal_certificate_ref_guard') THEN
    v_ok := v_ok + 1; RAISE NOTICE 'P1 PASS trigger de certificate_ref instalado';
  ELSE v_fail := v_fail + 1; RAISE WARNING 'P1 FAIL trigger ausente'; END IF;

  -- P2: valor arbitrário (não UUID) é rejeitado.
  BEGIN
    UPDATE public.company_fiscal_settings SET certificate_ref = 'CERT-MANUAL-123' WHERE id = v_settings;
    v_fail := v_fail + 1; RAISE WARNING 'P2 FAIL referencia arbitraria aceita';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'certificate_ref_invalid%' THEN v_ok := v_ok + 1; RAISE NOTICE 'P2 PASS referencia arbitraria rejeitada';
    ELSE v_fail := v_fail + 1; RAISE WARNING 'P2 FAIL erro inesperado: %', SQLERRM; END IF;
  END;

  -- P3: UUID inexistente/sem certificado ativo de homologação é rejeitado.
  BEGIN
    UPDATE public.company_fiscal_settings SET certificate_ref = gen_random_uuid()::text WHERE id = v_settings;
    v_fail := v_fail + 1; RAISE WARNING 'P3 FAIL uuid sem certificado ativo aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'certificate_ref_not_active_homologation%' THEN v_ok := v_ok + 1; RAISE NOTICE 'P3 PASS uuid sem certificado ativo rejeitado';
    ELSE v_fail := v_fail + 1; RAISE WARNING 'P3 FAIL erro inesperado: %', SQLERRM; END IF;
  END;

  -- P4: limpar a referência continua permitido (revogação/rollback seguro).
  BEGIN
    UPDATE public.company_fiscal_settings SET certificate_ref = NULL WHERE id = v_settings;
    v_ok := v_ok + 1; RAISE NOTICE 'P4 PASS limpeza de referencia permitida';
  EXCEPTION WHEN OTHERS THEN
    v_fail := v_fail + 1; RAISE WARNING 'P4 FAIL limpeza bloqueada: %', SQLERRM;
  END;

  -- P5: RPC de registro A1 não executável por anon/authenticated.
  IF NOT has_function_privilege('anon',
        'public.rpc_fiscal_certificate_register_a1(uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,text[],text,text,integer,text,text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated',
        'public.rpc_fiscal_certificate_register_a1(uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,text[],text,text,integer,text,text)', 'EXECUTE') THEN
    v_ok := v_ok + 1; RAISE NOTICE 'P5 PASS registro A1 restrito a service_role';
  ELSE v_fail := v_fail + 1; RAISE WARNING 'P5 FAIL registro A1 exposto a roles publicas'; END IF;

  -- P6: nenhuma coluna de senha/segredo persistido no material do certificado.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fiscal_certificate_material'
      AND (column_name ILIKE '%password%' OR column_name ILIKE '%senha%')
  ) THEN
    v_ok := v_ok + 1; RAISE NOTICE 'P6 PASS material sem coluna de senha';
  ELSE v_fail := v_fail + 1; RAISE WARNING 'P6 FAIL coluna de senha presente no material'; END IF;

  -- P7: material do certificado sem policies e sem grants para roles publicas.
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='fiscal_certificate_material') = 0
     AND NOT has_table_privilege('anon','public.fiscal_certificate_material','SELECT')
     AND NOT has_table_privilege('authenticated','public.fiscal_certificate_material','SELECT') THEN
    v_ok := v_ok + 1; RAISE NOTICE 'P7 PASS material fail-closed';
  ELSE v_fail := v_fail + 1; RAISE WARNING 'P7 FAIL material acessivel ao frontend'; END IF;

  RAISE NOTICE '== H7A POSTCHECK: % PASS / % FAIL ==', v_ok, v_fail;
  IF v_fail > 0 THEN RAISE EXCEPTION 'H7A_POSTCHECK_FAIL: % falhas', v_fail; END IF;
END $$;

ROLLBACK;
