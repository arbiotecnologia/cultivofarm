#!/usr/bin/env python3
"""Delta auditável da ponte congelada; preserva CHECK fiscal_audit_log."""
from pathlib import Path
import hashlib
import json

H = Path(__file__).resolve().parent
ROOT = H.parents[5]
SOURCE = ROOT / "scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/evidence/attempt-136/bridge-before-audit-body.sql"
BASELINE = ROOT / "scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/evidence/attempt-125/real-baselines.json"
REF = "swzpzcwiasxmjutrmvkm"
OLD = """ VALUES('fiscal_invoices',inv.id,'B2B_RECEIVABLE_RECONCILED',jsonb_build_object('receivable_id',inv.receivable_id),
   jsonb_build_object('receivable_id',result->>'receivable_id','document_id',inv.id,'replayed',result->>'replayed','source_digest',digest),NULL);"""
NEW = """ VALUES('fiscal_invoices',inv.id,'UPDATE',jsonb_build_object('receivable_id',inv.receivable_id),
   jsonb_build_object('operation','B2B_RECEIVABLE_RECONCILED','receivable_id',result->>'receivable_id','document_id',inv.id,'replayed',result->>'replayed','source_digest',digest),NULL);"""


def md5(text):
    return hashlib.md5(text.encode()).hexdigest()


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def main():
    baseline = json.loads(BASELINE.read_text())
    assert baseline["canonical_ref"] == REF and baseline["hosted"] is False
    source = SOURCE.read_text()
    original = source
    assert original.startswith("CREATE OR REPLACE FUNCTION platform_private.b2b_fiscal_invoice_bridge_v1")
    assert md5(original) == "8905212e276f6bb43be32423ee48abc8"
    assert original.count(OLD) == 1
    candidate = original.replace(OLD, NEW)
    # The canonical bridge already locks the invoice/transmission. Serialize the
    # order and its forecast before B4 allocation; cancellation never creates a
    # new title, while an already-confirmed NF may replay without losing history.
    order_lock = " SELECT * INTO po FROM public.partner_orders WHERE id=inv.partner_order_id;"
    assert candidate.count(order_lock) == 1
    candidate = candidate.replace(order_lock, order_lock[:-1] + " FOR UPDATE;")
    allocation_guard = """ PERFORM 1 FROM platform_private.b2b_financial_forecasts WHERE order_id=po.id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecasts f WHERE f.order_id=po.id
  AND f.state IN ('cancelado_antes_nf','cancelado_residual')
  AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecast_events e
    WHERE e.forecast_id=f.id AND e.event_type='FISCAL_CONFIRMED' AND e.event_reference=inv.id::text)) THEN
  RAISE EXCEPTION 'B2B_FORECAST_RESIDUAL_CANCELED' USING ERRCODE='PT409';END IF;
"""
    permit_anchor = " INSERT INTO platform_private.b2b_fiscal_service_permits(transaction_id,invoice_id,document_id,organization_id,order_id,partner_id)"
    assert candidate.count(permit_anchor) == 1
    candidate = candidate.replace(permit_anchor, allocation_guard + permit_anchor)
    allocation_anchor = " result:=platform_private.b2b_allocate_document(inv.id);\n UPDATE public.fiscal_invoices"
    allocation_replacement = " result:=platform_private.b2b_allocate_document(inv.id);\n PERFORM platform_private.b2b_financial_forecast_reconcile_fiscal_v1(inv.id,(result->>'receivable_id')::uuid);\n UPDATE public.fiscal_invoices"
    assert candidate.count(allocation_anchor) == 1
    candidate = candidate.replace(allocation_anchor, allocation_replacement)
    old_md5, new_md5 = md5(original), md5(candidate)
    pre = f"""-- REVIEW ONLY READ ONLY; ponte pós-B4 antes do delta de auditoria.
BEGIN READ ONLY;
DO $$ BEGIN
 IF current_setting('b2b_fiscal_bridge.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'B2B_FISCAL_REF_NOT_VERIFIED'; END IF;
 IF md5(pg_get_functiondef('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)'::regprocedure)) IS DISTINCT FROM '{old_md5}' THEN RAISE EXCEPTION 'BRIDGE_AUDIT_PRE_MD5_DRIFT'; END IF;
END $$;
ROLLBACK;
"""
    post = f"""-- REVIEW ONLY READ ONLY; CHECK fiscal_audit_log inalterado.
BEGIN READ ONLY;
DO $$ BEGIN
 IF md5(pg_get_functiondef('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)'::regprocedure)) IS DISTINCT FROM '{new_md5}' THEN RAISE EXCEPTION 'BRIDGE_AUDIT_POST_MD5_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.fiscal_audit_log'::regclass AND conname='fiscal_audit_log_action_check' AND convalidated) THEN RAISE EXCEPTION 'FISCAL_AUDIT_ACTION_CHECK_MISSING'; END IF;
END $$;
ROLLBACK;
"""
    install = f"""-- REVIEW ONLY INACTIVE; usa ação UPDATE permitida, operação no payload.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF current_setting('b2b_fiscal_bridge.review_project_ref',true) IS DISTINCT FROM '{REF}' THEN RAISE EXCEPTION 'B2B_FISCAL_REF_NOT_VERIFIED'; END IF;
 IF md5(pg_get_functiondef('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)'::regprocedure)) IS DISTINCT FROM '{old_md5}' THEN RAISE EXCEPTION 'BRIDGE_AUDIT_INSTALL_PRE_DRIFT'; END IF;
END $$;
{candidate};
DO $$ BEGIN
 IF md5(pg_get_functiondef('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)'::regprocedure)) IS DISTINCT FROM '{new_md5}' THEN RAISE EXCEPTION 'BRIDGE_AUDIT_INSTALL_POST_DRIFT'; END IF;
END $$;
COMMIT;
"""
    denied = """CREATE OR REPLACE FUNCTION platform_private.b2b_fiscal_invoice_bridge_v1(p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
BEGIN RAISE EXCEPTION 'B2B_FISCAL_BRIDGE_ROLLED_BACK' USING ERRCODE='42501';END $function$"""
    denied_md5 = md5(denied)
    rollback = f"""-- REVIEW ONLY deny-only; não restaura a ponte sem proteção de cancelamento.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF md5(pg_get_functiondef('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)'::regprocedure)) IS DISTINCT FROM '{new_md5}' THEN RAISE EXCEPTION 'BRIDGE_AUDIT_ROLLBACK_PRE_DRIFT'; END IF;
END $$;
{denied};
REVOKE ALL ON FUNCTION platform_private.b2b_fiscal_invoice_bridge_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
 IF md5(pg_get_functiondef('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)'::regprocedure)) IS DISTINCT FROM '{denied_md5}' THEN RAISE EXCEPTION 'BRIDGE_AUDIT_ROLLBACK_POST_DRIFT'; END IF;
END $$;
COMMIT;
"""
    files = {"01-pre.sql.readonly": pre, "02-install.sql.review": install, "03-post.sql.readonly": post, "04-rollback-deny.sql.review": rollback}
    for name, text in files.items():
        (H / name).write_text(text)
    manifest = {
        "project_ref": REF,
        "status": "REVIEW_ONLY_INACTIVE_NOT_APPROVED",
        "phase": "AFTER_B4_AND_SERVICE_BRIDGE_BEFORE_H7_LINK",
        "source": str(SOURCE.relative_to(ROOT)),
        "source_sha256": sha(source),
        "canonical_ref_evidence": str(BASELINE.relative_to(ROOT)),
        "before_bridge_md5": old_md5,
        "after_bridge_md5": new_md5,
        "constraint_changed": False,
        "action": "UPDATE",
        "operation_payload": "B2B_RECEIVABLE_RECONCILED",
        "files": {name: sha(text) for name, text in files.items()},
        "hosted": False,
    }
    (H / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
