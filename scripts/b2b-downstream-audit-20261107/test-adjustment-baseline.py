#!/usr/bin/env python3
"""Reprodução LOCAL da RPC capturada de ajuste, com TODOS os gatilhos reais ativos.

Não conecta a rede nem a banco hospedado. Reutiliza o boot B3 somente para montar o esquema
B2/captured com os 38 gatilhos reais; B3 NÃO é instalado nem alterado. Auth e escopo são costuras
sintéticas declaradas pelo harness. Os pedidos são fictícios.
"""
import hashlib
import importlib.util
import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
B3_DIR = ROOT / "scripts/b2b-payment-condition-v1-rebase-20261106"
SPEC = importlib.util.spec_from_file_location("b3h", B3_DIR / "test-local-pg.py")
B = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(B)
SP = B.SP
SP.PORT = "55471"
EVIDENCE = HERE / "evidence/adjustment-baseline.json"


def main():
    checks = []

    def check(name, ok, detail=None):
        row = {"name": name, "ok": bool(ok)}
        if detail is not None:
            row["detail"] = str(detail)[:1200]
        checks.append(row)

    tmp = B.boot()
    try:
        psql = SP.psql
        current = json.loads((ROOT / "scripts/delivery-atomic-hardening-20261030/capture/current.json").read_text())
        match = [f for f in current["functions"] if f.get("signature") == "public.request_b2b_payment_terms_adjustment_secure(p_partner_order_id uuid, p_notes text)"]
        check("captura LOCAL identificada sem ambiguidade", len(match) == 1, len(match))
        body = match[0]["body"]
        check("hash da captura LOCAL f9bf8f54 conferido", hashlib.md5(body.encode()).hexdigest() == "f9bf8f543564af480d08e7bebd111b88")
        psql(body.rstrip() + ";\nREVOKE ALL ON FUNCTION public.request_b2b_payment_terms_adjustment_secure(uuid,text) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.request_b2b_payment_terms_adjustment_secure(uuid,text) TO authenticated, service_role;")
        actual_md5 = psql("SELECT md5(pg_get_functiondef('public.request_b2b_payment_terms_adjustment_secure(uuid,text)'::regprocedure))").stdout.strip()
        check("corpo executado é byte-equivalente à captura LOCAL", actual_md5 == "f9bf8f543564af480d08e7bebd111b88", actual_md5)

        trigger_defs = (ROOT / "scripts/b2b-solid-packaging-order-20261106/captured/triggers/_triggerdefs.live-20261106.sql").read_text()
        expected = re.findall(r"CREATE (?:CONSTRAINT )?TRIGGER (\w+) .*? ON (public\.\w+)", trigger_defs)
        rows = psql("SELECT t.tgname||'|'||c.relnamespace::regnamespace||'.'||c.relname||'|'||t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal ORDER BY 1").stdout.strip().splitlines()
        actual = {(r.split("|")[0], r.split("|")[1]): r.split("|")[2] for r in rows}
        missing = [(name, table) for name, table in expected if actual.get((name, table)) in (None, "D")]
        check("TODOS os 38 gatilhos reais capturados estão habilitados", len(expected) == 38 and not missing, {"expected": len(expected), "missing": missing})

        # Pedido externo canônico: sem emissor válido, a fixture recebe o contrato REAL de pendência.
        psql(f"UPDATE public.commercial_payment_plans SET requires_financial_approval=true WHERE id='{SP.PLD}'")
        created = B.legacy(SP.UB, SP.PLD, [B.L(1)], "TESTE-AJUSTE-PENDING-BASELINE")
        order, error = B.out(created)
        check("pedido fictício canônico criado para a reprodução", order is not None, error or order)
        origin = psql(f"SELECT c2_external_origin_snapshot->>'contract' FROM public.partner_orders WHERE id='{order['id']}'").stdout.strip() if order else ""
        before = psql(f"SELECT financial_approval_status||'|'||payment_condition_status FROM public.partner_orders WHERE id='{order['id']}'").stdout.strip() if order else ""
        terms_before = psql(f"SELECT approval_status FROM public.partner_order_payment_terms WHERE partner_order_id='{order['id']}'").stdout.strip() if order else ""
        check("fixture contábil está pending→pending e com contrato REAL", origin == "C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1" and before == "pending|pending" and terms_before == "pending", {"origin": origin, "order": before, "terms": terms_before})

        result = SP.as_user(SP.UADM, f"SELECT public.request_b2b_payment_terms_adjustment_secure('{order['id']}','TESTE pending para pending')::text;", check=False) if order else None
        after = psql(f"SELECT financial_approval_status||'|'||payment_condition_status FROM public.partner_orders WHERE id='{order['id']}'").stdout.strip() if order else ""
        terms_after = psql(f"SELECT approval_status||'|'||approval_notes FROM public.partner_order_payment_terms WHERE partner_order_id='{order['id']}'").stdout.strip() if order else ""
        check("LACUNA CONFIRMADA LOCALMENTE: pending→pending conclui apesar do contrato contábil", result is not None and result.returncode == 0 and after == "pending|adjustment_requested", (result.stderr if result is not None else "sem chamada", after, terms_after))

        # Pedido legado sintético, SEM snapshot C2: separa a ausência de escopo da pendência contábil.
        legacy_id = "10000000-0000-0000-0000-000000000001"
        terms_id = "10000000-0000-0000-0000-000000000002"
        psql(f"""INSERT INTO public.partner_orders(id,partner_id,status,total,created_by,payment_terms_id,requires_financial_approval,financial_approval_status,payment_condition_status)
                 VALUES ('{legacy_id}','{SP.P}','em_analise_comercial',100,'{SP.UB}','{terms_id}',true,'pending','pending');
                 INSERT INTO public.partner_order_payment_terms(id,partner_order_id,payment_plan_id,approval_status,final_amount)
                 VALUES ('{terms_id}','{legacy_id}','{SP.PLD}','pending',100);""")
        legacy_result = SP.as_user(SP.UADMF, f"SELECT public.request_b2b_payment_terms_adjustment_secure('{legacy_id}','TESTE escopo estrangeiro')::text;", check=False)
        foreign_notes = psql(f"SELECT approval_notes FROM public.partner_order_payment_terms WHERE id='{terms_id}'").stdout.strip()
        check("LACUNA DE ESCOPO CONFIRMADA LOCALMENTE: admin de outro tenant altera pedido legado", legacy_result.returncode == 0 and foreign_notes == "TESTE escopo estrangeiro", (legacy_result.stderr, foreign_notes))

        # Controle da guarda contábil isolada: pending→approved é negado, mostrando por que o delta escapa.
        control = psql("BEGIN; ALTER TABLE public.partner_orders DISABLE TRIGGER USER; ALTER TABLE public.partner_orders ENABLE TRIGGER zz_c2_accounting_pending;\n"
                       f"SELECT set_config('request.jwt.claim.sub','{SP.UADM}',true) \\g /dev/null\nUPDATE public.partner_orders SET financial_approval_status='approved' WHERE id='{order['id']}';\nROLLBACK;", check=False) if order else None
        check("controle: o gatilho contábil REAL nega pending→approved", control is not None and control.returncode != 0 and "C2_ACCOUNTING_PENDING" in control.stderr, control.stderr if control is not None else "")
        enabled_after = psql("SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND t.tgenabled='D'").stdout.strip()
        check("nenhum gatilho ficou desabilitado após o controle transacional revertido", enabled_after == "0", enabled_after)

        report = {
            "kind": "DISPOSABLE_PG_CAPTURED_RPC_ALL_REAL_TRIGGERS_NOT_HOSTED_PROOF",
            "mode": "baseline_reproduction",
            "source": "scripts/delivery-atomic-hardening-20261030/capture/current.json",
            "source_function_md5": "f9bf8f543564af480d08e7bebd111b88",
            "live_source_still_requires_auditor_confirmation": True,
            "b3_installed_or_modified": False,
            "real_trigger_count": len(expected),
            "synthetic_seams": ["Auth por GUC local", "has_role/b2b_phase1_order_visible e escopo mínimos do harness", "schema e dependências de segundo nível do harness B2/B3", "sem JWT/RLS/PostgREST/Storage"],
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
