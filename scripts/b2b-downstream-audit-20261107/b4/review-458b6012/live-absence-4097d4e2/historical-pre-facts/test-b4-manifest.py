#!/usr/bin/env python3
"""Validação estática determinística da revisão B4; sem banco/rede e sem somar 63 históricos."""
import hashlib
import importlib.util
import json
import pathlib
import sys

H = pathlib.Path(__file__).resolve().parent
OUT = H / "review-458b6012"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


R = load("b4_review_generator", H / "generate-b4-review.py")
CHECKS = []


def check(name, ok, detail=""):
    CHECKS.append({"name": name, "ok": bool(ok), **({} if ok else {"detail": str(detail)[:1600]})})


def main():
    files = R.build()
    for name, text in files.items():
        check(f"gerado determinístico: {name}", (H / name).read_text() == text)
    manifest = json.loads(files["b4-object-manifest.json"])
    body = files["b4-candidate.sql.review"]
    pre = files["01-pre.sql.readonly"]
    install = files["02-install.sql.review"]
    post = files["03-post.sql.readonly"]
    rollback = files["04-rollback-deny.sql.review"]
    objects = manifest["objects"]
    by_object = {x["object"]: x for x in objects}
    check("status permanece inativo/bloqueado/não aprovado", manifest["status"] == "INACTIVE_BLOCKED_MISSING_CAPTURED_BASELINE_NOT_APPROVED")
    check("manifesto cobre 54 alterações sem contagem de testes sobreposta", manifest["object_count"] == len(objects) == 54)
    check("histórico 63 preservado byte a byte", hashlib.sha256((OUT / "historical-63/b4-candidate.sql.review").read_bytes()).hexdigest() == R.EXPECTED_HISTORICAL_SHA256)
    check("histórico não é promovido nem somado", "63/63 históricos preservados separadamente e não somados" in manifest["limitations"])
    check("ref canônico explícito", manifest["canonical_ref"] == "swzpzcwiasxmjutrmvkm" and manifest["hosted"] == "NOT_RUN")

    required = ["public.rpc_register_receivable_payment(uuid,jsonb)", "public.fn_generate_receivable_installments()",
                "public.rpc_receivable_money_projection_v1(uuid,integer,integer)", "public.ux_ar_one_active_per_b2b_order"]
    check("quatro achados do revisor têm entradas próprias", all(x in by_object for x in required), required)
    check("funções compartilhadas são REPLACE, nunca ausência presumida", all(by_object[x]["operation"] == "REPLACE" for x in required[:3]))
    check("índice compartilhado é DROP_AND_RECREATE com baseline capturada", by_object[required[3]]["operation"] == "DROP_AND_RECREATE" and by_object[required[3]]["baseline"]["status"] == "CAPTURED_REQUIRES_LIVE_RECHECK")
    check("projeção sem captura LIVE bloqueia instalação", manifest["missing_baseline"] == [required[2]] and "B4_BASELINE_CAPTURE_REQUIRED:" + required[2] in pre)
    check("demais substituições têm corpo/owner/ACL capturados", all(by_object[x]["baseline"].get("body_md5") and by_object[x]["baseline"].get("owner") and by_object[x]["baseline"].get("acl") for x in required[:2]))
    check("todos os objetos têm baseline e candidato", all(x.get("baseline") and x.get("candidate") for x in objects))
    check("objetos novos exigem ausência no PRE", all(x["baseline"]["status"] == "ABSENCE_REQUIRED" for x in objects if x["operation"].startswith("CREATE") or x["operation"] == "ADD"))

    funcs = R.function_sources(body)
    check("inventário de funções cobre exatamente o corpo candidato", set(funcs) == set(R.SIGS))
    check("duplicidade histórica do guard compartilhado fica visível", manifest["duplicate_definitions_in_historical_body"] == ["platform_private.b2b_shared_receivable_credit_guard"])
    check("toda função candidata tem MD5 no manifesto", all(x["candidate"].get("body_md5") for x in objects if x["kind"] == "function"))
    check("todo MD5 de função nova aparece no POST", all(x["candidate"]["body_md5"] in post for x in objects if x["kind"] == "function" and x["operation"] == "CREATE"))
    check("owners e ACLs de substituições aparecem no PRE", all(by_object[x]["baseline"]["owner"] in pre and R.acl_md5(by_object[x]["baseline"]["acl"], "f") in pre for x in required[:2]))

    table = by_object["public.accounts_receivable.b2b_document_id"]
    baseline = table["baseline"]["table_schema"]
    check("tabela compartilhada tem todas as colunas", len(baseline["columns"]) == 35 and baseline["columns_md5"] in pre and manifest["post_shared_schema_md5"]["columns"] in post)
    check("tabela compartilhada tem todas as constraints", len(baseline["constraints"]) == 16 and baseline["constraints_md5"] in pre and manifest["post_shared_schema_md5"]["constraints"] in post)
    check("tabela compartilhada tem ACL/RLS/owner", baseline["acl"] and baseline["rls"] is True and baseline["force_rls"] is False and baseline["owner"] == "postgres")
    check("todos os índices compartilhados entram no PRE/POST", len(baseline["indexes"]) == 13 and baseline["indexes_md5"] in pre and manifest["post_shared_schema_md5"]["indexes"] in post)
    check("todos os triggers compartilhados entram no PRE/POST", len(baseline["triggers"]) == 9 and baseline["triggers_md5"] in pre and manifest["post_shared_schema_md5"]["triggers"] in post)
    check("trigger automático dependente também é pinado", len(manifest["dependent_trigger_pins"]) == 1 and "B4_PRE_AUTO_TRIGGER" in pre and "B4_POST_AUTO_TRIGGER" in post)
    check("coluna/FK novas exigem ausência e têm pós-condição", table["baseline"]["status"] == "ABSENCE_REQUIRED" and table["candidate"]["references"] == "platform_private.b2b_authorized_documents(id)" and "B4_PRE_UNEXPECTED_COLUMN" in pre)

    check("blocos DO do PRE balanceados", pre.count("DO $guard$") == pre.count("END $guard$"))
    check("blocos DO do POST balanceados", post.count("DO $guard$") == post.count("END $guard$"))
    check("instalação é transacional e contém PRE+POST", install.startswith("-- CANDIDATO B4 INATIVO/BLOQUEADO") and "BEGIN;" in install and "COMMIT;" in install and "B4_BASELINE_CAPTURE_REQUIRED" in install and "B4_POST_COLUMNS" in install)
    check("instalação não contém GRANT", "GRANT " not in install)
    check("instalação não injeta stub operacional", "CREATE OR REPLACE FUNCTION platform_private.b2b_integration_dependencies" not in install)
    check("dependência operacional real permanece sempre deny", "CREATE FUNCTION platform_private.b2b_integration_dependencies() RETURNS void" in body and "B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN" in body)
    check("separação instalação/operação declarada", manifest["operation_separation"] == {"installation_grants_operation": False, "b2b_integration_dependencies": "REAL_ALWAYS_DENY_RETAINED_IN_INSTALL", "test_stub_allowed_in_install": False})
    check("funções novas não herdam EXECUTE de PUBLIC", "nenhuma função nova herda EXECUTE implícito de PUBLIC" in body and "REVOKE ALL ON FUNCTION" in body)
    check("rollback é deny-only e exige POST completo", "DENY-ONLY" in rollback and "B4_POST_COLUMNS" in rollback and "DROP TABLE" not in rollback and "DROP FUNCTION" not in rollback)
    check("hashes gerados cobrem os artefatos", all(hashlib.sha256(text.encode()).hexdigest() in files["SHA256SUMS"] for name, text in files.items() if name != "SHA256SUMS"))

    report = {"kind": "STATIC_B4_REVIEW_458B6012_NO_HOSTED", "status": manifest["status"],
              "historical_63_added": False, "passed": sum(x["ok"] for x in CHECKS), "total": len(CHECKS), "checks": CHECKS}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "evidence-manifest-tests.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    for row in CHECKS:
        print(("PASS " if row["ok"] else "FAIL ") + row["name"] + ("" if row["ok"] else " :: " + row.get("detail", "")))
    print(f"{report['passed']}/{report['total']}")
    return 0 if report["passed"] == report["total"] else 1


if __name__ == "__main__":
    sys.exit(main())
