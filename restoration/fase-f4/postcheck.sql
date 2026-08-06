-- =====================================================================
-- Fase F4 — POSTCHECK estrutural (read-only, fail-fast).
-- Alvo: staging ikaauvsflpmamgxmkhoq. Aborta na primeira divergência.
-- =====================================================================
\set ON_ERROR_STOP on

DO $$
DECLARE
  n int; v text;
BEGIN
  -- G01 tabelas criadas
  IF to_regclass('public.fiscal_xml_runs') IS NULL THEN
    RAISE EXCEPTION 'G01 FAIL: fiscal_xml_runs ausente'; END IF;
  IF to_regclass('public.fiscal_xsd_registry') IS NULL THEN
    RAISE EXCEPTION 'G02 FAIL: fiscal_xsd_registry ausente'; END IF;

  -- G03 RLS habilitada e forçada
  SELECT count(*) INTO n FROM pg_class
   WHERE oid IN ('public.fiscal_xml_runs'::regclass,'public.fiscal_xsd_registry'::regclass)
     AND relrowsecurity AND relforcerowsecurity;
  IF n <> 2 THEN RAISE EXCEPTION 'G03 FAIL: RLS nao habilitada/forcada nas 2 tabelas (%).', n; END IF;

  -- G04 nenhuma policy de escrita
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename IN ('fiscal_xml_runs','fiscal_xsd_registry')
     AND cmd <> 'SELECT';
  IF n <> 0 THEN RAISE EXCEPTION 'G04 FAIL: % policies de escrita encontradas', n; END IF;

  -- G05 anon sem qualquer privilegio nas tabelas
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name IN ('fiscal_xml_runs','fiscal_xsd_registry')
     AND grantee IN ('anon','PUBLIC');
  IF n <> 0 THEN RAISE EXCEPTION 'G05 FAIL: anon/PUBLIC com % grants', n; END IF;

  -- G06 authenticated apenas SELECT
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name IN ('fiscal_xml_runs','fiscal_xsd_registry')
     AND grantee='authenticated' AND privilege_type <> 'SELECT';
  IF n <> 0 THEN RAISE EXCEPTION 'G06 FAIL: authenticated com % privilegios de escrita', n; END IF;

  -- G07 RPCs existem
  IF to_regprocedure('public.rpc_fiscal_xml_prepare_v1(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'G07 FAIL: rpc_fiscal_xml_prepare_v1 ausente'; END IF;
  IF to_regprocedure('public.rpc_fiscal_xml_record_v1(uuid,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'G08 FAIL: rpc_fiscal_xml_record_v1 ausente'; END IF;
  IF to_regprocedure('public.rpc_fiscal_xml_status_v1(uuid)') IS NULL THEN
    RAISE EXCEPTION 'G09 FAIL: rpc_fiscal_xml_status_v1 ausente'; END IF;

  -- G10 record_v1 executavel APENAS por service_role (ACL via catalogo)
  SELECT array_to_string(proacl,',') INTO v FROM pg_proc
   WHERE oid = 'public.rpc_fiscal_xml_record_v1(uuid,text,jsonb)'::regprocedure;
  IF v IS NULL OR v ~ '(^|,)=X/' OR v ~ 'anon=X' OR v ~ 'authenticated=X' THEN
    RAISE EXCEPTION 'G10 FAIL: ACL indevida em rpc_fiscal_xml_record_v1: %', v; END IF;
  IF v !~ 'service_role=X' THEN
    RAISE EXCEPTION 'G10 FAIL: service_role sem EXECUTE em rpc_fiscal_xml_record_v1'; END IF;

  -- G11 prepare/status sem anon e sem PUBLIC
  FOR v IN SELECT array_to_string(proacl,',') FROM pg_proc
            WHERE oid IN ('public.rpc_fiscal_xml_prepare_v1(uuid,text)'::regprocedure,
                          'public.rpc_fiscal_xml_status_v1(uuid)'::regprocedure)
  LOOP
    IF v IS NULL OR v ~ '(^|,)=X/' OR v ~ 'anon=X' THEN
      RAISE EXCEPTION 'G11 FAIL: ACL indevida (PUBLIC/anon) em RPC F4: %', v; END IF;
  END LOOP;

  -- G12 SECURITY DEFINER + search_path fixo nas 3 RPCs e nos triggers
  SELECT count(*) INTO n FROM pg_proc
   WHERE oid IN ('public.rpc_fiscal_xml_prepare_v1(uuid,text)'::regprocedure,
                 'public.rpc_fiscal_xml_record_v1(uuid,text,jsonb)'::regprocedure,
                 'public.rpc_fiscal_xml_status_v1(uuid)'::regprocedure,
                 'public.tg_fiscal_xml_runs_immutable()'::regprocedure,
                 'public.tg_fiscal_xsd_registry_immutable()'::regprocedure)
     AND prosecdef
     AND array_to_string(proconfig,',') LIKE '%search_path=public,pg_temp%';
  IF n <> 5 THEN RAISE EXCEPTION 'G12 FAIL: % de 5 funcoes com SECURITY DEFINER + search_path fixo', n; END IF;

  -- G13 triggers de imutabilidade ativos
  SELECT count(*) INTO n FROM pg_trigger
   WHERE NOT tgisinternal
     AND tgname IN ('trg_fiscal_xml_runs_immutable','trg_fiscal_xsd_registry_immutable');
  IF n <> 2 THEN RAISE EXCEPTION 'G13 FAIL: % de 2 triggers de imutabilidade', n; END IF;

  -- G14 teto de ambiente: CHECK exige tpAmb=2
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid='public.fiscal_xml_runs'::regclass
       AND conname='fiscal_xml_runs_env_chk'
       AND pg_get_constraintdef(oid) ILIKE '%environment_code = ''2''%')
  THEN RAISE EXCEPTION 'G14 FAIL: CHECK de ambiente ausente/alterado'; END IF;

  -- G15 teto de estado: nenhum estado de transmissao/autorizacao no dominio
  SELECT pg_get_constraintdef(oid) INTO v FROM pg_constraint
   WHERE conrelid='public.fiscal_xml_runs'::regclass AND conname='fiscal_xml_runs_state_chk';
  IF v ILIKE '%AUTHORIZED%' OR v ILIKE '%TRANSMITTED%' OR v ILIKE '%SEFAZ%' THEN
    RAISE EXCEPTION 'G15 FAIL: dominio de estado permite transmissao: %', v; END IF;
  IF v NOT ILIKE '%SIGNED%' THEN RAISE EXCEPTION 'G15 FAIL: estado SIGNED ausente'; END IF;

  -- G16 chave de acesso com 44 digitos obrigatorios
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
     WHERE conrelid='public.fiscal_xml_runs'::regclass AND conname='fiscal_xml_runs_key_chk')
  THEN RAISE EXCEPTION 'G16 FAIL: CHECK da chave de acesso ausente'; END IF;

  -- G17 idempotencia unica por documento
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
     WHERE conrelid='public.fiscal_xml_runs'::regclass AND conname='fiscal_xml_runs_idem_unique')
  THEN RAISE EXCEPTION 'G17 FAIL: unicidade de idempotencia ausente'; END IF;

  -- G18 versionamento unico por documento
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND indexname='fiscal_xml_runs_invoice_version_uidx')
  THEN RAISE EXCEPTION 'G18 FAIL: indice unico de versao ausente'; END IF;

  -- G19 registro XSD semeado com fonte oficial gov.br
  SELECT count(*) INTO n FROM public.fiscal_xsd_registry
   WHERE is_active AND public.fn_fiscal_official_url_allowlisted(source_url);
  IF n < 2 THEN RAISE EXCEPTION 'G19 FAIL: registro XSD oficial incompleto (%)', n; END IF;

  -- G20 bucket privado dedicado
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='fiscal-xml' AND public = false) THEN
    RAISE EXCEPTION 'G20 FAIL: bucket fiscal-xml ausente ou publico'; END IF;

  -- G21 storage: nenhuma policy de escrita para o bucket
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND qual ILIKE '%fiscal-xml%' AND cmd <> 'SELECT';
  IF n <> 0 THEN RAISE EXCEPTION 'G21 FAIL: % policies de escrita no bucket fiscal-xml', n; END IF;

  -- G22 gate de ambiente F3.1-R2 continua referenciado pelo preparo
  IF pg_get_functiondef('public.rpc_fiscal_xml_prepare_v1(uuid,text)'::regprocedure)
     NOT LIKE '%fn_fiscal_assert_environment_homologation%' THEN
    RAISE EXCEPTION 'G22 FAIL: preparo sem gate de ambiente fail-closed'; END IF;

  -- G23 preparo exige calculo e reserva previos
  v := pg_get_functiondef('public.rpc_fiscal_xml_prepare_v1(uuid,text)'::regprocedure);
  IF v NOT LIKE '%FISCAL_CALCULATION_REQUIRED%'
     OR v NOT LIKE '%FISCAL_NUMBER_RESERVATION_REQUIRED%' THEN
    RAISE EXCEPTION 'G23 FAIL: preparo sem pre-requisitos de calculo/reserva'; END IF;

  -- G24 preparo bloqueia payload com chave sensivel
  IF v NOT LIKE '%fiscal_json_has_sensitive_key%' THEN
    RAISE EXCEPTION 'G24 FAIL: preparo sem guarda de dado sensivel'; END IF;

  -- G25 F3 permanece intacta (nao regressao)
  IF to_regprocedure('public.rpc_fiscal_calculate_invoice_v1(uuid,text)') IS NULL
     OR to_regprocedure('public.rpc_fiscal_reserve_nfe_number_v1(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'G25 FAIL: RPCs da fase F3 ausentes'; END IF;

  RAISE NOTICE 'POSTCHECK F4: 25/25 GATES PASS';
END$$;
