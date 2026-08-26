-- FASE H7f — Postcheck do transporte SEFAZ-MG homologação.
-- Somente leitura + fixtures transacionais (rollback ao final).
BEGIN;

CREATE TEMP TABLE h7f_result(check_name text, status text) ON COMMIT DROP;

DO $$
DECLARE
  v_ok   boolean;
  v_id   uuid;
  v_json jsonb;
  v_msg  text;
BEGIN
  -- H7F-1: tabela com RLS ativa
  SELECT relrowsecurity INTO v_ok FROM pg_class
   WHERE oid = 'public.fiscal_sefaz_transmissions'::regclass;
  INSERT INTO h7f_result VALUES ('H7F-1 RLS ativa na tabela de transmissoes',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END);

  -- H7F-2: anon sem qualquer privilegio
  SELECT count(*) = 0 INTO v_ok FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='fiscal_sefaz_transmissions' AND grantee='anon';
  INSERT INTO h7f_result VALUES ('H7F-2 anon sem grants na tabela',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END);

  -- H7F-3: authenticated somente SELECT
  SELECT coalesce(bool_and(privilege_type='SELECT'), false) INTO v_ok
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='fiscal_sefaz_transmissions'
     AND grantee='authenticated';
  INSERT INTO h7f_result VALUES ('H7F-3 authenticated somente leitura',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END);

  -- H7F-4: RPCs de escrita negadas a anon e authenticated
  SELECT NOT (
      has_function_privilege('anon',
        'public.rpc_fiscal_sefaz_transmit_begin_v1(text,text,text,text,uuid,uuid,uuid)','EXECUTE')
   OR has_function_privilege('authenticated',
        'public.rpc_fiscal_sefaz_transmit_begin_v1(text,text,text,text,uuid,uuid,uuid)','EXECUTE')
   OR has_function_privilege('anon',
        'public.rpc_fiscal_sefaz_transmit_record_v1(uuid,text,jsonb)','EXECUTE')
   OR has_function_privilege('authenticated',
        'public.rpc_fiscal_sefaz_transmit_record_v1(uuid,text,jsonb)','EXECUTE')
   OR has_function_privilege('anon',
        'public.rpc_fiscal_sefaz_transmission_status_v1(uuid)','EXECUTE')
  ) INTO v_ok;
  INSERT INTO h7f_result VALUES ('H7F-4 RPC de transporte restrita a service_role',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END);

  -- H7F-5: search_path explicito nas funcoes novas
  SELECT coalesce(bool_and(p.proconfig::text LIKE '%search_path%'), false) INTO v_ok
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('rpc_fiscal_sefaz_transmit_begin_v1',
                       'rpc_fiscal_sefaz_transmit_record_v1',
                       'rpc_fiscal_sefaz_transmission_status_v1',
                       'fn_fiscal_sefaz_tx_guard');
  INSERT INTO h7f_result VALUES ('H7F-5 search_path fixo nas funcoes de transporte',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END);

  -- H7F-6: endpoint de producao bloqueado
  v_ok := false;
  BEGIN
    PERFORM public.rpc_fiscal_sefaz_transmit_begin_v1(
      'NFeStatusServico4','H7F-PROD-'||gen_random_uuid()::text,'fp',
      'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_ok := v_msg LIKE '%FISCAL_PRODUCTION_ENDPOINT_BLOCKED%';
  END;
  INSERT INTO h7f_result VALUES ('H7F-6 endpoint de producao bloqueado',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END);

  -- H7F-7: replay idempotente estavel
  v_json := public.rpc_fiscal_sefaz_transmit_begin_v1(
    'NFeStatusServico4','H7F-POSTCHECK-A','fp-a',
    'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4');
  v_id := (v_json->>'transmissionId')::uuid;
  v_json := public.rpc_fiscal_sefaz_transmit_begin_v1(
    'NFeStatusServico4','H7F-POSTCHECK-A','fp-a',
    'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4');
  INSERT INTO h7f_result VALUES ('H7F-7 replay idempotente nao duplica',
    CASE WHEN (v_json->>'transmissionId')::uuid = v_id
          AND (v_json->>'idempotentReplay')::boolean THEN 'PASS' ELSE 'FAIL' END);

  -- H7F-8: mesma chave com payload diferente => mismatch
  v_ok := false;
  BEGIN
    PERFORM public.rpc_fiscal_sefaz_transmit_begin_v1(
      'NFeStatusServico4','H7F-POSTCHECK-A','fp-DIFERENTE',
      'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_ok := v_msg LIKE '%IDEMPOTENCY_MISMATCH%';
  END;
  INSERT INTO h7f_result VALUES ('H7F-8 fingerprint divergente rejeitado',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END);

  -- H7F-9: retorno com tpAmb de producao bloqueia
  v_ok := false;
  BEGIN
    PERFORM public.rpc_fiscal_sefaz_transmit_record_v1(
      v_id, 'SUCCEEDED', jsonb_build_object('cStat','107','tpAmb','1'));
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_ok := v_msg LIKE '%FISCAL_PRODUCTION_ENDPOINT_BLOCKED%';
  END;
  INSERT INTO h7f_result VALUES ('H7F-9 retorno tpAmb=1 bloqueado',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END);

  -- H7F-10: estado terminal e imutavel e DELETE proibido
  PERFORM public.rpc_fiscal_sefaz_transmit_record_v1(
    v_id, 'SUCCEEDED', jsonb_build_object('cStat','107','xMotivo','Servico em Operacao','tpAmb','2'));
  v_ok := false;
  BEGIN
    PERFORM public.rpc_fiscal_sefaz_transmit_record_v1(v_id, 'FAILED', '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_ok := v_msg LIKE '%FISCAL_TRANSMISSION_IMMUTABLE%';
  END;
  INSERT INTO h7f_result VALUES ('H7F-10 estado terminal imutavel',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END);

  v_ok := false;
  BEGIN
    DELETE FROM public.fiscal_sefaz_transmissions WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_ok := v_msg LIKE '%APPEND_ONLY%';
  END;
  INSERT INTO h7f_result VALUES ('H7F-11 transmissao append-only',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END);
END $$;

SELECT check_name, status FROM h7f_result ORDER BY check_name;

DO $$
DECLARE v_fail int;
BEGIN
  SELECT count(*) INTO v_fail FROM h7f_result WHERE status <> 'PASS';
  RAISE NOTICE '== H7F POSTCHECK: % PASS / % FAIL ==',
    (SELECT count(*) FROM h7f_result WHERE status='PASS'), v_fail;
  IF v_fail > 0 THEN RAISE EXCEPTION 'H7F POSTCHECK FALHOU'; END IF;
END $$;

ROLLBACK;
