CREATE OR REPLACE FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(_invoice_id uuid, _access_key text, _protocol text, _dh_recbto timestamp with time zone, _c_stat text, _x_motivo text, _transmission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_inv public.fiscal_invoices%ROWTYPE; v_xml uuid; v_bridge jsonb; v_tx public.fiscal_sefaz_transmissions%ROWTYPE; v_saved platform_private.b2b_fiscal_invoice_snapshots%ROWTYPE;
BEGIN
  IF nullif(btrim(coalesce(_protocol,'')),'') IS NULL
     OR coalesce(_access_key,'') !~ '^[0-9]{44}$'
     OR _c_stat NOT IN ('100','150') OR _transmission_id IS NULL OR _dh_recbto IS NULL THEN
    RAISE EXCEPTION 'FISCAL_AUTHORIZATION_PAYLOAD_INVALID';
  END IF;

  SELECT * INTO v_inv FROM public.fiscal_invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND'; END IF;
  IF coalesce(v_inv.environment,'HOMOLOGATION') = 'PRODUCTION' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  SELECT * INTO v_tx FROM public.fiscal_sefaz_transmissions
   WHERE id=_transmission_id AND fiscal_invoice_id=_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_tx.state IS DISTINCT FROM 'SUCCEEDED'
    OR v_tx.outcome IS DISTINCT FROM 'AUTHORIZED' OR coalesce(v_tx.protocol_c_stat,v_tx.c_stat) IS DISTINCT FROM _c_stat
    OR v_tx.ch_nfe IS DISTINCT FROM _access_key OR v_tx.n_prot IS DISTINCT FROM _protocol
    OR v_tx.ambiente_retorno IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'FISCAL_AUTHORIZATION_TRANSMISSION_MISMATCH';
  END IF;

  -- Evidencia assinada e retorno protocolado sao obrigatorios tambem no replay.
  SELECT r.id INTO v_xml
    FROM public.fiscal_xml_runs r
   WHERE r.fiscal_invoice_id = _invoice_id
     AND r.signed_path IS NOT NULL
     AND (r.access_key IS NULL OR r.access_key = _access_key)
   ORDER BY coalesce(r.signed_at, r.updated_at) DESC LIMIT 1;
  IF v_xml IS NULL THEN RAISE EXCEPTION 'FISCAL_SIGNED_XML_REQUIRED'; END IF;

  -- Idempotente: documento ja autorizado nunca e reescrito, mas a ponte revalida o snapshot.
  IF v_inv.normalized_status = 'AUTHORIZED' THEN
    IF coalesce(v_inv.access_key,'') <> _access_key THEN
      RAISE EXCEPTION 'FISCAL_AUTHORIZATION_CONFLICT: documento ja autorizado com outra chave.';
    END IF;
    SELECT * INTO v_saved FROM platform_private.b2b_fiscal_invoice_snapshots WHERE invoice_id=v_inv.id;
    IF v_saved.invoice_id IS NOT NULL AND (
      v_saved.protocol IS DISTINCT FROM _protocol
      OR v_saved.snapshot->>'access_key' IS DISTINCT FROM _access_key
      OR v_saved.snapshot->>'transmission_c_stat' IS DISTINCT FROM _c_stat
      OR v_saved.snapshot->>'transmission_environment' IS DISTINCT FROM v_tx.ambiente_retorno
    ) THEN RAISE EXCEPTION 'FISCAL_REPLAY_DIVERGENCE' USING ERRCODE='PT409'; END IF;
    v_bridge := platform_private.b2b_fiscal_invoice_bridge_v1(v_inv.id);
    RETURN jsonb_build_object('invoiceId', v_inv.id, 'applied', false,
      'normalizedStatus', v_inv.normalized_status,
      'reconciliationStatus', v_inv.reconciliation_status,
      'receivableId', v_bridge->>'receivable_id', 'b2bReplay', v_bridge->>'replayed',
      'b2bSkipped', v_bridge->>'skipped', 'b2bReason', v_bridge->>'reason');
  END IF;

  UPDATE public.fiscal_invoices
     SET status = 'ISSUED',
         normalized_status = 'AUTHORIZED',
         access_key = _access_key,
         authorized_at = coalesce(_dh_recbto, now()),
         provider_status_raw = coalesce(_c_stat, provider_status_raw),
         tax_authority_notes = coalesce(_x_motivo, tax_authority_notes),
         -- xml_document_id NAO e sobrescrito aqui: o nfeProc protocolado ainda
         -- nao e gerado/armazenado pelo transporte (gate documentado).
         reconciliation_status = 'PENDING',
         updated_at = now()
   WHERE id = _invoice_id;

  INSERT INTO public.fiscal_audit_log (table_name, record_id, action, old_values, new_values, changed_by)
  VALUES ('fiscal_invoices', _invoice_id, 'UPDATE',
          jsonb_build_object('normalizedStatus', v_inv.normalized_status, 'status', v_inv.status),
          jsonb_build_object('normalizedStatus','AUTHORIZED','status','ISSUED',
                             'accessKey', _access_key, 'protocol', _protocol,
                             'transmissionId', _transmission_id,
                             'signedXmlRunId', v_xml,
                             'protocoledXmlStored', false), NULL);

  v_bridge := platform_private.b2b_fiscal_invoice_bridge_v1(_invoice_id);
  RETURN jsonb_build_object('invoiceId', _invoice_id, 'applied', true,
    'receivableId', v_bridge->>'receivable_id', 'b2bReplay', v_bridge->>'replayed',
    'b2bSkipped', v_bridge->>'skipped', 'b2bReason', v_bridge->>'reason',
    'normalizedStatus','AUTHORIZED',
    'reconciliationStatus','PENDING',
    'signedXmlRunId', v_xml,
    'protocoledXmlStored', false);
END $function$