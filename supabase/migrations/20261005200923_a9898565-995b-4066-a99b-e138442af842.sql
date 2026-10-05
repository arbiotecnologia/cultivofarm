ALTER TABLE public.aplicacoes ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
CREATE INDEX IF NOT EXISTS aplicacoes_organization_id_idx ON public.aplicacoes(organization_id);
CREATE INDEX IF NOT EXISTS entregas_organization_id_idx ON public.entregas(organization_id);

DROP TRIGGER IF EXISTS tenant_organization_guard ON public.aplicacoes;
CREATE TRIGGER tenant_organization_guard BEFORE INSERT OR UPDATE ON public.aplicacoes
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_organization_id();
DROP TRIGGER IF EXISTS tenant_organization_guard ON public.entregas;
CREATE TRIGGER tenant_organization_guard BEFORE INSERT OR UPDATE ON public.entregas
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_organization_id();

DROP POLICY IF EXISTS tenant_isolation_d51_5 ON public.aplicacoes;
CREATE POLICY tenant_isolation_d51_5 ON public.aplicacoes AS RESTRICTIVE FOR ALL TO authenticated
USING (organization_id IS NOT NULL AND organization_id = public.h15_actor_organization())
WITH CHECK (organization_id IS NOT NULL AND organization_id = public.h15_actor_organization());
DROP POLICY IF EXISTS tenant_isolation_d51_5 ON public.entregas;
CREATE POLICY tenant_isolation_d51_5 ON public.entregas AS RESTRICTIVE FOR ALL TO authenticated
USING (organization_id IS NOT NULL AND organization_id = public.h15_actor_organization())
WITH CHECK (organization_id IS NOT NULL AND organization_id = public.h15_actor_organization());

