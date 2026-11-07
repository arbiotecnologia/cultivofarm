#!/usr/bin/env python3
"""Valida artefatos da revisão de entrada de revenda; nunca conecta ao hosted."""
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVIDENCE = HERE / "evidence"


def main():
    checks = []

    def check(name, condition):
        checks.append({"name": name, "status": "PASS" if condition else "FAIL"})
        if not condition:
            raise AssertionError(name)

    facts = json.loads((HERE / "live-entry-guards-20261107T1737Z.json").read_text())
    baseline = json.loads((HERE / "baseline.json").read_text())
    results = json.loads((HERE / "results.json").read_text())
    manifest = json.loads((HERE / "manifest.json").read_text())
    candidate = (HERE / "candidate.sql.review").read_text()
    install = (HERE / "install.sql.review").read_text()
    post = (HERE / "postflight.sql.review").read_text()
    rollback = (HERE / "rollback.sql.review").read_text()
    candidate_hash = hashlib.sha256(candidate.encode()).hexdigest()

    check("candidato e resultados têm o mesmo SHA256", candidate_hash == results["candidate_sha256"] == manifest["files"]["candidate.sql.review"]["sha256"])
    check("status continua inativo e não aprovado", results["status"] == "PASS_LOCAL_INACTIVE_BLOCKED_NOT_APPROVED" and manifest["status"] == "INACTIVE_NOT_APPROVED")
    check("nenhuma operação hosted/publicação foi registrada", not results["hosted"] and not results["publication"] and not manifest["hosted"])
    check("nenhum grant foi adicionado", not manifest["new_grants"] and not re.search(r"(?im)^\s*GRANT\s", candidate))

    reported = facts["functions"]
    captured = {x["signature"]: x for x in baseline["functions"] + baseline["dependency_functions"]}
    for signature, fact in reported.items():
        check(f"MD5 descartável coincide com o relato LIVE: {signature}", captured[signature]["md5"] == fact["reported_md5"])
    check("guard de tenant não é regravado pelo candidato", "FUNCTION platform_private.estoque_produto_catalog_tenant_guard" not in candidate)
    check("PRE pina guard e trigger de tenant", "874c9ca8b5b4e307cf995a0197f98efc" in install and "a000_estoque_produto_catalog_tenant_guard" in install)
    check("POST preserva guard e trigger de tenant", "874c9ca8b5b4e307cf995a0197f98efc" in post and "a000_estoque_produto_catalog_tenant_guard" in post and "POST_RUNTIME_REQUIRED" not in post)
    check("manifesto separa 11 alterações e uma dependência imutável", len(manifest["changed_functions"]) == 11 and manifest["dependency_functions"] == ["platform_private.estoque_produto_catalog_tenant_guard()"])

    check("compra insere entrada agregada com reserva NULL", "validade,quantidade_reservada,status,origem_estoque" in candidate and "p_validade,NULL,'disponivel','compra_produto_acabado_revenda'" in candidate)
    check("retorno de reserva exige contexto para origem compra", "FINISHED_PRODUCT_RESERVATION_CONTEXT_DENIED" in candidate)
    check("guard de imagem também exige reserva NULL na compra", "AND NEW.quantidade_reservada IS NULL" in candidate)
    check("entrada biológica sem envase permanece fechada", "ELSIF NOT EXISTS (SELECT 1 FROM public.envase WHERE lote_id = NEW.lote_id)" in candidate)
    check("lote do fornecedor é obrigatório e entra no fingerprint/snapshots", "p_lote_fornecedor text" in candidate and "'supplier_lot'" in candidate and "'lote_fornecedor'" in candidate)

    check("rollback é deny-only e não destrói histórico", "SET enabled=false" in rollback and not re.search(r"(?im)^\s*(DROP|DELETE|TRUNCATE)\s", rollback))
    for name, expected in (("before", 17), ("after", 49), ("legacy-candidate", 6)):
        data = json.loads((EVIDENCE / f"{name}.json").read_text())
        total = data.get("total", len(data.get("checks", [])))
        passed = data.get("passed", sum(x.get("status") == "PASS" for x in data.get("checks", [])))
        check(f"{name}: {expected}/{expected} e exit 0", total == passed == expected and (EVIDENCE / f"{name}.exitcode").read_text().strip() == "0")
        check(f"{name}: stderr vazio", not (EVIDENCE / f"{name}.stderr.txt").read_text())
    old = json.loads((HERE / "history/pre-live-entry-guards/results.json").read_text())
    check("evidência anterior 37/37 permanece preservada", old["batteries"]["after"] == {"passed": 37, "total": 37, "exit_code": 0, "meaning": "compra_e_downstream_local_com_gate_sintetico_e_rollback"})

    out = {"status": "PASS", "checks": checks, "passed": len(checks), "total": len(checks), "hosted": False, "candidate_sha256": candidate_hash}
    (EVIDENCE / "review.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    print(f"RESULT {len(checks)}/{len(checks)} exit 0")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        (EVIDENCE / "review.json").write_text(json.dumps({"status": "FAIL", "error": str(exc), "hosted": False}, ensure_ascii=False, indent=2) + "\n")
        print("FAIL", exc)
        raise SystemExit(1)
