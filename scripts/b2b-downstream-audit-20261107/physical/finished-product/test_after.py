#!/usr/bin/env python3
"""Matriz positiva/negativa do candidato, somente PostgreSQL descartável."""
import importlib.util
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("finished_before", HERE / "test_pg.py")
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)
RESULTS = HERE / "evidence"
RESULTS.mkdir(exist_ok=True)


def finished(group, unit, per_unit, quantity=2):
    volume = quantity * per_unit if unit == "l" else (quantity * per_unit / 1000 if unit == "ml" else None)
    item = B.fixture(group, unit.upper(), volume, quantity)
    B.SEQUENCE += 1
    packaging = B.T.u(3000 + B.SEQUENCE)
    # Snapshot de embalagem upstream sintético: não cria catálogo/tabela paralela.
    # A ligação com o catálogo B3 permanece dependência explícita de instalação.
    B.sql("SET session_replication_role=replica;" + f"""
    UPDATE public.estoque_produto SET origem_estoque='produto_acabado',unidade_comercial='unidade',conteudo_por_unidade={per_unit},unidade_conteudo='{unit}',quantidade_conteudo={quantity * per_unit},embalagem_id='{packaging}',embalagem_versao=1 WHERE id='{item['stock']}';
    SET session_replication_role=origin;
    """)
    item.update({"packaging": packaging, "per_unit": per_unit, "unit_lower": unit})
    return item


