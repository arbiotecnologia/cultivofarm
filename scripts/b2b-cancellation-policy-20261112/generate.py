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
bridge=read('bridge')
bridge=replace(bridge,' IF existing.id IS NULL THEN',""" -- Closed replay proves immutable fiscal evidence AND exact persisted allocation/title/event.
 -- No allocator dispatch with the event-sign actor: it is not a buyer/commercial actor.
 PERFORM platform_private.b2b_integration_dependencies();
 IF existing.id IS NOT NULL AND EXISTS(
  SELECT 1 FROM platform_private.b2b_document_allocations a
  JOIN public.accounts_receivable r ON r.id=a.receivable_id
  JOIN platform_private.b2b_financial_forecasts f ON f.order_id=po.id AND f.organization_id=org AND f.partner_id=po.partner_id
  JOIN platform_private.b2b_financial_forecast_events fe ON fe.forecast_id=f.id AND fe.event_type='FISCAL_CONFIRMED' AND fe.event_reference=inv.id::text AND fe.payload->>'receivable_id'=inv.receivable_id::text
  WHERE a.document_id=inv.id AND a.organization_id=org AND a.order_id=po.id AND a.source_digest=digest AND a.items=existing.items
   AND r.id=inv.receivable_id AND r.organization_id=org AND r.origin_id=po.id AND r.origin_type='B2B_ORDER' AND r.partner_id=po.partner_id AND r.b2b_document_id=inv.id
   AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_allocation_reversals z WHERE z.document_id=inv.id)
 ) THEN RETURN jsonb_build_object('success',true,'invoice_id',inv.id,'receivable_id',inv.receivable_id,'replayed',true,'closed_evidence_verified',true); END IF;
 IF existing.id IS NULL THEN""")
apply=read('apply')
apply=replace(apply,"  -- Idempotente: documento ja autorizado", """  -- A valid historical authorization cannot resurrect a finally cancelled invoice.
  IF v_inv.normalized_status='CANCELED' THEN
    SELECT * INTO v_saved FROM platform_private.b2b_fiscal_invoice_snapshots WHERE invoice_id=v_inv.id;
    IF v_saved.invoice_id IS NULL OR v_saved.transmission_id IS DISTINCT FROM v_tx.id OR v_saved.protocol IS DISTINCT FROM _protocol OR v_saved.snapshot->>'access_key' IS DISTINCT FROM _access_key OR v_saved.snapshot->>'transmission_c_stat' IS DISTINCT FROM _c_stat THEN RAISE EXCEPTION 'FISCAL_REPLAY_DIVERGENCE' USING ERRCODE='PT409'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.fiscal_events e JOIN public.fiscal_sefaz_transmissions ct ON ct.id=e.sefaz_transmission_id WHERE e.fiscal_invoice_id=v_inv.id AND e.event_type='SEFAZ_EVENT_REGISTERED' AND e.sefaz_event_code='110111' AND e.sefaz_c_stat IN ('135','155') AND ct.fiscal_invoice_id=v_inv.id AND ct.outcome='EVENT_REGISTERED' AND ct.state='SUCCEEDED' AND ct.ch_nfe=v_inv.access_key AND ct.n_prot=e.sefaz_n_prot) THEN RAISE EXCEPTION 'FISCAL_CANCEL_UNPROVEN' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('invoiceId',v_inv.id,'applied',false,'normalizedStatus','CANCELED','receivableId',v_inv.receivable_id,'historicalAuthorizationVerified',true);
  END IF;
  -- Idempotente: documento ja autorizado""")
