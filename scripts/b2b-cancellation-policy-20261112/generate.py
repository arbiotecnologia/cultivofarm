"""Generate inactive policy deltas; no database access."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent
def read(name):return (H/'capture'/f'{name}.sql').read_text()
def replace(source,a,b):
 if source.count(a)!=1:raise RuntimeError('ANCHOR_COUNT:'+a[:70])
 return source.replace(a,b)
residual=read('residual').replace("ARRAY['administrador','financeiro']", "ARRAY['administrador','gestor_comercial']")
residual=replace(residual,'BEGIN\n',"BEGIN\n IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton AND enabled) THEN RAISE EXCEPTION 'CANCEL_POLICY_DISABLED' USING ERRCODE='42501'; END IF;\n")
residual=replace(residual,' -- An emission/consultation still open', ' -- An emission/consultation still open')
# Keep features, scope and revocable lifecycle gates; reject unapproved operational order.
residual=replace(residual,' -- An emission/consultation still open'," IF po.approved_at IS NULL OR po.approved_by IS NULL OR po.status::text NOT IN ('aprovado','entregue') THEN RAISE EXCEPTION 'B2B_CANCEL_ORDER_NOT_APPROVED' USING ERRCODE='PT409'; END IF;\n IF f.state IN ('cancelado_antes_nf','cancelado_residual') THEN\n  IF EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecast_events e WHERE e.forecast_id=f.id AND e.event_type='FORECAST_CANCELED' AND e.payload->>'reason'=p_reason) THEN RETURN jsonb_build_object('forecast_id',f.id,'state',f.state,'version',f.version,'idempotentReplay',true); END IF;\n  RAISE EXCEPTION 'B2B_FORECAST_CAS_CONFLICT' USING ERRCODE='PT409'; END IF;\n -- An emission/consultation still open")
residual=replace(residual," IF po.approved_at IS NULL", " PERFORM 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton FOR SHARE;\n IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton AND enabled) THEN RAISE EXCEPTION 'CANCEL_POLICY_DISABLED' USING ERRCODE='42501'; END IF;\n IF po.approved_at IS NULL")
residual=replace(residual,"  IF EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecast_events", "  IF f.version=p_expected_version+1 AND EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecast_events")
payment=read('payment')
anchor='  SELECT * INTO v_inst FROM public.accounts_receivable_installments\n   WHERE id = p_installment_id AND organization_id=v_org FOR UPDATE;'
payment=replace(payment,anchor,"  -- Lock title before installment, shared with fiscal cancellation.\n  SELECT * INTO v_origin FROM public.accounts_receivable WHERE organization_id=v_org AND id=(SELECT receivable_id FROM public.accounts_receivable_installments WHERE id=p_installment_id AND organization_id=v_org) FOR UPDATE;\n  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;\n"+anchor)
helper="""CREATE OR REPLACE FUNCTION platform_private.b2b_cancel_confirmed_fiscal_v1(p_tx uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE t public.fiscal_sefaz_transmissions;e public.fiscal_events;i public.fiscal_invoices;r public.accounts_receivable;paid boolean;actor_org uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton AND enabled) THEN RETURN jsonb_build_object('final',false,'code','CANCEL_POLICY_DISABLED'); END IF;
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN RAISE EXCEPTION 'CANCEL_READ_COMMITTED_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.fiscal_sefaz_transmissions WHERE id=p_tx;
 IF NOT FOUND OR t.service<>'NFeRecepcaoEvento4' OR t.fiscal_event_id IS NULL THEN RETURN jsonb_build_object('final',false,'code','NOT_LINKED_CANCEL'); END IF;
 actor_org:=public.h15_actor_organization();
 IF actor_org IS NULL OR public.fn_fiscal_can_operate(auth.uid()) IS NOT TRUE THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO i FROM public.fiscal_invoices WHERE id=t.fiscal_invoice_id AND organization_id=actor_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.fiscal_events WHERE id=t.fiscal_event_id AND organization_id=i.organization_id AND fiscal_invoice_id=i.id;
 IF NOT FOUND OR e.event_type<>'SEFAZ_CANCELLATION_PREPARED' OR e.sefaz_event_code<>'110111' OR e.sefaz_access_key IS DISTINCT FROM i.access_key THEN RETURN jsonb_build_object('final',false,'code','NOT_LINKED_CANCEL'); END IF;
 -- 136 is registration without final linkage: consultation remains necessary.
 IF t.state<>'SUCCEEDED' OR t.outcome<>'EVENT_REGISTERED' OR t.c_stat NOT IN ('135','155') OR nullif(btrim(t.n_prot),'') IS NULL OR t.ch_nfe IS DISTINCT FROM i.access_key OR t.ambiente_retorno IS DISTINCT FROM '2' THEN RETURN jsonb_build_object('final',false,'code','FISCAL_CANCEL_NOT_FINAL'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_events x WHERE x.related_event_id=e.id AND x.sefaz_transmission_id=t.id AND x.organization_id=i.organization_id AND x.fiscal_invoice_id=i.id AND x.event_type='SEFAZ_EVENT_REGISTERED' AND x.sefaz_c_stat=t.c_stat AND x.sefaz_n_prot=t.n_prot AND x.sefaz_access_key=i.access_key AND x.sefaz_event_code='110111' AND x.sefaz_seq_evento=e.sefaz_seq_evento) THEN RETURN jsonb_build_object('final',false,'code','FISCAL_CANCEL_UNPROVEN'); END IF;
 PERFORM 1 FROM public.fiscal_invoices WHERE id=i.id FOR UPDATE;
 IF public.h15_actor_organization() IS DISTINCT FROM actor_org OR public.fn_fiscal_can_operate(auth.uid()) IS NOT TRUE THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton AND enabled) THEN RETURN jsonb_build_object('final',false,'code','CANCEL_POLICY_DISABLED'); END IF;
 SELECT * INTO i FROM public.fiscal_invoices WHERE id=i.id;
 IF i.normalized_status NOT IN ('AUTHORIZED','CANCELED') OR EXISTS(SELECT 1 FROM platform_private.fiscal_close_pending p WHERE p.fiscal_invoice_id=i.id AND p.error_code='FISCAL_AUTHORIZATION_CLOSE_PENDING') THEN RETURN jsonb_build_object('final',false,'code','FISCAL_AUTHORIZATION_RECONCILIATION_PENDING'); END IF;
 IF i.partner_order_id IS NULL OR i.debtor_partner_id IS NULL OR i.receivable_id IS NULL THEN RETURN jsonb_build_object('final',false,'code','FISCAL_CANCEL_TITLE_LINK_UNPROVEN'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.partner_orders po JOIN public.partner_accounts pa ON pa.id=po.partner_id WHERE po.id=i.partner_order_id AND po.partner_id=i.debtor_partner_id AND pa.commercial_owner_organization_id=i.organization_id) THEN RAISE EXCEPTION 'FISCAL_CANCEL_LINK_MISMATCH' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.accounts_receivable WHERE id=i.receivable_id AND organization_id=i.organization_id AND b2b_document_id=i.id AND origin_type='B2B_ORDER' AND origin_id=i.partner_order_id AND partner_id=i.debtor_partner_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_CANCEL_LINK_MISMATCH' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.accounts_receivable_installments WHERE receivable_id=r.id ORDER BY id FOR UPDATE;
 IF public.h15_actor_organization() IS DISTINCT FROM actor_org OR public.fn_fiscal_can_operate(auth.uid()) IS NOT TRUE OR NOT EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=i.debtor_partner_id AND pa.commercial_owner_organization_id=i.organization_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL) THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.receivable_payments p JOIN public.accounts_receivable_installments x ON x.id=p.installment_id WHERE x.receivable_id=r.id) OR EXISTS(SELECT 1 FROM public.accounts_receivable_installments x WHERE x.receivable_id=r.id AND (x.received_amount IS NULL OR x.received_amount<>0 OR x.status='PAID')) INTO paid;
 IF i.normalized_status<>'CANCELED' THEN UPDATE public.fiscal_invoices SET status='CANCELED',normalized_status='CANCELED',canceled_at=clock_timestamp(),cancel_reason=e.sefaz_reason,reconciliation_status=CASE WHEN paid THEN 'REQUIRES_REVIEW' ELSE 'RECONCILED' END WHERE id=i.id; END IF;
 IF paid THEN RETURN jsonb_build_object('final',true,'financialReconciliationRequired',true,'code','FISCAL_CANCEL_PAYMENT_REVIEW'); END IF;
 IF r.status='CANCELED' THEN RETURN jsonb_build_object('final',true,'financialReconciliationRequired',false,'idempotentReplay',true); END IF;
 IF r.status NOT IN ('OPEN','OVERDUE') OR EXISTS(SELECT 1 FROM public.accounts_receivable_installments x WHERE x.receivable_id=r.id AND (x.organization_id IS DISTINCT FROM i.organization_id OR x.status NOT IN ('OPEN','OVERDUE') OR x.discount_amount IS NULL OR x.discount_amount<>0)) OR NOT EXISTS(SELECT 1 FROM public.accounts_receivable_installments WHERE receivable_id=r.id) THEN RAISE EXCEPTION 'FISCAL_CANCEL_FINANCIAL_STATE_UNDECIDED' USING ERRCODE='PT409'; END IF;
 UPDATE public.accounts_receivable_installments SET status='CANCELED' WHERE receivable_id=r.id;
 UPDATE public.accounts_receivable SET status='CANCELED' WHERE id=r.id;
 INSERT INTO public.financial_audit_log(entity_type,entity_id,action,performed_by,reason,new_data) VALUES('accounts_receivable',r.id,'AR_CANCELED',auth.uid(),e.sefaz_reason,jsonb_build_object('source','FINAL_FISCAL_CANCELLATION','invoice_id',i.id,'transmission_id',t.id));
 RETURN jsonb_build_object('final',true,'financialReconciliationRequired',false,'idempotentReplay',false);
