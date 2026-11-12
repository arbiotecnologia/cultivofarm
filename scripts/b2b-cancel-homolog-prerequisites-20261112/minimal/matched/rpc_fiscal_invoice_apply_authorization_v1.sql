CREATE OR REPLACE FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(
  _invoice_id uuid, _access_key text, _protocol text, _dh_recbto timestamptz,
  _c_stat text, _x_motivo text, _transmission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_inv public.fiscal_invoices%ROWTYPE; v_xml uuid;
BEGIN
  IF nullif(btrim(coalesce(_protocol,'')),'') IS NULL
     OR coalesce(_access_key,'') !~ '^[0-9]{44}$' THEN
    RAISE EXCEPTION 'FISCAL_AUTHORIZATION_PAYLOAD_INVALID';
  END IF;

  SELECT * INTO v_inv FROM public.fiscal_invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND'; END IF;
  IF coalesce(v_inv.environment,'HOMOLOGATION') = 'PRODUCTION' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;

  -- Idempotente: documento ja autorizado nunca e reescrito.
  IF v_inv.normalized_status = 'AUTHORIZED' THEN
    IF coalesce(v_inv.access_key,'') <> _access_key THEN
      RAISE EXCEPTION 'FISCAL_AUTHORIZATION_CONFLICT: documento ja autorizado com outra chave.';
    END IF;
    RETURN jsonb_build_object('invoiceId', v_inv.id, 'applied', false,
      'normalizedStatus', v_inv.normalized_status,
      'reconciliationStatus', v_inv.reconciliation_status);
  END IF;

  -- Evidencia do XML assinado ja armazenado. O nfeProc (XML + protocolo) ainda
  -- nao e montado pelo transporte: enquanto nao existir, a nota fica PENDING.
  SELECT r.id INTO v_xml
    FROM public.fiscal_xml_runs r
   WHERE r.fiscal_invoice_id = _invoice_id
     AND r.signed_path IS NOT NULL
     AND (r.access_key IS NULL OR r.access_key = _access_key)
   ORDER BY coalesce(r.signed_at, r.updated_at) DESC LIMIT 1;

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

  RETURN jsonb_build_object('invoiceId', _invoice_id, 'applied', true,
    'normalizedStatus','AUTHORIZED',
    'reconciliationStatus','PENDING',
    'signedXmlRunId', v_xml,
    'protocoledXmlStored', false);
END $$;
