#!/usr/bin/env python3
"""Regressão biológica focal com candidato instalado e gate desligado."""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("finished_before", HERE / "test_pg.py")
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)


def main():
    status = 1
    try:
        B.restore_checkpoint()
        loaded = B.run_raw((HERE / "install.sql.review").read_text())
        assert loaded.returncode == 0, loaded.stderr[-8000:]
        assert B.last("SELECT enabled FROM platform_private.finished_product_gate_v1 WHERE singleton;") == "f"
        B.ok("candidato instalado e gate permanece desligado para o legado")

        delivery, _ = B.C.create(B.C.T.O2, B.C.T.PP2, B.C.T.L2, "71")
        observed = B.last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery}';")
        sent = json.loads(B.last(B.send(delivery, "legacy-candidate", observed)))
        assert sent["success"] is True and sent["status"] == "em_rota"
        observed_confirm = B.last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery}';")
        confirmed = json.loads(B.last(B.confirm(delivery, "legacy-candidate", observed_confirm)))
        assert confirmed["success"] is True and confirmed["status"] == "entregue"
        assert B.last(f"SELECT count(*) FROM public.programacao_producao WHERE ordem_servico_id='{B.C.T.O2}';") == "1"
        B.ok("legado biológico mantém programação, envio e confirmação canônicos com gate desligado")

        delivery_cancel, _ = B.C.create(B.C.T.O5, B.C.T.PP5, B.C.T.L5, "72", True)
        cancelled = json.loads(B.last(B.cancel(delivery_cancel, "legacy-candidate-cancel")))
        assert cancelled["success"] is True
        B.ok("legado biológico mantém cancelamento e recomposição de estoque")

        B.reject("legado sem envase continua negado pelo writer físico", "SELECT public.rpc_cockpit_criar_entrega_v1(NULL,'manual',NULL,1,'{}'::jsonb);", "P0001")
        status = 0
    except Exception as exc:
        B.ok("FAIL " + str(exc))
    finally:
        out = {"status": "PASS" if status == 0 else "FAIL", "checks": B.CHECKS, "candidate_installed": True, "gate_enabled": False, "hosted": False}
        (HERE / "evidence/legacy-candidate.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
        print(f"RESULT {sum(x['status'] == 'PASS' for x in B.CHECKS)} / {len(B.CHECKS)} exit {status}")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
