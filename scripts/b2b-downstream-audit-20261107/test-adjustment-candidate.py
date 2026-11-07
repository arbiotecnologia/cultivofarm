#!/usr/bin/env python3
"""Valida o candidato de ajuste em PostgreSQL descartável, sem rede/hosted.

Todos os 38 gatilhos reais ficam ativos nas chamadas. A única preparação com gatilhos
pausados é a fixture legada mínima; todos são religados/conferidos antes da RPC.
"""
import hashlib
import importlib.util
import json
import pathlib
import re
import subprocess
import sys
import tempfile
import threading
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
B3_DIR = ROOT / "scripts/b2b-payment-condition-v1-rebase-20261106"

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

B = load("b3h_candidate", B3_DIR / "test-local-pg.py")
G = load("adjustment_generator", HERE / "generate-adjustment-fix.py")
SP = B.SP
SP.PORT = "55472"
EVIDENCE = HERE / "evidence/adjustment-candidate.json"


def main():
    checks = []

    def check(name, ok, detail=None):
        row = {"name": name, "ok": bool(ok)}
        if detail is not None:
            row["detail"] = str(detail)[:1400]
        checks.append(row)

    tmp = B.boot()
    work = pathlib.Path(tempfile.mkdtemp(prefix="b2b-adjustment-candidate-", dir="/tmp"))
    work.chmod(0o777)
    try:
        psql = SP.psql
        generated = G.build()
        check("gerador determinístico: 01–04/candidato/captura byte a byte", all((HERE / name).read_text() == text for name, text in generated.items() if name != "adjustment-pins.json"))

        # Os artefatos de revisão mantêm o pin LIVE da captura. Só as cópias em /tmp trocam o pin
        # do leitor de escopo pela costura sintética do harness, como nos pacotes B2/B3.
        local_scope_md5 = psql("SELECT md5(pg_get_functiondef('public.b2b_phase1_order_visible(uuid)'::regprocedure))").stdout.strip()
        for name in ("01-pre.sql.readonly", "02-install.sql.review", "03-post.sql.readonly", "04-rollback-deny.sql.review"):
            text = generated[name].replace(G.VISIBLE_MD5, local_scope_md5)
            path = work / name
            path.write_text(text)
            path.chmod(0o644)
        check("artefatos revisáveis conservam o pin LIVE; localização existe só em /tmp", all(G.VISIBLE_MD5 in (HERE / name).read_text() and local_scope_md5 not in (HERE / name).read_text() for name in ("01-pre.sql.readonly", "02-install.sql.review", "03-post.sql.readonly", "04-rollback-deny.sql.review")))

        def runfile(path):
            return subprocess.run(SP.su() + ["psql", "-X", "-q", "-t", "-A", "-h", SP.SOCK[0], "-p", SP.PORT, "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-f", str(path)], capture_output=True, text=True)

        psql(generated["captured/public.request_b2b_payment_terms_adjustment_secure.f9bf8f54.local-20261030.sql"].rstrip() + ";\nREVOKE ALL ON FUNCTION public.request_b2b_payment_terms_adjustment_secure(uuid,text) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.request_b2b_payment_terms_adjustment_secure(uuid,text) TO authenticated, service_role;")
        r = runfile(work / "01-pre.sql.readonly")
        check("01 PRE_OK com a captura pinada", r.returncode == 0 and "PRE_OK" in r.stdout, r.stderr)
        bad = work / "bad-install.sql"
        bad.write_text((work / "02-install.sql.review").read_text().replace(G.BASE_MD5, "0" * 32, 1))
        bad.chmod(0o644)
        r = runfile(bad)
        check("pin divergente aborta sem trocar a função", r.returncode != 0 and psql("SELECT md5(pg_get_functiondef('public.request_b2b_payment_terms_adjustment_secure(uuid,text)'::regprocedure))").stdout.strip() == G.BASE_MD5, r.stderr)
        r = runfile(work / "02-install.sql.review")
        check("02 instala o candidato transacionalmente", r.returncode == 0, r.stderr)
        candidate_md5 = psql("SELECT md5(pg_get_functiondef('public.request_b2b_payment_terms_adjustment_secure(uuid,text)'::regprocedure))").stdout.strip()
        expected_candidate_md5 = json.loads(generated["adjustment-pins.json"])["candidate_md5"]
        check("candidato executado tem o MD5 gerado", candidate_md5 == expected_candidate_md5, {"actual": candidate_md5, "expected": expected_candidate_md5})
        r = runfile(work / "03-post.sql.readonly")
        check("03 POST_OK e ACL preservada", r.returncode == 0 and "POST_OK" in r.stdout, r.stderr)
        r = runfile(work / "02-install.sql.review")
        check("rerun sobre o candidato aborta pelo pin da baseline", r.returncode != 0, r.stderr)

        trigger_defs = (ROOT / "scripts/b2b-solid-packaging-order-20261106/captured/triggers/_triggerdefs.live-20261106.sql").read_text()
        expected = re.findall(r"CREATE (?:CONSTRAINT )?TRIGGER (\w+) .*? ON (public\.\w+)", trigger_defs)

        def triggers_ok():
            rows = psql("SELECT t.tgname||'|'||c.relnamespace::regnamespace::text||'.'||c.relname||'|'||t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal ORDER BY 1").stdout.strip().splitlines()
            actual = {(r.split("|")[0], r.split("|")[1]): r.split("|")[2] for r in rows}
            return len(expected) == 38 and all(actual.get((name, table)) not in (None, "D") for name, table in expected)

        check("TODOS os 38 gatilhos reais habilitados após instalar", triggers_ok())

        def state(order_id):
            queries = {
                "order": f"SELECT to_jsonb(o)::text FROM public.partner_orders o WHERE id='{order_id}'",
                "terms": f"SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb)::text FROM public.partner_order_payment_terms t WHERE partner_order_id='{order_id}'",
                "audit": f"SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id),'[]'::jsonb)::text FROM public.partner_order_audit_logs a WHERE order_id='{order_id}'",
                "notifications": "SELECT COALESCE(jsonb_agg(to_jsonb(n) ORDER BY n.id),'[]'::jsonb)::text FROM public.notificacoes_operacionais n",
            }
            return {key: psql(query).stdout.strip() for key, query in queries.items()}

        def request(uid, order_id, note):
            return SP.as_user(uid, f"SELECT public.request_b2b_payment_terms_adjustment_secure('{order_id}','{note}')::text;")

        # Pendência contábil: pedido externo REAL e financial/terms já pending.
        psql(f"UPDATE public.commercial_payment_plans SET requires_financial_approval=true WHERE id='{SP.PLD}'")
        pending, pending_error = B.out(B.legacy(SP.UB, SP.PLD, [B.L(1)], "TESTE-AJUSTE-PENDING-CANDIDATE"))
        check("fixture de pendência criada pelo writer canônico", pending is not None, pending_error or pending)
        before = state(pending["id"])
        r = request(SP.UADM, pending["id"], "TESTE negado")
        check("C2_ACCOUNTING_PENDING nega pending→pending", r.returncode != 0 and "C2_ACCOUNTING_PENDING" in r.stderr, r.stderr)
        check("negação contábil preserva pedido/termos/auditoria/notificações", state(pending["id"]) == before)

        # Origem externa validada: o candidato agora nega por escopo antes do gatilho de origem.
        settings_id = "10000000-0000-0000-0000-000000000003"
        psql(f"""INSERT INTO public.company_fiscal_settings(id,organization_id,is_active,configuration_status,accounting_validated_at,legal_name,cnpj,configuration_version)
                 VALUES ('{settings_id}','{SP.A}',true,'VALIDATED',now(),'EMPRESA FICTICIA TESTE','00000000000000',1);""")
        validated, validated_error = B.out(B.legacy(SP.UB, SP.PLD, [B.L(1)], "TESTE-AJUSTE-VALIDATED-CANDIDATE"))
        check("fixture validada criada pelo writer canônico", validated is not None, validated_error or validated)
        before = state(validated["id"])
        r = request(SP.UADMF, validated["id"], "TESTE estrangeiro")
        check("admin estrangeiro negado pelo escopo canônico no pedido validado", r.returncode != 0 and "b2b_phase1_scope_denied" in r.stderr, r.stderr)
        check("negação de escopo validado preserva estado integral", state(validated["id"]) == before)

        # Fixture legada sem origem; preparação explícita, todos os gatilhos religados antes das chamadas.
        legacy_id = "10000000-0000-0000-0000-000000000001"
        terms_id = "10000000-0000-0000-0000-000000000002"
        psql(f"""BEGIN;
                 ALTER TABLE public.partner_orders DISABLE TRIGGER USER; ALTER TABLE public.partner_order_payment_terms DISABLE TRIGGER USER;
                 INSERT INTO public.partner_orders(id,partner_id,status,total,created_by,payment_terms_id,requires_financial_approval,financial_approval_status,payment_condition_status)
                 VALUES ('{legacy_id}','{SP.P}','em_analise_comercial',100,'{SP.UB}','{terms_id}',true,'pending','pending');
                 INSERT INTO public.partner_order_payment_terms
                 SELECT (jsonb_populate_record(NULL::public.partner_order_payment_terms,
                       to_jsonb(src)||jsonb_build_object('id','{terms_id}'::uuid,'partner_order_id','{legacy_id}'::uuid,'approval_status','pending'))).*
                 FROM public.partner_order_payment_terms src WHERE src.partner_order_id='{validated['id']}';
                 ALTER TABLE public.partner_orders ENABLE TRIGGER USER; ALTER TABLE public.partner_order_payment_terms ENABLE TRIGGER USER; COMMIT;""")
        check("TODOS os gatilhos reais religados antes das chamadas legadas", triggers_ok())
        before = state(legacy_id)
        r = request(SP.UADMF, legacy_id, "TESTE legado estrangeiro")
        check("admin estrangeiro negado no legado sem snapshot", r.returncode != 0 and "b2b_phase1_scope_denied" in r.stderr, r.stderr)
        check("negação legada preserva estado integral", state(legacy_id) == before)

        # Reautorização após espera: papel é removido enquanto a RPC aguarda o lock do pedido.
        before = state(legacy_id)
        blocker_result = {}
        caller_result = {}

        def blocker():
            blocker_result["r"] = psql(f"BEGIN; SELECT 1 FROM public.partner_orders WHERE id='{legacy_id}' FOR UPDATE; SELECT pg_sleep(1.4); COMMIT;", check=False)

        def caller():
            time.sleep(0.25)
            caller_result["r"] = request(SP.UADM, legacy_id, "TESTE revogacao durante espera")

        first = threading.Thread(target=blocker)
        second = threading.Thread(target=caller)
        first.start(); second.start()
        time.sleep(0.65)
        psql(f"DELETE FROM public.user_roles WHERE user_id='{SP.UADM}' AND role='administrador'")
        first.join(8); second.join(8)
        revoked = caller_result.get("r")
        check("revogação durante o lock é vista pela segunda autorização", revoked is not None and revoked.returncode != 0 and "unauthorized" in revoked.stderr, revoked.stderr if revoked is not None else "sem retorno")
        check("revogação sob espera não grava efeitos", state(legacy_id) == before)
        psql(f"INSERT INTO public.user_roles VALUES ('{SP.UADM}','administrador')")

        # Controles positivos no próprio tenant, sem alterar a economia nem os snapshots.
        r = request(SP.UADM, validated["id"], "TESTE positivo validado")
        check("mesmo tenant ainda solicita ajuste em pedido validado", r.returncode == 0 and "adjustment_requested" in r.stdout, r.stderr)
        r = request(SP.UADM, legacy_id, "TESTE positivo legado")
        check("mesmo tenant ainda solicita ajuste no legado", r.returncode == 0 and "adjustment_requested" in r.stdout, r.stderr)
        r = request(SP.UB, legacy_id, "TESTE comprador")
        check("comprador sem papel financeiro continua negado", r.returncode != 0 and "unauthorized" in r.stderr, r.stderr)

        # Rollback restritivo: pin errado não altera; correto só revoga cliente.
        bad_rb = work / "bad-rollback.sql"
        bad_rb.write_text((work / "04-rollback-deny.sql.review").read_text().replace(expected_candidate_md5, "0" * 32, 1))
        bad_rb.chmod(0o644)
        r = runfile(bad_rb)
        check("rollback com pin divergente aborta sem revogar", r.returncode != 0 and psql("SELECT has_function_privilege('authenticated','public.request_b2b_payment_terms_adjustment_secure(uuid,text)','EXECUTE')").stdout.strip() == "t", r.stderr)
        r = runfile(work / "04-rollback-deny.sql.review")
        check("04 rollback deny-only conclui", r.returncode == 0, r.stderr)
        after_rb = state(legacy_id)
        r = request(SP.UADM, legacy_id, "TESTE apos rollback")
        check("rollback nega EXECUTE ao cliente sem restaurar corpo vulnerável", r.returncode != 0 and "permission denied" in r.stderr and psql("SELECT md5(pg_get_functiondef('public.request_b2b_payment_terms_adjustment_secure(uuid,text)'::regprocedure))").stdout.strip() == expected_candidate_md5, r.stderr)
        check("rollback não apaga nem reescreve histórico", state(legacy_id) == after_rb)
        check("TODOS os 38 gatilhos continuam habilitados no fim", triggers_ok())
        check("B3 não foi instalado nem modificado nesta bateria", psql("SELECT to_regclass('platform_private.b2b_condition_versions') IS NULL").stdout.strip() == "t")

        report = {
            "kind": "DISPOSABLE_PG_CANDIDATE_ALL_REAL_TRIGGERS_NOT_HOSTED_PROOF",
            "source": str(G.SOURCE.relative_to(ROOT)),
            "live_source_still_requires_auditor_confirmation": True,
            "baseline_md5": G.BASE_MD5,
            "candidate_md5": expected_candidate_md5,
            "real_trigger_count": len(expected),
            "b3_installed_or_modified": False,
            "synthetic_seams": ["Auth por GUC local", "has_role/b2b_phase1_order_visible e escopo mínimos do harness; somente o pin desse leitor é localizado em /tmp", "schema e dependências de segundo nível B2/B3", "fixture legada mínima com gatilhos pausados só na preparação e todos religados antes das RPCs", "sem JWT/RLS/PostgREST/Storage"],
            "passed": sum(c["ok"] for c in checks),
            "total": len(checks),
            "checks": checks,
        }
    finally:
        subprocess.run(SP.su() + ["pg_ctl", "-D", str(tmp / "d"), "-m", "fast", "stop"], capture_output=True)
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"{report['passed']}/{report['total']}")
    for row in checks:
        print(("PASS" if row["ok"] else "FAIL"), row["name"], row.get("detail", ""))
    return 0 if report["passed"] == report["total"] else 1


if __name__ == "__main__":
    sys.exit(main())
