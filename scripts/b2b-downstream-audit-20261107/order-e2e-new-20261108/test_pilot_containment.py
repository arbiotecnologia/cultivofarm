#!/usr/bin/env python3
"""Disposable PostgreSQL proof for ARBio-only scoped synthetic pilot grants."""
import json
import time
from pathlib import Path


def run(B, Review, Q, A, choice, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    checks = []

    def ok(name, condition=True):
        assert condition, name
        checks.append({"test": name, "status": "PASS"})
        print("PILOT_PASS", name, flush=True)

    def deny(name, sql, codes=("RESALE_PILOT_SCOPE_DENIED",)):
        result = B.run_raw(sql)
        assert result.returncode != 0 and any(code in result.stderr for code in codes), name + ":" + result.stdout[-1000:] + result.stderr[-2500:]
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

    def reader(order, actor=Q.UADM):
        return B.T.actor(actor) + f"SELECT public.rpc_b2b_resale_os_availability_v1('{order}');"

    # SQL roles/claims are synthetic transport only: never hosted JWT/RLS/Storage proof.
    R = Review(B, Q, A, choice, {})
    R.sequence = int(time.time() * 1000) % 100000000
    fixture = R.make_order([Q.S(3)], "pilot-contained")
    run_id = fixture["journal"]["key"][:16]
    order, item = fixture["id"], fixture["items"][0]
    item_id, product = item["id"], item["product_id"]
    os_key = f"pilot-os-create-{run_id}"
    create = R.os_create_sql(order, item_id, fixture["accepted"]["updated_at"], os_key)
    purchase_key = f"pilot-purchase-{run_id}"
    purchase = A.purchase({"product": product, "packaging": item["packaging_id_snapshot"]}, 3, purchase_key, actor=Q.UADM)
    before = B.last("SELECT jsonb_build_array((SELECT count(*) FROM public.accounts_receivable),(SELECT count(*) FROM public.fiscal_invoices),(SELECT count(*) FROM public.comunicacao_outbox))::text;")
    B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=true WHERE singleton;UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true WHERE singleton;")

    deny("ARBio real actor valid role outside allowlist cannot read", reader(order))
    deny("ARBio real actor outside allowlist cannot create OS", create)
    deny("ARBio real actor outside allowlist cannot purchase finished product", purchase)
    # Synthetic FSF entitlement copied from the already published ARBio fixture;
    # role stays valid, no allowlist row is created for this other organization.
    B.sql("SET session_replication_role=replica;" + f"""INSERT INTO public.organization_subscriptions(id,organization_id,plan_id,plan_version_id,status,started_at)
      SELECT gen_random_uuid(),'{Q.F}',plan_id,plan_version_id,'ACTIVE',now()-interval '1 hour'
      FROM public.organization_subscriptions src WHERE src.id='{Q.u(807)}'
        AND NOT EXISTS(SELECT 1 FROM public.organization_subscriptions os WHERE os.organization_id='{Q.F}' AND os.status='ACTIVE');SET session_replication_role=origin;""")
    deny("other organization feature ON role valid remains denied", reader(order, Q.UADMF),
         ("RESALE_PILOT_SCOPE_DENIED", "B2B_RESALE_ORDER_SCOPE_DENIED", "B2B_RESALE_ACTOR_DENIED"))
    deny("other organization cannot purchase using ARBio product", A.purchase({"product": product, "packaging": item["packaging_id_snapshot"]}, 3, f"pilot-other-org-{run_id}", actor=Q.UADMF))
    deny("authenticated cannot write server allowlist", B.T.actor(Q.UADM) + f"INSERT INTO platform_private.resale_pilot_allowlist_v1(gate,operation,actor_id,organization_id,product_id,valid_until) VALUES('finished_product','purchase','{Q.UADM}','{Q.A}','{product}',now()+interval '1 hour');", ("permission denied",))
    deny("client GUC cannot substitute allowlist authority", B.T.actor(Q.UADM) + "SET app.pilot_allowed='true';" + create)

    read_grant = grant("b2b_resale", "read", Q.UADM, Q.A, Q.P, order)
    assert json.loads(B.last(reader(order)))["available"] is True
    ok("allowlisted ARBio synthetic order can be read")
    deny("read grant alone cannot create OS", create)

    os_grant = grant("b2b_resale", "os_create", Q.UADM, Q.A, Q.P, order, item_id, product)
    created = json.loads(B.last(create))
    assert created["ok"] is True and created["replay"] is False
    os_id = created["os_id"]
    replay = json.loads(B.last(create))
    assert replay["replay"] is True and replay["os_id"] == os_id
    ok("allowlisted OS create and exact replay succeed without duplicate")

    purchase_grant = grant("finished_product", "purchase", Q.UADM, Q.A, product=product)
    purchased = json.loads(B.last(purchase))
    assert purchased["ok"] is True and purchased["replay"] is False
    stock = purchased["estoque_produto_id"]
    ok("allowlisted physical purchase uses existing receipt and real stock motor")

    reserve_grant = grant("b2b_resale", "reserve", Q.UADM, Q.A, Q.P, order, item_id, product, stock)
    stock = R.reserve(fixture, os_id, stock, 3, "pilot-reserve")
    update_grant(reserve_grant, f"stock_id='{stock}'")
    ok("reserve uses exact allowlisted references and canonical returned split stock")

    group_key = f"pilot-delivery-before-{run_id}"
    observed_os = B.last(f"SELECT updated_at FROM public.ordens_servico WHERE id='{os_id}';")
    observed_stock = B.last(f"SELECT updated_at FROM public.estoque_produto WHERE id='{stock}';")
    items = json.dumps([{"item_id": stock, "quantidade": 3, "observed_updated_at": observed_stock}])
    group_sql = B.T.actor(Q.UADM) + f"SELECT public.rpc_cockpit_criar_entrega_v1('{os_id}','b2b','{items}'::jsonb,'{group_key}','{{}}'::jsonb,'{observed_os}'::timestamptz);"
    deny("delivery create requires its own operation grant", group_sql)
    delivery_grant = grant("b2b_resale", "delivery_create", Q.UADM, Q.A, Q.P, order, item_id, product, stock)
    delivery = R.group(os_id, stock, 3, "pilot-delivery")
    ok("allowlisted delivery create succeeds")

    deny("proof before proof grant is denied", B.T.actor(Q.UADM) + f"SELECT public.rpc_entrega_formulario_gerar_v1('{delivery}','pilot-proof-before-{run_id}');")
    send_observed = B.last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery}';")
    send_sql = B.T.actor(Q.UADM) + f"SELECT public.rpc_entrega_enviar_manual_v1('{delivery}','{send_observed}','pilot-send-{run_id}');"
    deny("send before send grant is denied", send_sql)
    send_grant = grant("b2b_resale", "send", Q.UADM, Q.A, Q.P, order, item_id, product, stock, delivery)
    sent = json.loads(B.last(send_sql))
    assert sent["success"] is True and sent["status"] == "em_rota"
    ok("exact delivery send grant succeeds")
    update_grant(send_grant, "revoked_at=now(),revoked_by=actor_id,revoke_reason='local revocation test'")
    deny("revoked send grant blocks exact replay", send_sql, ("RESALE_PILOT_SCOPE_DENIED", "DELIVERY_CONFIRM_SCOPE_DENIED"))

    proof_grant = grant("b2b_resale", "proof", Q.UADM, Q.A, Q.P, order, item_id, product, stock, delivery)
    R.proof(delivery, "pilot-proof")
    comprovante = B.last(f"SELECT comprovante_id FROM public.entregas WHERE id='{delivery}';")
    assert comprovante and comprovante != "None"
    ok("proof grant is distinct and succeeds after explicit provisioning")

    confirm_observed = B.last(f"SELECT updated_at FROM public.entregas WHERE id='{delivery}';")
    confirm_sql = B.T.actor(Q.UADM) + f"SELECT public.rpc_entrega_confirmar_manual_v1('{delivery}','{confirm_observed}','pilot-confirm-{run_id}','{{\"nome\":\"LOCAL PILOTO\"}}'::jsonb);"
    deny("confirm before confirm grant is denied", confirm_sql)
    confirm_grant = grant("b2b_resale", "confirm", Q.UADM, Q.A, Q.P, order, item_id, product, stock, delivery)
    confirmed = json.loads(B.last(confirm_sql))
    assert confirmed["success"] is True and confirmed["status"] == "entregue"
    ok("full scoped synthetic ARBio flow confirms physically")

    update_grant(os_grant, "valid_until=now()-interval '1 second'")
    deny("expired OS grant blocks exact replay", create)
    update_grant(os_grant, "valid_until=now()+interval '2 hours',revoked_at=now(),revoked_by=actor_id,revoke_reason='local replay revocation'")
    deny("revoked OS grant blocks exact replay after expiry restored", create)
    grant("b2b_resale", "os_create", Q.UADM, Q.A, Q.P, order, item_id, product)
    replay = json.loads(B.last(create))
    assert replay["replay"] is True
    ok("new explicit valid grant restores replay without changing history")
    update_grant(confirm_grant, "revoked_at=now(),revoked_by=actor_id,revoke_reason='local terminal replay revocation'")
    deny("revoked confirm grant blocks terminal exact replay", confirm_sql)
    update_grant(read_grant, "valid_until=now()-interval '1 second'")
    deny("expired read grant denies reader", reader(order))

    # Two real PostgreSQL connections, same request: one create and one exact replay.
    concurrent = R.make_order([Q.S(3)], "pilot-concurrent")
    c_item = concurrent["items"][0]
    grant("b2b_resale", "read", Q.UADM, Q.A, Q.P, concurrent["id"])
    grant("b2b_resale", "os_create", Q.UADM, Q.A, Q.P, concurrent["id"], c_item["id"], c_item["product_id"])
    statement = R.os_create_sql(concurrent["id"], c_item["id"], concurrent["accepted"]["updated_at"], f"pilot-concurrent-{concurrent['journal']['key'][:16]}")
    holder = B.T.session(f"BEGIN;SELECT 1 FROM public.partner_orders WHERE id='{concurrent['id']}' FOR UPDATE;")
    time.sleep(0.1)
    workers = [B.T.session(statement), B.T.session(statement)]
    B.T.wait()
    B.T.finish(holder, "COMMIT;")
    acknowledgments = []
    for worker in workers:
        stdout, stderr = B.T.finish(worker)
        assert not stderr, stdout + stderr
        acknowledgments.append(json.loads(stdout.strip().splitlines()[-1]))
    assert acknowledgments[0]["os_id"] == acknowledgments[1]["os_id"]
    assert sorted(row["replay"] for row in acknowledgments) == [False, True]
    assert B.last(f"SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{concurrent['id']}';") == "1"
    ok("two concurrent connections produce one OS and one idempotent receipt")

    B.sql("UPDATE platform_private.finished_product_gate_v1 SET enabled=false WHERE singleton;UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=false WHERE singleton;")
    deny("master switch OFF remains fail closed even with valid grants", create)
    ok("allowlist and receipts retained after gates OFF", B.last("SELECT count(*)>=10 FROM platform_private.resale_pilot_allowlist_v1;") == "t")
    after = B.last("SELECT jsonb_build_array((SELECT count(*) FROM public.accounts_receivable),(SELECT count(*) FROM public.fiscal_invoices),(SELECT count(*) FROM public.comunicacao_outbox))::text;")
    ok("no financial fiscal or communication downstream effects", before == after)
    (out / "checks.json").write_text(json.dumps({"hosted": False, "synthetic_auth": True, "checks": checks}, indent=2, ensure_ascii=False) + "\n")
    return checks
