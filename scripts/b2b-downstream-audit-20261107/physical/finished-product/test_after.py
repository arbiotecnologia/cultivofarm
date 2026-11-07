#!/usr/bin/env python3
"""Compra para revenda e downstream físico; somente PostgreSQL descartável."""
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("finished_before", HERE / "test_pg.py")
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)
RESULTS = HERE / "evidence"
RESULTS.mkdir(exist_ok=True)
NEW_FUNCTIONS = [
    "platform_private.finished_product_stock_valid_v1(public.estoque_produto)",
    "platform_private.finished_product_delivery_valid_v1(public.estoque_produto,public.entregas,public.lotes)",
    "platform_private.finished_product_purchase_entry_v1(uuid,uuid,text,numeric,text,text,text,date)",
]


def catalog_item(group, unit, per_unit, owner=None):
    """Cria somente catálogo e demanda; lote/estoque nascem na compra."""
    B.SEQUENCE += 1
    n = 5000 + B.SEQUENCE * 10
    product, packaging, os_id = [B.T.u(n + i) for i in range(1, 4)]
    owner = owner or B.T.A
    kind = "solo" if group == "fertilizante" else "inseticida"
    family = "fertilizante_adubo" if group == "fertilizante" else "quimico"
    solid = unit in ("kg", "g")
    volume_ml = None if solid else per_unit * (1000 if unit == "l" else 1)
    weight_kg = per_unit / (1000 if unit == "g" else 1) if solid else None
    B.sql("SET session_replication_role=replica;" + f"""
    INSERT INTO public.produtos(id,nome,tipo,codigo,familia_catalogo,owner_organization_id)
      VALUES('{product}','{group.upper()} {unit} COMPRA TESTE LOCAL','{kind}','BUY-{n}','{family}','{owner}');
    INSERT INTO public.product_sale_units(product_id,owner_organization_id,unidade_conteudo,forma_fisica,version)
      VALUES('{product}','{owner}','{unit}','{'solido' if solid else 'liquido'}',1);
    INSERT INTO public.catalogo_volumes(id,item_tipo,produto_id,volume_ml,rotulo,preco_brl,ativo,owner_organization_id,medida)
      VALUES('{packaging}','produto','{product}',{'NULL' if volume_ml is None else volume_ml},'{per_unit} {unit}',0,true,'{owner}','{'embalagem' if solid else 'volume'}');
    {f"INSERT INTO public.product_packagings(id,product_id,owner_organization_id,codigo,descricao,peso_liquido_kg,version,ativo) VALUES('{packaging}','{product}','{owner}','PACK-{n}','Embalagem {per_unit} {unit}',{weight_kg},1,true);" if solid else ''}
    INSERT INTO public.ordens_servico(id,organization_id,cliente_id,fazenda_id,talhao_id,produto_id,origem,status,numero_os)
      VALUES('{os_id}','{B.T.A}','{B.T.C}','{B.T.u(18)}','{B.T.u(20)}','{product}','agronomica','pronto_entrega','BUY-{n}');
    SET session_replication_role=origin;
    """)
    return {"name": group, "unit_lower": unit, "per_unit": per_unit, "product": product,
            "packaging": packaging, "packaging_version": 1, "os": os_id, "owner": owner, "sequence": n}


def purchase(item, quantity, key, internal=True, actor=None):
    actor = actor or B.T.U
    call = f"""SELECT platform_private.finished_product_purchase_entry_v1(
      '{item['product']}','{item['packaging']}','LOTE-{key}',{quantity},
      'COMPRA-{key}','FORNECEDOR FICTICIO {key}','{key}','2028-12-31');"""
    prefix = f"RESET ROLE; SET request.jwt.claim.sub='{actor}'; SET request.jwt.claims='{{\"sub\":\"{actor}\",\"iat\":1}}';" if internal else B.T.actor(actor)
    return prefix + call


