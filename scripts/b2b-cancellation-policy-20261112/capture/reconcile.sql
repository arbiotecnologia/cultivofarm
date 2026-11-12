CREATE OR REPLACE FUNCTION public.rpc_fiscal_event_sefaz_reconcile_v1(_event_id uuid, _transmission_id uuid, _c_stat text, _x_motivo text, _n_prot text DEFAULT NULL::text, _dh_registro timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_state record; v_type text; v_key text; v_id uuid;
BEGIN
  SELECT * INTO v_state FROM public.v_fiscal_sefaz_event_state WHERE event_id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EVENT_NOT_FOUND'; END IF;
  IF coalesce(_c_stat, '') = '' THEN RAISE EXCEPTION 'FISCAL_EVENT_CSTAT_REQUIRED'; END IF;

  v_type := CASE WHEN _c_stat IN ('135','136','155')
                 THEN 'SEFAZ_EVENT_REGISTERED' ELSE 'SEFAZ_EVENT_REJECTED' END;
  v_key := 'RECONCILE:' || _event_id::text || ':' || _c_stat || ':' || coalesce(_n_prot, '-');

  IF EXISTS (
    SELECT 1 FROM public.fiscal_events
     WHERE related_event_id = _event_id AND idempotency_key = v_key) THEN
    RETURN jsonb_build_object('eventId', _event_id, 'state',
      CASE WHEN v_type = 'SEFAZ_EVENT_REGISTERED' THEN 'REGISTERED' ELSE 'REJECTED' END,
      'idempotentReplay', true);
  END IF;

  INSERT INTO public.fiscal_events (
    fiscal_invoice_id, event_type, event_source, related_event_id,
    sefaz_event_code, sefaz_seq_evento, sefaz_access_key,
    sefaz_c_stat, sefaz_n_prot, sefaz_transmission_id,
    idempotency_key, payload_fingerprint, response_snapshot, notes)
  VALUES (
    v_state.fiscal_invoice_id, v_type, 'SEFAZ_HOMOLOGATION', _event_id,
    v_state.sefaz_event_code, v_state.sefaz_seq_evento, v_state.sefaz_access_key,
    _c_stat, _n_prot, _transmission_id,
    v_key, encode(extensions.digest(v_key, 'sha256'), 'hex'),
    jsonb_build_object('cStat', _c_stat, 'xMotivo', left(coalesce(_x_motivo, ''), 200),
                       'nProt', _n_prot, 'dhRegistro', _dh_registro,
                       'environmentCode', '2'),
    left(coalesce(_x_motivo, ''), 2000))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('eventId', _event_id, 'reconciliationEventId', v_id,
    'state', CASE WHEN v_type = 'SEFAZ_EVENT_REGISTERED' THEN 'REGISTERED' ELSE 'REJECTED' END,
    'idempotentReplay', false);
END $function$