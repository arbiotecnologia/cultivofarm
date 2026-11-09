#!/usr/bin/env python3
"""Delta auditável da ponte congelada; preserva CHECK fiscal_audit_log."""
from pathlib import Path
import hashlib
import json

H = Path(__file__).resolve().parent
ROOT = H.parents[5]
SOURCE = ROOT / "scripts/b2b-downstream-audit-20261107/b4/fiscal-decision-20261108/service-bridge/02-install.sql.review"
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
    start = source.index("CREATE FUNCTION platform_private.b2b_fiscal_invoice_bridge_v1")
    end = source.index("END $$;", start) + 7
    original = source[start:end].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
    assert original.count(OLD) == 1
    candidate = original.replace(OLD, NEW)
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
    rollback = f"""-- REVIEW ONLY deny-only; restaura ponte anterior sem apagar histórico.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF md5(pg_get_functiondef('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)'::regprocedure)) IS DISTINCT FROM '{new_md5}' THEN RAISE EXCEPTION 'BRIDGE_AUDIT_ROLLBACK_PRE_DRIFT'; END IF;
END $$;
{original};
DO $$ BEGIN
 IF md5(pg_get_functiondef('platform_private.b2b_fiscal_invoice_bridge_v1(uuid)'::regprocedure)) IS DISTINCT FROM '{old_md5}' THEN RAISE EXCEPTION 'BRIDGE_AUDIT_ROLLBACK_POST_DRIFT'; END IF;
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
