#!/usr/bin/env python3
"""Previsão privada pré-NF; deriva approve_partner_order LIVE. REVIEW_ONLY."""
from pathlib import Path
import hashlib
import json

H = Path(__file__).resolve().parent
ROOT = H.parents[5]
CAPTURE = ROOT / "scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/evidence/attempt-125/current-pre-physical.json"
CAPTURE5 = H / "capture-5-functions-20261109.json"
BASELINE = CAPTURE.with_name("real-baselines.json")
REF = "swzpzcwiasxmjutrmvkm"
OLD_APPROVE_MD5 = "664f63441c92a6716f0117362255ec9e"
ANCHOR = "  END LOOP;\nEND\n$function$"
REPLACEMENT = "  END LOOP;\n  PERFORM platform_private.b2b_financial_forecast_after_approval_v1(p_order_id, v_credit);\nEND\n$function$"


def md5(text): return hashlib.md5(text.encode()).hexdigest()
def sha(text): return hashlib.sha256(text.encode()).hexdigest()


def main():
    baseline = json.loads(BASELINE.read_text())
    assert baseline["canonical_ref"] == REF and baseline["hosted"] is False
    capture = json.loads(CAPTURE.read_text())
    capture5 = json.loads(CAPTURE5.read_text())
    assert capture5["canonical_ref"] == REF and capture5["hosted"] is False
    current = {r["proname"]: r for r in capture5["functions"]}
    assert set(current) == {"approve_b2b_credit", "approve_b2b_payment_terms_secure", "approve_partner_order", "fn_b2b_credit_exposure", "tg_h7_fiscal_invoice_immutable_v1"}
    for name, row in current.items():
        assert md5(row["definition"]) == row["md5"], name
    approve = current["approve_partner_order"]["definition"]
    assert md5(approve) == OLD_APPROVE_MD5 and approve.count(ANCHOR) == 1
    candidate_approve = approve.replace(ANCHOR, REPLACEMENT)
    new_approve_md5 = md5(candidate_approve)

    terms = current["approve_b2b_payment_terms_secure"]["definition"]
    terms_anchor = "  RETURN jsonb_build_object('success', true, 'status', 'approved');"
    assert terms.count(terms_anchor) == 1
    candidate_terms = terms.replace(terms_anchor, "  PERFORM platform_private.b2b_financial_forecast_after_approval_v1(p_partner_order_id,\n    public.fn_b2b_credit_exposure((SELECT po.partner_id FROM public.partner_orders po WHERE po.id=p_partner_order_id),0,NULL));\n" + terms_anchor)
    new_terms_md5 = md5(candidate_terms)

    credit = current["fn_b2b_credit_exposure"]["definition"]
    committed_start = credit.index("  -- (b) pedidos com compromisso financeiro real")
    committed_end = credit.index("  -- (c) H4-001:", committed_start)
    committed_residual = """  -- (b) compromisso aprovado: com previsão B4, somente o residual ainda sem NF.
  -- O título em aberto já entra em (a); sem previsão, preserva o legado e seus links.
  SELECT COALESCE(SUM(ROUND(CASE
    WHEN f.order_id IS NOT NULL THEN f.residual_amount
    ELSE COALESCE(po.final_amount_with_interest, po.total, 0) END,2)),0)
    INTO v_committed
  FROM public.partner_orders po
  LEFT JOIN platform_private.b2b_financial_forecasts f ON f.order_id=po.id
  WHERE po.partner_id = p_partner_id
    AND po.status IN ('aprovado','em_producao','produzido','aguardando_entrega',
                      'confirmado','em_separacao','enviado','entregue')
    AND (f.order_id IS NOT NULL OR (COALESCE(po.receivable_generated,false) = false
      AND NOT EXISTS (SELECT 1 FROM public.partner_order_financial_links pofl
                      WHERE pofl.partner_order_id = po.id)))
    AND (p_exclude_order_id IS NULL OR po.id <> p_exclude_order_id);

"""
    candidate_credit = credit[:committed_start] + committed_residual + credit[committed_end:]
    new_credit_md5 = md5(candidate_credit)
    schema = r"""
CREATE TABLE platform_private.b2b_financial_forecasts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL UNIQUE REFERENCES public.partner_orders(id),
 organization_id uuid NOT NULL,partner_id uuid NOT NULL,total_amount numeric(14,2) NOT NULL CHECK(total_amount>0),
 residual_amount numeric(14,2) NOT NULL CHECK(residual_amount>=0 AND residual_amount<=total_amount),
 state text NOT NULL CHECK(state IN ('aguardando_fiscal','emissao_em_andamento','consulta_fiscal_obrigatoria','faturado_parcial','faturado_total','cancelado_antes_nf','cancelado_residual')),
 due_dates_estimated boolean NOT NULL DEFAULT true CHECK(due_dates_estimated),economic_snapshot jsonb NOT NULL,
 schedule_snapshot jsonb NOT NULL CHECK(jsonb_typeof(schedule_snapshot)='array'),items_snapshot jsonb NOT NULL CHECK(jsonb_typeof(items_snapshot)='array'),
 credit_decision_snapshot jsonb NOT NULL,commercial_approved_by uuid NOT NULL,commercial_approved_at timestamptz NOT NULL,
 credit_approved_by uuid,credit_approved_at timestamptz,fiscal_intent_id uuid,last_error_code text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE platform_private.b2b_financial_forecasts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.b2b_financial_forecasts FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE platform_private.b2b_financial_forecast_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,forecast_id uuid NOT NULL REFERENCES platform_private.b2b_financial_forecasts(id),
 event_type text NOT NULL,event_reference text NOT NULL,payload jsonb NOT NULL DEFAULT '{}'::jsonb,actor_id uuid,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(forecast_id,event_type,event_reference));
ALTER TABLE platform_private.b2b_financial_forecast_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.b2b_financial_forecast_events FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION platform_private.b2b_financial_forecast_events_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN RAISE EXCEPTION 'B2B_FORECAST_EVENT_IMMUTABLE' USING ERRCODE='42501';END$$;
CREATE TRIGGER b2b_forecast_events_no_change BEFORE UPDATE OR DELETE ON platform_private.b2b_financial_forecast_events
FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_financial_forecast_events_immutable();
CREATE FUNCTION platform_private.b2b_financial_forecast_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'B2B_FORECAST_DELETE_DENIED' USING ERRCODE='42501';END IF;
 IF (NEW.order_id,NEW.organization_id,NEW.partner_id,NEW.total_amount,NEW.due_dates_estimated,NEW.economic_snapshot,
     NEW.schedule_snapshot,NEW.items_snapshot,NEW.credit_decision_snapshot,NEW.commercial_approved_by,NEW.commercial_approved_at,
     NEW.credit_approved_by,NEW.credit_approved_at)
    IS DISTINCT FROM
    (OLD.order_id,OLD.organization_id,OLD.partner_id,OLD.total_amount,OLD.due_dates_estimated,OLD.economic_snapshot,
     OLD.schedule_snapshot,OLD.items_snapshot,OLD.credit_decision_snapshot,OLD.commercial_approved_by,OLD.commercial_approved_at,
     OLD.credit_approved_by,OLD.credit_approved_at)
 THEN RAISE EXCEPTION 'B2B_FORECAST_ECONOMIC_IMMUTABLE' USING ERRCODE='42501';END IF;
 IF NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'B2B_FORECAST_CAS_REQUIRED' USING ERRCODE='PT409';END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER b2b_forecast_guard BEFORE UPDATE OR DELETE ON platform_private.b2b_financial_forecasts
FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_financial_forecast_guard();

CREATE FUNCTION platform_private.b2b_financial_forecast_after_approval_v1(p_order uuid,p_credit jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE po public.partner_orders;org uuid;f platform_private.b2b_financial_forecasts;
 schedule jsonb;items jsonb;reason text:=coalesce(p_credit->>'reason_code','');total numeric(14,2);
BEGIN
 SELECT * INTO po FROM public.partner_orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR po.status<>'aprovado' OR po.approved_by IS NULL OR po.approved_at IS NULL THEN
  RAISE EXCEPTION 'B2B_FORECAST_COMMERCIAL_APPROVAL_REQUIRED' USING ERRCODE='42501';END IF;
 IF po.requires_financial_approval AND po.financial_approval_status IS DISTINCT FROM 'approved' THEN
  RETURN jsonb_build_object('deferred',true,'reason','PAYMENT_TERMS_APPROVAL_REQUIRED');END IF;
 IF po.payment_terms_id IS NULL OR coalesce(po.payment_condition_status,'') NOT IN ('defined','approved') THEN
  RAISE EXCEPTION 'B2B_FORECAST_CONDITION_UNPROVEN' USING ERRCODE='42501';END IF;
 IF po.credit_approved_at IS NULL AND reason<>'OK' THEN
  RAISE EXCEPTION 'B2B_FORECAST_CREDIT_APPROVAL_REQUIRED' USING ERRCODE='42501';END IF;
 IF po.credit_approved_at IS NOT NULL AND po.credit_approved_by IS NULL THEN
  RAISE EXCEPTION 'B2B_FORECAST_CREDIT_APPROVAL_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT pa.commercial_owner_organization_id INTO org FROM public.partner_accounts pa
  WHERE pa.id=po.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
 IF org IS NULL OR po.internal_economic_snapshot IS NULL THEN RAISE EXCEPTION 'B2B_FORECAST_SCOPE_UNPROVEN' USING ERRCODE='42501';END IF;
 total:=round(coalesce(po.final_amount_with_interest,po.total,0),2);
 IF total<=0 THEN RAISE EXCEPTION 'B2B_FORECAST_TOTAL_INVALID' USING ERRCODE='23514';END IF;
 SELECT jsonb_agg(to_jsonb(s) ORDER BY s.installment_number) INTO schedule
  FROM public.partner_order_payment_schedule s WHERE s.partner_order_id=po.id;
 IF schedule IS NULL OR jsonb_array_length(schedule)=0 OR (SELECT sum((x->>'amount')::numeric) FROM jsonb_array_elements(schedule)x) IS DISTINCT FROM total THEN
  RAISE EXCEPTION 'B2B_FORECAST_SCHEDULE_UNPROVEN' USING ERRCODE='23514';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]'::jsonb) INTO items FROM public.partner_order_items i WHERE i.order_id=po.id;
 IF jsonb_array_length(items)=0 THEN RAISE EXCEPTION 'B2B_FORECAST_ITEMS_UNPROVEN' USING ERRCODE='23514';END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE order_id=po.id;
 IF f.id IS NOT NULL THEN
  IF (f.organization_id,f.partner_id,f.total_amount,f.residual_amount,f.economic_snapshot,f.schedule_snapshot,f.items_snapshot,f.credit_decision_snapshot)
   IS DISTINCT FROM (org,po.partner_id,total,total,po.internal_economic_snapshot,schedule,items,p_credit)
  THEN RAISE EXCEPTION 'B2B_FORECAST_REPLAY_DIVERGENCE' USING ERRCODE='PT409';END IF;
  RETURN jsonb_build_object('forecast_id',f.id,'replayed',true,'state',f.state);
 END IF;
 INSERT INTO platform_private.b2b_financial_forecasts(order_id,organization_id,partner_id,total_amount,residual_amount,state,
  economic_snapshot,schedule_snapshot,items_snapshot,credit_decision_snapshot,commercial_approved_by,commercial_approved_at,credit_approved_by,credit_approved_at)
 VALUES(po.id,org,po.partner_id,total,total,'aguardando_fiscal',po.internal_economic_snapshot,schedule,items,p_credit,
  po.approved_by,po.approved_at,po.credit_approved_by,po.credit_approved_at) RETURNING * INTO f;
 INSERT INTO platform_private.b2b_financial_forecast_events(forecast_id,event_type,event_reference,payload,actor_id)
 VALUES(f.id,'PREVISION_CREATED',f.id::text,jsonb_build_object('total',total,'estimated',true),po.approved_by);
 RETURN jsonb_build_object('forecast_id',f.id,'replayed',false,'state',f.state);
END$$;

CREATE FUNCTION public.get_b2b_financial_forecast_secure(p_order uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE f platform_private.b2b_financial_forecasts;actor uuid:=auth.uid();owner_org uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'B2B_FORECAST_READ_DENIED' USING ERRCODE='42501';END IF;
 IF NOT public.b2b_phase1_order_visible(p_order) THEN
  SELECT pa.commercial_owner_organization_id INTO owner_org
   FROM public.partner_orders po JOIN public.partner_accounts pa ON pa.id=po.partner_id
  WHERE po.id=p_order AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
  IF owner_org IS NULL OR public.h15_actor_organization() IS DISTINCT FROM owner_org
   OR NOT (public.has_role(actor,'administrador') OR public.has_role(actor,'gestor_comercial') OR public.has_role(actor,'financeiro')) THEN
   RAISE EXCEPTION 'B2B_FORECAST_READ_DENIED' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE order_id=p_order;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('forecast_id',f.id,'order_id',f.order_id,'organization_id',f.organization_id,'partner_id',f.partner_id,
  'total_amount',f.total_amount,'residual_amount',f.residual_amount,'state',f.state,'due_dates_estimated',true,
  'schedule',f.schedule_snapshot,'version',f.version,'fiscal_intent_id',f.fiscal_intent_id,'last_error_code',f.last_error_code,
  'created_at',f.created_at,'updated_at',f.updated_at);
END$$;
REVOKE ALL ON FUNCTION public.get_b2b_financial_forecast_secure(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_b2b_financial_forecast_secure(uuid) TO authenticated;

CREATE FUNCTION platform_private.b2b_financial_forecast_transition_v1(p_forecast uuid,p_expected_version integer,p_event text,p_reference text,p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE f platform_private.b2b_financial_forecasts;new_state text;existing bigint;event_ref text;
BEGIN
 IF coalesce(p_payload->>'attempt','1')!~'^[1-9][0-9]*$' THEN RAISE EXCEPTION 'B2B_FORECAST_ATTEMPT_INVALID' USING ERRCODE='22023';END IF;
 event_ref:=p_reference||':'||coalesce(nullif(p_payload->>'attempt',''),'1');
 SELECT id INTO existing FROM platform_private.b2b_financial_forecast_events WHERE forecast_id=p_forecast AND event_type=p_event AND event_reference=event_ref;
 IF existing IS NOT NULL THEN SELECT state,version INTO new_state,f.version FROM platform_private.b2b_financial_forecasts WHERE id=p_forecast;
  RETURN jsonb_build_object('forecast_id',p_forecast,'state',new_state,'version',f.version,'replayed',true);END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE id=p_forecast FOR UPDATE;
 IF NOT FOUND OR f.version<>p_expected_version THEN RAISE EXCEPTION 'B2B_FORECAST_CAS_CONFLICT' USING ERRCODE='PT409';END IF;
 IF p_event='EMISSION_STARTED' THEN
  IF f.state NOT IN ('aguardando_fiscal','emissao_em_andamento') THEN RAISE EXCEPTION 'B2B_FORECAST_STATE_CONFLICT' USING ERRCODE='PT409';END IF;
  IF f.state='emissao_em_andamento' AND f.fiscal_intent_id::text IS DISTINCT FROM p_reference THEN RAISE EXCEPTION 'B2B_FORECAST_INTENT_CONFLICT' USING ERRCODE='PT409';END IF;
  new_state:='emissao_em_andamento';
 ELSIF p_event IN ('EMISSION_FAILED','EMISSION_REJECTED') THEN
  IF f.state<>'emissao_em_andamento' OR f.fiscal_intent_id::text IS DISTINCT FROM p_reference THEN RAISE EXCEPTION 'B2B_FORECAST_STATE_CONFLICT' USING ERRCODE='PT409';END IF;
  new_state:='aguardando_fiscal';
 ELSIF p_event='EMISSION_TIMEOUT' THEN
  IF f.state<>'emissao_em_andamento' OR f.fiscal_intent_id::text IS DISTINCT FROM p_reference THEN RAISE EXCEPTION 'B2B_FORECAST_STATE_CONFLICT' USING ERRCODE='PT409';END IF;
  new_state:='consulta_fiscal_obrigatoria';
 ELSIF p_event='CONSULTATION_NOT_AUTHORIZED' THEN
  IF f.state<>'consulta_fiscal_obrigatoria' OR f.fiscal_intent_id::text IS DISTINCT FROM p_reference THEN RAISE EXCEPTION 'B2B_FORECAST_STATE_CONFLICT' USING ERRCODE='PT409';END IF;
  new_state:='aguardando_fiscal';
 ELSE RAISE EXCEPTION 'B2B_FORECAST_EVENT_INVALID' USING ERRCODE='22023';END IF;
 UPDATE platform_private.b2b_financial_forecasts SET state=new_state,fiscal_intent_id=CASE WHEN p_event='EMISSION_STARTED' THEN p_reference::uuid ELSE fiscal_intent_id END,
  last_error_code=CASE WHEN p_event IN ('EMISSION_FAILED','EMISSION_REJECTED','EMISSION_TIMEOUT') THEN nullif(p_payload->>'error_code','') ELSE NULL END,
  version=version+1,updated_at=now() WHERE id=f.id;
 INSERT INTO platform_private.b2b_financial_forecast_events(forecast_id,event_type,event_reference,payload) VALUES(f.id,p_event,event_ref,p_payload);
 RETURN jsonb_build_object('forecast_id',f.id,'state',new_state,'version',f.version+1,'replayed',false);
END$$;

CREATE FUNCTION platform_private.b2b_financial_forecast_reconcile_fiscal_v1(p_document uuid,p_receivable uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE a platform_private.b2b_document_allocations;f platform_private.b2b_financial_forecasts;residual numeric;new_state text;
BEGIN
 SELECT * INTO a FROM platform_private.b2b_document_allocations WHERE document_id=p_document AND receivable_id=p_receivable;
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_FORECAST_FISCAL_ALLOCATION_UNPROVEN' USING ERRCODE='42501';END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE order_id=a.order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('forecast_found',false,'legacy_order',true);END IF;
 IF EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecast_events WHERE forecast_id=f.id AND event_type='FISCAL_CONFIRMED' AND event_reference=p_document::text) THEN
  RETURN jsonb_build_object('forecast_id',f.id,'state',f.state,'version',f.version,'replayed',true);END IF;
 residual:=platform_private.b2b_order_residual(a.order_id);new_state:=CASE WHEN residual=0 THEN 'faturado_total' ELSE 'faturado_parcial' END;
 UPDATE platform_private.b2b_financial_forecasts SET residual_amount=residual,state=new_state,fiscal_intent_id=NULL,last_error_code=NULL,version=version+1,updated_at=now() WHERE id=f.id;
 INSERT INTO platform_private.b2b_financial_forecast_events(forecast_id,event_type,event_reference,payload)
 VALUES(f.id,'FISCAL_CONFIRMED',p_document::text,jsonb_build_object('receivable_id',p_receivable,'residual',residual,'due_dates_estimated',false));
 RETURN jsonb_build_object('forecast_id',f.id,'state',new_state,'residual_amount',residual,'version',f.version+1,'replayed',false);
END$$;

CREATE FUNCTION platform_private.b2b_financial_forecast_cancel_residual_v1(p_forecast uuid,p_expected_version integer,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE f platform_private.b2b_financial_forecasts;new_state text;
BEGIN
 IF nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'B2B_FORECAST_CANCEL_REASON_REQUIRED' USING ERRCODE='22023';END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE id=p_forecast FOR UPDATE;
 IF NOT FOUND OR f.version<>p_expected_version THEN RAISE EXCEPTION 'B2B_FORECAST_CAS_CONFLICT' USING ERRCODE='PT409';END IF;
 IF f.state IN ('emissao_em_andamento','consulta_fiscal_obrigatoria','faturado_total','cancelado_antes_nf','cancelado_residual') THEN RAISE EXCEPTION 'B2B_FORECAST_STATE_CONFLICT' USING ERRCODE='PT409';END IF;
 new_state:=CASE WHEN f.state='faturado_parcial' THEN 'cancelado_residual' ELSE 'cancelado_antes_nf' END;
 UPDATE platform_private.b2b_financial_forecasts SET state=new_state,residual_amount=0,version=version+1,updated_at=now() WHERE id=f.id;
 INSERT INTO platform_private.b2b_financial_forecast_events(forecast_id,event_type,event_reference,payload)
 VALUES(f.id,'FORECAST_CANCELED',f.id::text||':'||(f.version+1)::text,jsonb_build_object('reason',p_reason,'previous_state',f.state));
 RETURN jsonb_build_object('forecast_id',f.id,'state',new_state,'version',f.version+1);
END$$;
REVOKE ALL ON FUNCTION platform_private.b2b_financial_forecast_after_approval_v1(uuid,jsonb),platform_private.b2b_financial_forecast_events_immutable(),platform_private.b2b_financial_forecast_guard(),platform_private.b2b_financial_forecast_transition_v1(uuid,integer,text,text,jsonb),platform_private.b2b_financial_forecast_reconcile_fiscal_v1(uuid,uuid),platform_private.b2b_financial_forecast_cancel_residual_v1(uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.b2b_financial_forecast_transition_v1(uuid,integer,text,text,jsonb),platform_private.b2b_financial_forecast_reconcile_fiscal_v1(uuid,uuid),platform_private.b2b_financial_forecast_cancel_residual_v1(uuid,integer,text) TO service_role;
"""
    reconcile_start = schema.index("CREATE FUNCTION platform_private.b2b_financial_forecast_reconcile_fiscal_v1")
    reconcile_end = schema.index("CREATE FUNCTION platform_private.b2b_financial_forecast_cancel_residual_v1", reconcile_start)
    reconcile_sql = schema[reconcile_start:reconcile_end]
    schema = schema[:reconcile_start] + schema[reconcile_end:]
    reconcile_grant = ",platform_private.b2b_financial_forecast_reconcile_fiscal_v1(uuid,uuid)"
    assert schema.count(reconcile_grant) == 2
    schema = schema.replace(reconcile_grant, "")
    pre = f"""-- REVIEW ONLY READ ONLY PRE; previsão separada, nenhum título pré-NF.
BEGIN READ ONLY;
DO $$ BEGIN
 IF current_setting('b2b_forecast.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'B2B_FORECAST_REF_NOT_VERIFIED';END IF;
 IF md5(pg_get_functiondef('public.approve_partner_order(uuid,text,date)'::regprocedure)) IS DISTINCT FROM '{OLD_APPROVE_MD5}' THEN RAISE EXCEPTION 'B2B_FORECAST_APPROVE_PRE_DRIFT';END IF;
 IF to_regclass('platform_private.b2b_financial_forecasts') IS NOT NULL OR to_regclass('platform_private.b2b_financial_forecast_events') IS NOT NULL THEN RAISE EXCEPTION 'B2B_FORECAST_ALREADY_INSTALLED';END IF;
END$$;
ROLLBACK;
"""
    post = f"""-- REVIEW ONLY READ ONLY POST; previsão não é conta a receber.
BEGIN READ ONLY;
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.approve_partner_order(uuid,text,date)'::regprocedure)) IS DISTINCT FROM '{new_approve_md5}' THEN RAISE EXCEPTION 'B2B_FORECAST_APPROVE_POST_DRIFT';END IF;
 IF (SELECT count(*) FROM pg_class WHERE oid IN ('platform_private.b2b_financial_forecasts'::regclass,'platform_private.b2b_financial_forecast_events'::regclass) AND NOT relrowsecurity)<>0 THEN RAISE EXCEPTION 'B2B_FORECAST_RLS_MISSING';END IF;
 IF has_function_privilege('anon','public.get_b2b_financial_forecast_secure(uuid)','EXECUTE') OR NOT has_function_privilege('authenticated','public.get_b2b_financial_forecast_secure(uuid)','EXECUTE') THEN RAISE EXCEPTION 'B2B_FORECAST_READER_ACL_INVALID';END IF;
END$$;
ROLLBACK;
"""
    install = f"""-- REVIEW_ONLY_INACTIVE_NOT_APPROVED; PostgreSQL descartável apenas.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF current_setting('b2b_forecast.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'B2B_FORECAST_REF_NOT_VERIFIED';END IF;
 IF md5(pg_get_functiondef('public.approve_partner_order(uuid,text,date)'::regprocedure)) IS DISTINCT FROM '{OLD_APPROVE_MD5}' THEN RAISE EXCEPTION 'B2B_FORECAST_APPROVE_INSTALL_PRE_DRIFT';END IF;
END$$;
{schema}
{candidate_approve};
DO $$ BEGIN IF md5(pg_get_functiondef('public.approve_partner_order(uuid,text,date)'::regprocedure)) IS DISTINCT FROM '{new_approve_md5}' THEN RAISE EXCEPTION 'B2B_FORECAST_APPROVE_INSTALL_POST_DRIFT';END IF;END$$;
COMMIT;
"""
    rollback = f"""-- REVIEW ONLY deny-only; preserva previsões/eventos e restaura aprovação LIVE.
BEGIN;
SET LOCAL lock_timeout='3s';
{approve};
REVOKE ALL ON FUNCTION public.get_b2b_financial_forecast_secure(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION platform_private.b2b_financial_forecast_after_approval_v1(uuid,jsonb),platform_private.b2b_financial_forecast_transition_v1(uuid,integer,text,text,jsonb),platform_private.b2b_financial_forecast_cancel_residual_v1(uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN IF md5(pg_get_functiondef('public.approve_partner_order(uuid,text,date)'::regprocedure)) IS DISTINCT FROM '{OLD_APPROVE_MD5}' THEN RAISE EXCEPTION 'B2B_FORECAST_ROLLBACK_POST_DRIFT';END IF;END$$;
COMMIT;
"""
    reconcile_pre = f"""-- REVIEW ONLY READ ONLY; fase 2 exige B4 e previsão já instalados.
BEGIN READ ONLY;
DO $$ BEGIN
 IF current_setting('b2b_forecast.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'B2B_FORECAST_REF_NOT_VERIFIED';END IF;
 IF to_regclass('platform_private.b2b_document_allocations') IS NULL OR to_regclass('platform_private.b2b_financial_forecasts') IS NULL THEN RAISE EXCEPTION 'B2B_FORECAST_RECONCILE_DEPENDENCY_MISSING';END IF;
 IF to_regprocedure('platform_private.b2b_financial_forecast_reconcile_fiscal_v1(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'B2B_FORECAST_RECONCILE_ALREADY_INSTALLED';END IF;
END$$;
ROLLBACK;
"""
    reconcile_install = f"""-- REVIEW ONLY INACTIVE; fase 2 service-only, um definitivo por NF.
BEGIN;
SET LOCAL lock_timeout='3s';
{reconcile_sql}
REVOKE ALL ON FUNCTION platform_private.b2b_financial_forecast_reconcile_fiscal_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.b2b_financial_forecast_reconcile_fiscal_v1(uuid,uuid) TO service_role;
COMMIT;
"""
    reconcile_post = """-- REVIEW ONLY READ ONLY POST fase 2.
BEGIN READ ONLY;
DO $$ BEGIN
 IF has_function_privilege('authenticated','platform_private.b2b_financial_forecast_reconcile_fiscal_v1(uuid,uuid)','EXECUTE') OR NOT has_function_privilege('service_role','platform_private.b2b_financial_forecast_reconcile_fiscal_v1(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'B2B_FORECAST_RECONCILE_ACL_INVALID';END IF;
END$$;
ROLLBACK;
"""
    reconcile_rollback = """-- REVIEW ONLY deny-only fase 2; preserva previsões, títulos e eventos.
BEGIN;
REVOKE ALL ON FUNCTION platform_private.b2b_financial_forecast_reconcile_fiscal_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
"""
    files = {"01-pre.sql.readonly": pre, "02-install.sql.review": install, "03-post.sql.readonly": post, "04-rollback-deny.sql.review": rollback,
             "05-pre-fiscal-reconcile.sql.readonly": reconcile_pre, "06-install-fiscal-reconcile.sql.review": reconcile_install,
             "07-post-fiscal-reconcile.sql.readonly": reconcile_post, "08-rollback-fiscal-reconcile-deny.sql.review": reconcile_rollback}
    for name, text in files.items(): (H/name).write_text(text)
    manifest = {"project_ref":REF,"status":"REVIEW_ONLY_INACTIVE_NOT_APPROVED","phase":"FORECAST_AFTER_COMMERCIAL_AND_CREDIT_BEFORE_NF",
      "capture":str(CAPTURE.relative_to(ROOT)),"capture_sha256":sha(CAPTURE.read_text()),"live_approve_md5":OLD_APPROVE_MD5,
      "after_forecast_approve_md5":new_approve_md5,"accounts_receivable_before_nf":False,"definitive_cardinality":"ONE_PER_AUTHORIZED_FISCAL_DOCUMENT",
      "forecast_additive_to_credit":False,"files":{n:sha(t) for n,t in files.items()},"hosted":False}
    (H/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    print(json.dumps(manifest,indent=2))

if __name__ == "__main__": main()
