#!/usr/bin/env python3
"""Prova nulidade fail-closed do contrato físico; somente PostgreSQL descartável."""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("finished_before_null", HERE / "test_pg.py")
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)
spec = importlib.util.spec_from_file_location("finished_after_null", HERE / "test_after.py")
A = importlib.util.module_from_spec(spec)
spec.loader.exec_module(A)
OUT = HERE / "evidence"


def main():
    status = 1
    probes = []
    try:
        B.restore_checkpoint()
        loaded = B.run_raw((HERE / "install.sql.review").read_text())
        if loaded.returncode != 0:
            raise AssertionError("candidate PRE/install failed\n" + loaded.stdout[-2000:] + loaded.stderr[-6000:])
        B.ok("candidato instalado para matriz isolada de nulidade")
        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=true WHERE singleton;")
        item = A.finished("quimico", "kg", 25, 2)
        stock = item["stock"]

        cases = [
            ("origem inesperada", {"origem_estoque": "origem_inesperada"}),
            ("embalagem_versao NULL", {"embalagem_versao": None}),
            ("conteudo_por_unidade NULL", {"conteudo_por_unidade": None}),
            ("unidade_conteudo NULL", {"unidade_conteudo": None}),
            ("quantidade_conteudo NULL", {"quantidade_conteudo": None}),
            ("quantidade NULL", {"quantidade": None}),
            ("embalagem_id NULL", {"embalagem_id": None}),
            ("dimensão sólida com volume", {"volume_total": 50}),
            ("dimensão de conteúdo incoerente", {"quantidade_conteudo": 49}),
            ("unidade comercial NULL", {"unidade_comercial": None}),
        ]

        for gate_enabled in (True, False):
            B.sql(f"UPDATE platform_private.finished_product_gate_v1 SET enabled={str(gate_enabled).lower()} WHERE singleton;")
            for index, (label, overrides) in enumerate(cases):
                encoded = json.dumps(overrides)
                composite = f"jsonb_populate_record(s,'{encoded}'::jsonb)"
                helper = json.loads(B.last(f"""SELECT jsonb_build_object(
                  'value',platform_private.finished_product_stock_valid_v1({composite}),
                  'legacy_if_not_denies',NOT platform_private.finished_product_stock_valid_v1({composite}),
                  'fail_closed_denies',platform_private.finished_product_stock_valid_v1({composite}) IS NOT TRUE
                ) FROM public.estoque_produto s WHERE s.id='{stock}';"""))
                helper_ok = helper["value"] is False and helper["legacy_if_not_denies"] is True and helper["fail_closed_denies"] is True
                record = {"case": label, "gate_enabled": gate_enabled, "overrides": overrides, "helper": helper}
                if helper_ok:
                    B.ok(f"gate {gate_enabled}: helper nega {label} sem NULL", helper)
                else:
                    B.fail(f"gate {gate_enabled}: helper nega {label} sem NULL", helper)

                probe_id = B.T.u(12000 + index + (100 if not gate_enabled else 0))
                with_id = dict(overrides, id=str(probe_id))
                statement = "SET session_replication_role=replica;" + f"""
                INSERT INTO public.estoque_produto
                SELECT (jsonb_populate_record(s,'{json.dumps(with_id)}'::jsonb)).*
                FROM public.estoque_produto s WHERE s.id='{stock}';
                SET session_replication_role=origin;
                """
                result = B.run_raw(statement)
                denied = result.returncode != 0 and "finished_product_unit_contract" in result.stderr
                record["check"] = {"returncode": result.returncode, "stderr": result.stderr[-2000:], "denied": denied}
                if denied:
                    B.ok(f"gate {gate_enabled}: CHECK nega {label}", "finished_product_unit_contract")
                else:
                    B.fail(f"gate {gate_enabled}: CHECK nega {label}", record["check"])
                    if result.returncode == 0:
                        B.sql(f"SET session_replication_role=replica;DELETE FROM public.estoque_produto WHERE id='{probe_id}';SET session_replication_role=origin;")
                probes.append(record)

        for signature in (
            "public.reservar_estoque_item(uuid,numeric,uuid,text,uuid,uuid,uuid,text)",
            "public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)",
            "platform_private.delivery_merge_split_20261030(uuid,jsonb,jsonb)",
            "platform_private.delivery_confirm_apply_v1(uuid,timestamptz,text,jsonb)",
            "platform_private.delivery_send_apply_v1(uuid,timestamptz,text)",
            "public.validate_estoque_entrada()",
        ):
            body = B.last(f"SELECT pg_get_functiondef('{signature}'::regprocedure);")
            uses_fail_closed = "finished_product_" not in body or " IS NOT TRUE" in body
            if uses_fail_closed:
                B.ok(f"caller usa IS NOT TRUE: {signature}")
            else:
                B.fail(f"caller usa IS NOT TRUE: {signature}", "predicado NOT helper ainda presente")

        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=true WHERE singleton;")
        valid = B.last(f"SELECT platform_private.finished_product_stock_valid_v1(s) FROM public.estoque_produto s WHERE s.id='{stock}';")
        if valid == "t":
            B.ok("controle válido permanece aceito com gate ligado")
        else:
            B.fail("controle válido permanece aceito com gate ligado", valid)
        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=false WHERE singleton;")
        disabled = B.last(f"SELECT platform_private.finished_product_stock_valid_v1(s) FROM public.estoque_produto s WHERE s.id='{stock}';")
        if disabled == "f":
            B.ok("controle válido é negado com gate desligado")
        else:
            B.fail("controle válido é negado com gate desligado", disabled)

        status = 0 if all(x["status"] == "PASS" for x in B.CHECKS) else 1
    except Exception as exc:
        import traceback
        B.fail("execução da matriz de nulidade terminou no ponto concreto", traceback.format_exc())
        status = 1
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        evidence = {
            "kind": "DISPOSABLE_FINISHED_PRODUCT_NULL_CONTRACT_NOT_HOSTED",
            "status": "PASS" if status == 0 else "FAIL",
            "exit_code": status,
            "passed": sum(x["status"] == "PASS" for x in B.CHECKS),
            "total": len(B.CHECKS),
            "checks": B.CHECKS,
            "probes": probes,
            "hosted": False,
            "synthetic_seams": [
                "Auth/claims e catálogo fictícios somente no PostgreSQL descartável",
                "sondas de CHECK usam session_replication_role=replica apenas para isolar a constraint; nenhum writer positivo é certificado por essa costura",
                "helpers recebem linhas compostas sintéticas sem alterar dados canônicos",
                "nenhum JWT/RLS/Storage/PostgREST/browser ou efeito fiscal/financeiro/comunicação",
            ],
        }
        (OUT / "null-contract.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
        print(f"RESULT {evidence['passed']} / {evidence['total']} exit {status}", flush=True)
    return status


if __name__ == "__main__":
    raise SystemExit(main())