capability="""CREATE OR REPLACE FUNCTION public.rpc_b2b_cancel_residual_capability_v1(p_order uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE org uuid;po public.partner_orders;f platform_private.b2b_financial_forecasts;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE singleton AND enabled) THEN RETURN jsonb_build_object('available',false); END IF;
 org:=platform_private.c2p1_internal_actor(ARRAY['administrador','gestor_comercial']::public.app_role[]);
 IF org IS NULL OR public._saas_user_has_feature(auth.uid(),'pedidos_b2b') IS NOT TRUE OR public._saas_user_has_feature(auth.uid(),'contas_receber') IS NOT TRUE THEN RETURN jsonb_build_object('available',false); END IF;
 SELECT * INTO po FROM public.partner_orders WHERE id=p_order AND EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=partner_id AND pa.commercial_owner_organization_id=org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL);
 IF NOT FOUND OR po.approved_by IS NULL OR po.approved_at IS NULL OR po.status::text NOT IN ('aprovado','entregue') OR platform_private.c2p1_settings_allowed(po.partner_id,true) IS NOT TRUE OR platform_private.b2b_forecast_lifecycle_scope_v1('forecast_cancel',auth.uid(),org,po.partner_id,po.id) IS NOT TRUE THEN RETURN jsonb_build_object('available',false); END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE order_id=po.id AND organization_id=org AND partner_id=po.partner_id;
 IF NOT FOUND OR f.residual_amount IS NULL OR f.residual_amount<=0 OR f.state NOT IN ('aprovado_previsto','faturado_parcial') OR EXISTS(SELECT 1 FROM public.fiscal_invoices i JOIN platform_private.fiscal_close_pending cp ON cp.fiscal_invoice_id=i.id WHERE i.partner_order_id=po.id) OR EXISTS(SELECT 1 FROM public.fiscal_invoices i JOIN public.fiscal_sefaz_transmissions t ON t.fiscal_invoice_id=i.id WHERE i.partner_order_id=po.id AND t.state IN ('PENDING','SENT')) THEN RETURN jsonb_build_object('available',false); END IF;
 RETURN jsonb_build_object('available',true,'order_id',po.id,'version',f.version,'residual_amount',f.residual_amount);
END $fn$;
REVOKE ALL ON FUNCTION public.rpc_b2b_cancel_residual_capability_v1(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.rpc_b2b_cancel_residual_capability_v1(uuid) TO authenticated;
"""
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
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_allowlist_v1 g WHERE g.actor_id=auth.uid() AND g.organization_id=i.organization_id AND g.invoice_id=i.id AND g.order_id=i.partner_order_id AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp() AND g.valid_until>clock_timestamp() AND g.synthetic) THEN RETURN jsonb_build_object('final',false,'code','CANCEL_POLICY_SCOPE_DENIED'); END IF;
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
 PERFORM 1 FROM platform_private.b2b_cancel_policy_allowlist_v1 g WHERE g.actor_id=auth.uid() AND g.organization_id=i.organization_id AND g.invoice_id=i.id AND g.order_id=i.partner_order_id FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_allowlist_v1 g WHERE g.actor_id=auth.uid() AND g.organization_id=i.organization_id AND g.invoice_id=i.id AND g.order_id=i.partner_order_id AND g.revoked_at IS NULL AND g.valid_from<=clock_timestamp() AND g.valid_until>clock_timestamp() AND g.synthetic) THEN RETURN jsonb_build_object('final',false,'code','CANCEL_POLICY_SCOPE_DENIED'); END IF;
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
record=replace(record,'  v_invoice_id := v_cur.fiscal_invoice_id;',"  IF v_cur.service='NFeRecepcaoEvento4' AND v_cur.fiscal_event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fiscal_invoices i WHERE i.id=v_cur.fiscal_invoice_id AND i.organization_id=public.h15_actor_organization() AND public.fn_fiscal_can_operate(auth.uid()) IS TRUE) THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;\n  v_invoice_id := v_cur.fiscal_invoice_id;")
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
CREATE TABLE platform_private.b2b_cancel_policy_allowlist_v1(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL,organization_id uuid NOT NULL,invoice_id uuid NOT NULL,order_id uuid NOT NULL,synthetic boolean NOT NULL DEFAULT true,valid_from timestamptz NOT NULL DEFAULT clock_timestamp(),valid_until timestamptz NOT NULL,revoked_at timestamptz);
REVOKE ALL ON platform_private.b2b_cancel_policy_allowlist_v1 FROM PUBLIC,anon,authenticated,service_role;
"""
(H/'candidate.sql').write_text(gate+residual+';\n'+payment+';\n'+bridge+';\n'+apply+';\n'+capability+helper+record+';\n')
(H/'01-pre.sql.readonly').write_text('BEGIN READ ONLY;\n'+pre+'ROLLBACK;\n')
(H/'02-install.sql.review').write_text('BEGIN;\n'+pre+"IF_NOT_USED".replace('IF_NOT_USED','')+(H/'candidate.sql').read_text()+'COMMIT;\n')
post=H/'capture/post-pins.json'
if post.exists():
 pg=guard(json.loads(post.read_text()));(H/'03-post.sql.readonly').write_text('BEGIN READ ONLY;\n'+pg+'ROLLBACK;\n')
 (H/'04-rollback-deny.sql.review').write_text('BEGIN;\n'+pg+"UPDATE platform_private.b2b_cancel_policy_gate_v1 SET enabled=false;\nREVOKE EXECUTE ON FUNCTION public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;\nREVOKE EXECUTE ON FUNCTION public.rpc_b2b_cancel_residual_capability_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;\nCOMMIT;\n")
 rollbackpins=json.loads(post.read_text())
 rollbackpins['public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text)']['acl']=['postgres=X/postgres']
 if 'public.rpc_b2b_cancel_residual_capability_v1(uuid)' in rollbackpins: rollbackpins['public.rpc_b2b_cancel_residual_capability_v1(uuid)']['acl']=['postgres=X/postgres']
 (H/'05-post-rollback.sql.readonly').write_text('BEGIN READ ONLY;\n'+guard(rollbackpins)+"DO $g$ BEGIN IF EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE enabled) THEN RAISE EXCEPTION 'ROLLBACK_GATE_OPEN'; END IF; END $g$;\nROLLBACK;\n")
 (H/'06-reinstall-closed.sql.review').write_text('BEGIN;\n'+guard(rollbackpins)+"GRANT EXECUTE ON FUNCTION public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text),public.rpc_b2b_cancel_residual_capability_v1(uuid) TO authenticated;\nUPDATE platform_private.b2b_cancel_policy_gate_v1 SET enabled=false;\nCOMMIT;\n")
(H/'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in sorted(H.glob('*.sql*'))))