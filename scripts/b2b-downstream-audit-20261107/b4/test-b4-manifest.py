#!/usr/bin/env python3
"""Validação estática determinística B4 4097d4e2; sem banco/rede e sem somar históricos."""
import hashlib
import importlib.util
import json
import os
import pathlib
import sys

H = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path(os.environ.get("B4_EVIDENCE_OUT", str(H / "review-458b6012/manual-null-1813")))
HISTORICAL = H / "review-458b6012/historical-63"


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
    projection = "public.rpc_receivable_money_projection_v1(uuid,integer,integer)"
    payment = "public.rpc_register_receivable_payment(uuid,jsonb)"
    installments = "public.fn_generate_receivable_installments()"
    index = "public.ux_ar_one_active_per_b2b_order"

    check("status permanece inativo/bloqueado/não aprovado", manifest["status"] == "INACTIVE_BLOCKED_PENDING_LIVE_DATA_IMPACT_AND_HOMOLOGATION_NOT_APPROVED")
    check("manifesto cobre 56 alterações sem contagem de testes sobreposta", manifest["object_count"] == len(objects) == 56)
    check("histórico 63 preservado byte a byte", hashlib.sha256((HISTORICAL / "b4-candidate.sql.review").read_bytes()).hexdigest() == R.EXPECTED_HISTORICAL_SHA256)
    check("histórico não é promovido nem somado", "63/63 históricos preservados separadamente e não somados" in manifest["limitations"])
    check("ref canônico explícito", manifest["canonical_ref"] == "swzpzcwiasxmjutrmvkm" and manifest["hosted"] == "NOT_RUN")

    check("quatro achados do revisor têm entradas próprias", all(x in by_object for x in [payment, installments, projection, index]))
    check("writers compartilhados são REPLACE com baseline", all(by_object[x]["operation"] == "REPLACE" and by_object[x]["baseline"]["status"] == "CAPTURED_REQUIRES_LIVE_RECHECK" for x in [payment, installments]))
    check("projeção é CREATE com ausência LIVE relatada", by_object[projection]["operation"] == "CREATE" and by_object[projection]["baseline"]["status"] == "ABSENCE_CONFIRMED_BY_AUDITOR_READONLY")
    check("não há baseline de projeção inventada", manifest["missing_baseline"] == [] and by_object[projection]["baseline"]["body_md5"] is None)
    check("PRE exige zero overloads pelo catálogo pg_proc", "p.proname='rpc_receivable_money_projection_v1'" in pre and "<>0" in pre and "B4_PRE_PROJECTION_ANY_OVERLOAD_EXISTS" in pre)
    check("POST exige exatamente um overload da projeção", "B4_POST_PROJECTION_OVERLOAD_COUNT_DRIFT" in post and "<>1" in post)
    check("índice compartilhado é DROP_AND_RECREATE com definição LIVE relatada", by_object[index]["operation"] == "DROP_AND_RECREATE" and by_object[index]["baseline"]["definition"] == R.LIVE_FACTS["index"]["definition"])
    check("todos os objetos têm baseline e candidato", all(x.get("baseline") and x.get("candidate") for x in objects))
    check("objetos novos exigem ausência no PRE", all(x["baseline"]["status"] in {"ABSENCE_REQUIRED", "ABSENCE_CONFIRMED_BY_AUDITOR_READONLY"} for x in objects if x["operation"].startswith("CREATE") or x["operation"] == "ADD"))

    funcs = R.function_sources(body)
    check("inventário de funções cobre exatamente o corpo candidato", set(funcs) == set(R.SIGS))
    check("duplicidade histórica do guard compartilhado fica visível", manifest["duplicate_definitions_in_historical_body"] == ["platform_private.b2b_shared_receivable_credit_guard"])
    check("toda função candidata tem MD5 no manifesto", all(x["candidate"].get("body_md5") for x in objects if x["kind"] == "function"))
    check("todo MD5 de função nova aparece no POST", all(x["candidate"]["body_md5"] in post for x in objects if x["kind"] == "function" and x["operation"] == "CREATE"))
    check("MD5/owner/ACL dos writers relatados aparecem no PRE", all(R.LIVE_FACTS["functions"][x]["body_md5"] in pre and R.LIVE_FACTS["functions"][x]["owner"] in pre and R.acl_md5(R.LIVE_FACTS["functions"][x]["acl"], "f") in pre for x in [payment, installments]))

    table = by_object["public.accounts_receivable.b2b_document_id"]
    baseline = table["baseline"]["table_schema"]
    check("tabela compartilhada tem todas as colunas", len(baseline["columns"]) == 35 and baseline["columns_md5"] in pre and manifest["post_shared_schema_md5"]["columns"] in post)
    check("tabela compartilhada tem todas as constraints", len(baseline["constraints"]) == 16 and baseline["constraints_md5"] in pre and manifest["post_shared_schema_md5"]["constraints"] in post)
    check("tabela compartilhada tem ACL/RLS/owner", baseline["acl"] and baseline["rls"] is True and baseline["force_rls"] is False and baseline["owner"] == "postgres")
    check("todos os índices compartilhados entram no PRE/POST", len(baseline["indexes"]) == 13 and baseline["indexes_md5"] in pre and manifest["post_shared_schema_md5"]["indexes"] in post)
    check("dez triggers compartilhados entram no PRE/POST", len(baseline["triggers"]) == 10 and baseline["triggers_md5"] == "7c65f3e7fed5e102fd6c8b96bc9fe8e0" and baseline["triggers_md5"] in pre and manifest["post_shared_schema_md5"]["triggers"] in post)
    check("trigger automático dependente também é pinado", len(manifest["dependent_trigger_pins"]) == 1 and "B4_PRE_AUTO_TRIGGER" in pre and "B4_POST_AUTO_TRIGGER" in post)
    check("coluna/FK novas exigem ausência e têm pós-condição", table["baseline"]["status"] == "ABSENCE_REQUIRED" and table["candidate"]["references"] == "platform_private.b2b_authorized_documents(id)" and "B4_PRE_UNEXPECTED_COLUMN" in pre)

    check("baixa não B2B sem parceiro usa matemática legada", "v_interest:=v_inst.interest_amount; v_financed:=0;" in body and "v_inst.original_amount + (v_interest-v_financed)" in body)
    check("prova obrigatória cobre B2B ou devedor resolvido inclusive partner_id NULL", "v_debtor:=platform_private.b2b_receivable_partner_scope(v_origin.id);" in body and "IF v_origin.origin_type='B2B_ORDER' OR v_debtor IS NOT NULL THEN" in body)
    check("origem desconhecida de parceiro continua explicitamente bloqueada", "MONEY_ORIGIN_UNPROVEN" in body and "IF v_proven IS NULL THEN RAISE EXCEPTION 'MONEY_ORIGIN_UNPROVEN'" in body)
    scope_object = "platform_private.b2b_receivable_partner_scope(uuid)"
    check("resolvedor de escopo é função nova owner-only", scope_object in by_object and by_object[scope_object]["operation"] == "CREATE" and by_object[scope_object]["candidate"]["acl"] == "OWNER_ONLY")
    check("crédito inclui cliente ligado sem UNION nem dupla contagem", "a.partner_id=p_partner OR EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=p_partner AND pa.client_id=a.customer_id" in body and "debtor:=platform_private.b2b_receivable_partner_scope(i.receivable_id);" in body)
    check("ambiguidade, conflito e owner têm negações explícitas", all(token in body for token in ["CREDIT_PARTNER_LINK_AMBIGUOUS", "CREDIT_PARTNER_CONFLICT", "CREDIT_PARTNER_OWNER_MISMATCH"]))
    check("não há backfill dos cinco títulos nem cancelamento LIVE", "UPDATE public.accounts_receivable SET partner_id" not in body and manifest["reported_manual_null_live_readonly"]["manual_titles"]["cancel_or_backfill_authorized"] is False)
    check("forma LIVE relatada 4 OPEN/1 OVERDUE permanece bloqueio de aprovação", manifest["reported_manual_null_live_readonly"]["manual_titles"]["status_counts"] == {"OPEN": 4, "OVERDUE": 1} and manifest["status"].startswith("INACTIVE_BLOCKED"))
    check("crédito usa prova monetária interna no tenant vendedor", "row:=platform_private.b2b_proven_money_row_internal(i.id,org);" in body)
    check("limite zero é configuração válida; NULL/negativo/NaN continuam fechados", "s.credit_limit IS NOT NULL AND s.credit_limit >= 0 AND s.credit_limit::text NOT IN ('NaN','Infinity','-Infinity')" in body)
    check("limite zero positivo usa limite excedido, nunca NO_LIMIT_DEFINED", "WHEN v_limit <= 0 THEN 'NO_LIMIT_DEFINED'" not in body and "WHEN v_proj > v_limit THEN 'LIMIT_EXCEEDED_BLOCK'" in body)
    check("residual legado não usa projeção do ator comprador", "PERFORM platform_private.b2b_proven_money_row_internal(i.id,org)" in body and "PERFORM public.rpc_receivable_money_projection_v1(l.receivable_id" not in body)
    check("projeção pública conserva guard de ator, papel e tenant", "RETURN platform_private.b2b_proven_money_row_internal(p_id,org);" in body and "public.is_financial_staff(auth.uid()) IS NOT TRUE" in body)
    check("resolvedor interno é função nova owner-only", by_object["platform_private.b2b_proven_money_row_internal(uuid,uuid)"]["operation"] == "CREATE" and by_object["platform_private.b2b_proven_money_row_internal(uuid,uuid)"]["candidate"]["acl"] == "OWNER_ONLY")
    check("blocos DO do PRE balanceados", pre.count("DO $guard$") == pre.count("END $guard$"))
    check("blocos DO do POST balanceados", post.count("DO $guard$") == post.count("END $guard$"))
    check("instalação é transacional e contém PRE+POST", install.startswith("-- CANDIDATO B4 INATIVO/BLOQUEADO") and "BEGIN;" in install and "COMMIT;" in install and "B4_PRE_PROJECTION_ANY_OVERLOAD_EXISTS" in install and "B4_POST_COLUMNS" in install)
    check("instalação não contém GRANT", "GRANT " not in install)
    check("instalação não injeta stub operacional", "CREATE OR REPLACE FUNCTION platform_private.b2b_integration_dependencies" not in install)
    check("dependência operacional real permanece sempre deny", "CREATE FUNCTION platform_private.b2b_integration_dependencies() RETURNS void" in body and "B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN" in body)
    check("separação instalação/operação declarada", manifest["operation_separation"] == {"installation_grants_operation": False, "b2b_integration_dependencies": "REAL_ALWAYS_DENY_RETAINED_IN_INSTALL", "test_stub_allowed_in_install": False})
    check("funções novas não herdam EXECUTE de PUBLIC", "nenhuma função nova herda EXECUTE implícito de PUBLIC" in body and "REVOKE ALL ON FUNCTION" in body)
    check("rollback é deny-only e exige POST completo", "DENY-ONLY" in rollback and "B4_POST_COLUMNS" in rollback and "DROP TABLE" not in rollback and "DROP FUNCTION" not in rollback)
    check("impacto em dados LIVE continua bloqueio explícito", "impacto em pedidos/títulos LIVE permanece NOT_RUN e bloqueia release" in manifest["limitations"])
    check("hashes gerados cobrem os artefatos", all(hashlib.sha256(text.encode()).hexdigest() in files["SHA256SUMS"] for name, text in files.items() if name != "SHA256SUMS"))

    report = {"kind": "STATIC_B4_REVIEW_MANUAL_NULL_1813_NO_HOSTED", "status": manifest["status"],
              "historical_63_added": False, "passed": sum(x["ok"] for x in CHECKS), "total": len(CHECKS), "checks": CHECKS}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "evidence-manifest-tests.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    for row in CHECKS:
        print(("PASS " if row["ok"] else "FAIL ") + row["name"] + ("" if row["ok"] else " :: " + row.get("detail", "")))
    print(f"{report['passed']}/{report['total']}")
    return 0 if report["passed"] == report["total"] else 1


if __name__ == "__main__":
    sys.exit(main())
