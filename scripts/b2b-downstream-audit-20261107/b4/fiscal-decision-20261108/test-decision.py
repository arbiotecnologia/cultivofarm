#!/usr/bin/env python3
"""Confere matriz, inventário e evidência B4; não instala nem acessa a rede."""
import importlib.util
import json
from pathlib import Path

H = Path(__file__).resolve().parent
B4 = H.parent
COMPONENT = H / "evidence/component/evidence-b4-shared-impact.json"


def load_inventory_builder():
    spec = importlib.util.spec_from_file_location("fiscal_inventory", H / "build_inventory.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    checks = []

    def check(name, ok, detail=""):
        checks.append({"name": name, "ok": bool(ok), **({} if ok else {"detail": str(detail)[:1200]})})

    builder = load_inventory_builder()
    inventory = builder.build()
    check("inventário determinístico", json.loads((H / "inventory.json").read_text()) == inventory)
    matrix = json.loads((H / "matrix.json").read_text())
    component = json.loads(COMPONENT.read_text())
    result = component
    by_name = {row["name"]: row for row in result["checks"]}
    check("componente B4 sem falhas", result["passed"] == result["total"] and all(row["ok"] for row in result["checks"]), f"{result['passed']}/{result['total']}")

    for requirement in matrix["requirements"]:
        for evidence_name in requirement.get("covered_by", []) + requirement.get("component_evidence", []):
            check(f"{requirement['id']}: {evidence_name}", by_name.get(evidence_name, {}).get("ok") is True)
        if requirement["local_status"] == "BLOCKED":
            check(f"{requirement['id']} permanece bloqueado por lacuna explícita", requirement.get("gap") in {gap["id"] for gap in inventory["gaps"]})

    functions = {row["signature"]: row for row in inventory["reused_functions"]}
    capture = json.loads(builder.CURRENT.read_text())
    bodies = {f["signature"]: f.get("body", "") for f in capture.get("functions", [])}
    authorization = "public.rpc_fiscal_invoice_apply_authorization_v1(_invoice_id uuid, _access_key text, _protocol text, _dh_recbto timestamp with time zone, _c_stat text, _x_motivo text, _transmission_id uuid)"
    body = bodies[authorization]
    check("lacuna da ponte fiscal reproduzida na captura", "b2b_allocate_document" not in body and "accounts_receivable" not in body)
    manual = bodies["public.rpc_create_financial_title(p_kind text, p_payload jsonb)"]
    check("exceção manual atual não contém contrato completo", "exception_reason" not in manual and "source_operation_id" not in manual and "AR_MANUAL_CREATED" in manual)
    candidate = (B4 / "b4-candidate.sql.review").read_text()
    check("candidato conserva atestação fiscal obrigatória", "B2B_AUTHORIZED_FISCAL_DOCUMENT_REQUIRED" in candidate and "B2B_FISCAL_ONE_SHOT_PERMIT_REQUIRED" in candidate)
    check("dependência operacional continua fechada", "B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN" in candidate and "test_stub_allowed_in_install" not in candidate)
    check("inventário declara seis lacunas e nenhum efeito hospedado", len(inventory["gaps"]) == 6 and inventory["hosted"] == "NOT_RUN" and inventory["canonical_ref"] == "swzpzcwiasxmjutrmvkm")
    check("matriz não converte lacunas em aprovação", matrix["status"] == "INACTIVE_BLOCKED_COMPONENT_EVIDENCE_ONLY" and any(r["local_status"] == "BLOCKED" for r in matrix["requirements"]))

    output = {
        "status": "INACTIVE_BLOCKED_COMPONENT_EVIDENCE_ONLY_NOT_APPROVED",
        "canonical_ref": "swzpzcwiasxmjutrmvkm",
        "hosted": "NOT_RUN",
        "component": {"passed": result["passed"], "total": result["total"]},
        "decision_checks": {"passed": sum(c["ok"] for c in checks), "total": len(checks), "checks": checks},
        "requirements": [{k: v for k, v in row.items() if k in {"id", "local_status", "gap"}} for row in matrix["requirements"]],
        "open_gaps": inventory["gaps"],
        "limitations": "PostgreSQL descartável e atestações sintéticas; não prova ponte fiscal real, JWT/RLS/Storage/browser nem homologação.",
    }
    out = H / "evidence/decision-results.json"
    out.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    for row in checks:
        print(("PASS " if row["ok"] else "FAIL ") + row["name"] + ("" if row["ok"] else " :: " + row.get("detail", "")))
    print(f"{output['decision_checks']['passed']}/{output['decision_checks']['total']} | componente {result['passed']}/{result['total']} | STATUS=BLOCKED")
    raise SystemExit(0 if all(row["ok"] for row in checks) else 1)


if __name__ == "__main__":
    main()
