"""Espelho real (rebuild_current, NEW_E2E_LINKED_APPROVAL=1): alinha os 6 consumidores ao LIVE verbatim, sonda condições,
instala o delta gerado pelos arquivos entregues e exercita compra→reserva por lote→entregas parciais→saldo final,
replay/concorrência e rollback. Auth por claims SQL (sintética). Cabeçalho do pedido nunca é alterado para aprovar."""
import importlib.util, json, time, uuid
from pathlib import Path
H = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("lla_generate", H / "generate.py"); G = importlib.util.module_from_spec(spec); spec.loader.exec_module(G)

def run(B, Review, Q, A, choice, out):
    out = Path(out) / "linked-approval"; out.mkdir(parents=True, exist_ok=True)
    checks = []
    def ok(name, cond, detail=None):
        assert cond, (name, detail)
        checks.append({"test": name, "status": "PASS", "detail": detail}); print("LLA_PASS", name, flush=True)
    def md5(sig): return B.last(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure));")
    def acl(sig): return B.last(f"SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid='{sig}'::regprocedure;")
    def gates(v): B.sql(f"UPDATE platform_private.finished_product_gate_v1 SET enabled={v} WHERE singleton;UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled={v} WHERE singleton;")
    def grant(gate, op, partner=None, order=None, item=None, product=None, stock=None, delivery=None):
        vals = ",".join("NULL" if v is None else f"'{v}'::uuid" for v in [Q.UADM, Q.A, partner, order, item, product, stock, delivery])
        return B.last(f"""INSERT INTO platform_private.resale_pilot_allowlist_v1(gate,operation,actor_id,organization_id,partner_id,order_id,order_item_id,product_id,stock_id,delivery_id,synthetic,valid_until,created_by)
          VALUES('{gate}','{op}',{vals},true,now()+interval '2 hours','{Q.UADM}') RETURNING id;""")
    def err(r): return next((l for l in r.stderr.splitlines() if l.startswith("ERROR")), r.stderr[-200:])

    gates("false")
    import hashlib
    rows, final_sha = G.verify_on_disk()  # fontes finais == gerador (bytes), antes de qualquer execução
    executed = {}
    def exec_file(name, raw=False):
        data = (H / name).read_bytes(); sha = hashlib.sha256(data).hexdigest()
        assert sha == final_sha[name], ("EXECUTED_BYTES_DIFFER", name)
        executed.setdefault(name, []).append(sha)
        return B.run_raw(data.decode()) if raw else B.sql(data.decode())
    # ---- 1. Alinhar ao LIVE: instalar verbatim os corpos congelados de produção e exigir md5 LIVE ----
    align = {}
    for r in rows:
        before, a0 = md5(r["signature"]), acl(r["signature"])
        B.sql(r["live"] + ";")
        align[r["signature"]] = {"mirror_md5": before, "live_md5_after": md5(r["signature"]), "acl_unchanged": acl(r["signature"]) == a0}
    (out / "mirror-alignment.json").write_text(json.dumps(align, indent=1) + "\n")
    ok("6 consumers aligned verbatim to frozen production artifacts with LIVE md5 and ACL unchanged",
       all(v["live_md5_after"] == r["live_md5"] and v["acl_unchanged"] for r, v in zip(rows, align.values())), align)
    measured_acl = {r["signature"]: acl(r["signature"]) for r in rows}
    ok("mirror ACL equals pinned ACL (no rewrite of package)", measured_acl == G.ACL_PINNED, measured_acl)

    # ---- 2. Fixture canônica: pedido aprovado comercialmente + termos aprovados pelo financeiro ----
    R = Review(B, Q, A, choice, {}); R.sequence = int(time.time() * 1000) % 100000000 + 11
    fx = R.make_order([Q.S(5)], "lla"); rid = fx["journal"]["key"][:12]
    order, item = fx["id"], fx["items"][0]; item_id, product = item["id"], item["product_id"]
    gates("true"); grant("b2b_resale", "os_create", Q.P, order, item_id, product)
    probe = json.loads(B.last(f"""SELECT jsonb_build_object(
      'status',po.status,'approved_by',po.approved_by IS NOT NULL,'approved_at',po.approved_at IS NOT NULL,
      'payment_condition_status',po.payment_condition_status,'financial_approval_status',po.financial_approval_status,
      'requires_financial_approval',po.requires_financial_approval,'credit_approved_pair',(po.credit_approved_at IS NULL)=(po.credit_approved_by IS NULL),
      'ready_for_production',po.ready_for_production,'receivable_generated',po.receivable_generated,
      'economic_snapshot',po.internal_economic_snapshot IS NOT NULL,'internal_origin_null',po.internal_origin_snapshot IS NULL,
      'c2_origin_valid',platform_private.c2_external_origin_contract_valid(po.c2_external_origin_snapshot),
      'terms_linked',(SELECT jsonb_build_object('same_order',t.partner_order_id=po.id,'approval_status',t.approval_status,'approved_by',t.approved_by IS NOT NULL,'approved_at',t.approved_at IS NOT NULL) FROM public.partner_order_payment_terms t WHERE t.id=po.payment_terms_id),
      'partner_owner_ok',(SELECT pa.commercial_owner_organization_id='{Q.A}' AND pa.ativo AND pa.deleted_at IS NULL FROM public.partner_accounts pa WHERE pa.id=po.partner_id),
      'item',(SELECT jsonb_build_object('qty',i.quantidade,'integer',i.quantidade=trunc(i.quantidade),'unidade',i.unidade_medida,'pack',i.packaging_id_snapshot IS NOT NULL,'pack_version',i.packaging_version_snapshot,
          'conteudo',i.packaging_unidade_conteudo_snapshot,'peso_kg',i.packaging_peso_liquido_kg_snapshot,
          'peso_rule_ok',(i.packaging_unidade_conteudo_snapshot IN ('kg','g') AND i.packaging_peso_liquido_kg_snapshot>0) OR (i.packaging_unidade_conteudo_snapshot IN ('l','ml') AND i.packaging_peso_liquido_kg_snapshot IS NULL),
          'product_family',(SELECT p.familia_catalogo FROM public.produtos p WHERE p.id=i.product_id),'product_owner_ok',(SELECT p.owner_organization_id='{Q.A}' AND p.ativo FROM public.produtos p WHERE p.id=i.product_id)) FROM public.partner_order_items i WHERE i.id='{item_id}'),
      'os_create_grant',(SELECT count(*) FROM platform_private.resale_pilot_allowlist_v1 WHERE order_id=po.id AND operation='os_create' AND revoked_at IS NULL AND valid_until>clock_timestamp()))::text
      FROM public.partner_orders po WHERE po.id='{order}';"""))
    (out / "condition-probe.json").write_text(json.dumps(probe, indent=1) + "\n")
    ok("PROBE: all non-financial conditions hold (scope grant, owner, family, integer whole packs, weight rule, snapshots)",
       probe["os_create_grant"] == 1 and probe["partner_owner_ok"] and probe["c2_origin_valid"] and probe["item"]["integer"] and probe["item"]["peso_rule_ok"]
       and probe["item"]["product_owner_ok"] and probe["item"]["product_family"] in ("quimico", "fertilizante_adubo") and probe["economic_snapshot"] and probe["internal_origin_null"], probe)
    ok("PROBE: only failing condition is frozen header (financial_approval_status pending) while linked terms are approved",
       probe["financial_approval_status"] == "pending" and probe["requires_financial_approval"] is True and probe["terms_linked"]["approval_status"] == "approved" and probe["terms_linked"]["same_order"], probe)
    os_key = f"lla-os-{rid}"; create = R.os_create_sql(order, item_id, fx["accepted"]["updated_at"], os_key)
    r = B.run_raw(create); ok("LIVE consumer denies OS creation for canonically approved order", r.returncode != 0 and "B2B_RESALE_ORDER_CONFLICT" in r.stderr, err(r))

    # ---- 3. Delta pelos arquivos entregues ----
    ok("PRE PASS (exact final bytes)", "PRE_PASS" in exec_file("01-pre.sql.readonly"))
    exec_file("02-install.sql.review")
    cand = {r_["signature"]: md5(r_["signature"]) for r_ in rows}
    ok("installed candidate md5 equals pinned attempt-234 md5", cand == G.CANDIDATE_MD5, cand)
    ok("POST PASS (exact final bytes, no substitution)", "POST_PASS" in exec_file("03-post.sql.readonly"), cand)
    ok("install rerun refused by PRE pins", exec_file("02-install.sql.review", raw=True).returncode != 0)
    (out / "candidate-md5.json").write_text(json.dumps(cand, indent=1) + "\n")
    (out / "candidate-bodies.sql").write_text("".join(f"-- {r_['signature']} md5={cand[r_['signature']]}\n" + B.last(f"SELECT pg_get_functiondef('{r_['signature']}'::regprocedure);") + "\n" for r_ in rows))
    (out / "candidate-acl.json").write_text(json.dumps({r_["signature"]: acl(r_["signature"]) for r_ in rows}, indent=1) + "\n")

    created = json.loads(B.last(create)); ok("candidate: OS created from linked approved terms", created["ok"] and created["replay"] is False, created)
    os_id = created["os_id"]
    ok("OS replay same key", json.loads(B.last(create))["replay"] is True)

    # ---- 4. Negativas em transação revertida (mutação só para NEGAR; nunca para aprovar) ----
    other = B.last(f"SELECT id FROM public.partner_orders WHERE id<>'{order}' ORDER BY created_at LIMIT 1;")
    claims = f"SET LOCAL request.jwt.claim.sub='{Q.UADM}';SET LOCAL request.jwt.claims='{{\"sub\":\"{Q.UADM}\",\"role\":\"authenticated\"}}';"
    def predicate_under(mutation):
        sql = ("BEGIN;SET LOCAL session_replication_role=replica;" + mutation + "SET LOCAL session_replication_role=origin;" + claims +
               f"SELECT (SELECT platform_private.b2b_resale_os_operational_valid_v1(o) FROM public.ordens_servico o WHERE o.id='{os_id}')::text||','||"
               f"(SELECT platform_private.b2b_resale_os_valid_v1(o) FROM public.ordens_servico o WHERE o.id='{os_id}')::text;ROLLBACK;")
        r = B.run_raw(sql); assert r.returncode == 0, r.stderr[-800:]
        return [l for l in r.stdout.splitlines() if "," in l and l.strip().replace(",", "").isalpha()][-1].strip()
    other_org = B.last(f"SELECT id FROM public.organizations WHERE id<>'{Q.A}' ORDER BY created_at LIMIT 1;"); assert other_org
    T = f"UPDATE public.partner_order_payment_terms SET {{}} WHERE partner_order_id='{order}';"
    O = f"UPDATE public.partner_orders SET {{}} WHERE id='{order}';"
    cases = {"control_no_mutation": ("", "true,true"),
             "terms_pending_real": (T.format("approval_status='pending',approved_by=NULL,approved_at=NULL"), "false,false"),
             "terms_rejected": (T.format("approval_status='rejected'"), "false,false"),
             "terms_approved_without_actor": (T.format("approved_by=NULL"), "false,false"),
             "link_absent": (O.format("payment_terms_id=NULL"), "false,false"),
             "link_divergent_other_order": (T.format(f"partner_order_id='{other}'"), "false,false"),
             "header_rejected": (O.format("financial_approval_status='rejected'"), "false,false"),
             "commercial_approval_absent": (O.format("approved_by=NULL"), "false,false"),
             "credit_pair_inconsistent": (O.format("credit_approved_at=now(),credit_approved_by=NULL"), "false,false"),
             "terms_approved_without_date": (T.format("approved_at=NULL"), "false,false"),
             "commercial_approval_without_date": (O.format("approved_at=NULL"), "false,false"),
             "partner_owner_other_tenant": (f"UPDATE public.partner_accounts SET commercial_owner_organization_id='{other_org}' WHERE id='{Q.P}';", "false,false"),
             # Dispensa: SOMENTE predicado em transação revertida (não é fixture canônica nem prova de aprovação).
             "terms_and_header_rejected_as_writer_does": (T.format("approval_status='rejected'") + O.format("financial_approval_status='rejected',payment_condition_status='rejected'"), "false,false"),
             "waived_not_required_no_terms": (O.format("requires_financial_approval=false,financial_approval_status='not_required',payment_terms_id=NULL"), "true,true"),
             "waived_but_header_pending": (O.format("requires_financial_approval=false,financial_approval_status='pending',payment_terms_id=NULL"), "false,false"),
             "waived_but_header_rejected": (O.format("requires_financial_approval=false,financial_approval_status='rejected',payment_terms_id=NULL"), "false,false"),
             "waived_without_commercial_approver": (O.format("requires_financial_approval=false,financial_approval_status='not_required',payment_terms_id=NULL,approved_by=NULL"), "false,false")}
    got = {k: predicate_under(m) for k, (m, _) in cases.items()}
    (out / "negatives.json").write_text(json.dumps(got, indent=1) + "\n")
    ok("canonical predicate: control true; pending/rejected/no actor/absent/divergent link/header rejected/no commercial/credit inconsistent all false",
       all(got[k] == e for k, (_, e) in cases.items()), got)
    rf = B.run_raw(B.T.actor(Q.UB) + f"SELECT public.rpc_b2b_resale_os_availability_v1('{order}');")
    ok("buyer/foreign actor denied on availability reader", rf.returncode != 0, err(rf))

    # ---- 4b. Termos EFETIVAMENTE rejeitados pelo writer canônico (sem mutação direta) ----
    Q_ = Q; sim, e_ = Q_.sim(Q_.UB, Q_.P3, [Q_.S(2)], choice); assert sim is not None, e_
    jr, e_ = Q_.call(Q_.UB, f"public.recover_partner_order_attempt_v1('{Q_.P}',NULL,NULL,false,NULL)")
    if jr["state"] == "committed":
        jr, e_ = Q_.call(Q_.UB, f"public.recover_partner_order_attempt_v1('{Q_.P}','{jr['key']}',{jr['generation']},true,'{jr['order_id']}')")
    cr2, e_ = Q_.create(Q_.UB, Q_.P3, [Q_.S(2)], sim["cart_hash"], jr["key"], choice); assert cr2 is not None, e_
    rej_order = cr2["id"]
    assert Q_.as_user(Q_.UADM, f"SELECT public.approve_partner_order('{rej_order}',NULL,NULL);").returncode == 0
    rj = Q_.as_user(Q_.UFIN, f"SELECT public.reject_b2b_payment_terms_secure('{rej_order}','LLA TERMOS REJEITADOS LOCAL');")
    rej_state = json.loads(B.last(f"SELECT jsonb_build_object('header',o.financial_approval_status,'terms',t.approval_status,'same',t.partner_order_id=o.id)::text FROM public.partner_orders o JOIN public.partner_order_payment_terms t ON t.id=o.payment_terms_id WHERE o.id='{rej_order}';"))
    if rj.returncode == 0 and rej_state == {"header": "rejected", "terms": "rejected", "same": True}:
        ok("canonical writer rejected linked terms", True, rej_state); rej_label = "effectively rejected terms"
    else:
        # Writer LIVE do espelho (40777d0c) exige b2b_phase1_order_visible: o financeiro vendedor não o alcança. Não contornar.
        checks.append({"test": "canonical writer rejection of linked terms", "status": "BLOCKED", "detail": {"state": rej_state, "err": rj.stderr[-300:]}})
        print("LLA_BLOCKED canonical reject writer unreachable for seller financeiro in mirror", flush=True)
        rej_label = "real pending (unapproved) terms"
    rej_item = B.last(f"SELECT id FROM public.partner_order_items WHERE order_id='{rej_order}' ORDER BY id LIMIT 1;")
    rej_prod = B.last(f"SELECT product_id FROM public.partner_order_items WHERE id='{rej_item}';")
    grant("b2b_resale", "os_create", Q.P, rej_order, rej_item, rej_prod)
    rr = B.run_raw(R.os_create_sql(rej_order, rej_item, B.last(f"SELECT updated_at FROM public.partner_orders WHERE id='{rej_order}';"), f"lla-rej-{rid}"))
    ok(f"candidate denies OS for order with {rej_label} (even with exact os_create grant)", rr.returncode != 0 and "B2B_RESALE_ORDER_CONFLICT" in rr.stderr, err(rr))
    ok("no OS created for rejected order", B.last(f"SELECT count(*) FROM public.ordens_servico WHERE partner_order_id='{rej_order}';") == "0")

    # ---- 5. Compra (2 lotes) → reserva por lote → entregas parciais → saldo final ----
    grant("finished_product", "purchase", product=product)
    lot1 = json.loads(B.last(A.purchase({"product": product, "packaging": item["packaging_id_snapshot"]}, 3, f"lla-buy1-{rid}", actor=Q.UADM)))["estoque_produto_id"]
    lot2 = json.loads(B.last(A.purchase({"product": product, "packaging": item["packaging_id_snapshot"]}, 2, f"lla-buy2-{rid}", actor=Q.UADM)))["estoque_produto_id"]
    ok("two distinct purchased lots", B.last(f"SELECT count(DISTINCT lote_id) FROM public.estoque_produto WHERE id IN ('{lot1}','{lot2}');") == "2")
    ar0 = B.last(f"SELECT count(*) FROM public.accounts_receivable;")
    def mv(): return B.last(f"SELECT count(*) FROM public.estoque_movimentacoes WHERE estoque_produto_id IN (SELECT id FROM public.estoque_produto WHERE lote_id IN (SELECT lote_id FROM public.estoque_produto WHERE id IN ('{lot1}','{lot2}')));")
    def reserve_sql(stock, qty, key):
        items = json.dumps([{"item_id": stock, "quantidade": qty}]); data = json.dumps({"partner_id": Q.P, "partner_order_id": order})
        return B.T.actor(Q.UADM) + f"SELECT public.rpc_estoque_reservar_v1('{os_id}','b2b','{items}'::jsonb,'{key}','{data}'::jsonb);"
    g1 = grant("b2b_resale", "reserve", Q.P, order, item_id, product, lot1)
    k1 = f"lla-res1-{rid}"; r1 = json.loads(B.last(reserve_sql(lot1, 3, k1))); s1 = r1["itens"][0]; m_after1 = mv()
    rp = json.loads(B.last(reserve_sql(lot1, 3, k1)))
    ok("reserve lot1 replay: same receipt, no new movement", rp["replay"] is True and rp["itens"] == r1["itens"] and mv() == m_after1, rp)
    g2 = grant("b2b_resale", "reserve", Q.P, order, item_id, product, lot2)
    k2 = f"lla-res2-{rid}"; holder = B.T.session(f"BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('stock_batch:'||'{k2}',0));")
    time.sleep(0.1); w = [B.T.session(reserve_sql(lot2, 2, k2)), B.T.session(reserve_sql(lot2, 2, k2))]
    deadline, waited = time.monotonic() + 3, False
    while time.monotonic() < deadline and not waited:
        waited = B.last("SELECT count(*)>=1 FROM pg_locks WHERE locktype='advisory' AND NOT granted;") == "t"; time.sleep(0.03)
    B.T.finish(holder, "COMMIT;"); res = [B.T.finish(x) for x in w]
    outs = [json.loads(o.strip().splitlines()[-1]) for o, e in res if not e]
    errs = [next((l for l in e.splitlines() if l.startswith("ERROR")), e[-200:]) for o, e in res if e]
    after = json.loads(B.last(reserve_sql(lot2, 2, k2)))
    rows_res = B.last(f"SELECT count(*) FROM public.estoque_produto WHERE reservado_para_os_id='{os_id}' AND status::text='reservado';")
    (out / "concurrent-reserve.json").write_text(json.dumps({"waited": waited, "successes": outs, "errors": errs, "exact_replay_after": after, "reserved_rows_for_os": rows_res}, indent=1) + "\n")
    first = [o for o in outs if o["replay"] is False]
    ok("concurrent same-key reserve (2 real sessions, proven wait): exactly one reservation; loser is exact replay or explicit error; later exact replay returns same receipt",
       waited and len(first) == 1 and all(o["itens"] == first[0]["itens"] for o in outs) and after["replay"] is True and after["itens"] == first[0]["itens"] and rows_res == "2", {"outs": outs, "errs": errs})
    s2 = first[0]["itens"][0]
    rx = B.run_raw(reserve_sql(lot1, 1, f"lla-res-extra-{rid}"))
    ok("no over-reservation beyond purchased lot", rx.returncode != 0, err(rx))
    for gid, s in ((g1, s1), (g2, s2)): B.sql(f"UPDATE platform_private.resale_pilot_allowlist_v1 SET stock_id='{s}' WHERE id='{gid}';")
    def deliver(stock, qty, tag):
        grant("b2b_resale", "delivery_create", Q.P, order, item_id, product, stock)
        d = R.group(os_id, stock, qty, f"lla-{tag}")
        for op in ("send", "proof", "confirm"): grant("b2b_resale", op, Q.P, order, item_id, product, stock, d)
        R.send(d, f"lla-send-{tag}"); R.proof(d, f"lla-proof-{tag}")
        c = R.confirm(d, f"lla-confirm-{tag}"); assert c["success"] is True and c["status"] == "entregue", c
        return d, c
    d1, c1 = deliver(s1, 3, "p1")
    st_partial = R.status(order)
    ok("partial delivery 3/5 confirmed; order NOT concluded", st_partial != "entregue", st_partial)
    mv_s1 = B.last(f"SELECT count(*) FROM public.estoque_movimentacoes WHERE estoque_produto_id='{s1}';")
    cr = B.run_raw(R.confirm_sql(d1, "lla-confirm-p1"))
    ok("confirm replay same key: no new stock movement (no double exit)", B.last(f"SELECT count(*) FROM public.estoque_movimentacoes WHERE estoque_produto_id='{s1}';") == mv_s1, (cr.returncode, err(cr) if cr.returncode else "replay ok"))
    d2, c2 = deliver(s2, 2, "p2")
    final = json.loads(B.last(f"""SELECT jsonb_build_object('order_status',(SELECT status::text FROM public.partner_orders WHERE id='{order}'),
      'delivered',(SELECT coalesce(sum(quantidade_entregue),0) FROM public.entregas WHERE ordem_servico_id='{os_id}' AND status::text='entregue'),
      'reserved_left',(SELECT coalesce(sum(quantidade_reservada),0) FROM public.estoque_produto WHERE reservado_para_os_id='{os_id}' AND status::text='reservado'),
      'receivables',(SELECT count(*) FROM public.accounts_receivable),
      'header_financial',(SELECT financial_approval_status FROM public.partner_orders WHERE id='{order}'))::text;"""))
    (out / "final-state.json").write_text(json.dumps(final, indent=1) + "\n")
    ok("final: 5/5 delivered over two lots, zero reserved left, no receivable created, header untouched (pending)",
       float(final["delivered"]) == 5 and float(final["reserved_left"]) == 0 and str(final["receivables"]) == ar0 and final["header_financial"] == "pending", final)

    # ---- 6. Rollback restaura o predicado legado (mais restritivo), histórico preservado ----
    hist = B.last(f"SELECT count(*) FROM public.entregas WHERE ordem_servico_id='{os_id}';")
    exec_file("04-rollback-restore-legacy-strict.sql.review")
    ok("rollback ACL unchanged vs pinned", {r_["signature"]: acl(r_["signature"]) for r_ in rows} == G.ACL_PINNED)
    ok("rollback: LIVE md5 restored, deliveries kept", all(md5(r_["signature"]) == r_["live_md5"] for r_ in rows) and B.last(f"SELECT count(*) FROM public.entregas WHERE ordem_servico_id='{os_id}';") == hist)
    nr = B.run_raw(R.os_create_sql(order, fx["items"][0]["id"], B.last(f"SELECT updated_at FROM public.partner_orders WHERE id='{order}';"), f"lla-after-rb-{rid}"))
    ok("after rollback canonical-terms order is closed again (fail closed)", nr.returncode != 0, err(nr))
    gates("false")
    rb_rerun = exec_file("04-rollback-restore-legacy-strict.sql.review", raw=True)
    ok("rollback rerun is idempotent (LIVE pins still hold)", rb_rerun.returncode == 0 and all(md5(r_["signature"]) == r_["live_md5"] for r_ in rows), err(rb_rerun) if rb_rerun.returncode else None)
    (out / "executed-sha256.json").write_text(json.dumps({"final_files": final_sha, "executed": executed}, indent=1) + "\n")
    (out / "checks.json").write_text(json.dumps(checks, indent=1) + "\n")
    return checks
