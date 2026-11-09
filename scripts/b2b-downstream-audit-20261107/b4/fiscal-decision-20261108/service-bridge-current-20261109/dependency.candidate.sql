CREATE OR REPLACE FUNCTION platform_private.b2b_integration_dependencies() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE p platform_private.b2b_fiscal_service_permits;
 d platform_private.b2b_authorized_documents;
 s platform_private.b2b_fiscal_invoice_snapshots;
 i public.fiscal_invoices;
 t public.fiscal_sefaz_transmissions;
 o public.partner_orders;
 permits integer;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'B2B_READ_COMMITTED_REQUIRED' USING ERRCODE='0A000';
 END IF;
 SELECT count(*) INTO permits FROM platform_private.b2b_fiscal_service_permits x
  WHERE x.transaction_id=txid_current();
 IF permits<>1 THEN
  RAISE EXCEPTION 'B2B_FISCAL_SERVICE_PERMIT_REQUIRED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO p FROM platform_private.b2b_fiscal_service_permits x
  WHERE x.transaction_id=txid_current();
 SELECT * INTO d FROM platform_private.b2b_authorized_documents x
  WHERE x.id=p.document_id AND x.id=p.invoice_id AND x.order_id=p.order_id
   AND x.organization_id=p.organization_id AND x.partner_id=p.partner_id AND x.state='AUTHORIZED';
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_FISCAL_DOCUMENT_NOT_PROVEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM platform_private.b2b_fiscal_invoice_snapshots x
  WHERE x.invoice_id=p.invoice_id AND x.source_digest=d.source_digest;
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_FISCAL_SNAPSHOT_NOT_PROVEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.fiscal_invoices x
  WHERE x.id=p.invoice_id AND x.partner_order_id=p.order_id AND x.debtor_partner_id=p.partner_id
   AND x.organization_id=p.organization_id AND x.normalized_status='AUTHORIZED'
   AND x.invoice_type='NFE' AND x.environment='HOMOLOGATION' AND x.authorized_at IS NOT NULL
   AND x.issue_date=d.issue_date AND coalesce(x.access_key,'')~'^[0-9]{44}$';
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_FISCAL_CONFIRMATION_UNPROVEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.partner_orders x WHERE x.id=p.order_id AND x.partner_id=p.partner_id;
 IF NOT FOUND OR NOT EXISTS(
   SELECT 1 FROM public.partner_accounts pa WHERE pa.id=p.partner_id
    AND pa.commercial_owner_organization_id=p.organization_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
 ) OR NOT EXISTS(
   SELECT 1 FROM public.company_fiscal_settings c WHERE c.id=i.company_settings_id
    AND c.organization_id=p.organization_id AND c.is_active IS TRUE
    AND c.configuration_status='VALIDATED' AND c.accounting_validated_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'B2B_FISCAL_ACCOUNTING_OR_TENANT_UNPROVEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.fiscal_sefaz_transmissions x
  WHERE x.id=s.transmission_id AND x.fiscal_invoice_id=p.invoice_id
   AND x.state='SUCCEEDED' AND x.outcome='AUTHORIZED'
   AND coalesce(x.protocol_c_stat,x.c_stat) IN ('100','150')
   AND x.ch_nfe=i.access_key AND x.n_prot=s.protocol AND x.ambiente_retorno='2';
 IF NOT FOUND OR NOT EXISTS(
   SELECT 1 FROM public.fiscal_xml_runs r WHERE r.fiscal_invoice_id=p.invoice_id
    AND r.signed_path IS NOT NULL AND (r.access_key IS NULL OR r.access_key=i.access_key)
 ) THEN RAISE EXCEPTION 'B2B_FISCAL_CONFIRMATION_UNPROVEN' USING ERRCODE='42501'; END IF;
 IF s.snapshot->>'access_key' IS DISTINCT FROM i.access_key
  OR s.snapshot->>'organization_id' IS DISTINCT FROM p.organization_id::text
  OR s.snapshot->>'partner_order_id' IS DISTINCT FROM p.order_id::text
  OR s.snapshot->>'debtor_partner_id' IS DISTINCT FROM p.partner_id::text
  OR s.snapshot->>'total_amount' IS DISTINCT FROM i.total_amount::text
 THEN RAISE EXCEPTION 'B2B_FISCAL_SNAPSHOT_DIVERGENCE' USING ERRCODE='PT409'; END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.b2b_integration_dependencies() FROM PUBLIC,anon,authenticated,service_role;
