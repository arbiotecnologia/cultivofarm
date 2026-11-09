#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[4]
checks = []


def check(name, condition, detail=""):
    checks.append(dict(test=name, status="PASS" if condition else "FAIL", detail=detail))
    print(("PASS " if condition else "FAIL ") + name + ((" :: " + str(detail)) if detail and not condition else ""))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    capture = json.loads((H / "capture-current.json").read_text())
    functions = {(x["schema"], x["proname"], x["args"]): x for x in capture["functions"]}
    pins = {x["sig"]: x for x in capture["pins"]}
    check("manifesto contém exatamente 101 pins", len(capture["pins"]) == 101)
    check("respond executado é Seller91 97bc", functions[("public", "respond_b2b_order_quote_secure", "uuid,jsonb,date,integer,text")]["definition_md5"] == "97bcdb9884b54adb3bd4aae4915e32d0")
    check("respond 97bc está nos pins de metadata", pins["public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)"]["definition_md5"] == "97bcdb9884b54adb3bd4aae4915e32d0")
    expected = {
        ("public", "generate_b2b_receivable_secure", "uuid"): "c49cc7ccedbcb28cba9b816b7e47c521",
        ("public", "generate_b2b_receivable_secure_impl", "uuid"): "1bdac7fae6d702fb42d3a30539e9c9c3",
        ("public", "tg_auto_b2b_receivable", ""): "0f679538fe394924b140e54938a3bb9e",
        ("public", "tg_b2b_block_receivable_before_approval", ""): "9d559f2f04613704467cb488de0d842f",
        ("platform_private", "b2b_resale_delivery_order_valid_v1", "entregas"): "bd76345c3bceaa5e6203013920427df4",
        ("platform_private", "b2b_resale_delivery_status_transition_valid_v1", "partner_orders,partner_orders"): "72d5d18157ffd837b89245bad19fc17e",
    }
    for key, md5 in expected.items():
        check(f"hash atual {key[1]}", functions[key]["definition_md5"] == md5, functions[key]["definition_md5"])
    check("captura declara origem auditor, não leitura hosted", capture["source"]["read_performed_by_agent"] is False and capture["source"]["hosted_read_performed"] is False)
    strict = (H / "dependency.candidate.sql").read_text()
    for token in ("b2b_fiscal_service_permits", "B2B_FISCAL_CONFIRMATION_UNPROVEN", "B2B_FISCAL_DOCUMENT_NOT_PROVEN", "B2B_FISCAL_SNAPSHOT_NOT_PROVEN", "B2B_FISCAL_ACCOUNTING_OR_TENANT_UNPROVEN", "B2B_FISCAL_SNAPSHOT_DIVERGENCE", "environment='HOMOLOGATION'", "protocol_c_stat='100'", "signed_xml_available"):
        check(f"dependência estrita contém {token}", token in strict)
    check("dependência não contém SELECT $$", "SELECT$$" not in strict.replace(" ", ""))
    check("rollback restaura negação, não liberação", "B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN" in (H / "04-rollback-deny.sql.review").read_text())
    pre = (H / "01-pre.sql.readonly").read_text()
    check("PRE exige writer legado negado", "c49cc7ccedbcb28cba9b816b7e47c521" in pre and "3a4ca7fcd75f9fd3a183b6917fe05cd2" in pre and "B2B_AUTHORIZED_FISCAL_DOCUMENT_REQUIRED" in (H / "dependency.before-deny.sql").read_text())
    frozen_dir = H.parent / "service-bridge"
    frozen_manifest = json.loads((frozen_dir / "manifest.json").read_text())
    drift = []
    for name, expected_sha in frozen_manifest["outputs"].items():
        path = frozen_dir / name
        if not path.is_file() or sha(path) != expected_sha:
            drift.append(name)
    b4_file = H.parents[1] / "02-install.sql.review"
    if not b4_file.is_file() or sha(b4_file) != frozen_manifest["b4_sha256"]:
        drift.append("b4/02-install.sql.review")
    check("B4 e ponte anteriores permanecem byte a byte", not drift, drift)
    evidence = H / "evidence/strict-09/evidence-b4-shared-impact.json"
    result = json.loads(evidence.read_text())
    check("bateria estrita 09 tem 124/124", result["total_checks"] == 124 and result["passed"] == 124 and result["failed"] == 0)
    check("bateria estrita 09 não contém stub permissivo", result["always_allow_stub"] is False and result["strict_fiscal_permits_required"] is True)
    check("bateria estrita 09 rollback preserva histórico", result["rollback_status"] == "DENY_ONLY_PRESERVES_HISTORY")
    check("bateria estrita 09 continua review-only", "NOT_APPROVED" in result["status"])
    check("exit code estrito 09 é zero", (evidence.parent / "run.exitcode").read_text().strip() == "0")
    check("stderr estrito 09 vazio", (evidence.parent / "run.stderr.txt").read_text() == "")
    composition = ROOT / "scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/compose_current.py"
    text = composition.read_text()
    check("composição instala Seller91 antes do pedido", text.index("strict_dir/'respond.seller91.sql'") < text.index("create_partner_order_secure", text.index("STRICT_FISCAL=True")))
    check("composição exige ponte estrita e callback positivo", "strict_dir/'02-install.sql.review'" in text and "STRICT_FISCAL_CONFIRMED_TO_ONE_RECEIVABLE_REVIEW_ONLY" in text)
    check("composição não usa dependência always-allow", "SELECT$$" not in text.replace(" ", ""))
    out = H / "evidence/manifest-validation.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    summary = dict(total_checks=len(checks), passed=sum(x["status"] == "PASS" for x in checks), failed=sum(x["status"] == "FAIL" for x in checks), checks=checks)
    out.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({k: summary[k] for k in ("total_checks", "passed", "failed")}))
    raise SystemExit(1 if summary["failed"] else 0)


if __name__ == "__main__":
    main()