END $fn$;
REVOKE ALL ON FUNCTION platform_private.b2b_cancel_confirmed_fiscal_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
"""
record=read('record')
record=replace(record,'  v_close_error text := NULL;',"  v_close_error text := NULL;\n  v_cancel jsonb := NULL;")
record=replace(record,'      PERFORM public.rpc_fiscal_event_sefaz_reconcile_v1(', '      PERFORM public.rpc_fiscal_event_sefaz_reconcile_v1(') # exact anchor sanity
record=replace(record,"        coalesce(_patch->>'xMotivo', ''), v_row.n_prot, v_row.dh_recbto);", "        coalesce(_patch->>'xMotivo', ''), v_row.n_prot, v_row.dh_recbto);\n      v_cancel:=platform_private.b2b_cancel_confirmed_fiscal_v1(v_row.id);\n      IF v_cancel->>'code' IN ('FISCAL_AUTHORIZATION_RECONCILIATION_PENDING','FISCAL_CANCEL_TITLE_LINK_UNPROVEN') THEN v_close_error:='FISCAL_EVENT_RECONCILIATION_PENDING'; END IF;")
record=replace(record,"    'transmissionId', v_row.id, 'state', v_row.state, 'outcome', v_row.outcome,", "    'cancellation',v_cancel,\n    'transmissionId', v_row.id, 'state', v_row.state, 'outcome', v_row.outcome,")
record=replace(record,"  ELSIF v_row.outcome = 'AUTHORIZED' THEN", "  ELSIF v_cancel->>'final'='true' THEN\n    DELETE FROM platform_private.fiscal_close_pending WHERE transmission_id=v_row.id AND error_code='FISCAL_EVENT_RECONCILIATION_PENDING';\n  ELSIF v_row.outcome = 'AUTHORIZED' THEN")
def guard(pins):
 result='DO $g$ BEGIN\n'
 for sig,p in pins.items():
  value=json.dumps(p,separators=(',',':')).replace("'","''")
  result+=f"IF (SELECT jsonb_build_object('md5',md5(pg_get_functiondef(oid)),'owner',pg_get_userbyid(proowner),'acl',(SELECT coalesce(jsonb_agg(x::text ORDER BY x::text),'[]'::jsonb) FROM unnest(proacl)x),'config',to_jsonb(proconfig)) FROM pg_proc WHERE oid=to_regprocedure('{sig}')) IS DISTINCT FROM '{value}'::jsonb THEN RAISE EXCEPTION 'CANCEL_PIN_DRIFT:{sig}'; END IF;\n"
 return result+'END $g$;\n'
pins=json.loads((H/'capture/pins.json').read_text());pre=guard(pins)
gate="""CREATE TABLE platform_private.b2b_cancel_policy_gate_v1(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
REVOKE ALL ON platform_private.b2b_cancel_policy_gate_v1 FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO platform_private.b2b_cancel_policy_gate_v1(singleton,enabled) VALUES(true,false);
"""
(H/'candidate.sql').write_text(gate+residual+';\n'+payment+';\n'+helper+record+';\n')
(H/'01-pre.sql.readonly').write_text('BEGIN READ ONLY;\n'+pre+'ROLLBACK;\n')
(H/'02-install.sql.review').write_text('BEGIN;\n'+pre+"IF_NOT_USED".replace('IF_NOT_USED','')+(H/'candidate.sql').read_text()+'COMMIT;\n')
post=H/'capture/post-pins.json'
if post.exists():
 pg=guard(json.loads(post.read_text()));(H/'03-post.sql.readonly').write_text('BEGIN READ ONLY;\n'+pg+'ROLLBACK;\n')
 (H/'04-rollback-deny.sql.review').write_text('BEGIN;\n'+pg+"UPDATE platform_private.b2b_cancel_policy_gate_v1 SET enabled=false;\nREVOKE EXECUTE ON FUNCTION public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;\nCOMMIT;\n")
(H/'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in sorted(H.glob('*.sql*'))))