#!/usr/bin/env python3
"""Gera ponte fiscal service-only sobre B4; nunca aplica fora do PG descartável."""
from pathlib import Path
import hashlib
import json
import re
import runpy

H = Path(__file__).resolve().parent
ROOT = H.parents[4]
B4 = ROOT / "scripts/b2b-downstream-audit-20261107/b4/b4-candidate.sql.review"
CAPTURE = ROOT / "scripts/delivery-atomic-hardening-20261030/capture/current.json"
REF = "swzpzcwiasxmjutrmvkm"
EXPECTED_B4 = "7dde7f07bca49f6d89ca995f1b6eacfdbb84b0694565e2a4121b1a7bec4dc59f"


def extract(text: str, name: str) -> str:
    match = re.search(r"CREATE(?: OR REPLACE)? FUNCTION (?:public|platform_private)\." + re.escape(name) + r"\s*\(", text, re.I)
    assert match, name
    tail = text[match.end():]
    marker = re.search(r"\bAS\s*(\$function\$|\$\$)", tail, re.I)
    assert marker, name
    tag = marker.group(1)
    end = tail.find(tag + ";", marker.end())
    assert end >= 0, name
    return text[match.start():match.end()] + tail[:end + len(tag) + 1]


def edit(text: str, old: str, new: str) -> str:
    assert text.count(old) == 1, (old[:120], text.count(old))
    return text.replace(old, new)