def finished(group, unit, per_unit, quantity=2):
    item = catalog_item(group, unit, per_unit)
    key = f"purchase-entry-{item['sequence']}"
    received = json.loads(B.last(purchase(item, quantity, key)))
    assert received["ok"] is True and received["replay"] is False
    item.update({"lot": received["lote_id"], "stock": received["estoque_produto_id"],
                 "movement": received["movimentacao_id"], "quantity": quantity, "purchase_key": key})
    assert B.last(f"""SELECT l.programacao_id IS NULL AND l.volume_produzido IS NULL AND l.microrganismo_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.envase e WHERE e.lote_id=l.id)
      AND NOT EXISTS(SELECT 1 FROM public.controle_qualidade q WHERE q.lote_id=l.id)
      FROM public.lotes l WHERE l.id='{item['lot']}';""") == "t"
    B.ok(f"{group} {unit}: compra/entrada canônica cria lote e {quantity} UN sem bioreator, CQ ou envase", received)
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
        signatures = [x["signature"] for x in baseline["functions"]] + NEW_FUNCTIONS
        values = ",".join("('" + x.replace("'", "''") + "')" for x in signatures)
        post_functions = json.loads(B.last(f"""SELECT coalesce(jsonb_agg(jsonb_build_object('signature',v.signature,'md5',md5(pg_get_functiondef(p.oid)),'owner',r.rolname,'acl',coalesce(p.proacl::text,'')) ORDER BY v.signature),'[]'::jsonb) FROM (VALUES {values}) v(signature) JOIN pg_proc p ON p.oid=to_regprocedure(v.signature) JOIN pg_roles r ON r.oid=p.proowner;"""))
        assert len(post_functions) == len(signatures)
        (RESULTS / "post-install-functions.json").write_text(json.dumps({"source": "disposable_post_install", "functions": post_functions}, ensure_ascii=False, indent=2) + "\n")
        assert B.last("SELECT enabled FROM platform_private.finished_product_gate_v1 WHERE singleton;") == "f"
        B.ok("instalação permanece operacionalmente desligada")

        closed = catalog_item("quimico", "kg", 25)
        B.reject("aplicativo não tem EXECUTE na entrada privada de compra", purchase(closed, 2, "purchase-acl-closed", internal=False), "42501", "permission denied for function finished_product_purchase_entry_v1")
        B.reject("gate fechado nega compra/entrada interna", purchase(closed, 2, "purchase-gate-closed"), "42501", "FINISHED_PRODUCT_GATE_CLOSED")
        B.reject("aplicativo não pode forjar ticket de compra", B.T.actor() + "INSERT INTO platform_private.authz_tickets(txid,scope,target) VALUES(txid_current(),'finished_product_purchase_entry_v1',gen_random_uuid());", "42501", "permission denied for table authz_tickets")
        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=true WHERE singleton;")

        foreign = catalog_item("quimico", "kg", 25, owner=B.T.B)
        B.reject("produto de outro tenant é negado antes de criar lote/estoque", purchase(foreign, 2, "purchase-foreign"), "42501", "FINISHED_PRODUCT_CATALOG_DENIED")
        fractional_entry = catalog_item("fertilizante", "kg", 25)
        B.reject("compra de 0,5 embalagem é negada", purchase(fractional_entry, 0.5, "purchase-fractional"), "23514", "FINISHED_PRODUCT_WHOLE_PACK_REQUIRED")

        first_item = None
        for group, unit, per_unit in (("quimico", "kg", 25), ("fertilizante", "g", 25000), ("quimico", "l", 1), ("fertilizante", "ml", 500)):
            item = finished(group, unit, per_unit)
            if first_item is None:
                first_item = item
            key = group + "-" + unit
            assert B.last(f"SELECT acao='entrada' AND origem='finished_product_purchase_entry_v1' AND quantidade=2 AND metadata->>'origem_estoque'='compra_produto_acabado_revenda' FROM public.estoque_movimentacoes WHERE id='{item['movement']}';") == "t"
            reserved = json.loads(B.last(B.reserve(item["os"], item["stock"], 2, "after-reserve-" + key)))["itens"][0]
            observed = (B.last(f"SELECT updated_at FROM public.ordens_servico WHERE id='{item['os']}';"), B.last(f"SELECT updated_at FROM public.estoque_produto WHERE id='{reserved}';"))
            grouped = json.loads(B.last(B.group(item["os"], reserved, 2, "after-group-" + key, observed)))
            delivery = grouped["itens"][0]["entrega_id"]
            delivered_ml = per_unit * 2 * (1000 if unit == "l" else 1)
            expected_ml = "NULL" if unit in ("kg", "g") else str(delivered_ml)
            actual = json.loads(B.last(f"SELECT jsonb_build_object('qty',quantidade_entregue,'content',quantidade_conteudo,'unit',unidade_conteudo,'ml',volume_entregue_ml,'origin',origem_estoque) FROM public.entregas WHERE id='{delivery}';"))
            assert actual["qty"] == 2 and actual["content"] == per_unit * 2 and actual["unit"] == unit and actual["origin"] == "compra_produto_acabado_revenda"
            assert (actual["ml"] is None if unit in ("kg", "g") else actual["ml"] == delivered_ml), actual
            assert B.last(f"SELECT count(*) FROM public.estoque_movimentacoes WHERE referencia_tipo='entrega' AND referencia_id='{delivery}' AND acao='expedicao';") == "1"
            B.ok(f"{group} {unit}: compra → reserva → baixa; 2 UN = {per_unit * 2} {unit}; volume_ml={expected_ml}", actual)
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
            B.ok(f"{group} {unit}: expedição/entrega/replays sem fabricação e sem segunda baixa")

        replayed = json.loads(B.last(purchase(first_item, 2, first_item["purchase_key"])))
        assert replayed["replay"] is True and replayed["estoque_produto_id"] == first_item["stock"]
        assert B.last(f"SELECT (SELECT count(*) FROM public.estoque_produto WHERE id='{first_item['stock']}')=1 AND (SELECT count(*) FROM public.estoque_movimentacoes WHERE idempotency_key='{first_item['purchase_key']}')=1;") == "t"
        B.ok("replay exato da compra retorna o mesmo lote/estoque sem duplicar entrada")
        B.reject("mesma chave de compra com quantidade diversa conflita", purchase(first_item, 3, first_item["purchase_key"]), "23505", "FINISHED_PRODUCT_IDEMPOTENCY_CONFLICT")

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
        partner, order, order_item = B.T.u(8901), B.T.u(8902), B.T.u(8903)
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
        B.reject("B2B permanece fechado mesmo com compra e produto acabado válidos", B.T.actor() + B.group(b2b["os"], reserved, 2, "after-group-b2b"), "42501", "DELIVERY_SCOPE_DENIED")
        B.ok("nenhuma abertura B2B/OnFarm, fiscal, financeira ou de comunicação")

        waited = catalog_item("quimico", "kg", 25)
        wait_key = "purchase-revocation-wait"
        holder = B.T.session(f"BEGIN;SELECT pg_advisory_xact_lock(hashtext('finished_product_purchase:{wait_key}'));")
        worker = B.T.session(purchase(waited, 2, wait_key))
        B.T.wait()
        B.T.finish(holder, f"UPDATE public.profiles SET ativo=false WHERE user_id='{B.T.U}';COMMIT;")
        _, err = B.T.finish(worker)
        assert "ESTQ_IDENTIDADE_INATIVA" in err or "ESTQ_NAO_AUTENTICADO" in err, err
        B.sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{B.T.U}';")
        assert B.last("SELECT count(*) FROM public.lotes WHERE codigo_lote='LOTE-purchase-revocation-wait';") == "0"
        B.ok("revogação durante espera da compra é revalidada antes de criar lote/estoque")

        concurrent = catalog_item("fertilizante", "g", 25000)
        concurrent_key = "purchase-concurrent-replay"
        holder = B.T.session("BEGIN;" + purchase(concurrent, 2, concurrent_key))
        worker = B.T.session(purchase(concurrent, 2, concurrent_key))
        B.T.wait()
        holder_out, holder_err = B.T.finish(holder, "COMMIT;")
        out, err = B.T.finish(worker)
        combined = holder_out + "\n" + out
        assert not holder_err and not err, holder_out + holder_err + out + err
        assert combined.count('"replay": false') == 1 and combined.count('"replay": true') == 1, combined
        assert B.last("SELECT (SELECT count(*) FROM public.lotes WHERE codigo_lote='LOTE-purchase-concurrent-replay')=1 AND (SELECT count(*) FROM public.estoque_movimentacoes WHERE idempotency_key='purchase-concurrent-replay')=1;") == "t"
        B.ok("duas compras concorrentes com a mesma chave geram uma única entrada e replay")

        B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=false WHERE singleton;")
        loaded = B.run_raw((HERE / "postflight.sql.review").read_text())
        assert loaded.returncode == 0, loaded.stderr
        B.ok("POST confirma gate fechado após a bateria")
        historical_counts = B.last("SELECT jsonb_build_array((SELECT count(*) FROM public.lotes),(SELECT count(*) FROM public.estoque_produto),(SELECT count(*) FROM public.entregas),(SELECT count(*) FROM public.estoque_movimentacoes))::text;")
        rolled_back = B.run_raw((HERE / "rollback.sql.review").read_text())
        assert rolled_back.returncode == 0, rolled_back.stderr
        B.ok("rollback deny-only executa sem restaurar grants ou apagar objetos")
        B.reject("compra após rollback permanece fechada", purchase(first_item, 2, "purchase-after-rollback"), "42501", "FINISHED_PRODUCT_GATE_CLOSED")
        assert B.last("SELECT jsonb_build_array((SELECT count(*) FROM public.lotes),(SELECT count(*) FROM public.estoque_produto),(SELECT count(*) FROM public.entregas),(SELECT count(*) FROM public.estoque_movimentacoes))::text;") == historical_counts
        B.ok("rollback preserva compras, estoque, entregas e histórico integralmente")
        # O POST de instalação não é reaplicado após o rollback: a revogação intencional muda o ACL.
        status = 0
    except Exception as exc:
        import traceback
        B.ok("FAIL " + str(exc) + "\n" + traceback.format_exc())
    finally:
        out = {"status": "PASS" if status == 0 else "FAIL", "checks": B.CHECKS, "hosted": False,
               "real_nf_or_receivable": False, "purchase_origin": "compra_produto_acabado_revenda",
               "synthetic_seams": ["Auth/claims e chamada interna privilegiada somente no PG descartável",
                                    "schema de catálogo atual reconciliado na captura antiga; sem writers Owned ou preços",
                                    "produtos/demanda/comprovantes fictícios; entrada e downstream com triggers reais"]}
        (RESULTS / "after.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
        print(f"RESULT {sum(x['status'] == 'PASS' for x in B.CHECKS)} / {len(B.CHECKS)} exit {status}")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
