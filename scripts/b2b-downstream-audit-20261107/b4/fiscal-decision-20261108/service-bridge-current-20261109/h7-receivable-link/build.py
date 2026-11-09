#!/usr/bin/env python3
"""Gera overlay H7 mínimo a partir da captura real; REVIEW_ONLY, nunca hosted."""
from pathlib import Path
import hashlib
import json

H = Path(__file__).resolve().parent
ROOT = H.parents[5]
CAPTURE = ROOT / "scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/evidence/attempt-125/current-pre-physical.json"
EXPECTED_REF = "swzpzcwiasxmjutrmvkm"
OLD_MD5 = "37b2342921df8bf839f4597ad033696d"
OLD = "     OR NEW.receivable_id IS DISTINCT FROM OLD.receivable_id"
NEW = """     OR (NEW.receivable_id IS DISTINCT FROM OLD.receivable_id
       AND NOT (
         OLD.normalized_status = 'AUTHORIZED'
         AND NEW.normalized_status = 'AUTHORIZED'
         AND OLD.receivable_id IS NULL
         AND NEW.receivable_id IS NOT NULL
         AND EXISTS (
           SELECT 1
             FROM platform_private.b2b_fiscal_service_permits p
             JOIN public.accounts_receivable ar ON ar.id = NEW.receivable_id
            WHERE p.transaction_id = txid_current()
              AND p.invoice_id = OLD.id
              AND p.document_id = OLD.id
              AND p.organization_id = OLD.organization_id
              AND p.order_id = OLD.partner_order_id
              AND p.partner_id = OLD.debtor_partner_id
              AND ar.b2b_document_id = OLD.id
              AND ar.organization_id = OLD.organization_id
              AND ar.origin_type = 'B2B_ORDER'
              AND ar.origin_id = OLD.partner_order_id
              AND ar.partner_id = OLD.debtor_partner_id
         )
       ))"""


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def main():
    capture = json.loads(CAPTURE.read_text())
    canonical_baseline_path = CAPTURE.with_name("real-baselines.json")
    canonical_baseline = json.loads(canonical_baseline_path.read_text())
    assert canonical_baseline["canonical_ref"] == EXPECTED_REF and canonical_baseline["hosted"] is False
    rows = [f for f in capture["functions"] if f["signature"] == "public.tg_h7_fiscal_invoice_immutable_v1()"]
    assert len(rows) == 1
    original = rows[0]["body"]
    assert hashlib.md5(original.encode()).hexdigest() == OLD_MD5
    assert original.count(OLD) == 1
    candidate = original.replace(OLD, NEW)
    new_md5 = hashlib.md5(candidate.encode()).hexdigest()
    assert new_md5 != OLD_MD5
    pre = f"""-- REVIEW ONLY; READ ONLY PRE H7, captura LIVE/pós-B4 inalterada.
BEGIN READ ONLY;
DO $$ BEGIN
 IF current_setting('b2b_fiscal_bridge.review_project_ref',true) IS DISTINCT FROM '{EXPECTED_REF}' THEN RAISE EXCEPTION 'B2B_FISCAL_REF_NOT_VERIFIED'; END IF;
 IF md5(pg_get_functiondef('public.tg_h7_fiscal_invoice_immutable_v1()'::regprocedure)) IS DISTINCT FROM '{OLD_MD5}' THEN RAISE EXCEPTION 'H7_LINK_PRE_MD5_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.fiscal_invoices'::regclass AND tgname='trg_h7_fiscal_invoice_immutable' AND tgenabled='O') THEN RAISE EXCEPTION 'H7_LINK_PRE_TRIGGER_DISABLED'; END IF;
 IF to_regclass('platform_private.b2b_fiscal_service_permits') IS NULL THEN RAISE EXCEPTION 'H7_LINK_PERMIT_MISSING'; END IF;
END $$;
ROLLBACK;
"""
    post = f"""-- REVIEW ONLY; READ ONLY POST H7: exceção somente para vínculo permitido.
BEGIN READ ONLY;
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.tg_h7_fiscal_invoice_immutable_v1()'::regprocedure)) IS DISTINCT FROM '{new_md5}' THEN RAISE EXCEPTION 'H7_LINK_POST_MD5_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.fiscal_invoices'::regclass AND tgname='trg_h7_fiscal_invoice_immutable' AND tgenabled='O') THEN RAISE EXCEPTION 'H7_LINK_POST_TRIGGER_DISABLED'; END IF;
 IF pg_get_functiondef('public.tg_h7_fiscal_invoice_immutable_v1()'::regprocedure) NOT LIKE '%p.transaction_id = txid_current()%' THEN RAISE EXCEPTION 'H7_LINK_TXID_GUARD_MISSING'; END IF;
 IF pg_get_functiondef('public.tg_h7_fiscal_invoice_immutable_v1()'::regprocedure) NOT LIKE '%OLD.receivable_id IS NULL%' THEN RAISE EXCEPTION 'H7_LINK_OVERWRITE_GUARD_MISSING'; END IF;
END $$;
ROLLBACK;
"""
    install = f"""-- REVIEW ONLY INACTIVE; executar somente após 01-pre e ponte estrita.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF current_setting('b2b_fiscal_bridge.review_project_ref',true) IS DISTINCT FROM '{EXPECTED_REF}' THEN RAISE EXCEPTION 'B2B_FISCAL_REF_NOT_VERIFIED'; END IF;
 IF md5(pg_get_functiondef('public.tg_h7_fiscal_invoice_immutable_v1()'::regprocedure)) IS DISTINCT FROM '{OLD_MD5}' THEN RAISE EXCEPTION 'H7_LINK_INSTALL_PRE_DRIFT'; END IF;
END $$;
{candidate};
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.tg_h7_fiscal_invoice_immutable_v1()'::regprocedure)) IS DISTINCT FROM '{new_md5}' THEN RAISE EXCEPTION 'H7_LINK_INSTALL_POST_DRIFT'; END IF;
END $$;
COMMIT;
"""
    rollback = f"""-- REVIEW ONLY; deny-only: restaura H7 real, preserva dados/títulos/histórico.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.tg_h7_fiscal_invoice_immutable_v1()'::regprocedure)) IS DISTINCT FROM '{new_md5}' THEN RAISE EXCEPTION 'H7_LINK_ROLLBACK_PRE_DRIFT'; END IF;
END $$;
{original};
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.tg_h7_fiscal_invoice_immutable_v1()'::regprocedure)) IS DISTINCT FROM '{OLD_MD5}' THEN RAISE EXCEPTION 'H7_LINK_ROLLBACK_POST_DRIFT'; END IF;
END $$;
COMMIT;
"""
    files = {"01-pre.sql.readonly": pre, "02-install.sql.review": install, "03-post.sql.readonly": post, "04-rollback-deny.sql.review": rollback}
    for name, text in files.items():
        (H / name).write_text(text)
    manifest = {
        "project_ref": EXPECTED_REF,
        "status": "REVIEW_ONLY_INACTIVE_NOT_APPROVED",
        "phase": "AFTER_B4_AND_STRICT_SERVICE_BRIDGE_BEFORE_FISCAL_CALLBACK",
        "capture": str(CAPTURE.relative_to(ROOT)),
        "capture_sha256": sha(CAPTURE.read_text()),
        "canonical_ref_evidence": str(canonical_baseline_path.relative_to(ROOT)),
        "canonical_ref_evidence_sha256": sha(canonical_baseline_path.read_text()),
        "live_h7_md5": OLD_MD5,
        "after_b4_h7_md5": OLD_MD5,
        "after_overlay_h7_md5": new_md5,
        "environment_contract": {"invoice_environment": "HOMOLOGATION", "transmission_ambiente_retorno": "2", "production_nf_ready": False},
        "delta": "AUTHORIZED receivable_id NULL->valid B4 title only; exact txid/invoice/document/org/order/partner permit; no economic/fiscal field relaxation",
        "files": {name: sha(text) for name, text in files.items()},
        "hosted": False,
    }
    (H / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
