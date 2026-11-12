CREATE OR REPLACE FUNCTION public.rpc_fiscal_sefaz_transmit_record_v1(_transmission_id uuid, _state text, _patch jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row     public.fiscal_sefaz_transmissions;
  v_cur     public.fiscal_sefaz_transmissions;
  v_cstat   text;
  v_prot    text;
  v_outcome text;
  v_close_error text := NULL;
BEGIN
  IF _state NOT IN ('SENT','SUCCEEDED','FAILED','BLOCKED') THEN
    RAISE EXCEPTION 'FISCAL_TRANSMISSION_STATE_INVALID';
  END IF;

  SELECT * INTO v_cur FROM public.fiscal_sefaz_transmissions WHERE id = _transmission_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_TRANSMISSION_NOT_FOUND'; END IF;

  v_cstat := coalesce(_patch->>'protocolCStat', _patch->>'cStat', v_cur.c_stat);
  v_prot  := coalesce(_patch->>'nProt', v_cur.n_prot);

  IF _state IN ('FAILED','BLOCKED') THEN
    v_outcome := 'TRANSPORT_ERROR';
  ELSIF _state = 'SENT' THEN
    v_outcome := 'PENDING';
  ELSIF v_cstat IN ('100','150') AND v_prot IS NOT NULL THEN
    v_outcome := 'AUTHORIZED';
  ELSIF v_cstat IN ('135','136','155') THEN
    v_outcome := 'EVENT_REGISTERED';
  ELSIF v_cstat IN ('103','105','104','106','107','108','109','111','128') THEN
    v_outcome := CASE WHEN v_cur.service = 'NFeStatusServico4'
                      THEN 'SERVICE_INFO' ELSE 'PROCESSING' END;
  ELSE
    v_outcome := 'REJECTED';
  END IF;

  UPDATE public.fiscal_sefaz_transmissions SET
    state            = _state,
    outcome          = v_outcome,
    c_stat           = coalesce(_patch->>'cStat', c_stat),
    x_motivo         = coalesce(_patch->>'xMotivo', x_motivo),
    ch_nfe           = coalesce(_patch->>'chNFe', ch_nfe),
    n_prot           = coalesce(_patch->>'nProt', n_prot),
    n_rec            = coalesce(_patch->>'nRec', n_rec),
    ambiente_retorno = coalesce(_patch->>'tpAmb', ambiente_retorno),
    dh_recbto        = coalesce((_patch->>'dhRecbto')::timestamptz, dh_recbto),
    error_code       = coalesce(_patch->>'errorCode', error_code),
    response_summary = coalesce(_patch->'responseSummary', response_summary),
    completed_at     = CASE WHEN _state IN ('SUCCEEDED','FAILED','BLOCKED')
                            THEN now() ELSE completed_at END
  WHERE id = _transmission_id
  RETURNING * INTO v_row;

  IF v_row.ambiente_retorno IS NOT NULL AND v_row.ambiente_retorno <> '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  IF v_row.service = 'NFeRecepcaoEvento4' AND v_row.fiscal_event_id IS NOT NULL
     AND _state = 'SUCCEEDED' AND v_cstat IS NOT NULL THEN
    BEGIN
      PERFORM public.rpc_fiscal_event_sefaz_reconcile_v1(
        v_row.fiscal_event_id, v_row.id, v_cstat,
        coalesce(_patch->>'xMotivo', ''), v_row.n_prot, v_row.dh_recbto);
    EXCEPTION WHEN OTHERS THEN
      v_close_error := 'FISCAL_EVENT_RECONCILIATION_PENDING';
    END;
  END IF;

  -- H13: o fechamento documental nao pode descartar o retorno ja recebido.
  IF v_row.outcome = 'AUTHORIZED' AND v_row.fiscal_invoice_id IS NOT NULL
     AND v_row.ch_nfe IS NOT NULL AND v_row.n_prot IS NOT NULL THEN
    BEGIN
      PERFORM public.rpc_fiscal_invoice_apply_authorization_v1(
        v_row.fiscal_invoice_id, v_row.ch_nfe, v_row.n_prot, v_row.dh_recbto,
        v_row.c_stat, v_row.x_motivo, v_row.id);
    EXCEPTION WHEN OTHERS THEN
      v_close_error := 'FISCAL_AUTHORIZATION_CLOSE_PENDING';
    END;
  END IF;

  IF v_close_error IS NOT NULL THEN
    UPDATE public.fiscal_sefaz_transmissions
       SET error_code = v_close_error
     WHERE id = _transmission_id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'transmissionId', v_row.id, 'state', v_row.state, 'outcome', v_row.outcome,
    'cStat', v_row.c_stat, 'xMotivo', v_row.x_motivo,
    'chNFe', v_row.ch_nfe, 'nProt', v_row.n_prot, 'nRec', v_row.n_rec,
    'reconciliationPending', v_close_error IS NOT NULL,
    'reconciliationCode', v_close_error);
END $function$;