def main() -> None:
    b4text = B4.read_text()
    assert hashlib.sha256(b4text.encode()).hexdigest() == EXPECTED_B4
    captured = json.loads(CAPTURE.read_text())
    apply_auth = next(x["body"] for x in captured["functions"] if x["name"] == "rpc_fiscal_invoice_apply_authorization_v1")

    actor = extract(b4text, "b2b_integration_actor")
    actor = edit(actor, "BEGIN\n IF current_setting('transaction_isolation')<>'read committed'", """BEGIN
 IF current_setting('transaction_isolation')<>'read committed'""")
    actor = edit(actor, " IF u IS NULL OR org IS NULL THEN RAISE EXCEPTION 'B2B_ACTOR_DENIED' USING ERRCODE='42501'; END IF;", """ IF u IS NULL AND org IS NULL AND p_internal THEN
  SELECT p.organization_id INTO owner_org FROM platform_private.b2b_fiscal_service_permits p
  WHERE p.transaction_id=txid_current() AND p.partner_id=p_partner;
  IF owner_org IS NOT NULL AND EXISTS(SELECT 1 FROM public.partner_accounts pa
    WHERE pa.id=p_partner AND pa.commercial_owner_organization_id=owner_org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL) THEN
   RETURN owner_org;
  END IF;
 END IF;
 IF u IS NULL OR org IS NULL THEN RAISE EXCEPTION 'B2B_ACTOR_DENIED' USING ERRCODE='42501'; END IF;""")

    fence = extract(b4text, "b2b_title_insert_fence")
    fence = edit(fence, "  IF NOT FOUND OR p.actor_id IS DISTINCT FROM auth.uid() OR p.organization_id IS DISTINCT FROM public.h15_actor_organization()", """  IF NOT FOUND OR p.actor_id IS DISTINCT FROM auth.uid()
  OR (auth.uid() IS NULL AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_fiscal_service_permits sp
    WHERE sp.transaction_id=txid_current() AND sp.document_id=NEW.b2b_document_id AND sp.organization_id=NEW.organization_id AND sp.partner_id=NEW.partner_id))
  OR (auth.uid() IS NOT NULL AND p.organization_id IS DISTINCT FROM public.h15_actor_organization())""")

    apply_auth = edit(apply_auth, "DECLARE v_inv public.fiscal_invoices%ROWTYPE; v_xml uuid;", "DECLARE v_inv public.fiscal_invoices%ROWTYPE; v_xml uuid; v_bridge jsonb;")
    apply_auth = edit(apply_auth, "    RETURN jsonb_build_object('invoiceId', v_inv.id, 'applied', false,\n      'normalizedStatus', v_inv.normalized_status,\n      'reconciliationStatus', v_inv.reconciliation_status);", """    v_bridge := platform_private.b2b_fiscal_invoice_bridge_v1(v_inv.id);
    RETURN jsonb_build_object('invoiceId', v_inv.id, 'applied', false,
      'normalizedStatus', v_inv.normalized_status,
      'reconciliationStatus', v_inv.reconciliation_status,
      'receivableId', v_bridge->>'receivable_id', 'b2bReplay', v_bridge->>'replayed');""")
    apply_auth = edit(apply_auth, "  RETURN jsonb_build_object('invoiceId', _invoice_id, 'applied', true,\n    'normalizedStatus','AUTHORIZED',", """  v_bridge := platform_private.b2b_fiscal_invoice_bridge_v1(_invoice_id);
  RETURN jsonb_build_object('invoiceId', _invoice_id, 'applied', true,
    'receivableId', v_bridge->>'receivable_id', 'b2bReplay', v_bridge->>'replayed',
    'normalizedStatus','AUTHORIZED',""")

    schema = r"""
CREATE TABLE platform_private.b2b_fiscal_service_permits(
 transaction_id bigint NOT NULL,invoice_id uuid NOT NULL,document_id uuid NOT NULL,
 organization_id uuid NOT NULL,order_id uuid NOT NULL,partner_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(transaction_id,invoice_id));
ALTER TABLE platform_private.b2b_fiscal_service_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.b2b_fiscal_service_permits FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.b2b_title_permits ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.accounts_receivable ALTER COLUMN created_by DROP NOT NULL;
"""

    bridge = r"""
CREATE FUNCTION platform_private.b2b_fiscal_created_by_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.created_by IS NULL AND NOT EXISTS(
   SELECT 1 FROM platform_private.b2b_fiscal_service_permits p
   WHERE p.transaction_id=txid_current() AND p.document_id=NEW.b2b_document_id
    AND p.organization_id=NEW.organization_id AND p.partner_id=NEW.partner_id
 ) THEN RAISE EXCEPTION 'B2B_SERVICE_ORIGIN_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER b2b_fiscal_created_by_guard BEFORE INSERT OR UPDATE OF created_by,b2b_document_id,origin_type,origin_id,organization_id,partner_id,customer_id
ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_fiscal_created_by_guard();

CREATE FUNCTION platform_private.b2b_fiscal_invoice_bridge_v1(p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE inv public.fiscal_invoices; po public.partner_orders; org uuid; items jsonb;
 digest text; result jsonb; existing platform_private.b2b_authorized_documents;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'B2B_READ_COMMITTED_REQUIRED' USING ERRCODE='0A000'; END IF;
 SELECT * INTO inv FROM public.fiscal_invoices WHERE id=p_invoice FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF inv.normalized_status IS DISTINCT FROM 'AUTHORIZED' THEN
  RETURN jsonb_build_object('success',true,'skipped',true,'reason',coalesce(inv.normalized_status,inv.status),'receivable_id',NULL);
 END IF;
 IF inv.invoice_type NOT IN ('NFE','NFSE') OR inv.authorized_at IS NULL OR inv.issue_date IS NULL
  OR coalesce(inv.environment,'HOMOLOGATION')<>'HOMOLOGATION'
  OR (inv.invoice_type='NFE' AND coalesce(inv.access_key,'')!~'^[0-9]{44}$')
  OR (inv.invoice_type='NFSE' AND nullif(btrim(coalesce(inv.provider_reference,'')),'') IS NULL)
 THEN RAISE EXCEPTION 'B2B_FISCAL_CONFIRMATION_UNPROVEN' USING ERRCODE='42501'; END IF;
 SELECT c.organization_id INTO org FROM public.company_fiscal_settings c
 WHERE c.id=inv.company_settings_id AND c.is_active IS TRUE;
 IF org IS NULL OR inv.organization_id IS DISTINCT FROM org THEN RAISE EXCEPTION 'B2B_FISCAL_TENANT_MISMATCH' USING ERRCODE='42501'; END IF;
 SELECT * INTO po FROM public.partner_orders WHERE id=inv.partner_order_id;
 IF po.id IS NULL OR po.partner_id IS DISTINCT FROM inv.debtor_partner_id OR NOT EXISTS(
   SELECT 1 FROM public.partner_accounts pa WHERE pa.id=po.partner_id AND pa.commercial_owner_organization_id=org AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
 ) THEN RAISE EXCEPTION 'B2B_FISCAL_ORDER_SCOPE_INVALID' USING ERRCODE='42501'; END IF;
 SELECT jsonb_agg(jsonb_build_object('item_id',x.partner_order_item_id,'quantity',x.quantity,
   'commercial_unit',x.commercial_unit,'taxable_quantity',x.taxable_quantity,'taxable_unit',x.taxable_unit) ORDER BY x.partner_order_item_id)
 INTO items FROM (
   SELECT i.partner_order_item_id,sum(i.quantity) quantity,i.commercial_unit,sum(i.taxable_quantity) taxable_quantity,i.taxable_unit
   FROM public.fiscal_invoice_items i WHERE i.fiscal_invoice_id=inv.id
   GROUP BY i.partner_order_item_id,i.commercial_unit,i.taxable_unit
 ) x;
 IF items IS NULL OR jsonb_array_length(items)=0 OR EXISTS(
   SELECT 1 FROM public.fiscal_invoice_items i LEFT JOIN public.partner_order_items oi ON oi.id=i.partner_order_item_id AND oi.order_id=po.id
   WHERE i.fiscal_invoice_id=inv.id AND (i.partner_order_item_id IS NULL OR oi.id IS NULL OR i.quantity IS NULL OR i.quantity<=0
    OR i.taxable_quantity IS NULL OR i.taxable_quantity<=0 OR i.commercial_unit IS NULL OR i.taxable_unit IS NULL OR i.net_value IS NULL OR i.net_value<0)
 ) OR (SELECT sum(i.net_value) FROM public.fiscal_invoice_items i WHERE i.fiscal_invoice_id=inv.id) IS DISTINCT FROM inv.total_amount
 THEN RAISE EXCEPTION 'B2B_FISCAL_ITEMS_UNPROVEN' USING ERRCODE='23514'; END IF;
 digest:=encode(extensions.digest(convert_to(inv.id::text||'|'||coalesce(inv.access_key,'')||'|'||inv.authorized_at::text||'|'||items::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO existing FROM platform_private.b2b_authorized_documents WHERE id=inv.id;
 IF existing.id IS NOT NULL AND (existing.organization_id,existing.partner_id,existing.order_id,existing.kind,existing.issue_date,existing.event_key,existing.source_digest,existing.items,existing.state)
   IS DISTINCT FROM (org,po.partner_id,po.id,inv.invoice_type,inv.issue_date,'fiscal_invoice:'||inv.id::text,digest,items,'AUTHORIZED')
 THEN RAISE EXCEPTION 'FISCAL_REPLAY_DIVERGENCE' USING ERRCODE='PT409'; END IF;
 IF existing.id IS NULL THEN
  INSERT INTO platform_private.b2b_authorized_documents(id,organization_id,partner_id,order_id,kind,issue_date,event_key,source_digest,items,state)
  VALUES(inv.id,org,po.partner_id,po.id,inv.invoice_type,inv.issue_date,'fiscal_invoice:'||inv.id::text,digest,items,'AUTHORIZED');
 END IF;
 INSERT INTO platform_private.b2b_fiscal_service_permits(transaction_id,invoice_id,document_id,organization_id,order_id,partner_id)
 VALUES(txid_current(),inv.id,inv.id,org,po.id,po.partner_id);
 result:=platform_private.b2b_allocate_document(inv.id);
 UPDATE public.fiscal_invoices SET receivable_id=(result->>'receivable_id')::uuid,updated_at=now() WHERE id=inv.id;
 INSERT INTO public.fiscal_audit_log(table_name,record_id,action,old_values,new_values,changed_by)
 VALUES('fiscal_invoices',inv.id,'B2B_RECEIVABLE_RECONCILED',jsonb_build_object('receivable_id',inv.receivable_id),
   jsonb_build_object('receivable_id',result->>'receivable_id','document_id',inv.id,'replayed',result->>'replayed'),NULL);
 DELETE FROM platform_private.b2b_fiscal_service_permits WHERE transaction_id=txid_current() AND invoice_id=inv.id;
 RETURN result||jsonb_build_object('invoice_id',inv.id,'skipped',false);
END $$;
REVOKE ALL ON FUNCTION platform_private.b2b_fiscal_created_by_guard(),platform_private.b2b_fiscal_invoice_bridge_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform_private.b2b_fiscal_invoice_bridge_v1(uuid) TO service_role;
"""

    pre = f"""-- READONLY PRE da ponte; ref e fontes exatas.
DO $$ BEGIN
 IF current_setting('b2b_fiscal_bridge.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'B2B_FISCAL_REF_NOT_VERIFIED'; END IF;
 IF to_regprocedure('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)') IS NOT NULL THEN RAISE EXCEPTION 'B2B_FISCAL_BRIDGE_ALREADY_INSTALLED'; END IF;
 IF md5(pg_get_functiondef('platform_private.b2b_integration_actor(uuid,boolean)'::regprocedure)) IS DISTINCT FROM '{hashlib.md5(extract(b4text,'b2b_integration_actor').encode()).hexdigest()}' THEN RAISE EXCEPTION 'B2B_FISCAL_ACTOR_PIN_DRIFT'; END IF;
 IF md5(pg_get_functiondef('platform_private.b2b_title_insert_fence()'::regprocedure)) IS DISTINCT FROM '{hashlib.md5(extract(b4text,'b2b_title_insert_fence').encode()).hexdigest()}' THEN RAISE EXCEPTION 'B2B_FISCAL_FENCE_PIN_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamptz,text,text,uuid)'::regprocedure)) IS DISTINCT FROM '{hashlib.md5(next(x['body'] for x in captured['functions'] if x['name']=='rpc_fiscal_invoice_apply_authorization_v1').encode()).hexdigest()}' THEN RAISE EXCEPTION 'B2B_FISCAL_AUTH_PIN_DRIFT'; END IF;
END $$;
"""
    post = f"""-- READONLY POST da ponte; não certifica provedor/JWT/RLS hosted.
DO $$ BEGIN
 IF current_setting('b2b_fiscal_bridge.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'B2B_FISCAL_REF_NOT_VERIFIED'; END IF;
 IF md5(pg_get_functiondef('platform_private.b2b_integration_actor(uuid,boolean)'::regprocedure)) IS DISTINCT FROM '{hashlib.md5(actor.encode()).hexdigest()}' THEN RAISE EXCEPTION 'B2B_FISCAL_ACTOR_POST_DRIFT'; END IF;
 IF md5(pg_get_functiondef('platform_private.b2b_title_insert_fence()'::regprocedure)) IS DISTINCT FROM '{hashlib.md5(fence.encode()).hexdigest()}' THEN RAISE EXCEPTION 'B2B_FISCAL_FENCE_POST_DRIFT'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamptz,text,text,uuid)'::regprocedure)) IS DISTINCT FROM '{hashlib.md5(apply_auth.encode()).hexdigest()}' THEN RAISE EXCEPTION 'B2B_FISCAL_AUTH_POST_DRIFT'; END IF;
 IF has_function_privilege('authenticated','platform_private.b2b_fiscal_invoice_bridge_v1(uuid)','EXECUTE') OR has_function_privilege('anon','platform_private.b2b_fiscal_invoice_bridge_v1(uuid)','EXECUTE') OR NOT has_function_privilege('service_role','platform_private.b2b_fiscal_invoice_bridge_v1(uuid)','EXECUTE') THEN RAISE EXCEPTION 'B2B_FISCAL_BRIDGE_ACL_INVALID'; END IF;
END $$;
"""
    install = "-- REVIEW ONLY; ponte service-only inativa até revisão e autorização.\nBEGIN;\nSET LOCAL lock_timeout='3s';\n" + pre + schema + bridge + "\n" + actor + ";\n" + fence + ";\n" + apply_auth + ";\n" + post + "\nCOMMIT;\n"
    rollback = """-- DENY-ONLY: fecha ponte e callback; preserva NF, títulos, alocações e histórico.
BEGIN;
REVOKE ALL ON FUNCTION platform_private.b2b_fiscal_invoice_bridge_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamptz,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
"""
    outputs = {"01-pre.sql.readonly":pre,"02-install.sql.review":install,"03-post.sql.readonly":post,"04-rollback-deny.sql.review":rollback}
    for name,text in outputs.items():(H/name).write_text(text)
    manifest = {"project_ref":REF,"b4_sha256":EXPECTED_B4,"capture_sha256":hashlib.sha256(CAPTURE.read_bytes()).hexdigest(),"outputs":{n:hashlib.sha256(t.encode()).hexdigest() for n,t in outputs.items()}}
    (H/"manifest.json").write_text(json.dumps(manifest,indent=2,sort_keys=True)+"\n")
    print(json.dumps(manifest["outputs"],indent=2))


if __name__ == "__main__":
    main()
