CREATE OR REPLACE FUNCTION public.rpc_fiscal_event_sefaz_prepare_v1(_invoice_id uuid, _event_kind text, _reason text, _idempotency_key text, _actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_ref text; v_prod boolean; v_tpamb text; v_inv public.fiscal_invoices; v_actor_org uuid; v_code text; v_type text; v_reason text:=btrim(coalesce(_reason,'')); v_fp text; v_prev public.fiscal_events; v_seq integer; v_id uuid; v_prot text;
BEGIN
 IF _actor IS NULL OR _actor IS DISTINCT FROM auth.uid() OR NOT public.fn_fiscal_can_operate(_actor) THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 v_actor_org:=public.h15_actor_organization(); IF v_actor_org IS NULL THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF coalesce(btrim(_idempotency_key),'')='' OR length(_idempotency_key)>200 THEN RAISE EXCEPTION 'FISCAL_EVENT_IDEMPOTENCY_INVALID'; END IF;
 SELECT project_ref,production_emission_allowed INTO v_ref,v_prod FROM public.fiscal_environment_marker LIMIT 1;
 IF v_ref IS DISTINCT FROM 'vrlcdwmlytukrjezrrnf' OR coalesce(v_prod,true) THEN RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED'; END IF;
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
END $function$
;
