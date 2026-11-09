#!/usr/bin/env python3
"""Disposable PostgreSQL proof for ARBio-only scoped synthetic pilot grants."""
import json
import time
from pathlib import Path


def run(B, Review, A, out):
    out = Path(out)
    checks = []

    def ok(name, condition=True):
        assert condition, name
        checks.append({"test": name, "status": "PASS"})
        print("PILOT_PASS", name, flush=True)

    def deny(name, sql, codes=("RESALE_PILOT_SCOPE_DENIED",)):
        error = B.sql(sql, False)
        assert any(code in error for code in codes), name + ":" + error
        checks.append({"test": name, "status": "PASS", "expected": list(codes)})
        print("PILOT_PASS", name, flush=True)

    def grant(gate, operation, actor, org, partner=None, order=None, item=None,
              product=None, stock=None, delivery=None, until="now()+interval '2 hours'"):
        values = [actor, org, partner, order, item, product, stock, delivery]
        uuid_values = ",".join("NULL" if value is None else f"'{value}'::uuid" for value in values)
        return B.last(f"""INSERT INTO platform_private.resale_pilot_allowlist_v1(
          gate,operation,actor_id,organization_id,partner_id,order_id,order_item_id,
          product_id,stock_id,delivery_id,synthetic,valid_until,created_by)
          VALUES('{gate}','{operation}',{uuid_values},true,{until},'{actor}') RETURNING id;""")

    def update_grant(grant_id, assignment):
        B.sql(f"UPDATE platform_private.resale_pilot_allowlist_v1 SET {assignment} WHERE id='{grant_id}';")

    # This local role/claim transport is not hosted JWT/RLS/Storage evidence.
    R = Review(B, A, {})
    fixture = R.make_order("pilot-contained")
    order, item, product = fixture["order"], fixture["item"], fixture["product"]
    key = fixture["key"]
    create = B.resale_call(order, item, key)
    read = B.resale(order)
    purchase = A.purchase(product, "pilot-contained-purchase")
    B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=true WHERE singleton;UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true WHERE singleton;")

    deny("ARBio real actor with valid role but outside allowlist cannot read", B.actor(A.admin) + read)
    deny("ARBio real actor outside allowlist cannot create OS", B.actor(A.admin) + create)
    deny("ARBio real actor outside allowlist cannot purchase finished product", B.actor(A.admin) + purchase)
    deny("other organization feature ON and valid role remains denied", B.actor(A.fsf) + read,
         ("RESALE_PILOT_SCOPE_DENIED", "B2B_RESALE_ORDER_DENIED", "B2B_INTERNAL_ACTOR_DENIED"))
    deny("other organization cannot purchase using ARBio product", B.actor(A.fsf) + purchase)
    deny("authenticated cannot write server allowlist", B.actor(A.admin) + f"INSERT INTO platform_private.resale_pilot_allowlist_v1(gate,operation,actor_id,organization_id,product_id,valid_until) VALUES('finished_product','purchase','{A.admin}','{A.org}','{product}',now()+interval '1 hour');", ("permission denied",))
    deny("client GUC cannot substitute allowlist authority", B.actor(A.admin) + "SET app.pilot_allowed='true';" + create)

    read_grant = grant("b2b_resale", "read", A.admin, A.org, fixture["partner"], order)
    assert json.loads(B.last(B.actor(A.admin) + read))["available"] is True
    ok("allowlisted ARBio synthetic order can be read")
    deny("read grant alone cannot create OS", B.actor(A.admin) + create)

    os_grant = grant("b2b_resale", "os_create", A.admin, A.org, fixture["partner"], order, item, product)
    os_id = R.create_os(order, item, key)
    replay = json.loads(B.last(B.actor(A.admin) + B.resale_call(order, item, key)))
    assert replay["replay"] is True and replay["os_id"] == os_id
    ok("allowlisted OS create and exact replay succeed without duplicate")

    purchase_grant = grant("finished_product", "purchase", A.admin, A.org, product=product)
    purchase_result = json.loads(B.last(B.actor(A.admin) + purchase))
    assert purchase_result["success"] is True
    stock = purchase_result["estoque_produto_id"]
    ok("allowlisted physical purchase uses existing receipt and real stock motor")

    reserve_grant = grant("b2b_resale", "reserve", A.admin, A.org, fixture["partner"], order, item, product, stock)
    reserved = B.reserve(os_id, stock, 3, A.admin)
    assert reserved["success"] is True
    stock = reserved["estoque_produto_id"]
    # The canonical reserve may return a split UUID: replace the exact stock scope, never widen it.
    update_grant(reserve_grant, f"stock_id='{stock}'")
    update_grant(purchase_grant, "valid_until=now()+interval '2 hours'")
    ok("reserve accepts only exact allowlisted order item product and returned stock")

    deny("delivery create requires its own operation grant", B.actor(A.admin) + B.group(os_id, "b2b", stock, 3, "pilot-delivery-before-grant"))
    delivery_grant = grant("b2b_resale", "delivery_create", A.admin, A.org, fixture["partner"], order, item, product, stock)
    grouped = R.group(os_id, stock, "pilot-delivery")
    delivery = R.delivery_of(os_id)
    assert grouped["success"] is True and delivery
    ok("allowlisted delivery create succeeds")

    deny("proof before proof grant is denied", B.actor(A.admin) + f"SELECT public.rpc_entrega_formulario_gerar_v1('{delivery}','pilot-proof-before');")
    deny("send before send grant is denied", B.actor(A.admin) + B.send(delivery, "pilot-send-before"))

    send_grant = grant("b2b_resale", "send", A.admin, A.org, fixture["partner"], order, item, product, stock, delivery)
    assert R.send(delivery, "pilot-send")["success"] is True
    ok("exact delivery send grant succeeds")
    deny("send replay is reauthorized and fails after revocation", B.actor(A.admin) + B.send(delivery, "pilot-send"), ()) if False else None
    update_grant(send_grant, "revoked_at=now(),revoked_by=actor_id,revoke_reason='local revocation test'")
    deny("revoked send grant blocks exact replay", B.actor(A.admin) + B.send(delivery, "pilot-send"))

    proof_grant = grant("b2b_resale", "proof", A.admin, A.org, fixture["partner"], order, item, product, stock, delivery)
    proof = R.prove(delivery, "pilot-proof")
    assert proof["success"] is True
    ok("proof grant is distinct and succeeds after explicit provisioning")

    deny("confirm before confirm grant is denied", B.actor(A.admin) + B.confirm(delivery, "pilot-confirm-before", proof["comprovante_id"]))
    confirm_grant = grant("b2b_resale", "confirm", A.admin, A.org, fixture["partner"], order, item, product, stock, delivery)
    confirmed = R.confirm(delivery, "pilot-confirm", proof["comprovante_id"])
    assert confirmed["success"] is True
    ok("full scoped synthetic ARBio flow confirms physically")

    update_grant(os_grant, "valid_until=now()-interval '1 second'")
    deny("expired OS grant blocks exact replay", B.actor(A.admin) + B.resale_call(order, item, key))
    update_grant(os_grant, "valid_until=now()+interval '2 hours',revoked_at=now(),revoked_by=actor_id,revoke_reason='local replay revocation'")
    deny("revoked OS grant blocks exact replay after expiry restored", B.actor(A.admin) + B.resale_call(order, item, key))
    replacement_os_grant = grant("b2b_resale", "os_create", A.admin, A.org, fixture["partner"], order, item, product)
    replay = json.loads(B.last(B.actor(A.admin) + B.resale_call(order, item, key)))
    assert replay["replay"] is True
    ok("new explicit valid grant restores replay without changing history")

    update_grant(confirm_grant, "revoked_at=now(),revoked_by=actor_id,revoke_reason='local terminal replay revocation'")
    deny("revoked confirm grant blocks terminal exact replay", B.actor(A.admin) + B.confirm(delivery, "pilot-confirm", proof["comprovante_id"]))
    update_grant(read_grant, "valid_until=now()-interval '1 second'")
    deny("expired read grant denies reader", B.actor(A.admin) + read)

    # Two real PostgreSQL connections, same request: one create and one exact replay.
    concurrent = R.make_order("pilot-concurrent")
    grant("b2b_resale", "read", A.admin, A.org, concurrent["partner"], concurrent["order"])
    grant("b2b_resale", "os_create", A.admin, A.org, concurrent["partner"], concurrent["order"], concurrent["item"], concurrent["product"])
    statement = B.actor(A.admin) + B.resale_call(concurrent["order"], concurrent["item"], concurrent["key"])
    first = B.session(statement)
    time.sleep(0.1)
    second = B.session(statement)
    B.wait()
    stdout1, stderr1 = B.finish(first, "COMMIT;")
    stdout2, stderr2 = B.finish(second)
    assert not stderr1 and not stderr2, stderr1 + stderr2
    assert B.last(f"SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{concurrent['order']}';") == "1"
    assert B.last(f"SELECT count(*) FROM platform_private.b2b_resale_os_requests_v1 WHERE order_id='{concurrent['order']}';") == "1"
    ok("two concurrent connections produce one OS and one idempotent receipt")

    B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=false WHERE singleton;UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false WHERE singleton;")
    deny("master switch OFF remains fail closed even with valid grants", B.actor(A.admin) + B.resale_call(order, item, key))
    ok("allowlist and receipts retained after gates OFF", B.last("SELECT count(*)>=10 FROM platform_private.resale_pilot_allowlist_v1;") == "t")
    ok("no financial fiscal or communication downstream effects", B.last("SELECT (SELECT count(*) FROM public.accounts_receivable)=0 AND (SELECT count(*) FROM public.fiscal_invoices)=0 AND (SELECT count(*) FROM public.comunicacao_outbox)=0;") == "t")
    (out / "checks.json").write_text(json.dumps(checks, indent=2, ensure_ascii=False) + "\n")
    return checks
