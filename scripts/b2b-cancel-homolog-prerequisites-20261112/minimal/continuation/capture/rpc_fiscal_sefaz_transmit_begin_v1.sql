CREATE OR REPLACE FUNCTION public.rpc_fiscal_sefaz_transmit_begin_v1(_service text, _idempotency_key text, _request_fingerprint text, _endpoint_url text, _invoice_id uuid DEFAULT NULL::uuid, _xml_run_id uuid DEFAULT NULL::uuid, _actor uuid DEFAULT NULL::uuid, _event_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ref       text;
  v_prod      boolean;
  v_tpamb     text;
  v_host      text;
  v_run       public.fiscal_xml_runs;
  v_ev        record;
  v_invoice   uuid := _invoice_id;
  v_existing  public.fiscal_sefaz_transmissions;
  v_row       public.fiscal_sefaz_transmissions;
BEGIN
  IF coalesce(btrim(_idempotency_key), '') = '' OR length(_idempotency_key) > 200 THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_IDEMPOTENCY_INVALID';
  END IF;
  IF coalesce(btrim(_request_fingerprint), '') = '' THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_FINGERPRINT_REQUIRED';
  END IF;

  SELECT project_ref, production_emission_allowed INTO v_ref, v_prod
    FROM public.fiscal_environment_marker LIMIT 1;
  IF v_ref IS DISTINCT FROM 'vrlcdwmlytukrjezrrnf' OR coalesce(v_prod, true) THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  SELECT coalesce(nfe_environment_code, '') INTO v_tpamb
    FROM public.company_fiscal_settings WHERE is_active LIMIT 1;
  IF v_tpamb IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  v_host := split_part(split_part(_endpoint_url, '://', 2), '/', 1);
  IF _endpoint_url NOT LIKE 'https://hnfe.fazenda.mg.gov.br/%'
     OR v_host <> 'hnfe.fazenda.mg.gov.br' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  -- H7G-001: na autorização, o invoice é DERIVADO do XML run. O parâmetro do
  -- chamador nunca é autoridade; divergência é bloqueio duro.
  IF _service = 'NFeAutorizacao4' THEN
    IF _xml_run_id IS NULL THEN RAISE EXCEPTION 'SEFAZ_RUN_REQUIRED'; END IF;
    SELECT * INTO v_run FROM public.fiscal_xml_runs WHERE id = _xml_run_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'SEFAZ_RUN_NOT_FOUND'; END IF;
    IF v_run.state IS DISTINCT FROM 'SIGNED' OR coalesce(v_run.signed_path, '') = '' THEN
      RAISE EXCEPTION 'SEFAZ_DOCUMENT_NOT_SIGNED';
    END IF;
    IF coalesce(v_run.environment_code, '') <> '2' THEN
      RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
    END IF;
    IF coalesce(v_run.access_key, '') !~ '^[0-9]{44}$' THEN
      RAISE EXCEPTION 'SEFAZ_ACCESS_KEY_INVALID';
    END IF;
    IF v_run.fiscal_invoice_id IS NULL THEN RAISE EXCEPTION 'SEFAZ_RUN_INVOICE_MISSING'; END IF;
    IF _invoice_id IS NOT NULL AND _invoice_id IS DISTINCT FROM v_run.fiscal_invoice_id THEN
      RAISE EXCEPTION 'SEFAZ_INVOICE_RUN_MISMATCH';
    END IF;
    v_invoice := v_run.fiscal_invoice_id;
  END IF;

  -- H7G-002: no evento, invoice e chave vêm do evento fiscal canônico.
  IF _service = 'NFeRecepcaoEvento4' THEN
    IF _event_id IS NULL THEN RAISE EXCEPTION 'SEFAZ_EVENT_REQUIRED'; END IF;
    SELECT * INTO v_ev FROM public.v_fiscal_sefaz_event_state WHERE event_id = _event_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'SEFAZ_EVENT_NOT_FOUND'; END IF;
    IF v_ev.state <> 'SIGNED' THEN RAISE EXCEPTION 'SEFAZ_EVENT_NOT_SIGNED'; END IF;
    IF _invoice_id IS NOT NULL AND _invoice_id IS DISTINCT FROM v_ev.fiscal_invoice_id THEN
      RAISE EXCEPTION 'SEFAZ_EVENT_INVOICE_MISMATCH';
    END IF;
    v_invoice := v_ev.fiscal_invoice_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('fiscal_sefaz_tx:' || _idempotency_key, 0));

  SELECT * INTO v_existing FROM public.fiscal_sefaz_transmissions
   WHERE idempotency_key = _idempotency_key;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM _request_fingerprint THEN
      RAISE EXCEPTION 'FISCAL_TRANSMISSION_IDEMPOTENCY_MISMATCH';
    END IF;
    RETURN jsonb_build_object(
      'transmissionId', v_existing.id, 'state', v_existing.state,
      'outcome', v_existing.outcome,
      'service', v_existing.service, 'correlationId', v_existing.correlation_id,
      'invoiceId', v_existing.fiscal_invoice_id, 'eventId', v_existing.fiscal_event_id,
      'cStat', v_existing.c_stat, 'xMotivo', v_existing.x_motivo,
      'chNFe', v_existing.ch_nfe, 'nProt', v_existing.n_prot,
      'idempotentReplay', true);
  END IF;

  -- Documento já autorizado nunca é reenviado (invoice canônico).
  IF v_invoice IS NOT NULL AND _service IN ('NFeAutorizacao4','NFeRetAutorizacao4') THEN
    SELECT * INTO v_existing FROM public.fiscal_sefaz_transmissions
     WHERE fiscal_invoice_id = v_invoice
       AND state = 'SUCCEEDED'
       AND outcome = 'AUTHORIZED'
     ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'transmissionId', v_existing.id, 'state', v_existing.state,
        'outcome', v_existing.outcome,
        'service', v_existing.service, 'correlationId', v_existing.correlation_id,
        'invoiceId', v_existing.fiscal_invoice_id,
        'cStat', v_existing.c_stat, 'xMotivo', v_existing.x_motivo,
        'chNFe', v_existing.ch_nfe, 'nProt', v_existing.n_prot,
        'alreadyAuthorized', true, 'idempotentReplay', true);
    END IF;
  END IF;

  INSERT INTO public.fiscal_sefaz_transmissions (
    fiscal_invoice_id, xml_run_id, fiscal_event_id, service, environment_code,
    endpoint_host, endpoint_url, idempotency_key, request_fingerprint,
    state, outcome, attempt, created_by)
  VALUES (v_invoice, _xml_run_id, _event_id, _service, '2',
          v_host, _endpoint_url, _idempotency_key, _request_fingerprint,
          'PENDING', 'PENDING', 1, _actor)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'transmissionId', v_row.id, 'state', v_row.state, 'outcome', v_row.outcome,
    'service', v_row.service, 'correlationId', v_row.correlation_id,
    'invoiceId', v_row.fiscal_invoice_id, 'eventId', v_row.fiscal_event_id,
    'idempotentReplay', false);
END $function$
;