CREATE OR REPLACE FUNCTION public.financial_storage_object_permitted(_bucket text, _name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_org uuid; v_parts text[]; v_owner_type text; v_owner_id uuid;
BEGIN
  v_org := public.h15_actor_organization();
  IF v_org IS NULL OR NOT public.is_financial_staff(auth.uid()) THEN RETURN false; END IF;
  v_parts := storage.foldername(_name);
  IF _bucket IN ('financial-reports','financial-receipts') THEN
    RETURN array_length(v_parts,1) >= 1 AND v_parts[1] = v_org::text;
  END IF;
  IF _bucket <> 'financial-docs' OR array_length(v_parts,1) < 2 THEN RETURN false; END IF;
  v_owner_type := v_parts[1];
  BEGIN v_owner_id := v_parts[2]::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
  RETURN CASE v_owner_type
    WHEN 'RECEIVABLE' THEN EXISTS(SELECT 1 FROM public.accounts_receivable x WHERE x.id=v_owner_id AND x.organization_id=v_org)
    WHEN 'PAYABLE' THEN EXISTS(SELECT 1 FROM public.accounts_payable x WHERE x.id=v_owner_id AND x.organization_id=v_org)
    WHEN 'PAYMENT_RECEIVABLE' THEN EXISTS(SELECT 1 FROM public.receivable_payments x WHERE x.id=v_owner_id AND x.organization_id=v_org)
    WHEN 'PAYMENT_PAYABLE' THEN EXISTS(SELECT 1 FROM public.payable_payments x WHERE x.id=v_owner_id AND x.organization_id=v_org)
    WHEN 'FISCAL_INVOICE' THEN EXISTS(SELECT 1 FROM public.fiscal_invoices x WHERE x.id=v_owner_id AND x.organization_id=v_org)
    ELSE false END;
END $$;
REVOKE ALL ON FUNCTION public.financial_storage_object_permitted(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_storage_object_permitted(text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cliente_storage_object_permitted(_name text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_org uuid; v_parts text[]; v_cliente uuid;
BEGIN
  v_org := public.h15_actor_organization(); v_parts := storage.foldername(_name);
  IF v_org IS NULL OR array_length(v_parts,1)<2 OR v_parts[1] <> 'clientes' THEN RETURN false; END IF;
  BEGIN v_cliente := v_parts[2]::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
  RETURN EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=v_cliente AND c.organization_id=v_org AND public.can_user_access_cliente(c.id));
END $$;
REVOKE ALL ON FUNCTION public.cliente_storage_object_permitted(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_storage_object_permitted(text) TO authenticated, service_role;

DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND (coalesce(qual,'') ILIKE '%financial-docs%' OR coalesce(with_check,'') ILIKE '%financial-docs%' OR coalesce(qual,'') ILIKE '%financial-reports%' OR coalesce(with_check,'') ILIKE '%financial-reports%' OR coalesce(qual,'') ILIKE '%financial-receipts%' OR coalesce(with_check,'') ILIKE '%financial-receipts%' OR coalesce(qual,'') ILIKE '%clientes-docs%' OR coalesce(with_check,'') ILIKE '%clientes-docs%') LOOP
   EXECUTE format('DROP POLICY %I ON storage.objects',p.policyname);
 END LOOP;
END $$;
CREATE POLICY d51_5_financial_storage_select ON storage.objects FOR SELECT TO authenticated USING (public.financial_storage_object_permitted(bucket_id,name));
CREATE POLICY d51_5_financial_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (public.financial_storage_object_permitted(bucket_id,name));
CREATE POLICY d51_5_financial_storage_update ON storage.objects FOR UPDATE TO authenticated USING (public.financial_storage_object_permitted(bucket_id,name)) WITH CHECK (public.financial_storage_object_permitted(bucket_id,name));
CREATE POLICY d51_5_financial_storage_delete ON storage.objects FOR DELETE TO authenticated USING (public.financial_storage_object_permitted(bucket_id,name));
CREATE POLICY d51_5_clientes_docs_select ON storage.objects FOR SELECT TO authenticated USING (bucket_id='clientes-docs' AND public.cliente_storage_object_permitted(name));
CREATE POLICY d51_5_clientes_docs_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='clientes-docs' AND public.cliente_storage_object_permitted(name));
CREATE POLICY d51_5_clientes_docs_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='clientes-docs' AND public.cliente_storage_object_permitted(name)) WITH CHECK (bucket_id='clientes-docs' AND public.cliente_storage_object_permitted(name));
CREATE POLICY d51_5_clientes_docs_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='clientes-docs' AND public.cliente_storage_object_permitted(name));

CREATE OR REPLACE FUNCTION public.issue_financial_receipt(_payment_id uuid, _description text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE v_org uuid; v_payment record; v_installment record; v_receivable record; v_existing record; v_receipt_id uuid; v_desc text;
BEGIN
 v_org:=public.h15_actor_organization();
 IF v_org IS NULL OR NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_payment FROM public.receivable_payments WHERE id=_payment_id AND organization_id=v_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recebimento não encontrado' USING ERRCODE='42501'; END IF;
 IF v_payment.is_reversal THEN RAISE EXCEPTION 'Não é possível emitir recibo para estorno'; END IF;
 SELECT * INTO v_installment FROM public.accounts_receivable_installments WHERE id=v_payment.installment_id AND organization_id=v_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Parcela não encontrada' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_receivable FROM public.accounts_receivable WHERE id=v_installment.receivable_id AND organization_id=v_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Título não encontrado' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_existing FROM public.financial_receipts WHERE payment_id=_payment_id AND status='ISSUED' AND organization_id=v_org LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('duplicate',true,'receipt_id',v_existing.id,'receipt_number',v_existing.receipt_number,'message','Recibo já emitido para este recebimento'); END IF;
 v_desc:=COALESCE(NULLIF(trim(_description),''),'Recebimento ref. parcela '||COALESCE(v_installment.installment_number::text,'—')||' de '||COALESCE(v_receivable.description,'título financeiro'));
 INSERT INTO public.financial_receipts(payment_id,receivable_payment_id,receivable_id,customer_id,amount,payment_date,payment_method_id,description,issued_by,status,organization_id)
 VALUES(_payment_id,_payment_id,v_installment.receivable_id,v_receivable.customer_id,v_payment.amount_received,v_payment.payment_date,v_payment.payment_method_id,v_desc,auth.uid(),'ISSUED',v_org) RETURNING id INTO v_receipt_id;
 INSERT INTO public.financial_audit_log(entity_type,entity_id,action,new_data,performed_by) VALUES('financial_receipts',v_receipt_id,'FINANCIAL_RECEIPT_ISSUED',jsonb_build_object('payment_id',_payment_id,'amount',v_payment.amount_received),auth.uid());
 RETURN jsonb_build_object('duplicate',false,'receipt_id',v_receipt_id,'receipt_number',(SELECT receipt_number FROM public.financial_receipts WHERE id=v_receipt_id AND organization_id=v_org));
END $$;

CREATE OR REPLACE FUNCTION public.cancel_financial_receipt(_receipt_id uuid,_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'
AS $$
DECLARE v_org uuid; v_rec record;
BEGIN
 v_org:=public.h15_actor_organization();
 IF v_org IS NULL OR NOT public.is_financial_staff(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 IF _reason IS NULL OR length(trim(_reason))<5 THEN RAISE EXCEPTION 'Motivo do cancelamento é obrigatório (mín. 5 caracteres)'; END IF;
 SELECT * INTO v_rec FROM public.financial_receipts WHERE id=_receipt_id AND organization_id=v_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recibo não encontrado' USING ERRCODE='42501'; END IF;
 IF v_rec.status='CANCELED' THEN RAISE EXCEPTION 'Recibo já cancelado'; END IF;
 IF NOT (public.has_role(auth.uid(),'administrador'::public.app_role) OR public.has_role(auth.uid(),'gestor'::public.app_role)) AND v_rec.issued_at::date<>CURRENT_DATE THEN RAISE EXCEPTION 'Apenas administrador/gestor podem cancelar recibos de outros dias'; END IF;
 UPDATE public.financial_receipts SET status='CANCELED',cancel_reason=_reason,canceled_by=auth.uid(),canceled_at=now() WHERE id=_receipt_id AND organization_id=v_org;
 INSERT INTO public.financial_audit_log(entity_type,entity_id,action,new_data,performed_by,reason) VALUES('financial_receipts',_receipt_id,'FINANCIAL_RECEIPT_CANCELED',jsonb_build_object('reason',_reason),auth.uid(),_reason);
END $$;
REVOKE ALL ON FUNCTION public.issue_financial_receipt(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_financial_receipt(uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.cancel_financial_receipt(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_financial_receipt(uuid,text) TO authenticated,service_role;

DROP POLICY IF EXISTS d51_5_catalog_global_mutation ON public.produtos;
CREATE POLICY d51_5_catalog_global_mutation ON public.produtos AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_platform_superadmin(auth.uid())) WITH CHECK (public.is_platform_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.rpc_fiscal_event_sefaz_prepare_v1(_invoice_id uuid,_event_kind text,_reason text,_idempotency_key text,_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='public','pg_temp'
AS $$
DECLARE v_ref text; v_prod boolean; v_tpamb text; v_inv public.fiscal_invoices; v_actor_org uuid; v_code text; v_type text; v_reason text:=btrim(coalesce(_reason,'')); v_fp text; v_prev public.fiscal_events; v_seq integer; v_id uuid; v_prot text;
BEGIN
 IF _actor IS NULL OR _actor IS DISTINCT FROM auth.uid() OR NOT public.fn_fiscal_can_operate(_actor) THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 v_actor_org:=public.h15_actor_organization(); IF v_actor_org IS NULL THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF coalesce(btrim(_idempotency_key),'')='' OR length(_idempotency_key)>200 THEN RAISE EXCEPTION 'FISCAL_EVENT_IDEMPOTENCY_INVALID'; END IF;
 SELECT project_ref,production_emission_allowed INTO v_ref,v_prod FROM public.fiscal_environment_marker LIMIT 1;
 IF v_ref IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' OR coalesce(v_prod,true) THEN RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED'; END IF;
 SELECT * INTO v_inv FROM public.fiscal_invoices WHERE id=_invoice_id AND organization_id=v_actor_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EVENT_INVOICE_NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT nfe_environment_code INTO v_tpamb FROM public.company_fiscal_settings WHERE id=v_inv.company_settings_id AND organization_id=v_actor_org AND is_active;
 IF v_tpamb IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED'; END IF;
 IF _event_kind='CANCELLATION' THEN v_code:='110111';v_type:='SEFAZ_CANCELLATION_PREPARED'; ELSIF _event_kind='CORRECTION' THEN v_code:='110110';v_type:='SEFAZ_CORRECTION_PREPARED'; ELSE RAISE EXCEPTION 'FISCAL_EVENT_TYPE_UNSUPPORTED'; END IF;
 IF coalesce(v_inv.access_key,'') !~ '^[0-9]{44}$' THEN RAISE EXCEPTION 'FISCAL_EVENT_ACCESS_KEY_INVALID'; END IF;
 IF coalesce(v_inv.environment,'HOMOLOGATION')<>'HOMOLOGATION' THEN RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED'; END IF;
 SELECT n_prot INTO v_prot FROM public.fiscal_sefaz_transmissions WHERE fiscal_invoice_id=_invoice_id AND service IN ('NFeAutorizacao4','NFeRetAutorizacao4') AND state='SUCCEEDED' AND outcome='AUTHORIZED' AND n_prot IS NOT NULL AND ch_nfe=v_inv.access_key ORDER BY created_at DESC LIMIT 1;
 IF v_prot IS NULL THEN RAISE EXCEPTION 'FISCAL_EVENT_INVOICE_NOT_AUTHORIZED'; END IF;
 IF _event_kind='CANCELLATION' THEN IF length(v_reason)<15 OR length(v_reason)>255 THEN RAISE EXCEPTION 'FISCAL_EVENT_REASON_INVALID'; END IF; IF EXISTS(SELECT 1 FROM public.v_fiscal_sefaz_event_state WHERE fiscal_invoice_id=_invoice_id AND sefaz_event_code='110111' AND state='REGISTERED') THEN RAISE EXCEPTION 'FISCAL_EVENT_ALREADY_REGISTERED'; END IF;
 ELSE IF length(v_reason)<15 OR length(v_reason)>1000 THEN RAISE EXCEPTION 'FISCAL_EVENT_REASON_INVALID'; END IF; IF EXISTS(SELECT 1 FROM public.v_fiscal_sefaz_event_state WHERE fiscal_invoice_id=_invoice_id AND sefaz_event_code='110111' AND state='REGISTERED') THEN RAISE EXCEPTION 'FISCAL_EVENT_INVOICE_CANCELED'; END IF; END IF;
 v_fp:=encode(extensions.digest(v_code||'|'||v_inv.access_key||'|'||v_reason,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('fiscal_sefaz_event:'||_invoice_id::text||':'||_idempotency_key,0));
 SELECT * INTO v_prev FROM public.fiscal_events WHERE fiscal_invoice_id=_invoice_id AND organization_id=v_actor_org AND event_type=v_type AND idempotency_key=_idempotency_key;
 IF FOUND THEN IF v_prev.payload_fingerprint IS DISTINCT FROM v_fp THEN RAISE EXCEPTION 'FISCAL_EVENT_IDEMPOTENCY_MISMATCH'; END IF; RETURN jsonb_build_object('eventId',v_prev.id,'eventCode',v_prev.sefaz_event_code,'seqEvento',v_prev.sefaz_seq_evento,'accessKey',v_prev.sefaz_access_key,'reason',v_prev.sefaz_reason,'protocol',v_prot,'companySettingsId',v_inv.company_settings_id,'idempotentReplay',true); END IF;
 SELECT coalesce(max(sefaz_seq_evento),0)+1 INTO v_seq FROM public.fiscal_events WHERE fiscal_invoice_id=_invoice_id AND organization_id=v_actor_org AND sefaz_event_code=v_code;
 IF v_seq>20 THEN RAISE EXCEPTION 'FISCAL_EVENT_SEQUENCE_EXHAUSTED'; END IF;
 INSERT INTO public.fiscal_events(fiscal_invoice_id,event_type,event_source,performed_by,idempotency_key,payload_fingerprint,notes,sefaz_event_code,sefaz_seq_evento,sefaz_access_key,sefaz_reason,request_snapshot,organization_id)
 VALUES(_invoice_id,v_type,'INTERNAL',_actor,_idempotency_key,v_fp,left(v_reason,2000),v_code,v_seq,v_inv.access_key,v_reason,jsonb_build_object('eventKind',_event_kind,'protocol',v_prot,'environmentCode','2'),v_actor_org) RETURNING id INTO v_id;
 RETURN jsonb_build_object('eventId',v_id,'eventCode',v_code,'seqEvento',v_seq,'accessKey',v_inv.access_key,'reason',v_reason,'protocol',v_prot,'companySettingsId',v_inv.company_settings_id,'idempotentReplay',false);
END $$;
REVOKE ALL ON FUNCTION public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid) TO service_role;