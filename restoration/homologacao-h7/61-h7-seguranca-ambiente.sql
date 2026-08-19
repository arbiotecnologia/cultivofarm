-- FASE H7 — Testes estruturais (A), ambiente (C) e segurança/RLS (E).
-- Transacional e idempotente: termina em ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE v_ok int := 0; v_fail int := 0; v_n int; v_txt text;
BEGIN
  -- A1: RLS habilitada em todas as tabelas fiscais.
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r'
     AND (c.relname LIKE 'fiscal%' OR c.relname LIKE 'company_fiscal%')
     AND NOT c.relrowsecurity;
  IF v_n=0 THEN v_ok:=v_ok+1; RAISE NOTICE 'A1 PASS RLS em todas as tabelas fiscais';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'A1 FAIL % tabelas fiscais sem RLS', v_n; END IF;

  -- A2: nenhuma função fiscal executável por anon.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND (p.proname LIKE '%fiscal%' OR p.proname LIKE '%nfe%')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n=0 THEN v_ok:=v_ok+1; RAISE NOTICE 'A2 PASS anon sem EXECUTE fiscal';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'A2 FAIL % funcoes fiscais para anon', v_n; END IF;

  -- A3: SECURITY DEFINER fiscal sempre com search_path fixo.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND (p.proname LIKE '%fiscal%' OR p.proname LIKE '%nfe%')
     AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) x WHERE x LIKE 'search_path=%'));
  IF v_n=0 THEN v_ok:=v_ok+1; RAISE NOTICE 'A3 PASS search_path fixo em todos os SECURITY DEFINER fiscais';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'A3 FAIL % funcoes sem search_path', v_n; END IF;

  -- A4: buckets fiscais privados.
  SELECT count(*) INTO v_n FROM storage.buckets WHERE public AND (id LIKE '%fiscal%' OR id LIKE '%xml%');
  IF v_n=0 THEN v_ok:=v_ok+1; RAISE NOTICE 'A4 PASS buckets fiscais privados';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'A4 FAIL % buckets fiscais publicos', v_n; END IF;

  -- A5: material de certificado sem policy de leitura (fechado a qualquer usuário).
  SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename='fiscal_certificate_material';
  IF v_n=0 THEN v_ok:=v_ok+1; RAISE NOTICE 'A5 PASS fiscal_certificate_material sem policy (fail-closed)';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'A5 FAIL % policies expondo material de certificado', v_n; END IF;

  -- C1: marcador de ambiente presente, staging e produção proibida.
  SELECT project_ref||'|'||environment_label||'|'||production_emission_allowed::int
    INTO v_txt FROM public.fiscal_environment_marker WHERE id;
  IF v_txt = 'ikaauvsflpmamgxmkhoq|STAGING|0' THEN
    v_ok:=v_ok+1; RAISE NOTICE 'C1 PASS marcador = %', v_txt;
  ELSE v_fail:=v_fail+1; RAISE WARNING 'C1 FAIL marcador inesperado: %', v_txt; END IF;

  -- C2: marcador em PRODUCTION bloqueia o gate mesmo com tpAmb valido.
  UPDATE public.fiscal_environment_marker SET environment_label='PRODUCTION' WHERE id;
  BEGIN
    PERFORM public.fn_fiscal_environment_gate_v1('C2');
    v_fail:=v_fail+1; RAISE WARNING 'C2 FAIL gate liberou com marcador PRODUCTION';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FISCAL_PRODUCTION_DISABLED%' THEN v_ok:=v_ok+1; RAISE NOTICE 'C2 PASS marcador produtivo bloqueado';
    ELSE v_fail:=v_fail+1; RAISE WARNING 'C2 FAIL erro inesperado: %', SQLERRM; END IF;
  END;
  UPDATE public.fiscal_environment_marker SET environment_label='STAGING' WHERE id;

  -- C3: production_emission_allowed=true tambem bloqueia (dupla trava).
  UPDATE public.fiscal_environment_marker SET production_emission_allowed=true WHERE id;
  BEGIN
    PERFORM public.fn_fiscal_assert_staging_marker('C3');
    v_fail:=v_fail+1; RAISE WARNING 'C3 FAIL flag produtiva nao bloqueou';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FISCAL_PRODUCTION_DISABLED%' THEN v_ok:=v_ok+1; RAISE NOTICE 'C3 PASS flag produtiva bloqueada';
    ELSE v_fail:=v_fail+1; RAISE WARNING 'C3 FAIL erro inesperado: %', SQLERRM; END IF;
  END;
  UPDATE public.fiscal_environment_marker SET production_emission_allowed=false WHERE id;

  -- C4: nenhuma policy de escrita no marcador (somente service_role/migration).
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND tablename='fiscal_environment_marker' AND cmd <> 'SELECT';
  IF v_n=0 THEN v_ok:=v_ok+1; RAISE NOTICE 'C4 PASS marcador nao editavel por usuario autenticado';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'C4 FAIL % policies de escrita no marcador', v_n; END IF;

  -- E1: preflight canonico exige competencia fiscal e nao e acessivel a anon.
  IF NOT has_function_privilege('anon','public.rpc_fiscal_preflight_v1(uuid)','EXECUTE') THEN
    v_ok:=v_ok+1; RAISE NOTICE 'E1 PASS preflight negado a anon';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'E1 FAIL preflight executavel por anon'; END IF;

  -- E2: RPCs de transmissao/numeração negadas a anon.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('rpc_fiscal_reserve_nfe_number_v1','rpc_fiscal_xml_prepare_v1','rpc_fiscal_calculate_invoice_v1')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_n=0 THEN v_ok:=v_ok+1; RAISE NOTICE 'E2 PASS numeracao/XML negados a anon';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'E2 FAIL % RPCs criticas para anon', v_n; END IF;

  -- E3: documentos fiscais nao sao legiveis por anon (grant de tabela).
  IF NOT has_table_privilege('anon','public.fiscal_invoices','SELECT')
     AND NOT has_table_privilege('anon','public.fiscal_invoice_items','SELECT') THEN
    v_ok:=v_ok+1; RAISE NOTICE 'E3 PASS documentos fiscais negados a anon';
  ELSE v_fail:=v_fail+1; RAISE WARNING 'E3 FAIL anon com SELECT em documentos fiscais'; END IF;

  RAISE NOTICE '== H7 SEGURANCA/AMBIENTE: % PASS / % FAIL ==', v_ok, v_fail;
  IF v_fail>0 THEN RAISE EXCEPTION 'H7_SEC_ENV_FAIL: % falhas', v_fail; END IF;
END $$;

ROLLBACK;