def main():
    status = 1
    try:
        B.restore_checkpoint()
        loaded = B.run_raw((HERE / "install.sql.review").read_text())
        if loaded.returncode != 0:
            raise AssertionError("candidate PRE/install failed\n" + loaded.stdout[-3000:] + loaded.stderr[-8000:])
        B.ok("candidato instalado com todos os PRE pins e sem novos grants")
        baseline = json.loads((HERE / "baseline.json").read_text())
        values = ",".join("('" + x["signature"].replace("'", "''") + "')" for x in baseline["functions"])
        post_functions = json.loads(B.last(f"""SELECT coalesce(jsonb_agg(jsonb_build_object('signature',v.signature,'md5',md5(pg_get_functiondef(p.oid)),'owner',r.rolname,'acl',coalesce(p.proacl::text,'')) ORDER BY v.signature),'[]'::jsonb) FROM (VALUES {values}) v(signature) JOIN pg_proc p ON p.oid=to_regprocedure(v.signature) JOIN pg_roles r ON r.oid=p.proowner;"""))
        (RESULTS / "post-install-functions.json").write_text(json.dumps({"source": "disposable_post_install", "functions": post_functions}, ensure_ascii=False, indent=2) + "\n")
        assert B.last("SELECT enabled FROM platform_private.finished_product_gate_v1 WHERE singleton;") == "f"
        B.ok("instalação permanece operacionalmente desligada")
        closed = finished("quimico", "kg", 25)
        B.reject("gate fechado nega reserva de produto acabado", B.reserve(closed["os"], closed["stock"], 1, "finished-gate-closed"), "23514", "FINISHED_PRODUCT_STOCK_CONTRACT_DENIED")
        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=true WHERE singleton;")

        for group, unit, per_unit in (("quimico", "kg", 25), ("fertilizante", "g", 25000), ("quimico", "l", 1), ("fertilizante", "ml", 500)):
            item = finished(group, unit, per_unit)
            key = group + "-" + unit
            reserved = json.loads(B.last(B.reserve(item["os"], item["stock"], 2, "after-reserve-" + key)))["itens"][0]
            observed = (B.last(f"SELECT updated_at FROM public.ordens_servico WHERE id='{item['os']}';"), B.last(f"SELECT updated_at FROM public.estoque_produto WHERE id='{reserved}';"))
            grouped = json.loads(B.last(B.group(item["os"], reserved, 2, "after-group-" + key, observed)))
            delivery = grouped["itens"][0]["entrega_id"]
            delivered_ml = per_unit * 2 * (1000 if unit == "l" else 1)
            expected_ml = "NULL" if unit in ("kg", "g") else str(delivered_ml)
            actual = json.loads(B.last(f"SELECT jsonb_build_object('qty',quantidade_entregue,'content',quantidade_conteudo,'unit',unidade_conteudo,'ml',volume_entregue_ml,'origin',origem_estoque) FROM public.entregas WHERE id='{delivery}';"))
            assert actual["qty"] == 2 and actual["content"] == per_unit * 2 and actual["unit"] == unit and actual["origin"] == "produto_acabado"
            assert (actual["ml"] is None if unit in ("kg", "g") else actual["ml"] == delivered_ml), actual
            assert B.last(f"SELECT count(*) FROM public.estoque_movimentacoes WHERE referencia_tipo='entrega' AND referencia_id='{delivery}' AND acao='expedicao';") == "1"
            B.ok(f"{group} {unit}: pedido/OS → reserva → baixa; 2 UN = {per_unit * 2} {unit}; volume_ml={expected_ml}", actual)
            replay = json.loads(B.last(B.group(item["os"], reserved, 2, "after-group-" + key, observed)))
            assert replay["replay"] is True
            observed_send = B.last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery}';")
            sent = json.loads(B.last(B.send(delivery, "after-send-" + key, observed_send)))
            assert sent["success"] is True and sent["status"] == "em_rota"
            sent_replay = json.loads(B.last(B.send(delivery, "after-send-" + key, observed_send)))
            assert sent_replay["replay"] is True
            B.prove(delivery, "after-proof-" + key)
            observed_confirm = B.last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery}';")
            confirmed = json.loads(B.last(B.confirm(delivery, "after-confirm-" + key, observed_confirm)))
            assert confirmed["success"] is True and confirmed["status"] == "entregue"
            confirmed_replay = json.loads(B.last(B.confirm(delivery, "after-confirm-" + key, observed_confirm)))
            assert confirmed_replay["replay"] is True
            assert B.last(f"SELECT count(*) FROM public.estoque_movimentacoes WHERE referencia_tipo='entrega' AND referencia_id='{delivery}' AND acao='expedicao';") == "1"
            B.ok(f"{group} {unit}: envio/confirmação/replays idempotentes sem segunda baixa")

        partial = finished("fertilizante", "kg", 25, 3)
        reserved = json.loads(B.last(B.reserve(partial["os"], partial["stock"], 2, "after-reserve-partial")))["itens"][0]
        assert reserved != partial["stock"]
        assert B.last(f"SELECT quantidade=1 AND quantidade_conteudo=25 AND volume_total IS NULL AND embalagem_id='{partial['packaging']}' FROM public.estoque_produto WHERE id='{partial['stock']}';") == "t"
        grouped = json.loads(B.last(B.group(partial["os"], reserved, 2, "after-group-partial")))
        delivery = grouped["itens"][0]["entrega_id"]
        cancelled = json.loads(B.last(B.cancel(delivery, "after-cancel-partial")))
        assert cancelled["success"] is True and cancelled["replay"] is False
        assert B.last(f"SELECT quantidade=3 AND quantidade_conteudo=75 AND volume_total IS NULL AND status='disponivel' FROM public.estoque_produto WHERE id='{partial['stock']}';") == "t"
        assert B.last(f"SELECT quantidade=0 AND quantidade_conteudo=0 AND volume_total IS NULL AND status='estornado' FROM public.estoque_produto WHERE id='{reserved}';") == "t"
        B.ok("parcial 2 de 3 sacos 25 kg: split, cancelamento e merge preservam 75 kg, não litros")

        fractional = finished("quimico", "kg", 25, 2)
        B.reject("0,5 embalagem é negada na reserva whole-pack", B.reserve(fractional["os"], fractional["stock"], 0.5, "after-fractional"), "23514", "FINISHED_PRODUCT_WHOLE_PACK_REQUIRED")
        B.reject("peso não pode ser gravado como volume_total",
                 "SET session_replication_role=replica;" + f"UPDATE public.estoque_produto SET volume_total=50 WHERE id='{fractional['stock']}';SET session_replication_role=origin;", 
                 "23514", "finished_product_unit_contract")

        b2b = finished("quimico", "l", 1, 2)
        partner, order, order_item = B.T.u(3901), B.T.u(3902), B.T.u(3903)
        B.sql("SET session_replication_role=replica;" + f"""
        INSERT INTO public.partner_accounts(id,razao_social,commercial_owner_organization_id) VALUES('{partner}','PARCEIRO TESTE LOCAL','{B.T.A}');
        UPDATE public.organizations SET partner_account_id='{partner}' WHERE id='{B.T.A}';
        INSERT INTO public.partner_orders(id,partner_id,status,financial_status,financial_approval_status,payment_condition_status) VALUES('{order}','{partner}','aprovado','pendente','not_required','approved');
        INSERT INTO public.partner_order_items(id,order_id,product_id,quantidade) VALUES('{order_item}','{order}','{b2b['product']}',2);
        UPDATE public.ordens_servico SET origem='b2b',partner_order_id='{order}',partner_order_item_id='{order_item}',cliente_id=NULL,fazenda_id=NULL,talhao_id=NULL WHERE id='{b2b['os']}';
        SET session_replication_role=origin;
        """)
        items = json.dumps([{"item_id": b2b["stock"], "quantidade": 2}])
        data = json.dumps({"partner_id": partner, "partner_order_id": order})
        reserved = json.loads(B.last(B.T.actor() + f"SELECT public.rpc_estoque_reservar_v1('{b2b['os']}','b2b','{items}'::jsonb,'after-reserve-b2b','{data}'::jsonb);"))["itens"][0]
        B.reject("B2B permanece fechado mesmo com produto acabado válido", B.T.actor() + B.group(b2b["os"], reserved, 2, "after-group-b2b"), "42501", "DELIVERY_SCOPE_DENIED")
        B.ok("nenhuma abertura B2B/OnFarm, fiscal, financeira ou de comunicação")
        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=false WHERE singleton;")
        loaded = B.run_raw((HERE / "postflight.sql.review").read_text())
        assert loaded.returncode == 0, loaded.stderr
        B.ok("POST confirma gate fechado após a bateria")
        status = 0
    except Exception as exc:
        B.ok("FAIL " + str(exc))
    finally:
        out = {"status": "PASS" if status == 0 else "FAIL", "checks": B.CHECKS, "hosted": False, "real_nf_or_receivable": False}
        (RESULTS / "after.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
        print(f"RESULT {sum(x['status'] == 'PASS' for x in B.CHECKS)} / {len(B.CHECKS)} exit {status}")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
