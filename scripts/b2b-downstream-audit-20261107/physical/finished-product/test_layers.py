#!/usr/bin/env python3
"""Prova instalação em camadas com dependências downstream ausentes; PG descartável."""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("finished_layers_base", HERE / "test_pg.py")
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)
spec = importlib.util.spec_from_file_location("finished_layers_after", HERE / "test_after.py")
A = importlib.util.module_from_spec(spec)
spec.loader.exec_module(A)
OUT = HERE / "evidence"
CONFIRM = "platform_private.delivery_confirm_apply_v1(uuid,timestamptz,text,jsonb)"
SEND = "platform_private.delivery_send_apply_v1(uuid,timestamptz,text)"


def main():
    status = 1
    try:
        B.restore_checkpoint()
        # Costura sintética explícita: reproduz a ausência relatada sem afirmar nova leitura LIVE.
        original = {
            CONFIRM: B.sql(f"SELECT pg_get_functiondef('{CONFIRM}'::regprocedure);"),
            SEND: B.sql(f"SELECT pg_get_functiondef('{SEND}'::regprocedure);"),
        }
        B.sql(f"DROP FUNCTION {CONFIRM};DROP FUNCTION {SEND};")
        B.ok("ausência das duas dependências downstream simulada somente no PG descartável")

        B.reject("pacote completo falha fechado na primeira dependência ausente",
                 (HERE / "install.sql.review").read_text(), "P0001", "FINISHED_PRE_DEPENDENCY_MISSING " + CONFIRM)
        if B.last("SELECT to_regclass('platform_private.finished_product_gate_v1') IS NULL;") == "t":
            B.ok("PRE do pacote completo não cria objetos antes da dependência ausente")
        else:
            B.fail("PRE do pacote completo não cria objetos antes da dependência ausente", "gate criado")

        loaded = B.run_raw((HERE / "install-foundation.sql.review").read_text())
        if loaded.returncode == 0:
            B.ok("camada de entrada instala sem presumir confirmação/envio")
        else:
            raise AssertionError("foundation install failed\n" + loaded.stdout[-2000:] + loaded.stderr[-6000:])
        if B.last(f"SELECT to_regprocedure('{CONFIRM}') IS NULL AND to_regprocedure('{SEND}') IS NULL;") == "t":
            B.ok("camada de entrada não cria nem remove pins das dependências ausentes")
        else:
            B.fail("camada de entrada não cria nem remove pins das dependências ausentes", "dependência criada")
        loaded = B.run_raw((HERE / "postflight-foundation.sql.review").read_text())
        if loaded.returncode == 0:
            B.ok("POST da entrada confirma seus nove corpos, novos helpers e gate fechado")
        else:
            raise AssertionError("foundation post failed\n" + loaded.stderr[-6000:])
        B.reject("camada downstream continua bloqueada enquanto a dependência não existe",
                 (HERE / "install-downstream.sql.review").read_text(), "P0001", "FINISHED_PRE_DEPENDENCY_MISSING " + CONFIRM)

        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=true WHERE singleton;")
        item = A.finished("quimico", "kg", 25, 2)
        B.ok("compra canônica funciona na camada de entrada sem downstream", {"stock": item["stock"], "lot": item["lot"]})
        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=false WHERE singleton;")

        # Recompõe as dependências a partir dos corpos capturados no início, sem buscar hosted.
        B.sql(original[CONFIRM] + ";\n" + original[SEND] + ";")
        baseline = json.loads((HERE / "baseline.json").read_text())
        expected = {x["signature"]: x["md5"] for x in baseline["functions"]}
        for signature in (CONFIRM, SEND):
            actual = B.last(f"SELECT md5(pg_get_functiondef('{signature}'::regprocedure));")
            if actual == expected[signature]:
                B.ok(f"dependência reconstituída com o corpo capturado exato: {signature}")
            else:
                B.fail(f"dependência reconstituída com o corpo capturado exato: {signature}", actual)
        loaded = B.run_raw((HERE / "install-downstream.sql.review").read_text())
        if loaded.returncode == 0:
            B.ok("camada downstream instala somente após dependências e POST da entrada")
        else:
            raise AssertionError("downstream install failed\n" + loaded.stdout[-3000:] + loaded.stderr[-8000:])
        loaded = B.run_raw((HERE / "postflight-downstream.sql.review").read_text())
        if loaded.returncode == 0:
            B.ok("POST downstream confirma os dois corpos alterados e gate fechado")
        else:
            raise AssertionError("downstream post failed\n" + loaded.stderr[-6000:])

        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=true WHERE singleton;")
        reserved = json.loads(B.last(B.reserve(item["os"], item["stock"], 2, "layers-reserve")))["itens"][0]
        delivery = json.loads(B.last(B.group(item["os"], reserved, 2, "layers-group")))["itens"][0]["entrega_id"]
        sent = json.loads(B.last(B.send(delivery, "layers-send")))
        assert sent["success"] is True and sent["status"] == "em_rota"
        B.prove(delivery, "layers-proof")
        confirmed = json.loads(B.last(B.confirm(delivery, "layers-confirm")))
        assert confirmed["success"] is True and confirmed["status"] == "entregue"
        if B.last(f"SELECT count(*) FROM public.estoque_movimentacoes WHERE referencia_tipo='entrega' AND referencia_id='{delivery}' AND acao='expedicao';") == "1":
            B.ok("camadas compostas preservam reserva→expedição→entrega sem segunda baixa")
        else:
            B.fail("camadas compostas preservam reserva→expedição→entrega sem segunda baixa", delivery)
        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=false WHERE singleton;")
        loaded = B.run_raw((HERE / "postflight.sql.review").read_text())
        if loaded.returncode == 0:
            B.ok("POST completo coincide com a composição das duas camadas")
        else:
            raise AssertionError("full post failed\n" + loaded.stderr[-6000:])
        status = 0 if all(x["status"] == "PASS" for x in B.CHECKS) else 1
    except Exception as exc:
        import traceback
        B.fail("execução das camadas terminou no ponto concreto", traceback.format_exc())
        status = 1
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        evidence = {
            "kind": "DISPOSABLE_FINISHED_PRODUCT_LAYERED_INSTALL_NOT_HOSTED",
            "status": "PASS" if status == 0 else "FAIL",
            "exit_code": status,
            "passed": sum(x["status"] == "PASS" for x in B.CHECKS),
            "total": len(B.CHECKS),
            "checks": B.CHECKS,
            "hosted": False,
            "reported_live_state": {CONFIRM: "ABSENT", SEND: "ABSENT", "other_six": "REPORTED_MATCH"},
            "synthetic_seams": [
                "ausência simulada por DROP somente na composição descartável; nenhuma nova leitura ou escrita LIVE",
                "dependências reconstituídas com os corpos capturados e MD5 conferidos antes da camada downstream",
                "Auth/claims, produto, demanda e comprovante fictícios; sem JWT/RLS/Storage/PostgREST/browser",
                "nenhum efeito fiscal, financeiro, contábil ou de comunicação",
            ],
        }
        (OUT / "layers.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
        print(f"RESULT {evidence['passed']} / {evidence['total']} exit {status}", flush=True)
    return status


if __name__ == "__main__":
    raise SystemExit(main())
