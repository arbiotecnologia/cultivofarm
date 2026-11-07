#!/usr/bin/env python3
"""Reprodução física de produtos acabados em PostgreSQL descartável.

Nunca hosted. Usa a composição capturada já testada, writers/gatilhos reais e
fixtures upstream sintéticas explícitas. Não força químicos/fertilizantes por
bioreator/CQ/envase e não emite NF, cobrança ou comunicação.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import time
import traceback
import uuid

H = Path(__file__).resolve().parent
ROOT = H.parents[3]
S = ROOT / "scripts"
ATOMIC = S / "delivery-atomic-hardening-20261030"
CONF = ATOMIC / "confirmation"
OUT = H / "evidence"
sys.path.insert(0, str(ATOMIC))
sys.path.insert(0, str(H))
import restore
from restore import pg
import test_pg as T
from catalog_foundation import apply as apply_current_catalog
spec = importlib.util.spec_from_file_location("finished_confirmation", CONF / "test_pg.py")
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)

CHECKS = []
RAW = []
SEQUENCE = 0


def ok(name, detail=None):
    row = {"name": name, "status": "PASS"}
    if detail is not None:
        row["detail"] = detail
    CHECKS.append(row)
    print("PASS", name, flush=True)


def fail(name, detail):
    CHECKS.append({"name": name, "status": "FAIL", "detail": str(detail)[:4000]})
    print("FAIL", name, str(detail)[:800], flush=True)


def sql(statement):
    return pg.sql(statement)


def last(statement):
    return sql(statement).splitlines()[-1]


def run_raw(statement):
    result = subprocess.run(pg.psql(), input="\\set VERBOSITY verbose\n" + statement,
                            capture_output=True, text=True, timeout=45)
    return result


def reject(name, statement, code, message=None):
    result = run_raw(statement)
    RAW.append({"name": name, "returncode": result.returncode,
                "stdout": result.stdout[-4000:], "stderr": result.stderr[-4000:]})
    good = result.returncode != 0 and re.search(r"ERROR:\s+" + re.escape(code) + r":", result.stderr)
    if message:
        good = good and message in result.stderr
    if not good:
        raise AssertionError(name + " :: " + result.stdout[-1000:] + result.stderr[-2000:])
    ok(name, message or code)


def restore_checkpoint():
    cached = Path("/tmp/delivery-confirmation/applied-fixture.sql")
    assert cached.is_file() and cached.is_relative_to(Path("/tmp"))
    pg.start()
    metadata = restore.metadata()
    roles = {r["name"] for r in metadata["roles"]} | {"supabase_admin"}
    for item in metadata["relations"] + metadata["functions"] + metadata["schemas"]:
        roles.add(item["owner"])
    for item in metadata["policies"]:
        roles.update(item["roles"])
    for entry in (x.get("acl") or "" for x in metadata["relations"] + metadata["functions"] + metadata["schemas"]):
        for acl in entry.strip("{}").split(","):
            if "=" in acl:
                roles.update([acl.split("=")[0], acl.split("/")[-1]])
    for role in sorted(roles - {"", "postgres", "pg_database_owner", "public"}):
        sql('CREATE ROLE "' + role.replace('"', '""') + '";')
    for role in metadata["roles"]:
        if role["name"] != "postgres":
            sql('ALTER ROLE "' + role["name"] + '" ' + ("BYPASSRLS" if role["bypassrls"] else "NOBYPASSRLS") + ";")
    sql(cached.read_text())
    ok("checkpoint descartável da composição capturada restaurado", hashlib.sha256(cached.read_bytes()).hexdigest())
    # Mesma geração determinística do harness de confirmação; nenhum PRE é removido.
    pre = C.state()
    delta = C.G.candidate()
    measured = sql("BEGIN;" + delta + C.G.STATE + "::text;ROLLBACK;")
    post = json.loads([x for x in measured.splitlines() if x.startswith("{")][-1])
    released = json.loads([x for x in sql("BEGIN;" + delta + f"GRANT EXECUTE ON FUNCTION {C.G.RPC} TO authenticated;" + C.G.STATE + "::text;ROLLBACK;").splitlines() if x.startswith("{")][-1])
    C.G.write(pre, post, released)
    loaded = run_raw((CONF / "install.sql.review").read_text())
    if loaded.returncode != 0:
        raise AssertionError("CONFIRM_INSTALL_PIN_FAILED\n" + loaded.stdout[-3000:] + loaded.stderr[-8000:])
    send_spec = importlib.util.spec_from_file_location("finished_send_generator", CONF / "send/assemble.py")
    send_generator = importlib.util.module_from_spec(send_spec)
    send_spec.loader.exec_module(send_generator)
    send_pre = json.loads(last(send_generator.STATE + "::text;"))
    send_post = json.loads([x for x in sql("BEGIN;" + send_generator.candidate() + send_generator.STATE + "::text;ROLLBACK;").splitlines() if x.startswith("{")][-1])
    send_generator.write(send_pre, send_post)
    loaded = run_raw((CONF / "send/install.sql.review").read_text())
    if loaded.returncode != 0:
        raise AssertionError("SEND_INSTALL_PIN_FAILED\n" + loaded.stdout[-3000:] + loaded.stderr[-8000:])
    # Ativação exclusivamente no harness; os artefatos de release permanecem fechados.
    sql("GRANT EXECUTE ON FUNCTION public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb),public.rpc_entrega_enviar_manual_v1(uuid,timestamptz,text) TO authenticated;")
    ok("writers de confirmação/envio ativados somente no PostgreSQL descartável")
    # Costura exclusivamente local da captura antiga com o catálogo exclusivo atual.
    apply_current_catalog(sql, T.A)


def group(os_id, stock_id, quantity, key, observed=None):
    observed_os = (observed[0] if observed else None) or last(f"SELECT updated_at FROM public.ordens_servico WHERE id='{os_id}';")
    observed_stock = (observed[1] if observed else None) or last(f"SELECT updated_at FROM public.estoque_produto WHERE id='{stock_id}';")
    items = [{"item_id": stock_id, "quantidade": quantity, "observed_updated_at": observed_stock}]
    return T.actor() + "SELECT public.rpc_cockpit_criar_entrega_v1('%s','manual','%s'::jsonb,'%s','{}'::jsonb,'%s'::timestamptz);" % (
        os_id, json.dumps(items), key, observed_os)


def reserve(os_id, stock_id, quantity, key):
    payload = json.dumps({"cliente_id": T.C})
    items = json.dumps([{"item_id": stock_id, "quantidade": quantity}])
    return T.actor() + f"SELECT public.rpc_estoque_reservar_v1('{os_id}','manual','{items}'::jsonb,'{key}','{payload}'::jsonb);"


def prove(delivery_id, key):
    generated = json.loads(last(T.actor() + f"SELECT public.rpc_entrega_formulario_gerar_v1('{delivery_id}','finished-generate-{key}');"))
    assert generated["success"] is True
    path = f"entregas/{delivery_id}/comprovantes/{uuid.uuid4()}.pdf"
    sql(f"INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('entrega-documentos','{path}','{T.U}','{T.U}');")
    payload = json.dumps({"arquivo_path": path, "arquivo_nome": "local.pdf", "arquivo_mime": "application/pdf", "recebedor_nome": "LOCAL"})
    attached = json.loads(last(T.actor() + f"SELECT public.rpc_entrega_comprovante_anexar_v1('{delivery_id}','finished-proof-{key}','{payload}'::jsonb);"))
    assert attached["success"] is True


def confirm(delivery_id, key, observed=None):
    observed = observed or last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery_id}';")
    return T.actor() + f"SELECT public.rpc_entrega_confirmar_manual_v1('{delivery_id}','{observed}','finished-confirm-{key}','{{\"nome\":\"LOCAL\"}}'::jsonb);"


def send(delivery_id, key, observed=None):
    observed = observed or last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery_id}';")
    return T.actor() + f"SELECT public.rpc_entrega_enviar_manual_v1('{delivery_id}','{observed}','finished-send-{key}');"


def cancel(delivery_id, key):
    observed = last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery_id}';")
    return T.actor() + f"SELECT public.rpc_entrega_cancelar_v1('{delivery_id}','LOCAL {key}','{observed}'::timestamptz);"


def fixture(group_name, unit, volume, quantity=2):
    global SEQUENCE
    SEQUENCE += 1
    n = 1100 + SEQUENCE * 10
    product, lot, stock, os_id = [T.u(n + i) for i in range(4)]
    kind = "solo" if group_name == "fertilizante" else "inseticida"
    family = "fertilizante_adubo" if group_name == "fertilizante" else "quimico"
    # Apenas montagem upstream: produto acabado não passa por bioreator/CQ/envase.
    # Os writers sob teste executam depois, com session_replication_role=origin.
    sql("SET session_replication_role=replica;" + f"""
    INSERT INTO public.produtos(id,nome,tipo,codigo,familia_catalogo,owner_organization_id) VALUES('{product}','{group_name.upper()} {unit} TESTE LOCAL','{kind}','FIN-{n}','{family}','{T.A}');
    INSERT INTO public.ordens_servico(id,organization_id,cliente_id,fazenda_id,talhao_id,produto_id,origem,status,numero_os)
      VALUES('{os_id}','{T.A}','{T.C}','{T.u(18)}','{T.u(20)}','{product}','agronomica','pronto_entrega','FIN-{n}');
    INSERT INTO public.lotes(id,organization_id,produto_id,status,codigo_lote,volume_produzido)
      VALUES('{lot}','{T.A}','{product}','aprovado','FIN-LOT-{n}',NULL);
    INSERT INTO public.estoque_produto(id,lote_id,produto_id,quantidade,volume_total,status)
      VALUES('{stock}','{lot}','{product}',{quantity},{'NULL' if volume is None else volume},'disponivel');
    SET session_replication_role=origin;
    """)
    return {"name": group_name, "unit": unit, "product": product, "lot": lot, "stock": stock, "os": os_id, "quantity": quantity}


def main():
    status = 1
    started = time.monotonic()
    try:
        assert pg.root.is_relative_to(Path("/tmp")) and pg.psql()[3] == str(pg.root)
        restore_checkpoint()
        # A entrada direta sem envase é negada: não existe writer de produto acabado neste recorte.
        probe = fixture("quimico", "kg", None)
        direct = "CREATE TABLE public.local_finished_entry_probe(LIKE public.estoque_produto INCLUDING DEFAULTS);" + \
                 "CREATE TRIGGER local_validate_entry BEFORE INSERT ON public.local_finished_entry_probe FOR EACH ROW EXECUTE FUNCTION public.validate_estoque_entrada();" + \
                 f"INSERT INTO public.local_finished_entry_probe(id,lote_id,produto_id,quantidade,volume_total,status) VALUES('{T.u(1999)}','{probe['lot']}','{probe['product']}',2,NULL,'disponivel');"
        reject("função real de entrada exige envase quando não há writer de produto acabado", direct, "23514", "não possui registro de envase")
        sql("DROP TABLE public.local_finished_entry_probe;")

        # Dois sólidos: reserva real e limite exato do agrupamento por volume obrigatório.
        solids = [fixture("quimico", "kg", None), fixture("fertilizante", "g", None)]
        for item in solids:
            result = json.loads(last(reserve(item["os"], item["stock"], 2, "finished-reserve-" + item["name"])))
            assert result["ok"] is True and result["replay"] is False
            reserved = result["itens"][0]
            ok(item["name"] + ": pedido/OS → reserva canônica de 2 embalagens sem envase", reserved)
            reject(item["name"] + ": entrega sem unidade de conteúdo é fechada antes da baixa",
                   T.actor() + group(item["os"], reserved, 2, "finished-group-" + item["name"]),
                   "P0001", "COCKPIT_ENTREGA_VOLUME_ESTOQUE_INVALIDO")
            ok(item["name"] + ": nenhuma entrega/movimento de expedição após a negação",
               last(f"SELECT (SELECT count(*) FROM public.entregas WHERE ordem_servico_id='{item['os']}')=0 AND (SELECT count(*) FROM public.estoque_movimentacoes WHERE referencia_tipo='entrega' AND referencia_id IN (SELECT id FROM public.entregas WHERE ordem_servico_id='{item['os']}'))=0;") == "t")

        # Demonstra por que volume_total não pode receber kg: o writer atual o transforma em ml.
        ambiguous = fixture("fertilizante", "kg", 50)
        reserved = json.loads(last(reserve(ambiguous["os"], ambiguous["stock"], 2, "finished-reserve-ambiguous")))["itens"][0]
        grouped = json.loads(last(group(ambiguous["os"], reserved, 2, "finished-group-ambiguous")))
        delivery = grouped["itens"][0]["entrega_id"]
        delivered = json.loads(last(f"SELECT jsonb_build_object('quantity',quantidade_entregue,'volume_ml',volume_entregue_ml) FROM public.entregas WHERE id='{delivery}';"))
        assert delivered == {"quantity": 2, "volume_ml": 50000}
        ok("REPRODUZIDO: 50 kg em volume_total viram 50.000 ml; peso não é unidade válida", delivered)

        # Apresentação líquida canônica: 2 unidades de 1 L = volume_total 2 L.
        liquid = fixture("quimico", "L", 2)
        reserved = json.loads(last(reserve(liquid["os"], liquid["stock"], 2, "finished-reserve-liquid")))["itens"][0]
        grouped = json.loads(last(group(liquid["os"], reserved, 2, "finished-group-liquid")))
        delivery = grouped["itens"][0]["entrega_id"]
        assert last(f"SELECT quantidade_entregue=2 AND volume_entregue_ml=2000 FROM public.entregas WHERE id='{delivery}';") == "t"
        ok("apresentação L: pedido/OS → reserva → baixa com 2 UN e 2.000 ml", delivery)
        reject("apresentação L acabada: envio exige programação de produção inexistente",
               send(delivery, "liquid"), "42501", "DELIVERY_SEND_LINEAGE_DENIED")
        prove(delivery, "liquid")
        reject("apresentação L acabada: confirmação também não aceita lineage sem produção",
               confirm(delivery, "liquid"), "42501")

        liquid_cancel = fixture("fertilizante", "L", 2)
        reserved = json.loads(last(reserve(liquid_cancel["os"], liquid_cancel["stock"], 2, "finished-reserve-liquid-cancel")))["itens"][0]
        grouped = json.loads(last(group(liquid_cancel["os"], reserved, 2, "finished-group-liquid-cancel")))
        delivery_cancel = grouped["itens"][0]["entrega_id"]
        cancelled = json.loads(last(cancel(delivery_cancel, "liquid-cancel")))
        assert cancelled["success"] is True and cancelled["replay"] is False
        assert last(f"SELECT status::text FROM public.entregas WHERE id='{delivery_cancel}';") == "cancelada"
        ok("apresentação L: cancelamento canônico recompõe estoque sem efeitos fiscais/financeiros")

        # B2B continua fechado no writer atual, mesmo com pedido aprovado fictício.
        b2b = fixture("quimico", "L", 2)
        partner, order, order_item = T.u(1901), T.u(1902), T.u(1903)
        sql("SET session_replication_role=replica;" + f"""
        INSERT INTO public.partner_accounts(id,razao_social,commercial_owner_organization_id) VALUES('{partner}','PARCEIRO TESTE LOCAL','{T.A}');
        UPDATE public.organizations SET partner_account_id='{partner}' WHERE id='{T.A}';
        INSERT INTO public.partner_orders(id,partner_id,status,financial_status,financial_approval_status,payment_condition_status)
          VALUES('{order}','{partner}','aprovado','pendente','not_required','approved');
        INSERT INTO public.partner_order_items(id,order_id,product_id,quantidade) VALUES('{order_item}','{order}','{b2b['product']}',2);
        UPDATE public.ordens_servico SET origem='b2b',partner_order_id='{order}',partner_order_item_id='{order_item}',cliente_id=NULL,fazenda_id=NULL,talhao_id=NULL WHERE id='{b2b['os']}';
        SET session_replication_role=origin;
        """)
        b2b_items = json.dumps([{"item_id": b2b["stock"], "quantidade": 2}])
        b2b_data = json.dumps({"partner_id": partner, "partner_order_id": order})
        reserved = json.loads(last(T.actor() + f"SELECT public.rpc_estoque_reservar_v1('{b2b['os']}','b2b','{b2b_items}'::jsonb,'finished-reserve-b2b','{b2b_data}'::jsonb);"))["itens"][0]
        ok("reserva B2B usa vínculos canônicos próprios sem abrir entrega", reserved)
        reject("pedido B2B aprovado permanece contido no agrupamento físico",
               T.actor() + group(b2b["os"], reserved, 2, "finished-group-b2b"), "42501", "DELIVERY_SCOPE_DENIED")
        ok("gate B2B não foi aberto nem substituído pela prova manual")

        status = 0 if all(x["status"] == "PASS" for x in CHECKS) else 1
    except Exception as exc:
        fail("execução terminou no ponto concreto", traceback.format_exc())
        status = 1
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        evidence = {
            "kind": "DISPOSABLE_FINISHED_PRODUCT_REPRODUCTION_NOT_HOSTED_E2E",
            "phase": "before",
            "status": "PASS" if status == 0 else "FAIL",
            "exit_code": status,
            "passed": sum(x["status"] == "PASS" for x in CHECKS),
            "total": len(CHECKS),
            "checks": CHECKS,
            "raw": RAW,
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "synthetic_seams": [
                "Auth por claims/GUC locais, sem JWT/RLS/PostgREST/Storage real",
                "fixtures upstream com session_replication_role=replica; writers testados com triggers habilitados",
                "lotes de produto acabado sem bioreator/CQ/envase; sem cadastro paralelo",
                "ativação de writers exclusivamente no PostgreSQL descartável",
                "comprovante fictício local; nenhum documento fiscal/cobrança/envio externo",
            ],
            "findings": {
                "finished_stock_entry": "validate_estoque_entrada exige envase; não há entrada canônica aberta para produto acabado neste recorte",
                "solid_reservation": "reserva por quantidade funciona, mas entrega exige volume_total e não possui unidade de conteúdo",
                "weight_as_volume": "volume_total=50 em produto kg gera volume_entregue_ml=50000",
                "liquid_path": "apresentação L usa volume_total em litros e volume_entregue_ml em mililitros",
                "b2b_group": "DELIVERY_SCOPE_DENIED preservado; nenhum gate B2B aberto",
            },
        }
        (OUT / "before.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
        print("RESULT", evidence["passed"], "/", evidence["total"], "exit", status, flush=True)
    return status


if __name__ == "__main__":
    sys.exit(main())
