-- =============================================================================
-- FASE H7g — POSTCHECK (somente staging ikaauvsflpmamgxmkhoq).
-- Transacional e read-only por efeito: todo fixture é revertido no ROLLBACK.
-- Cobre H7G-001 (vínculo run↔invoice), H7G-002 (evento server-side),
-- H7G-004 (semântica de resultado) e menor privilégio.
-- =============================================================================
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_ref text; v_prod boolean;
  v_actor uuid; v_inv_a uuid; v_inv_b uuid; v_run uuid; v_tx uuid; v_event uuid;
  v_key_a text := '31' || repeat('7', 42);
  v_key_b text := '31' || repeat('8', 42);
  v_res jsonb; v_txt text; v_pass int := 0; v_n int;
BEGIN
  SELECT project_ref, production_emission_allowed INTO v_ref, v_prod
    FROM public.fiscal_environment_marker LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' OR coalesce(v_prod, true) THEN
    RAISE EXCEPTION 'H7G POSTCHECK ABORT: ambiente nao autorizado (%)', v_ref;
  END IF;

  SELECT user_id INTO v_actor FROM public.user_roles WHERE role = 'administrador' LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'H7G POSTCHECK ABORT: ator fiscal ausente'; END IF;

  -- ===== H7G-01 estrutura: colunas e constraints canônicas =================
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'fiscal_sefaz_transmissions'
                    AND column_name IN ('outcome')) THEN
    RAISE EXCEPTION 'FAIL H7G-01: coluna outcome ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'fiscal_sefaz_transmissions'
                    AND column_name = 'fiscal_event_id') THEN
    RAISE EXCEPTION 'FAIL H7G-01: coluna fiscal_event_id ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fiscal_sefaz_tx_outcome') THEN
    RAISE EXCEPTION 'FAIL H7G-01: constraint de outcome ausente';
  END IF;
  v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-01 estrutura outcome/fiscal_event_id';

  -- ===== H7G-02 guard de vínculo em nível de banco ========================
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.fiscal_sefaz_transmissions'::regclass
                    AND tgname = 'trg_fiscal_sefaz_tx_link_guard' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'FAIL H7G-02: trigger de vinculo ausente';
  END IF;
  v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-02 trigger de vinculo presente';

  -- ===== Fixtures ==========================================================
  INSERT INTO public.fiscal_invoices (invoice_type, created_by, access_key, environment, status)
  VALUES ('NFE', v_actor, v_key_a, 'HOMOLOGATION', 'DRAFT') RETURNING id INTO v_inv_a;
  INSERT INTO public.fiscal_invoices (invoice_type, created_by, access_key, environment, status)
  VALUES ('NFE', v_actor, v_key_b, 'HOMOLOGATION', 'DRAFT') RETURNING id INTO v_inv_b;

  INSERT INTO public.fiscal_xml_runs (
    fiscal_invoice_id, idempotency_key, schema_version, environment_code,
    access_key, state, payload, payload_sha256, signed_path)
  VALUES (v_inv_a, 'H7G-POSTCHECK-RUN', 'PL_009_V4', '2', v_key_a, 'SIGNED',
          '{}'::jsonb, repeat('a', 64), 'nfe/' || v_inv_a || '/signed.xml')
  RETURNING id INTO v_run;

  -- ===== H7G-03 autorização com invoice divergente é bloqueada ============
  BEGIN
    PERFORM public.rpc_fiscal_sefaz_transmit_begin_v1(
      'NFeAutorizacao4', 'H7G-MISMATCH', repeat('b', 64),
      'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
      v_inv_b, v_run, v_actor, NULL);
    RAISE EXCEPTION 'FAIL H7G-03: invoice divergente foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SEFAZ_INVOICE_RUN_MISMATCH%' THEN RAISE; END IF;
    v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-03 invoice divergente bloqueado (%)', SQLERRM;
  END;

  -- ===== H7G-04 invoice omitido usa o canônico do run =====================
  v_res := public.rpc_fiscal_sefaz_transmit_begin_v1(
    'NFeAutorizacao4', 'H7G-CANONICO', repeat('c', 64),
    'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
    NULL, v_run, v_actor, NULL);
  v_tx := (v_res ->> 'transmissionId')::uuid;
  IF (SELECT fiscal_invoice_id FROM public.fiscal_sefaz_transmissions WHERE id = v_tx)
     IS DISTINCT FROM v_inv_a THEN
    RAISE EXCEPTION 'FAIL H7G-04: invoice canonico do run nao foi derivado';
  END IF;
  v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-04 invoice derivado do run';

  -- ===== H7G-05 replay idempotente estável ================================
  v_res := public.rpc_fiscal_sefaz_transmit_begin_v1(
    'NFeAutorizacao4', 'H7G-CANONICO', repeat('c', 64),
    'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
    v_inv_a, v_run, v_actor, NULL);
  IF (v_res ->> 'idempotentReplay') IS DISTINCT FROM 'true'
     OR (v_res ->> 'transmissionId')::uuid <> v_tx THEN
    RAISE EXCEPTION 'FAIL H7G-05: replay nao foi estavel';
  END IF;
  v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-05 replay estavel com invoice coincidente';

  -- ===== H7G-06 INSERT direto divergente é bloqueado pelo trigger =========
  BEGIN
    INSERT INTO public.fiscal_sefaz_transmissions (
      fiscal_invoice_id, xml_run_id, service, endpoint_host, endpoint_url,
      idempotency_key, request_fingerprint)
    VALUES (v_inv_b, v_run, 'NFeAutorizacao4', 'hnfe.fazenda.mg.gov.br',
            'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
            'H7G-DIRETO', repeat('d', 64));
    RAISE EXCEPTION 'FAIL H7G-06: insert direto divergente foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SEFAZ_INVOICE_RUN_MISMATCH%' THEN RAISE; END IF;
    v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-06 defense-in-depth no banco (%)', SQLERRM;
  END;

  -- ===== H7G-07 evento sem vínculo canônico é bloqueado ===================
  BEGIN
    PERFORM public.rpc_fiscal_sefaz_transmit_begin_v1(
      'NFeRecepcaoEvento4', 'H7G-EVT-SEM-ID', repeat('e', 64),
      'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4',
      v_inv_a, NULL, v_actor, NULL);
    RAISE EXCEPTION 'FAIL H7G-07: evento sem fiscal_event_id foi aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SEFAZ_EVENT%' THEN RAISE; END IF;
    v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-07 evento exige vinculo canonico (%)', SQLERRM;
  END;

  -- ===== H7G-08 evento em NF-e não autorizada é bloqueado =================
  BEGIN
    PERFORM public.rpc_fiscal_event_sefaz_prepare_v1(
      v_inv_b, 'CANCELLATION', 'Cancelamento por erro de digitacao no destinatario',
      'H7G-EVT-NAOAUT', v_actor);
    RAISE EXCEPTION 'FAIL H7G-08: evento aceito sem autorizacao da NF-e';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%FISCAL_EVENT_INVOICE_NOT_AUTHORIZED%' THEN RAISE; END IF;
    v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-08 evento exige NF-e autorizada';
  END;

  -- ===== Autoriza sinteticamente a NF-e A (via RPC canônica de registro) ==
  PERFORM public.rpc_fiscal_sefaz_transmit_record_v1(v_tx, 'SENT', '{}'::jsonb);
  PERFORM public.rpc_fiscal_sefaz_transmit_record_v1(v_tx, 'SUCCEEDED', jsonb_build_object(
    'cStat', '104', 'protocolCStat', '100', 'xMotivo', 'Lote processado',
    'chNFe', v_key_a, 'nProt', '131260000000001', 'tpAmb', '2'));

  -- ===== H7G-09 outcome derivado server-side ==============================
  SELECT outcome INTO v_txt FROM public.fiscal_sefaz_transmissions WHERE id = v_tx;
  IF v_txt IS DISTINCT FROM 'AUTHORIZED' THEN
    RAISE EXCEPTION 'FAIL H7G-09: outcome esperado AUTHORIZED, obtido %', v_txt;
  END IF;
  v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-09 outcome AUTHORIZED derivado de cStat/protocolo';

  -- ===== H7G-10 rejeição não vira autorização =============================
  DECLARE v_tx_rej uuid; v_run_b uuid;
  BEGIN
    INSERT INTO public.fiscal_xml_runs (
      fiscal_invoice_id, idempotency_key, schema_version, environment_code,
      access_key, state, payload, payload_sha256, signed_path)
    VALUES (v_inv_b, 'H7G-POSTCHECK-RUN-B', 'PL_009_V4', '2', v_key_b, 'SIGNED',
            '{}'::jsonb, repeat('b', 64), 'nfe/' || v_inv_b || '/signed.xml')
    RETURNING id INTO v_run_b;
    v_res := public.rpc_fiscal_sefaz_transmit_begin_v1(
      'NFeAutorizacao4', 'H7G-REJEICAO', repeat('f', 64),
      'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
      NULL, v_run_b, v_actor, NULL);
    v_tx_rej := (v_res ->> 'transmissionId')::uuid;
    PERFORM public.rpc_fiscal_sefaz_transmit_record_v1(v_tx_rej, 'SUCCEEDED', jsonb_build_object(
      'cStat', '539', 'xMotivo', 'Duplicidade de NF-e', 'tpAmb', '2'));
    SELECT outcome INTO v_txt FROM public.fiscal_sefaz_transmissions WHERE id = v_tx_rej;
    IF v_txt IS DISTINCT FROM 'REJECTED' THEN
      RAISE EXCEPTION 'FAIL H7G-10: rejeicao produziu outcome %', v_txt;
    END IF;
  END;
  v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-10 rejeicao SEFAZ nao autoriza documento';

  -- ===== H7G-11 cancelamento sem motivo válido é bloqueado ================
  BEGIN
    PERFORM public.rpc_fiscal_event_sefaz_prepare_v1(
      v_inv_a, 'CANCELLATION', 'erro', 'H7G-EVT-SEMMOTIVO', v_actor);
    RAISE EXCEPTION 'FAIL H7G-11: motivo invalido aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%FISCAL_EVENT_REASON_INVALID%' THEN RAISE; END IF;
    v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-11 motivo normativo obrigatorio';
  END;

  -- ===== H7G-12 tipo de evento não suportado é bloqueado ==================
  BEGIN
    PERFORM public.rpc_fiscal_event_sefaz_prepare_v1(
      v_inv_a, 'MANIFESTACAO', 'Motivo suficientemente longo para o teste',
      'H7G-EVT-TIPO', v_actor);
    RAISE EXCEPTION 'FAIL H7G-12: tipo nao oficial aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%FISCAL_EVENT_TYPE_UNSUPPORTED%' THEN RAISE; END IF;
    v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-12 apenas tipos oficiais suportados';
  END;

  -- ===== H7G-13 fluxo positivo: prepare -> sign -> begin ==================
  v_res := public.rpc_fiscal_event_sefaz_prepare_v1(
    v_inv_a, 'CANCELLATION', 'Cancelamento por erro de digitacao no destinatario',
    'H7G-EVT-OK', v_actor);
  v_event := (v_res ->> 'eventId')::uuid;
  IF (v_res ->> 'eventCode') <> '110111' OR (v_res ->> 'accessKey') <> v_key_a THEN
    RAISE EXCEPTION 'FAIL H7G-13: preparo nao vinculou chave/codigo canonicos';
  END IF;
  PERFORM public.rpc_fiscal_event_sefaz_mark_signed_v1(
    v_event, 'eventos/' || v_inv_a || '/' || v_event || '.xml', repeat('1', 64), v_actor);
  SELECT state INTO v_txt FROM public.v_fiscal_sefaz_event_state WHERE event_id = v_event;
  IF v_txt IS DISTINCT FROM 'SIGNED' THEN
    RAISE EXCEPTION 'FAIL H7G-13: evento nao chegou a SIGNED (%)', v_txt;
  END IF;
  v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-13 evento preparado e assinado server-side';

  -- ===== H7G-14 replay do preparo é estável; payload divergente falha =====
  v_res := public.rpc_fiscal_event_sefaz_prepare_v1(
    v_inv_a, 'CANCELLATION', 'Cancelamento por erro de digitacao no destinatario',
    'H7G-EVT-OK', v_actor);
  IF (v_res ->> 'eventId')::uuid <> v_event THEN
    RAISE EXCEPTION 'FAIL H7G-14: replay do preparo gerou novo evento';
  END IF;
  BEGIN
    PERFORM public.rpc_fiscal_event_sefaz_prepare_v1(
      v_inv_a, 'CANCELLATION', 'Outro motivo completamente diferente do original',
      'H7G-EVT-OK', v_actor);
    RAISE EXCEPTION 'FAIL H7G-14: mismatch de idempotencia aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%FISCAL_EVENT_IDEMPOTENCY_MISMATCH%' THEN RAISE; END IF;
  END;
  v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-14 idempotencia de evento estavel e fail-closed';

  -- ===== H7G-15 evento de outro invoice não transporta ====================
  BEGIN
    PERFORM public.rpc_fiscal_sefaz_transmit_begin_v1(
      'NFeRecepcaoEvento4', 'H7G-EVT-CRUZADO', repeat('9', 64),
      'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4',
      v_inv_b, NULL, v_actor, v_event);
    RAISE EXCEPTION 'FAIL H7G-15: evento cruzado entre invoices aceito';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SEFAZ_EVENT_INVOICE_MISMATCH%' THEN RAISE; END IF;
    v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-15 evento cruzado bloqueado';
  END;

  -- ===== H7G-16 transporte do evento vincula event/invoice canônicos =====
  v_res := public.rpc_fiscal_sefaz_transmit_begin_v1(
    'NFeRecepcaoEvento4', 'H7G-EVT-TX', repeat('7', 64),
    'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4',
    NULL, NULL, v_actor, v_event);
  v_tx := (v_res ->> 'transmissionId')::uuid;
  SELECT count(*) INTO v_n FROM public.fiscal_sefaz_transmissions
   WHERE id = v_tx
     AND fiscal_event_id = v_event AND fiscal_invoice_id = v_inv_a;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL H7G-16: vinculo evento/invoice ausente'; END IF;
  v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-16 transmissao de evento vinculada';

  -- ===== H7G-17 reconciliação append-only preserva histórico =============
  PERFORM public.rpc_fiscal_sefaz_transmit_record_v1(v_tx, 'SUCCEEDED', jsonb_build_object(
    'cStat', '135', 'xMotivo', 'Evento registrado e vinculado a NF-e',
    'nProt', '131260000000009', 'tpAmb', '2'));
  PERFORM public.rpc_fiscal_event_sefaz_reconcile_v1(
    v_event, v_tx, '135', 'Evento registrado e vinculado a NF-e',
    '131260000000009', now());
  SELECT count(*) INTO v_n FROM public.fiscal_events
   WHERE fiscal_invoice_id = v_inv_a AND sefaz_event_code = '110111';
  IF v_n < 3 THEN RAISE EXCEPTION 'FAIL H7G-17: historico do evento nao e append-only (%)', v_n; END IF;
  SELECT state INTO v_txt FROM public.v_fiscal_sefaz_event_state WHERE event_id = v_event;
  IF v_txt IS DISTINCT FROM 'REGISTERED' THEN
    RAISE EXCEPTION 'FAIL H7G-17: estado final esperado REGISTERED, obtido %', v_txt;
  END IF;
  v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-17 reconciliacao append-only do evento';

  -- ===== H7G-18 menor privilégio nas RPCs de escrita =====================
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('rpc_fiscal_event_sefaz_prepare_v1',
                       'rpc_fiscal_event_sefaz_mark_signed_v1',
                       'rpc_fiscal_event_sefaz_reconcile_v1',
                       'rpc_fiscal_sefaz_transmit_begin_v1',
                       'rpc_fiscal_sefaz_transmit_record_v1')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL H7G-18: % RPCs de escrita expostas a perfis publicos', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname LIKE 'rpc_fiscal_event_sefaz%'
     AND (p.proconfig IS NULL OR NOT p.proconfig::text LIKE '%search_path%');
  IF v_n <> 0 THEN RAISE EXCEPTION 'FAIL H7G-18: % RPCs sem search_path explicito', v_n; END IF;
  v_pass := v_pass + 1; RAISE NOTICE 'PASS H7G-18 menor privilegio e search_path explicitos';

  RAISE NOTICE '================ H7G POSTCHECK: % checks PASS ================', v_pass;
  IF v_pass < 18 THEN RAISE EXCEPTION 'H7G POSTCHECK incompleto (%)', v_pass; END IF;
END $$;

ROLLBACK;
