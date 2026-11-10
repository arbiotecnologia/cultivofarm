#!/usr/bin/env python3
"""Testes no espelho rebuild_current (tabelas/corpos reais compostos, sem mocks de esquema).
Executado por compose_current.py quando NEW_E2E_RESALE_CAP=1, logo após a contenção do piloto.
Auth por claims SQL sintéticas: NÃO é prova JWT/RLS/Storage hospedada."""
import json, time, uuid
from pathlib import Path
CAP = Path(__file__).resolve().parent
RES = CAP.parent / "stock-reserve-replay-revalidation-20261110"
SIG = "public.rpc_b2b_resale_delivery_capability_v1(uuid,uuid[],text)"
RSIG = "public.rpc_estoque_reservar_v1(uuid,text,jsonb,text,jsonb)"


def run(B, Review, Q, A, choice, out, manual):
    out = Path(out) / "resale-capability-v2"; out.mkdir(parents=True, exist_ok=True)
    checks = []

    def ok(name, cond, detail=None):
        assert cond, (name, detail)
        checks.append({"test": name, "status": "PASS", "detail": detail}); print("RESCAP_PASS", name, flush=True)

    def md5(sig):
        return B.last(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure));")

    def gates(v):
        B.sql(f"UPDATE platform_private.finished_product_gate_v1 SET enabled={v} WHERE singleton;UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled={v} WHERE singleton;")

    def grant(gate, op, actor, org, partner=None, order=None, item=None, product=None, stock=None, until="now()+interval '2 hours'"):
        vals = ",".join("NULL" if v is None else f"'{v}'::uuid" for v in [actor, org, partner, order, item, product, stock, None])
        return B.last(f"""INSERT INTO platform_private.resale_pilot_allowlist_v1(gate,operation,actor_id,organization_id,partner_id,order_id,order_item_id,product_id,stock_id,delivery_id,synthetic,valid_until,created_by)
          VALUES('{gate}','{op}',{vals},true,{until},'{actor}') RETURNING id;""")

    def cap(actor, os_id, stocks, op):
        arr = "ARRAY[" + ",".join(f"'{s}'::uuid" for s in stocks) + "]::uuid[]"
        r = B.run_raw(B.T.actor(actor) + f"SELECT public.rpc_b2b_resale_delivery_capability_v1('{os_id}',{arr},'{op}');")
        assert r.returncode == 0, r.stderr[-1500:]
        return json.loads(r.stdout.strip().splitlines()[-1])

    CLOSED_KEYS = {"capability": "b2b_resale_delivery_v2", "organization_id": None, "os_id": None, "allowed": False, "stock_ids": []}
    def closed(v, op): return v == dict(CLOSED_KEYS, operation=op)

    prior = B.last("SELECT (SELECT enabled FROM platform_private.finished_product_gate_v1 WHERE singleton)::text||','||(SELECT enabled FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton)::text;")
    gates("false")
    # The mirror's generated pilot overlay differs from the production-applied 61 artifact only for this body.
    # Align by installing VERBATIM the frozen production artifact (byte source: 61-pilot-containment-install),
    # then require the LIVE md5 — never repin to the mirror value.
    osop = "platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico)"
    before_osop = md5(osop)
    frozen = (CAP.parent / "order-e2e-new-20261108/production-rollout-posplans-20261108/61-pilot-containment-install.sql.review").read_text().splitlines(keepends=True)
    st = next(i for i, l in enumerate(frozen) if l.startswith("CREATE OR REPLACE FUNCTION platform_private.b2b_resale_os_operational_valid_v1"))
    en = next(i for i in range(st, len(frozen)) if frozen[i].startswith("$function$"))
    acl_before = B.last(f"SELECT proacl::text FROM pg_proc WHERE oid='{osop}'::regprocedure;")
    mirror_body = B.sql(f"SELECT pg_get_functiondef('{osop}'::regprocedure);").strip()
    B.sql("".join(frozen[st:en + 1]))
    (out / "mirror-alignment.json").write_text(json.dumps({"function": osop, "mirror_generated_md5": before_osop, "after_frozen_61_md5": md5(osop), "acl_before": acl_before, "acl_after": B.last(f"SELECT proacl::text FROM pg_proc WHERE oid='{osop}'::regprocedure;")}, indent=1) + "\n")
    ok("os_operational aligned to frozen production 61 artifact with ACL unchanged", md5(osop) == "7cd8ee22794bf57e6592867259c9397e" and acl_before == B.last(f"SELECT proacl::text FROM pg_proc WHERE oid='{osop}'::regprocedure;"), before_osop)
    # Pins: real composed bodies in this mirror vs LIVE values informed by the auditor.
    pins = {s: md5(s) for s in ["platform_private.delivery_actor_20261030(text)", "public.fn_estoque_pode_operar(uuid,text)",
            "platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico)",
            "platform_private.resale_pilot_scope_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)", RSIG]}
    (out / "mirror-pins.json").write_text(json.dumps(pins, indent=1) + "\n")
    ok("mirror bodies equal LIVE pins (delivery_actor/fn_estoque_pode_operar/os_operational/scope/reservar)", pins == {
        "platform_private.delivery_actor_20261030(text)": "c6da1f5d9581a0c290e5e27e4605682c",
        "public.fn_estoque_pode_operar(uuid,text)": "d0d1e37b39e6f9f814c832ec63a540dd",
        "platform_private.b2b_resale_os_operational_valid_v1(public.ordens_servico)": "7cd8ee22794bf57e6592867259c9397e",
        "platform_private.resale_pilot_scope_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)": "63f49feea167f6865fd7840cde7dc63b",
        RSIG: "3e0dc7c48ab28f4402699b234476aa8a"}, pins)
    ok("real estoque_produto has no organization_id; lotes has it", B.last("SELECT (NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='estoque_produto' AND column_name='organization_id'))::text||(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='lotes' AND column_name='organization_id'))::text;") == "truetrue")

    # ---------- Fixture: new synthetic ARBio order, OS and purchased whole packs ----------
    R = Review(B, Q, A, choice, {}); R.sequence = int(time.time() * 1000) % 100000000 + 7
    fx = R.make_order([Q.S(3)], "rescap-v2"); rid = fx["journal"]["key"][:12]
    order, item = fx["id"], fx["items"][0]; item_id, product = item["id"], item["product_id"]
    gates("true")
    grant("b2b_resale", "os_create", Q.UADM, Q.A, Q.P, order, item_id, product)
    os_id = json.loads(B.last(R.os_create_sql(order, item_id, fx["accepted"]["updated_at"], f"rescap-os-{rid}")))["os_id"]
    grant("finished_product", "purchase", Q.UADM, Q.A, product=product)
    stock = json.loads(B.last(A.purchase({"product": product, "packaging": item["packaging_id_snapshot"]}, 3, f"rescap-buy-{rid}", actor=Q.UADM)))["estoque_produto_id"]
    gates("false")

    # ---------- Reserve receipt: reproduce LIVE gap BEFORE delta ----------
    def reserve_sql(key, qty=1, actor=Q.UADM):
        items = json.dumps([{"item_id": stock, "quantidade": qty}]); data = json.dumps({"partner_id": Q.P, "partner_order_id": order})
        return B.T.actor(actor) + f"SELECT public.rpc_estoque_reservar_v1('{os_id}','b2b','{items}'::jsonb,'{key}','{data}'::jsonb);"
    def moves(): return B.last(f"SELECT count(*) FROM public.estoque_movimentacoes WHERE idempotency_key LIKE 'stock_batch_item:%' AND estoque_produto_id IN (SELECT id FROM public.estoque_produto WHERE lote_id=(SELECT lote_id FROM public.estoque_produto WHERE id='{stock}'));")
    def waited_call(key, mutate):
        holder = B.T.session(f"BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('stock_batch:'||'{key}',0));")
        time.sleep(0.1)
        worker = B.T.session(reserve_sql(key))
        deadline, seen = time.monotonic() + 3, False
        while time.monotonic() < deadline and not seen:
            seen = B.last("SELECT count(*)>0 FROM pg_locks WHERE locktype='advisory' AND NOT granted;") == "t"; time.sleep(0.03)
        assert seen, "NO_REAL_WAIT"
        B.sql(mutate)
        B.T.finish(holder, "COMMIT;"); o, e = B.T.finish(worker); return seen, o, e

    gates("true"); g_res = grant("b2b_resale", "reserve", Q.UADM, Q.A, Q.P, order, item_id, product, stock)
    k1 = f"rescap-reserve-{rid}"
    first = json.loads(B.last(reserve_sql(k1))); ok("LIVE first reserve receipt", first["ok"] is True and first["replay"] is False, first)
    m1 = moves()
    seen, o, e = waited_call(k1, f"UPDATE platform_private.resale_pilot_allowlist_v1 SET revoked_at=clock_timestamp(),revoked_by=actor_id,revoke_reason='rescap live repro' WHERE id='{g_res}';")
    live_receipt = (not e) and json.loads(o.strip().splitlines()[-1])
    ok("REPRODUCED: LIVE returns receipt after revocation during proven wait", seen and live_receipt and live_receipt["replay"] is True and live_receipt["itens"] == first["itens"], (o[-300:], e[-300:]))
    gates("false")
    r = B.run_raw(reserve_sql(k1))
    err = next((l for l in r.stderr.splitlines() if l.startswith("ERROR")), "")
    ok("OBSERVED: LIVE with gates closed already denies BEFORE the receipt lock (real motor pre-check); gap is post-wait only", r.returncode != 0, err)

    # ---------- Install reserve delta via exact files ----------
    ok("reserve PRE PASS", "PRE_PASS" in B.sql((RES / "01-pre.sql.readonly").read_text()))
    B.sql((RES / "02-install.sql.review").read_text())
    rmd5 = md5(RSIG); post = (RES / "03-post.sql.readonly").read_text().replace(":CAND_MD5:", rmd5)
    ok("reserve POST PASS", "POST_PASS" in B.sql(post), rmd5)
    ok("reserve install rerun refused", "INSTALL_PIN_DRIFT_OR_RERUN" in B.run_raw((RES / "02-install.sql.review").read_text()).stderr)

    def denied(sql, code="42501"):
        r = B.run_raw(sql); return r.returncode != 0 and (code in r.stderr), r.stderr[-400:]
    d = denied(reserve_sql(k1)); ok("CANDIDATE gate closed: receipt denied 42501", d[0], d[1])
    gates("true")
    d = denied(reserve_sql(k1)); ok("CANDIDATE revoked grant: receipt denied", d[0], d[1])
    g2 = grant("b2b_resale", "reserve", Q.UADM, Q.A, Q.P, order, item_id, product, stock)
    rep = json.loads(B.last(reserve_sql(k1))); ok("CANDIDATE valid grant: same receipt, no new movement", rep["replay"] is True and rep["itens"] == first["itens"] and moves() == m1, rep)
    seen, o, e = waited_call(k1, f"UPDATE platform_private.resale_pilot_allowlist_v1 SET revoked_at=clock_timestamp(),revoked_by=actor_id,revoke_reason='rescap cand' WHERE id='{g2}';")
    ok("CANDIDATE revocation during proven wait: receipt denied", seen and e and "RESALE_PILOT_SCOPE_DENIED" in e, e[-300:])
    g3 = grant("b2b_resale", "reserve", Q.UADM, Q.A, Q.P, order, item_id, product, stock, until="now()+interval '2 seconds'")
    time.sleep(2.2); d = denied(reserve_sql(k1)); ok("CANDIDATE expired grant: receipt denied", d[0], d[1])
    d = denied(reserve_sql(k1, actor=Q.UADMF), ""); ok("CANDIDATE foreign tenant same key denied", d[0], d[1])
    g4 = grant("b2b_resale", "reserve", Q.UADM, Q.A, Q.P, order, item_id, product, stock)
    k2 = f"rescap-reserve2-{rid}"; second = json.loads(B.last(reserve_sql(k2)))
    ok("CANDIDATE new reservation path unchanged (split target id returned)", second["replay"] is False and second["itens"][0] != stock, second)
    ok("no extra movement from any replay: second NEW reservation adds exactly the per-reservation count of the first", int(moves()) == 2 * int(m1), (m1, moves()))
    # Biological stock (origem_estoque NULL) replay unaffected by pilot gates.
    morg = B.last(f"SELECT organization_id FROM public.ordens_servico WHERE id='{manual['os']}';")
    bprod = str(uuid.uuid4()); blot = str(uuid.uuid4()); bstock = str(uuid.uuid4())
    B.sql("SET session_replication_role=replica;" + f"INSERT INTO public.produtos(id,nome,tipo,owner_organization_id) VALUES('{bprod}','LOCAL BIO RESCAP','inoculante','{morg}');INSERT INTO public.lotes(id,organization_id,produto_id,status,codigo_lote,volume_produzido) VALUES('{blot}','{morg}','{bprod}','aprovado','RESCAP-{rid}',100000);INSERT INTO public.estoque_produto(id,lote_id,produto_id,quantidade,volume_total,status) VALUES('{bstock}','{blot}','{bprod}',5,5,'disponivel');SET session_replication_role=origin;")
    bkey = f"rescap-bio-{rid}"; b1 = B.run_raw(B.reserve(manual["os"], bstock, 2, bkey))
    if b1.returncode == 0:
        gates("false"); b2 = B.run_raw(B.reserve(manual["os"], bstock, 2, bkey)); gates("true")
        ok("biological (non finished) receipt preserved with gates closed", b2.returncode == 0 and '"replay": true' in b2.stdout, b2.stderr[-300:])
    else:
        checks.append({"test": "biological receipt replay", "status": "NOT_RUN", "detail": "first biological reserve refused by real motor: " + b1.stderr[-300:]})

    # ---------- Capability v2 via exact files ----------
    gates("false")
    ok("cap PRE PASS", "PRE_PASS" in B.sql((CAP / "01-pre.sql.readonly").read_text()))
    B.sql((CAP / "02-install.sql.review").read_text())
    cmd5 = md5(SIG); cpost = (CAP / "03-post.sql.readonly").read_text().replace(":CAP_MD5:", cmd5)
    ok("cap POST PASS", "POST_PASS" in B.sql(cpost), cmd5)
    (out / "hashes.json").write_text(json.dumps({"capability_md5": cmd5, "reserve_candidate_md5": rmd5}, indent=1) + "\n")
    v = cap(Q.UADM, os_id, [stock], "reserve"); ok("gate closed + valid grant: closed envelope without ids/org/os", closed(v, "reserve"), v)
    gates("true")
    header = B.last(f"SELECT jsonb_build_object('payment_condition_status',payment_condition_status,'financial_approval_status',financial_approval_status,'requires_financial_approval',requires_financial_approval)::text FROM public.partner_orders WHERE id='{order}';")
    v = cap(Q.UADM, os_id, [stock], "reserve")
    (out / "production-os-operational-finding.json").write_text(json.dumps({"header": json.loads(header), "os_operational_live": B.last(f"SELECT platform_private.b2b_resale_os_operational_valid_v1(o)::text FROM public.ordens_servico o WHERE o.id='{os_id}';"), "capability": v}, indent=1) + "\n")
    ok("PRODUCTION body: OS validity uses frozen header; linked-terms-approved synthetic order stays CLOSED (fail closed, no forcing)", closed(v, "reserve"), header)
    B.sql(mirror_body + ";")
    ok("phase B uses mirror linked-terms os_operational (INTERMEDIATE, NOT LIVE)", md5(osop) == before_osop, before_osop)
    v = cap(Q.UADM, os_id, [stock], "reserve"); ok("exact reserve grant: allowed with only requested ids", v == {"capability": "b2b_resale_delivery_v2", "organization_id": Q.A, "os_id": os_id, "operation": "reserve", "allowed": True, "stock_ids": [stock]}, v)
    v = cap(Q.UADM, os_id, [stock], "delivery_create"); ok("no delivery_create grant: closed", closed(v, "delivery_create"), v)
    v = cap(Q.UADMF, os_id, [stock], "reserve"); ok("foreign tenant admin: closed without ids", closed(v, "reserve"), v)
    v = cap(Q.UB, os_id, [stock], "reserve"); ok("buyer: closed", closed(v, "reserve"), v)
    v = cap(Q.UADM, os_id, [stock, str(uuid.uuid4())], "reserve"); ok("unknown extra stock: closed, nothing echoed", closed(v, "reserve"), v)
    v = cap(Q.UADM, os_id, [bstock], "reserve"); ok("biological stock not resale: closed", closed(v, "reserve"), v)
    v = cap(Q.UADM, manual["os"], [stock], "reserve"); ok("non-B2B OS: closed", closed(v, "reserve"), v)
    v = cap(Q.UADM, os_id, [stock, stock], "reserve"); ok("duplicate ids: closed", closed(v, "reserve"), v)
    B.sql(f"UPDATE platform_private.resale_pilot_allowlist_v1 SET revoked_at=clock_timestamp(),revoked_by=actor_id,revoke_reason='rescap cap' WHERE id='{g4}';")
    v = cap(Q.UADM, os_id, [stock], "reserve"); ok("revoked: closed", closed(v, "reserve"), v)
    grant("b2b_resale", "reserve", Q.UADM, Q.A, Q.P, order, item_id, product, stock, until="now()+interval '1 second'"); time.sleep(1.2)
    v = cap(Q.UADM, os_id, [stock], "reserve"); ok("expired: closed", closed(v, "reserve"), v)
    grant("b2b_resale", "delivery_create", Q.UADM, Q.A, Q.P, order, item_id, product, stock)
    v = cap(Q.UADM, os_id, [stock], "delivery_create"); ok("exact delivery_create grant: allowed", v["allowed"] is True and v["stock_ids"] == [stock], v)
    before = B.last("SELECT jsonb_build_array((SELECT count(*) FROM public.estoque_movimentacoes),(SELECT count(*) FROM platform_private.stock_batch_requests),(SELECT count(*) FROM platform_private.resale_pilot_allowlist_v1),(SELECT count(*) FROM public.entregas))::text;")
    for _ in range(3): cap(Q.UADM, os_id, [stock], "delivery_create")
    ok("capability writes nothing", before == B.last("SELECT jsonb_build_array((SELECT count(*) FROM public.estoque_movimentacoes),(SELECT count(*) FROM platform_private.stock_batch_requests),(SELECT count(*) FROM platform_private.resale_pilot_allowlist_v1),(SELECT count(*) FROM public.entregas))::text;"))
    ok("anon/writers/helpers closed", B.last(f"SELECT (has_function_privilege('anon','{SIG}','EXECUTE') OR has_function_privilege('authenticated','platform_private.resale_pilot_scope_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb)','EXECUTE'))::text;") == "false")
    gates("false")
    B.sql((CAP / "04-rollback-deny.sql.review").read_text())
    r = B.run_raw(B.T.actor(Q.UADM) + f"SELECT public.rpc_b2b_resale_delivery_capability_v1('{os_id}',ARRAY['{stock}'::uuid],'reserve');")
    ok("cap rollback deny-only", r.returncode != 0 and "permission denied" in r.stderr)
    hist = B.last("SELECT count(*) FROM platform_private.stock_batch_requests;")
    B.sql((RES / "04-rollback-deny.sql.review").read_text())
    ok("reserve rollback deny-only keeps receipts and never restores vulnerable body", md5(RSIG) == rmd5 and B.last("SELECT count(*) FROM platform_private.stock_batch_requests;") == hist)
    # Restore prior state for anything after this hook.
    B.sql(f"GRANT EXECUTE ON FUNCTION {RSIG} TO authenticated;")
    a, b = prior.split(","); B.sql(f"UPDATE platform_private.finished_product_gate_v1 SET enabled={a} WHERE singleton;UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled={b} WHERE singleton;")
    (out / "checks.json").write_text(json.dumps(checks, indent=1) + "\n")
    return checks
