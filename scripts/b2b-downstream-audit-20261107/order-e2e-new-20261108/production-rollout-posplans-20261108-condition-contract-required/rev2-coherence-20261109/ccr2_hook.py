"""Checks for 81 rev2, executed INSIDE the real-writer harness of b2b-payment-condition-v1-rebase-20261106 (temp mirror copy).

At the hook point the harness has: B3 installed (real create_partner_order_condition_secure / legacy create_partner_order_secure /
respond_b2b_order_quote_secure, real partner_orders triggers), seller A activated pilot [P, PN] (version 2), seller F NOT activated.
Declared seams of that harness stay (auth.uid by GUC, minimal roles/entitlements) - never hosted JWT/RLS proof.
"""
import json, pathlib, subprocess

PKG = pathlib.Path(__file__).resolve().parent


def run(ns):
    psql, call, check, denied, sim, create, create_sql, legacy, respond, session, parallel, idem, md5_of, out, js = (
        ns[k] for k in ("psql", "call", "check", "denied", "sim", "create", "create_sql", "legacy", "respond", "session", "parallel",
                        "idem", "md5_of", "out", "js"))
    SP = ns["SP"]; P, PN, PF, PO, A, F = ns["P"], ns["PN"], ns["PF"], ns["PO"], ns["A"], ns["F"]
    UB, UN, UB2, UADM, UADMF = ns["UB"], ns["UN"], ns["UB2"], ns["UADM"], ns["UADMF"]
    P3, PLD, PLQ, S, L = ns["P3"], ns["PLD"], ns["PLQ"], ns["S"], ns["L"]
    work = pathlib.Path(SP.SOCK[0])
    res = {}

    def runsql(name):
        src = (PKG / name).read_text()
        for k, v in res.get("pins", {}).items():
            src = src.replace(k, v)
        f = work / ("ccr2-" + name); f.write_text(src); f.chmod(0o644)
        return subprocess.run(SP.su() + ["psql", "-X", "-q", "-t", "-A", "-h", SP.SOCK[0], "-p", SP.PORT, "-U", "postgres", "-d", "t",
                                         "-v", "ON_ERROR_STOP=1", "-f", str(f)], capture_output=True, text=True, timeout=120)

    def opt(uid, partner, plan):
        j, e = call(uid, f"public.b2b_list_payment_condition_options_secure('{partner}','{plan}')")
        av = [o for o in (j or {}).get("options", []) if o.get("available")]
        return ({"payment_method": av[0]["payment_method"], "payment_condition_version": av[0]["payment_condition_version"],
                 "payment_deadline_days": av[0]["payment_deadline_days"]} if av else None), (j, e)

    def new_order(uid, partner, plan, items, key):
        c, dbg = opt(uid, partner, plan)
        s, e = sim(uid, plan, items, c, partner=partner)
        j, e2 = create(uid, plan, items, s and s["cart_hash"], key, c, partner=partner)
        return j, (e2 or e or dbg), c

    ISO = ("ALTER TABLE public.partner_orders DISABLE TRIGGER USER;"
           "ALTER TABLE public.partner_orders ENABLE TRIGGER b2b_condition_zz_coherence_upd;"
           "ALTER TABLE public.partner_orders ENABLE TRIGGER b2b_payment_condition_required;")

    def tx(sql):
        # Isolated negative/positive proof: other USER triggers of partner_orders disabled, rev2 + B3 guards enabled,
        # deferred constraints forced at the end, then ROLLBACK (nothing persists).
        return psql("BEGIN;\n" + ISO + "\n" + sql + "\nSET CONSTRAINTS ALL IMMEDIATE;\nROLLBACK;", check=False)

    def integ(sql):
        # Integrated stack: every real trigger enabled, real COMMIT.
        return psql("BEGIN;\n" + sql + "\nCOMMIT;", check=False)

    def fails(name, r, token):
        check(name, r.returncode != 0 and token in (r.stderr or ""), (r.stderr or r.stdout)[-300:])

    def counts():
        return psql("SELECT json_build_object('o',(SELECT count(*) FROM public.partner_orders),'s',(SELECT count(*) FROM platform_private.b2b_order_condition_snapshots),"
                    "'q',(SELECT count(*) FROM platform_private.b2b_order_condition_quote_snapshots),'i',(SELECT count(*) FROM public.partner_order_idempotency))").stdout.strip()

    # ---------- baseline pins measured on the installed B3 harness ----------
    check("CCR2 pins B3: mode/required_check MD5 = metadados B3 instalados",
          md5_of("platform_private.b2b_condition_mode(uuid)") == "7830c32a4ae139d9ab7e377dd39c8df6"
          and md5_of("platform_private.b2b_condition_required_check()") == "236b821b0ca568c81a9667512dae5def",
          (md5_of("platform_private.b2b_condition_mode(uuid)"), md5_of("platform_private.b2b_condition_required_check()")))


    r = runsql("80-ccr2-pre.sql.readonly"); check("CCR2 80 PRE_OK no B3 instalado", r.returncode == 0 and "CCR2_PRE_OK" in r.stderr, r.stderr[-400:])
    before = counts()
    r = runsql("81-ccr2-install.sql.review"); check("CCR2 81 install", r.returncode == 0, r.stderr[-600:])
    pins = {"__MD5_CHECK__": md5_of("platform_private.b2b_condition_order_coherence_check(uuid,text)"),
            "__MD5_OTRG__": md5_of("platform_private.b2b_condition_order_coherence_trg()"),
            "__MD5_STRG__": md5_of("platform_private.b2b_condition_snapshot_coherence_trg()")}
    res["pins"] = pins
    check("CCR2 install não altera dados", counts() == before, (before, counts()))
    r = runsql("82-ccr2-post.sql.readonly"); check("CCR2 82 POST_OK (owner/ACL/search_path/definer/gatilhos exatos)", r.returncode == 0 and "CCR2_POST_OK" in r.stderr, r.stderr[-600:])
    r = runsql("81-ccr2-install.sql.review"); check("CCR2 reexecução de 81 recusada", r.returncode != 0 and "CCR2_ALREADY_INSTALLED" in r.stderr, r.stderr[-200:])
    r = runsql("80-ccr2-pre.sql.readonly"); check("CCR2 PRE após install recusa (já instalado)", r.returncode != 0 and "CCR2_PRE_ALREADY_INSTALLED" in r.stderr, r.stderr[-200:])
    for role in ("anon", "authenticated", "service_role"):
        v = psql(f"SELECT bool_or(has_function_privilege('{role}',f,'EXECUTE'))::text FROM unnest(ARRAY['platform_private.b2b_condition_order_coherence_check(uuid,text)'::regprocedure,"
                 f"'platform_private.b2b_condition_order_coherence_trg()'::regprocedure,'platform_private.b2b_condition_snapshot_coherence_trg()'::regprocedure]) f", check=False)
        check(f"CCR2 {role} sem EXECUTE nas funções novas", v.returncode != 0 or v.stdout.strip() == "false", v.stdout + v.stderr[-200:])
    j, e = out(SP.as_user(UB, "SELECT platform_private.b2b_condition_order_coherence_check(gen_random_uuid(),'order_update')::text;"))
    check("CCR2 cliente não chama o checker diretamente", j is None and ("permission denied" in (e or "")), e)

    # ---------- positive: real condition writer, pilot partners ----------
    jP, eP, cP = new_order(UB, P, PLD, [L(1)], "CCR2-POS-P")
    check("CCR2 positivo: writer REAL de condição (parceiro P do piloto) cria pedido com snapshot coerente", jP and jP.get("payment_condition_contract") == "B2B_PAYMENT_CONDITION_V1", eP)
    jN, eN, cN = new_order(UN, PN, P3, [S(1)], "CCR2-POS-PN")
    check("CCR2 positivo: novo parceiro PN (piloto ampliado) cria pedido com snapshot coerente", jN and jN.get("payment_condition_contract") == "B2B_PAYMENT_CONDITION_V1", eN)
    if jN:
        s = json.loads(psql(f"SELECT to_jsonb(s) - 'rows' - 'condition' FROM platform_private.b2b_order_condition_snapshots s WHERE order_id='{jN['id']}'").stdout.strip())
        check("CCR2 snapshot PN grava empresa A/parceiro/plano/versão/meio escolhidos", s["organization_id"] == A and s["partner_id"] == PN and s["plan_id"] == P3
              and s["condition_method"] == cN["payment_method"] and s["condition_version"] == cN["payment_condition_version"], s)
    # idempotent replay: same key returns same order, no second snapshot
    if jN:
        n0 = counts()
        s2, _ = sim(UN, P3, [S(1)], cN, partner=PN)
        j2, e2 = create(UN, P3, [S(1)], s2 and s2["cart_hash"], "CCR2-POS-PN", cN, partner=PN)
        check("CCR2 idempotência: replay da mesma chave devolve o mesmo pedido sem novo snapshot", j2 and j2["id"] == jN["id"] and counts() == n0 and idem("CCR2-POS-PN") == "1", (e2, j2 and j2.get("id")))

    # ---------- snapshot cannot legitimize a partner/plan swap ----------
    if jP and jN:
        fails("CCR2 troca de plano em pedido com snapshot negada (snapshot antigo não legitima)",
              tx(f"UPDATE public.partner_orders SET payment_plan_id='{PLQ}' WHERE id='{jP['id']}';"), "B2B_PAYMENT_CONDITION_SNAPSHOT_INCOHERENT")
        fails("CCR2 troca de parceiro (P->PN) em pedido com snapshot negada",
              tx(f"UPDATE public.partner_orders SET partner_id='{PN}' WHERE id='{jP['id']}';"), "B2B_PAYMENT_CONDITION_SNAPSHOT_INCOHERENT")
        fails("CCR2 troca para parceiro de outro tenant (F) negada",
              tx(f"UPDATE public.partner_orders SET partner_id='{PF}' WHERE id='{jP['id']}';"), "B2B_PAYMENT_CONDITION_SNAPSHOT_INCOHERENT")
        fails("CCR2 troca e volta no mesmo commit: estado final coerente é exigido (ida para plano sem condição negada)",
              tx(f"UPDATE public.partner_orders SET payment_plan_id='{PLQ}' WHERE id='{jP['id']}'; UPDATE public.partner_orders SET payment_plan_id='{P3}' WHERE id='{jP['id']}';"),
              "B2B_PAYMENT_CONDITION_SNAPSHOT_INCOHERENT")
        r = integ(f"UPDATE public.partner_orders SET payment_plan_id='{PLQ}' WHERE id='{jP['id']}';")
        check("CCR2 pilha integrada (todos os gatilhos reais): troca de plano em pedido com snapshot não confirma", r.returncode != 0, r.stderr[-200:])
        r = tx(f"UPDATE public.partner_orders SET payment_plan_id='{P3}' WHERE id='{jP['id']}'; UPDATE public.partner_orders SET payment_plan_id='{PLD}' WHERE id='{jP['id']}';")
        check("CCR2 troca e volta ao plano original no mesmo commit: estado final coerente aceito", r.returncode == 0, r.stderr[-200:])
        # a snapshot copied from another order cannot be grafted onto a different order
        fails("CCR2 snapshot de outro pedido/parceiro inserido em pedido alheio negado",
              tx(f"INSERT INTO public.partner_orders(id,partner_id,payment_plan_id,status) VALUES ('00000000-0000-0000-0000-00000000cc21','{PN}','{P3}','em_analise_comercial');"
                 f"INSERT INTO platform_private.b2b_order_condition_snapshots SELECT '00000000-0000-0000-0000-00000000cc21',organization_id,partner_id,actor_id,plan_id,choice,condition,request_hash,rows,principal,financed_interest,financed_total,quote,payment_terms_id,cart_hash,payment_method_name,estimated,due_basis,estimated_reference_date,created_at,condition_version,condition_method FROM platform_private.b2b_order_condition_snapshots WHERE order_id='{jP['id']}';"),
              "B2B_PAYMENT_CONDITION")
        fails("CCR2 snapshot com versão/meio adulterados no JSON da escolha negado",
              tx(f"INSERT INTO public.partner_orders(id,partner_id,payment_plan_id,status) VALUES ('00000000-0000-0000-0000-00000000cc22','{P}','{PLD}','em_analise_comercial');"
                 f"INSERT INTO platform_private.b2b_order_condition_snapshots SELECT '00000000-0000-0000-0000-00000000cc22',organization_id,partner_id,actor_id,plan_id,choice || jsonb_build_object('payment_method','boleto'),condition,request_hash,rows,principal,financed_interest,financed_total,quote,payment_terms_id,cart_hash,payment_method_name,estimated,due_basis,estimated_reference_date,created_at,condition_version,condition_method FROM platform_private.b2b_order_condition_snapshots WHERE order_id='{jP['id']}';"),
              "B2B_PAYMENT_CONDITION_SNAPSHOT_INCOHERENT")
        check("CCR2 nenhum pedido/snapshot forjado sobreviveu", psql("SELECT count(*) FROM public.partner_orders WHERE id::text LIKE '00000000-0000-0000-0000-00000000cc2%'").stdout.strip() == "0")
        jj = json.loads(psql(f"SELECT json_build_object('p',partner_id,'pl',payment_plan_id) FROM public.partner_orders WHERE id='{jP['id']}'").stdout.strip())
        check("CCR2 pedido real intacto após negações integradas", jj == {"p": P, "pl": PLD}, jj)

    # ---------- required partner without snapshot via UPDATE (B3 INSERT-only gap) ----------
    fails("CCR2 lavagem: insere em parceiro legado PO e move para PN do piloto no mesmo commit -> negado",
          tx(f"INSERT INTO public.partner_orders(id,partner_id,payment_plan_id,status) VALUES ('00000000-0000-0000-0000-00000000cc31','{PO}','{P3}','em_analise_comercial');"
             f"UPDATE public.partner_orders SET partner_id='{PN}' WHERE id='00000000-0000-0000-0000-00000000cc31';"), "B2B_PAYMENT_CONDITION_REQUIRED")
    fails("CCR2 lavagem: insere sem plano e atribui plano a parceiro do piloto -> negado",
          tx(f"INSERT INTO public.partner_orders(id,partner_id,payment_plan_id,status) VALUES ('00000000-0000-0000-0000-00000000cc32','{PN}',NULL,'em_analise_comercial');"
             f"UPDATE public.partner_orders SET payment_plan_id='{P3}' WHERE id='00000000-0000-0000-0000-00000000cc32';"), "B2B_PAYMENT_CONDITION_REQUIRED")
    r = legacy(UN, P3, [S(1)], "CCR2-LEG-PN")
    check("CCR2 parceiro do piloto: writer legado REAL não grava pedido nem idempotência (motivo registrado)", r.returncode != 0 and idem("CCR2-LEG-PN") == "0", r.stderr[-200:])
    res["legacy_pn_denial"] = (r.stderr or "").strip().splitlines()[:1]

    # ---------- scope: outside pilot / other tenant unaffected ----------
    r = legacy(UB2, PLD, [ns["SF"](1)], "CCR2-LEG-F", partner=PF); jf, ef = out(r)
    check("CCR2 alcance: tenant F sem ativação segue contrato atual (sem bloqueio global)", jf is not None, ef)
    if jf:
        r = tx(f"UPDATE public.partner_orders SET payment_plan_id='{PLQ}' WHERE id='{jf['id']}';")
        check("CCR2 alcance: troca de plano em pedido legado de F sem ativação não é afetada pelo guard novo", r.returncode == 0, r.stderr[-200:])
    # historical legacy order (PB-001038 shape: legacy order, no snapshot, partner now 'required')
    HI = f"INSERT INTO public.partner_orders(id,partner_id,payment_plan_id,status) VALUES ('00000000-0000-0000-0000-00000000cc41','{PN}','{P3}','em_analise_comercial');"
    HI_LEG = f"INSERT INTO public.partner_orders(id,partner_id,payment_plan_id,status) VALUES ('00000000-0000-0000-0000-00000000cc41','{PO}','{P3}','em_analise_comercial');"
    r = tx(HI_LEG + "UPDATE public.partner_orders SET status=status WHERE id='00000000-0000-0000-0000-00000000cc41';")
    check("CCR2 legado histórico: update comum (sem troca de parceiro/plano) não dispara o guard", r.returncode == 0, r.stderr[-200:])
    fails("CCR2 legado histórico: não pode ser movido para parceiro do piloto sem snapshot",
          tx(HI_LEG + f"UPDATE public.partner_orders SET partner_id='{PN}' WHERE id='00000000-0000-0000-0000-00000000cc41';"), "B2B_PAYMENT_CONDITION_REQUIRED")
    r = psql(f"BEGIN; ALTER TABLE public.partner_orders DISABLE TRIGGER USER; {HI} ALTER TABLE public.partner_orders ENABLE TRIGGER USER; COMMIT;", check=False)
    check("CCR2 fixture histórica não deixou gatilho desabilitado", psql("SELECT count(*) FROM pg_trigger WHERE tgrelid='public.partner_orders'::regclass AND NOT tgisinternal AND tgenabled<>'O'").stdout.strip() == "0")
    check("CCR2 fixture PB-001038-like (pedido legado sem snapshot de parceiro hoje no piloto) criada como linha histórica", r.returncode == 0, r.stderr[-200:])
    r = tx("UPDATE public.partner_orders SET status=status WHERE id='00000000-0000-0000-0000-00000000cc41';")
    check("CCR2 PB-001038-like: atualização comum segue permitida (histórico preservado, sem backfill)", r.returncode == 0, r.stderr[-200:])
    fails("CCR2 PB-001038-like: troca de plano sem snapshot negada", tx(f"UPDATE public.partner_orders SET payment_plan_id='{PLD}' WHERE id='00000000-0000-0000-0000-00000000cc41';"), "B2B_PAYMENT_CONDITION_REQUIRED")
    fails("CCR2 legado histórico: backfill de snapshot fictício negado (escolha/condição de outro pedido)",
          tx(f"INSERT INTO platform_private.b2b_order_condition_snapshots SELECT '00000000-0000-0000-0000-00000000cc41',organization_id,partner_id,actor_id,plan_id,choice,condition,request_hash,rows,principal,financed_interest,financed_total,quote,payment_terms_id,cart_hash,payment_method_name,estimated,due_basis,estimated_reference_date,created_at,condition_version,condition_method FROM platform_private.b2b_order_condition_snapshots WHERE order_id='{jN['id'] if jN else jP['id']}';"),
          "B2B_PAYMENT_CONDITION_SNAPSHOT_INCOHERENT")

    # ---------- quote -> seller response ----------
    psql(f"UPDATE public.commercial_payment_plans SET pricing_mode='quote_only' WHERE id='{P3}'")
    jq, eq, cq = new_order(UN, PN, P3, [S(1)], "CCR2-COT-PN")
    psql(f"UPDATE public.commercial_payment_plans SET pricing_mode='discount_from_base' WHERE id='{P3}'")
    check("CCR2 cotação: writer REAL cria cotação com snapshot (quote) para PN", jq and jq["status"] == "aguardando_cotacao", eq)
    if jq:
        qi = psql(f"SELECT id FROM public.partner_order_items WHERE order_id='{jq['id']}'").stdout.strip()
        j, e = respond(UADM, jq["id"], [{"item_id": qi, "unit_price": 1000}])
        nq = psql(f"SELECT count(*) FROM platform_private.b2b_order_condition_quote_snapshots WHERE order_id='{jq['id']}'").stdout.strip()
        check("CCR2 resposta do vendedor REAL: snapshot econômico coerente aceito pelo guard", j is not None and nq == "1", e or j)
        fails("CCR2 snapshot de resposta com versão/meio (pix v1 existente) divergente da escolha inicial negado",
              tx(f"INSERT INTO public.partner_orders(id,partner_id,payment_plan_id,status) VALUES ('00000000-0000-0000-0000-00000000cc51','{PN}','{P3}','aguardando_cotacao');"
                 f"INSERT INTO platform_private.b2b_order_condition_snapshots SELECT '00000000-0000-0000-0000-00000000cc51',organization_id,partner_id,actor_id,plan_id,choice,condition,request_hash,rows,principal,financed_interest,financed_total,quote,payment_terms_id,cart_hash,payment_method_name,estimated,due_basis,estimated_reference_date,created_at,condition_version,condition_method FROM platform_private.b2b_order_condition_snapshots WHERE order_id='{jq['id']}';"
                 f"INSERT INTO platform_private.b2b_order_condition_quote_snapshots SELECT '00000000-0000-0000-0000-00000000cc51',organization_id,partner_id,actor_id,plan_id,choice,condition,request_hash,rows,principal,financed_interest,financed_total,payment_terms_id,cart_hash,payment_method_name,estimated,due_basis,estimated_reference_date,1,'pix',created_at FROM platform_private.b2b_order_condition_quote_snapshots WHERE order_id='{jq['id']}';"),
              "B2B_PAYMENT_CONDITION")

    # ---------- concurrency with real writers ----------
    # (a) activation added while a legacy create of a not-yet-pilot partner is open: commit-time B3+rev2 decide on committed activation.
    # PC is seller-A partner outside pilot with boleto assignment on P3.
    PC, UBC = ns["PC"], ns["UBC"]
    psql(f"UPDATE public.partner_financial_settings SET credit_limit=1000000 WHERE partner_id IN ('{PC}','{PN}')")  # declared fixture: credit not under test here
    act = json.loads(psql(f"SELECT json_build_object('v',version,'ids',pilot_partner_ids) FROM platform_private.b2b_condition_activation WHERE organization_id='{A}'").stdout.strip())
    sl, _ = call(UBC, f"public.simulate_b2b_payment_plan_secure('{PC}','{P3}','{js([L(1)])}'::jsonb)")
    leg_sql = session(UBC, f"BEGIN; SELECT public.create_partner_order_secure('{PC}',NULL,'{js([L(1)])}'::jsonb,NULL,'{P3}',NULL,NULL,'{sl and sl['cart_hash']}','CCR2-CONC-ACT'); SELECT pg_sleep(1.5); COMMIT;")
    ids = ",".join(f"'{x}'::uuid" for x in act["ids"] + [PC])
    act_sql = session(UADM, f"SELECT public.b2b_payment_condition_activation_set('pilot',ARRAY[{ids}],{act['v']});")
    rs = parallel([leg_sql, act_sql], [0, 0.4])
    check("CCR2 concorrência ativação: piloto ampliado durante create legado aberto -> commit negado (sem pedido/idempotência)",
          rs[1].returncode == 0 and rs[0].returncode != 0 and "B2B_PAYMENT_CONDITION_REQUIRED" in rs[0].stderr and idem("CCR2-CONC-ACT") == "0",
          (rs[0].stderr[-200:], rs[1].stderr[-200:]))
    # (c) revocation (assign disabled) racing create of PN.
    cR, _ = opt(UN, PN, P3)
    if cR:
        sr, _ = sim(UN, P3, [S(1)], cR, partner=PN)
        cr = session(UN, f"BEGIN; SELECT {create_sql(PN, P3, [S(1)], sr and sr['cart_hash'], 'CCR2-CONC-REV', cR)}; SELECT pg_sleep(1.2); COMMIT;")
        rv = session(UADM, f"SELECT public.b2b_payment_condition_assign('{PN}','{P3}','{cR['payment_method']}',{cR['payment_condition_version']},false);")
        rs = parallel([cr, rv], [0, 0.4])
        check("CCR2 concorrência revogação: create REAL e revogação serializam sem pedido incoerente",
              (rs[0].returncode == 0 and idem("CCR2-CONC-REV") == "1") or (rs[0].returncode != 0 and idem("CCR2-CONC-REV") == "0"), (rs[0].stderr[-200:], rs[1].stderr[-200:]))
        r = legacy(UN, P3, [S(1)], "CCR2-POST-REV", partner=PN)
        check("CCR2 após revogação: parceiro required NÃO cai no legado", r.returncode != 0 and "B2B_PAYMENT_CONDITION_REQUIRED" in r.stderr and idem("CCR2-POST-REV") == "0", r.stderr[-200:])
    else:
        check("CCR2 concorrência revogação: PN tem opção", False, "sem opção para PN")
    # (b) retirement racing a condition create: create holds version FOR SHARE; retire waits; order remains coherent.
    cC, _ = opt(UBC, PC, P3)
    if cC:
        sc, _ = sim(UBC, P3, [L(1)], cC, partner=PC)
        cr = session(UBC, f"BEGIN; SELECT {create_sql(PC, P3, [L(1)], sc and sc['cart_hash'], 'CCR2-CONC-RET', cC)}; SELECT pg_sleep(1.2); COMMIT;")
        rt = session(UADM, f"SELECT public.b2b_payment_condition_retire('{P3}','{cC['payment_method']}',{cC['payment_condition_version']});")
        rs = parallel([cr, rt], [0, 0.4])
        coh = psql("SELECT count(*) FROM platform_private.b2b_order_condition_snapshots s JOIN public.partner_order_idempotency i ON i.order_id=s.order_id "
                   f"JOIN public.partner_orders o ON o.id=s.order_id WHERE i.idempotency_key='CCR2-CONC-RET' AND s.partner_id=o.partner_id AND s.plan_id=o.payment_plan_id").stdout.strip()
        check("CCR2 concorrência aposentadoria: create REAL e retire serializam; pedido (se criado) tem snapshot coerente, sem pedido parcial",
              (rs[0].returncode == 0 and coh == "1") or (rs[0].returncode != 0 and idem("CCR2-CONC-RET") == "0"), (rs[0].stderr[-200:], rs[1].stderr[-200:], coh))
        r = legacy(UBC, P3, [L(1)], "CCR2-POST-RET", partner=PC)
        check("CCR2 após aposentadoria: parceiro required continua sem fallback legado", r.returncode != 0 and "B2B_PAYMENT_CONDITION_REQUIRED" in r.stderr, r.stderr[-200:])
    else:
        check("CCR2 concorrência aposentadoria: PC tem opção atribuída", False, "sem opção para PC")
    check("CCR2 coerência global: todo snapshot casa parceiro/plano/empresa do pedido",
          psql("SELECT count(*) FROM platform_private.b2b_order_condition_snapshots s JOIN public.partner_orders o ON o.id=s.order_id JOIN public.partner_accounts a ON a.id=o.partner_id "
               "WHERE s.partner_id<>o.partner_id OR s.plan_id<>o.payment_plan_id OR s.organization_id<>a.commercial_owner_organization_id").stdout.strip() == "0")

    # ---------- rollback 96 + reinstall ----------
    bad = (PKG / "96-ccr2-rollback.sql.review").read_text().replace("__MD5_CHECK__", "0" * 32)
    f = work / "ccr2-bad-rb.sql"; f.write_text(bad.replace("__MD5_OTRG__", pins["__MD5_OTRG__"]).replace("__MD5_STRG__", pins["__MD5_STRG__"])); f.chmod(0o644)
    r = subprocess.run(SP.su() + ["psql", "-X", "-q", "-h", SP.SOCK[0], "-p", SP.PORT, "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1", "-f", str(f)], capture_output=True, text=True)
    check("CCR2 rollback com pin divergente aborta sem remover nada", r.returncode != 0 and "CCR2_RB_PIN_DRIFT" in r.stderr
          and psql("SELECT to_regprocedure('platform_private.b2b_condition_order_coherence_check(uuid,text)') IS NOT NULL").stdout.strip() == "t")
    n0 = counts()
    r = runsql("96-ccr2-rollback.sql.review"); check("CCR2 96 rollback exato", r.returncode == 0, r.stderr[-300:])
    check("CCR2 rollback preserva pedidos/snapshots/idempotência", counts() == n0)
    check("CCR2 rollback mantém guarda B3 de INSERT (sem reabrir legado)",
          md5_of("platform_private.b2b_condition_required_check()") == "236b821b0ca568c81a9667512dae5def"
          and legacy(UN, P3, [S(1)], "CCR2-RB-LEG", partner=PN).returncode != 0)
    r = runsql("80-ccr2-pre.sql.readonly"); check("CCR2 PRE volta a passar após rollback", r.returncode == 0 and "CCR2_PRE_OK" in r.stderr, r.stderr[-200:])
    r = runsql("81-ccr2-install.sql.review"); check("CCR2 reinstall após rollback", r.returncode == 0, r.stderr[-300:])
    r = runsql("82-ccr2-post.sql.readonly"); check("CCR2 POST após reinstall", r.returncode == 0 and "CCR2_POST_OK" in r.stderr, r.stderr[-300:])
    r = runsql("96-ccr2-rollback.sql.review"); check("CCR2 rollback final antes do rollback B3 do harness", r.returncode == 0, r.stderr[-300:])
    (PKG / "pins.json").write_text(json.dumps(pins, indent=2) + "\n")
