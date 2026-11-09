"""Checks for 81 rev2, executed INSIDE the real-writer harness of b2b-payment-condition-v1-rebase-20261106 (temp mirror copy).

At the hook point the harness has: B3 installed (real create_partner_order_condition_secure / legacy create_partner_order_secure /
respond_b2b_order_quote_secure, real partner_orders triggers), seller A activated pilot [P, PN] (version 2), seller F NOT activated.
Declared seams of that harness stay (auth.uid by GUC, minimal roles/entitlements) - never hosted JWT/RLS proof.
"""
import json, os, pathlib, re, subprocess

PKG = pathlib.Path(__file__).resolve().parent
import sys as _sys; _sys.path.insert(0, str(PKG)); import live_bodies


def run(ns):
    psql, call, check, denied, sim, create, create_sql, legacy, respond, session, parallel, idem, md5_of, out, js = (
        ns[k] for k in ("psql", "call", "check", "denied", "sim", "create", "create_sql", "legacy", "respond", "session", "parallel",
                        "idem", "md5_of", "out", "js"))
    SP = ns["SP"]; P, PN, PF, PO, A, F = ns["P"], ns["PN"], ns["PF"], ns["PO"], ns["A"], ns["F"]
    UB, UN, UB2, UADM, UADMF = ns["UB"], ns["UN"], ns["UB2"], ns["UADM"], ns["UADMF"]
    P3, PLD, PLQ, S, L = ns["P3"], ns["PLD"], ns["PLQ"], ns["S"], ns["L"]
    LIVE_MODE = os.environ.get("CCR2_LIVE_BODIES") == "1"
    PLDF, PLQF = (ns["PLDF"], ns["PLQF"]) if LIVE_MODE else (PLD, PLQ)  # tenant-exclusive F plans only in the LIVE mirror
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


    def counts3():
        return psql("SELECT json_build_object('o',(SELECT count(*) FROM public.partner_orders),'s',(SELECT count(*) FROM platform_private.b2b_order_condition_snapshots),"
                    "'i',(SELECT count(*) FROM public.partner_order_idempotency),'v',(SELECT count(*) FROM platform_private.b2b_condition_versions),"
                    "'a',(SELECT count(*) FROM public.commercial_payment_plan_assignments),'p',(SELECT count(*) FROM public.commercial_payment_plans))::text").stdout.strip()

    def live_tenant_checks():
        # Tenant-exclusive fixture under the CURRENT rule: every plan family resolves to exactly one tenant, none is shared.
        fam = json.loads(psql("SELECT json_agg(json_build_object('id',p.id,'code',p.code,'org',p.organization_id,'orgs',(SELECT count(DISTINCT pa.commercial_owner_organization_id) "
                              "FROM public.commercial_payment_plan_assignments a JOIN public.partner_accounts pa ON pa.id=a.partner_id WHERE a.plan_id=p.id)) ORDER BY p.code) FROM public.commercial_payment_plans p").stdout.strip())
        res["plan_tenants"] = fam
        check("CCR2 TENANT fixture: nenhum plano atribuído a parceiros de mais de um tenant", all(x["orgs"] <= 1 for x in fam), fam)
        check("CCR2 TENANT fixture: todo plano com atribuição tem organization_id resolvido (nenhum NULL/ambíguo)", all(x["org"] for x in fam if x["orgs"] == 1), fam)
        org = {x["id"]: x["org"] for x in fam}
        check("CCR2 TENANT fixture: PLD/PLQ/P3 -> A e PLDF/PLQF -> F", [org.get(k) for k in (PLD, PLQ, P3, PLDF, PLQF)] == [A, A, A, F, F], [org.get(k) for k in (PLD, PLQ, P3, PLDF, PLQF)])
        # payment_choice_required diagnosis: the attempt-10 reproduction (shared family -> organization NULL) inside a rolled-back tx
        probe = ("BEGIN;\nUPDATE public.commercial_payment_plans SET organization_id=NULL WHERE id='%s';\n" % PLD
                 + session(UB, f"SELECT public.b2b_list_payment_condition_options_secure('{P}','{PLD}')::text;") + "\nROLLBACK;")
        r0 = psql(probe, check=False)
        res["diagnosis_shared_plan_null_org"] = {"rc": r0.returncode, "out": r0.stdout.strip()[-400:], "err": r0.stderr.strip()[-300:]}
        try:
            av0 = [o for o in json.loads(r0.stdout.strip().splitlines()[-1]).get("options", []) if o.get("available")]
        except Exception:
            av0 = None
        # Direct reproduction is impossible after install: organization_id is immutable. Cause is demonstrated by attempt-10 (shared family ->
        # ambiguous backfill NULL -> no option -> choice None -> payment_choice_required) plus the positive/negative controls below.
        check("CCR2 DIAG: organization_id do plano é imutável pós-instalação (forçar NULL negado por COMMERCIAL_PLAN_TENANT_IMMUTABLE)",
              r0.returncode != 0 and "COMMERCIAL_PLAN_TENANT_IMMUTABLE" in r0.stderr, res["diagnosis_shared_plan_null_org"])
        c, dbg = opt(UB, P, PLD)
        res["positive_control_P_PLD"] = {"choice": c, "options": dbg}
        check("CCR2 CONTROLE POSITIVO: comprador P vê opção disponível em PLD exclusivo de A (fixture corrigida)", c is not None, dbg)
        if c:
            sm, se = sim(UB, PLD, [L(1)], c, partner=P)
            check("CCR2 CONTROLE POSITIVO: simulação com escolha válida devolve cart_hash (sem payment_choice_required)", sm is not None and bool(sm.get("cart_hash")), se)
            sn, sne = sim(UB, PLD, [L(1)], None, partner=P)
            check("CCR2 CONTROLE NEGATIVO: mesma simulação sem escolha -> payment_choice_required (erro é da escolha, não da guarda 81)",
                  sn is None and "payment_choice_required" in (sne or ""), sne)
        # cross-tenant real (mirror) - each must fail and leave counts unchanged
        before = counts3()
        neg = [
         ("comprador F (UB2) lista opções do plano de A para PF", lambda: call(UB2, f"public.b2b_list_payment_condition_options_secure('{PF}','{PLD}')")),
         ("comprador A (UB) lista opções do plano de F para P", lambda: call(UB, f"public.b2b_list_payment_condition_options_secure('{P}','{PLDF}')")),
         ("comprador F simula com plano de A", lambda: call(UB2, f"public.simulate_b2b_payment_plan_secure('{PF}','{PLD}','{js([ns['SF'](1)])}'::jsonb)")),
         ("comprador A simula com plano de F", lambda: call(UB, f"public.simulate_b2b_payment_plan_secure('{P}','{PLDF}','{js([L(1)])}'::jsonb)")),
         ("comprador F cria (legado) com plano de A", lambda: out(legacy(UB2, PLD, [ns['SF'](1)], "CCR2-X-F-PLD", partner=PF))),
         ("comprador A cria (condição) com plano de F", lambda: out(psql(session(UB, f"SELECT ({create_sql(P, PLDF, [L(1)], 'x'*64, 'CCR2-X-A-PLDF', {'payment_method':'pix','payment_condition_version':1,'payment_deadline_days':2})})::text;"), check=False))),
         ("admin A publica condição no plano de F", lambda: call(UADM, f"public.b2b_payment_condition_publish('{PLDF}','boleto','{ns['M_BOL']}','{ns['CAT']}',30,1,0::numeric,0)")),
         ("admin F publica condição no plano de A", lambda: call(UADMF, f"public.b2b_payment_condition_publish('{PLD}','boleto','{ns['M_BOL']}','{ns['CAT']}',30,1,0::numeric,0)")),
         ("admin A atribui plano de F ao parceiro P", lambda: call(UADM, f"public.b2b_payment_condition_assign('{P}','{PLDF}','pix',1,true)")),
         ("admin F atribui plano de A ao parceiro PF", lambda: call(UADMF, f"public.b2b_payment_condition_assign('{PF}','{PLD}','pix',1,true)")),
         ("admin F aposenta condição do plano de A", lambda: call(UADMF, f"public.b2b_payment_condition_retire('{PLD}','pix',1)")),
        ]
        xt = {}
        for name, fn_ in neg:
            j, e = fn_()
            xt[name] = e or j
            if name.startswith("comprador") and "lista" in name:
                # LIVE listing contract denies by exposing NO option (commercial_plan_partner_visible false), not by raising.
                check("CCR2 CROSS-TENANT negado (nenhuma opção exposta): " + name, (j is None and bool(e)) or (j is not None and j.get("options") == []), e or j)
            else:
                check("CCR2 CROSS-TENANT negado: " + name, j is None and bool(e), e or j)
        res["cross_tenant"] = xt
        check("CCR2 CROSS-TENANT: zero delta em pedidos/snapshots/idempotência/versões/atribuições/planos", counts3() == before, (before, counts3()))
        c2, d2 = opt(UB2, PF, PLDF)
        res["positive_control_PF_PLDF"] = d2
        check("CCR2 CONTROLE POSITIVO F: comprador F vê a própria opção pix em PLDF", c2 is not None, d2)

    def counts():
        return psql("SELECT json_build_object('o',(SELECT count(*) FROM public.partner_orders),'s',(SELECT count(*) FROM platform_private.b2b_order_condition_snapshots),"
                    "'q',(SELECT count(*) FROM platform_private.b2b_order_condition_quote_snapshots),'i',(SELECT count(*) FROM public.partner_order_idempotency))").stdout.strip()

    # ---------- baseline pins measured on the installed B3 harness ----------
    check("CCR2 pins B3: mode/required_check MD5 = metadados B3 instalados",
          md5_of("platform_private.b2b_condition_mode(uuid)") == "7830c32a4ae139d9ab7e377dd39c8df6"
          and md5_of("platform_private.b2b_condition_required_check()") == "236b821b0ca568c81a9667512dae5def",
          (md5_of("platform_private.b2b_condition_mode(uuid)"), md5_of("platform_private.b2b_condition_required_check()")))


    if os.environ.get("CCR2_LIVE_BODIES") == "1":
        import live_bodies
        f = work / "ccr2-live-bodies.sql"; f.write_text(live_bodies.sql()); f.chmod(0o644)
        if os.environ.get("CCR2_PROBE") == "1":
            f.write_text(re.sub(r"^(BEGIN|COMMIT);$", r"-- \\1", live_bodies.sql(), flags=re.M)); f.chmod(0o644)
        r = subprocess.run(SP.su() + ["psql", "-X", "-q", "-h", SP.SOCK[0], "-p", SP.PORT, "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=%s" % ("0" if os.environ.get("CCR2_PROBE") == "1" else "1"), "-f", str(f)], capture_output=True, text=True, timeout=120)
        if os.environ.get("CCR2_PROBE") == "1": r = subprocess.CompletedProcess(r.args, 9, r.stdout, "\n".join(l for l in r.stderr.splitlines() if "ERROR" in l))
        lv = {k: {"mirror": md5_of(k), "live": v} for k, v in live_bodies.LIVE.items()}
        res["live_bodies_other_md5_unconfirmed"] = out(psql("SELECT json_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)) ORDER BY 1) FROM pg_proc p WHERE p.proname = ANY(ARRAY%s)" % json.dumps(live_bodies.other_names()).replace('"', "'")))[0]
        res["live_bodies"] = {"install_rc": r.returncode, "install_err": r.stderr[-6000:], "md5": lv, "seams": [x[0] for x in live_bodies.SEAMS]}
        check("CCR2 LIVE: corpos atuais (cc1f6cc) instalados no espelho", r.returncode == 0, r.stderr[-400:])
        check("CCR2 LIVE: md5 dos writers no espelho = LIVE informado", all(x["mirror"] == x["live"] for x in lv.values()), lv)
        pathlib.Path(os.environ.get("CCR2_EVIDENCE", str(work)), "hook-results.json").write_text(json.dumps(res, indent=2, ensure_ascii=False) + "\n")
        if os.environ.get("CCR2_PROBE") == "1" or r.returncode != 0:
            raise SystemExit("CCR2_LIVE_BODIES_STOP rc=%s" % r.returncode)
        if os.environ.get("CCR2_LIVE_EXACT7") == "1":
            import live_exact7
            ok7 = live_exact7.run(psql, check, md5_of, call, res, pathlib.Path(os.environ.get("CCR2_EVIDENCE", str(work))),
                                  {"UB": UB, "UB2": UB2, "P": P, "PF": PF, "UADM": UADM})
            pathlib.Path(os.environ.get("CCR2_EVIDENCE", str(work)), "hook-results.json").write_text(json.dumps(res, indent=2, ensure_ascii=False) + "\n")
            if not ok7:
                raise SystemExit("CCR2_LIVE_EXACT7_STOP")
        live_tenant_checks()
    r = runsql("80-ccr2-pre.sql.readonly"); check("CCR2 80 PRE_OK no B3 instalado", r.returncode == 0 and "CCR2_PRE_OK" in r.stderr, r.stderr[-400:])
    before = counts()
    r = runsql("81-ccr2-install.sql.review"); check("CCR2 81 install", r.returncode == 0, r.stderr[-600:])
    pins = {"__MD5_CHECK__": md5_of("platform_private.b2b_condition_order_coherence_check(uuid,text)"),
            "__MD5_OTRG__": md5_of("platform_private.b2b_condition_order_coherence_trg()"),
            "__MD5_STRG__": md5_of("platform_private.b2b_condition_snapshot_coherence_trg()")}
    res["pins"] = pins
    frozen = json.loads((PKG / "pins.json").read_text()) if (PKG / "pins.json").exists() else None
    check("CCR2 corpos instalados = pins congelados em 82/96", frozen is None or frozen == pins, (frozen, pins))
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
    r = legacy(UB2, PLDF, [ns["SF"](1)], "CCR2-LEG-F", partner=PF); jf, ef = out(r)
    check("CCR2 alcance: tenant F sem ativação segue contrato atual (sem bloqueio global)", jf is not None, ef)
    if jf:
        r = tx(f"UPDATE public.partner_orders SET payment_plan_id='{PLQF}' WHERE id='{jf['id']}';")
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
        RFIX = None; PQ = lambda q: psql(q, check=False)
        if os.environ.get("CCR2_LIVE_EXACT7") == "1":
            import seller_respond_fix as RF
            qs = ns["quote_state"]; st0 = qs(jq["id"])
            j0, e0 = respond(UADM, jq["id"], [{"item_id": qi, "unit_price": 1000}])
            res.setdefault("seller_respond", {})["live_body_admin_owner"] = e0 or j0
            check("CCR2 RESPOND LIVE (4926a99c): admin dono sem vínculo externo é negado por b2b_phase1_scope_denied (defeito reproduzido)",
                  j0 is None and "b2b_phase1_scope_denied" in (e0 or ""), e0 or j0)
            check("CCR2 RESPOND LIVE: negativa não altera estado", qs(jq["id"]) == st0)
            ovm = md5_of("public.b2b_phase1_order_visible(uuid)")
            b = RF.build(psql, pathlib.Path(os.environ.get("CCR2_EVIDENCE", str(work))), ovm)
            r = PQ(b["pre"]); check("CCR2 RESPOND FIX 90 PRE_OK", r.returncode == 0 and "RESPOND_FIX_PRE_OK" in r.stderr, r.stderr[-300:])
            RFIX = RF.finish(psql, b, pathlib.Path(os.environ.get("CCR2_EVIDENCE", str(work))))
            res["seller_respond"]["fix"] = {k: v for k, v in RFIX.items() if k not in ("post", "rollback")}
            check("CCR2 RESPOND FIX 91 install (candidato, só espelho)", RFIX["install_rc"] == 0, RFIX["install_err"])
            r = PQ(RFIX["post"]); check("CCR2 RESPOND FIX 92 POST_OK (md5/owner/ACL)", r.returncode == 0 and "RESPOND_FIX_POST_OK" in r.stderr, r.stderr[-300:])
            check("CCR2 RESPOND FIX: funções globais de visibilidade inalteradas",
                  md5_of("platform_private.b2b_phase1_partner_visible(uuid,boolean)") == "915f516e605af7cc14584e2e762a2661"
                  and md5_of("public.b2b_phase1_order_visible(uuid)") == ovm
                  and md5_of("platform_private.b2b_owner_internal_partner_readable(uuid)") == "fa72ca18fc673cb4a5ff4867e65137cd")
            for who, uid in (("admin da empresa F", UADMF), ("comprador PN", UN), ("comprador P de outro parceiro", UB)):
                st1 = qs(jq["id"]); jn, en = respond(uid, jq["id"], [{"item_id": qi, "unit_price": 1000}])
                res["seller_respond"]["neg_" + who] = en or jn
                check(f"CCR2 RESPOND FIX: {who} continua negado sem alterar estado", jn is None and bool(en) and qs(jq["id"]) == st1, en or jn)
            st1 = qs(jq["id"])
            # admin A with an ACTIVE partner link (external link) must not use the owner path
            r = PQ(f"BEGIN; INSERT INTO public.partner_users(user_id,partner_id,tenant_id) SELECT '{UADM}','{PN}',commercial_owner_organization_id FROM public.partner_accounts WHERE id='{PN}';"
                     f" SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{UADM}',true), set_config('request.jwt.claims', json_build_object('sub','{UADM}','role','authenticated')::text, true);"
                     f" SELECT public.respond_b2b_order_quote_secure('{jq['id']}','{js([{'item_id': qi, 'unit_price': 1000}])}'::jsonb,NULL,NULL,NULL); ROLLBACK;")
            res["seller_respond"]["neg_admin_with_active_partner_link"] = (r.stderr or "")[-300:]
            check("CCR2 RESPOND FIX: admin A com vínculo externo ativo não usa caminho do dono", "ERROR" in (r.stderr or "") and qs(jq["id"]) == st1, r.stderr[-300:])
        j, e = respond(UADM, jq["id"], [{"item_id": qi, "unit_price": 1000}])
        nq = psql(f"SELECT count(*) FROM platform_private.b2b_order_condition_quote_snapshots WHERE order_id='{jq['id']}'").stdout.strip()
        check("CCR2 resposta do vendedor REAL: snapshot econômico coerente aceito pelo guard", j is not None and nq == "1", e or j)
        fails("CCR2 snapshot de resposta com versão/meio (pix v1 existente) divergente da escolha inicial negado",
              tx(f"INSERT INTO public.partner_orders(id,partner_id,payment_plan_id,status) VALUES ('00000000-0000-0000-0000-00000000cc51','{PN}','{P3}','aguardando_cotacao');"
                 f"INSERT INTO platform_private.b2b_order_condition_snapshots SELECT '00000000-0000-0000-0000-00000000cc51',organization_id,partner_id,actor_id,plan_id,choice,condition,request_hash,rows,principal,financed_interest,financed_total,quote,payment_terms_id,cart_hash,payment_method_name,estimated,due_basis,estimated_reference_date,created_at,condition_version,condition_method FROM platform_private.b2b_order_condition_snapshots WHERE order_id='{jq['id']}';"
                 f"INSERT INTO platform_private.b2b_order_condition_quote_snapshots SELECT '00000000-0000-0000-0000-00000000cc51',organization_id,partner_id,actor_id,plan_id,choice,condition,request_hash,rows,principal,financed_interest,financed_total,payment_terms_id,cart_hash,payment_method_name,estimated,due_basis,estimated_reference_date,1,'pix',created_at FROM platform_private.b2b_order_condition_quote_snapshots WHERE order_id='{jq['id']}';"),
              "B2B_PAYMENT_CONDITION")
        if RFIX:
            r = PQ(RFIX["rollback"]); check("CCR2 RESPOND FIX 97 rollback restaura corpo LIVE 4926a99c", r.returncode == 0 and md5_of("public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)") == "4926a99c3fa3086b34ff25bb4b4038bb", r.stderr[-300:])
            r = PQ(RFIX["post"]); check("CCR2 RESPOND FIX POST após rollback recusa (drift)", r.returncode != 0 and "RESPOND_FIX_POST_DRIFT" in r.stderr, r.stderr[-200:])
            r = PQ(RFIX["rollback"]); check("CCR2 RESPOND FIX rollback repetido recusado", r.returncode != 0 and "RESPOND_FIX_ROLLBACK_DRIFT" in r.stderr, r.stderr[-200:])

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
    # ---------- revocation / retirement races: the SECOND operation must really succeed and persist ----------
    def coherent(key):
        return psql("SELECT count(*) FROM platform_private.b2b_order_condition_snapshots s JOIN public.partner_order_idempotency i ON i.order_id=s.order_id "
                    f"JOIN public.partner_orders o ON o.id=s.order_id WHERE i.idempotency_key='{key}' AND s.partner_id=o.partner_id AND s.plan_id=o.payment_plan_id").stdout.strip()

    def revoked(partner, c):
        return psql(f"SELECT count(*) FROM platform_private.b2b_condition_assignment_revocations WHERE organization_id='{A}' AND partner_id='{partner}' AND plan_id='{P3}' "
                    f"AND version={c['payment_condition_version']} AND method='{c['payment_method']}'").stdout.strip() == "1"

    def retired(c):
        return psql(f"SELECT count(*) FROM platform_private.b2b_condition_retirements WHERE organization_id='{A}' AND plan_id='{P3}' "
                    f"AND version={c['payment_condition_version']} AND method='{c['payment_method']}'").stdout.strip() == "1"

    def verdict(rs, key, persisted):
        # PASS requires: 2nd op exit 0 AND its effect persisted AND create either committed coherently or left nothing.
        create_ok = (rs[0].returncode == 0 and idem(key) == "1" and coherent(key) == "1") or (rs[0].returncode != 0 and idem(key) == "0")
        return rs[1].returncode == 0 and persisted() and create_ok, {"create_rc": rs[0].returncode, "second_rc": rs[1].returncode,
                "persisted": persisted(), "idem": idem(key), "coherent": coherent(key), "create_err": rs[0].stderr[-160:], "second_err": rs[1].stderr[-160:]}

    EXPECTED_UNAVAILABLE = "payment_condition_unavailable"

    def counts():
        return psql("SELECT json_build_object('orders',(SELECT count(*) FROM public.partner_orders),'snap',(SELECT count(*) FROM platform_private.b2b_order_condition_snapshots),"
                    "'idem',(SELECT count(*) FROM public.partner_order_idempotency))::text").stdout.strip()

    def after_denied(uid, partner, items, c, key, pre_hash):
        # Replay with the VALID cart_hash/condition captured BEFORE the revocation/retirement, under a NEW key.
        # PASS only with the specific unavailable-condition error and zero order/snapshot/idempotency deltas.
        if not pre_hash:
            return False, {"error": "pre-revocation cart_hash missing (NOT_RUN)"}
        before = counts()
        r = psql(session(uid, f"SELECT {create_sql(partner, P3, items, pre_hash, key, c)};"), check=False)
        after = counts(); err = (r.stderr or "")
        first = next((l for l in err.splitlines() if l.startswith("ERROR:")), "")
        ok = r.returncode != 0 and first.strip() == "ERROR:  " + EXPECTED_UNAVAILABLE and before == after and idem(key) == "0"
        return ok, {"rc": r.returncode, "error": first, "expected": EXPECTED_UNAVAILABLE, "before": before, "after": after, "pre_hash": pre_hash}

    cR, _ = opt(UN, PN, P3)
    if cR:
        sr, _ = sim(UN, P3, [S(1)], cR, partner=PN)
        # Mutation proof: the same race with an INJECTED failing revocation (stale version) must make the verdict FAIL.
        bad = dict(cR, payment_condition_version=cR["payment_condition_version"] + 999)
        cr = session(UN, f"BEGIN; SELECT {create_sql(PN, P3, [S(1)], sr and sr['cart_hash'], 'CCR2-CONC-REV-INJ', cR)}; SELECT pg_sleep(1.2); COMMIT;")
        rv = session(UADM, f"SELECT public.b2b_payment_condition_assign('{PN}','{P3}','{cR['payment_method']}',{bad['payment_condition_version']},false);")
        rs = parallel([cr, rv], [0, 0.4]); v, d = verdict(rs, "CCR2-CONC-REV-INJ", lambda: revoked(PN, cR))
        check("CCR2 mutação: revogação injetada com falha reprova o veredito de concorrência", rs[1].returncode != 0 and not v, d)
        res["mutation_revocation"] = d
        sr, _ = sim(UN, P3, [S(1)], cR, partner=PN); pre_rev_hash = sr and sr["cart_hash"]
        cr = session(UN, f"BEGIN; SELECT {create_sql(PN, P3, [S(1)], sr and sr['cart_hash'], 'CCR2-CONC-REV', cR)}; SELECT pg_sleep(1.2); COMMIT;")
        rv = session(UADM, f"SELECT public.b2b_payment_condition_assign('{PN}','{P3}','{cR['payment_method']}',{cR['payment_condition_version']},false);")
        rs = parallel([cr, rv], [0, 0.4]); v, d = verdict(rs, "CCR2-CONC-REV", lambda: revoked(PN, cR))
        check("CCR2 concorrência revogação: revogação REAL exit 0 e persistida; create serializa sem pedido incoerente", v, d)
        res["race_revocation"] = d
        c2, _ = opt(UN, PN, P3)
        check("CCR2 após revogação: PN sem opção disponível", c2 is None, c2)
        ok_, e = after_denied(UN, PN, [S(1)], cR, "CCR2-POST-REV-COND-NEWKEY", pre_rev_hash)
        check("CCR2 após revogação: replay com hash válido pré-revogação + nova chave -> payment_condition_unavailable, zero pedido/snapshot/idempotência", ok_, e)
        res["after_revocation_replay"] = e
        r = legacy(UN, P3, [S(1)], "CCR2-POST-REV", partner=PN)
        check("CCR2 após revogação: parceiro required NÃO cai no legado", r.returncode != 0 and "B2B_PAYMENT_CONDITION_REQUIRED" in r.stderr and idem("CCR2-POST-REV") == "0", r.stderr[-200:])
    else:
        check("CCR2 concorrência revogação: PN tem opção", False, "sem opção para PN")
    cC, _ = opt(UBC, PC, P3)
    if cC:
        sc, _ = sim(UBC, P3, [L(1)], cC, partner=PC)
        cr = session(UBC, f"BEGIN; SELECT {create_sql(PC, P3, [L(1)], sc and sc['cart_hash'], 'CCR2-CONC-RET-INJ', cC)}; SELECT pg_sleep(1.2); COMMIT;")
        rt = session(UADM, f"SELECT public.b2b_payment_condition_retire('{P3}','{cC['payment_method']}',{cC['payment_condition_version'] + 999});")
        rs = parallel([cr, rt], [0, 0.4]); v, d = verdict(rs, "CCR2-CONC-RET-INJ", lambda: retired(cC))
        check("CCR2 mutação: aposentadoria injetada com falha reprova o veredito de concorrência", rs[1].returncode != 0 and not v, d)
        res["mutation_retirement"] = d
        sc, _ = sim(UBC, P3, [L(1)], cC, partner=PC); pre_ret_hash = sc and sc["cart_hash"]
        cr = session(UBC, f"BEGIN; SELECT {create_sql(PC, P3, [L(1)], sc and sc['cart_hash'], 'CCR2-CONC-RET', cC)}; SELECT pg_sleep(1.2); COMMIT;")
        rt = session(UADM, f"SELECT public.b2b_payment_condition_retire('{P3}','{cC['payment_method']}',{cC['payment_condition_version']});")
        rs = parallel([cr, rt], [0, 0.4]); v, d = verdict(rs, "CCR2-CONC-RET", lambda: retired(cC))
        check("CCR2 concorrência aposentadoria: retire REAL exit 0 e persistido; create serializa sem pedido incoerente", v, d)
        res["race_retirement"] = d
        ok_, e = after_denied(UBC, PC, [L(1)], cC, "CCR2-POST-RET-COND-NEWKEY", pre_ret_hash)
        check("CCR2 após aposentadoria: replay com hash válido pré-retire + nova chave -> payment_condition_unavailable, zero pedido/snapshot/idempotência", ok_, e)
        res["after_retirement_replay"] = e
        r = legacy(UBC, P3, [L(1)], "CCR2-POST-RET", partner=PC)
        check("CCR2 após aposentadoria: parceiro required continua sem fallback legado", r.returncode != 0 and "B2B_PAYMENT_CONDITION_REQUIRED" in r.stderr and idem("CCR2-POST-RET") == "0", r.stderr[-200:])
    else:
        check("CCR2 concorrência aposentadoria: PC tem opção atribuída", False, "sem opção para PC")
    # ---------- snapshot immutability / ACL (B3 objects, read-only checks) ----------
    for t in ("b2b_order_condition_snapshots", "b2b_order_condition_quote_snapshots", "b2b_condition_assignment_revocations", "b2b_condition_retirements"):
        n = psql(f"SELECT count(*) FROM platform_private.{t}").stdout.strip()
        e = psql(f"BEGIN; UPDATE platform_private.{t} SET created_at=created_at WHERE true; ROLLBACK;" if t.endswith("snapshots") else f"BEGIN; DELETE FROM platform_private.{t}; ROLLBACK;", check=False)
        n2 = psql(f"SELECT count(*) FROM platform_private.{t}").stdout.strip()
        res.setdefault("immutability", {})[t] = {"rows": n, "error": (e.stderr or "").strip().splitlines()[:1]}
        check(f"CCR2 {t}: há linhas e UPDATE/DELETE é negado pelo gatilho imutável (mesmo postgres), contagem preservada",
              int(n) > 0 and e.returncode != 0 and "B2B_CONDITION_RECORD_IMMUTABLE" in e.stderr and n2 == n, (n, n2, e.stderr[-160:]))
        acl = psql(f"SELECT bool_or(has_table_privilege(r,'platform_private.{t}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) FROM unnest(ARRAY['anon','authenticated','service_role']) r").stdout.strip()
        check(f"CCR2 {t}: nenhum privilégio de tabela para anon/authenticated/service_role", acl == "f", acl)
    # ---------- writer pins used here vs LIVE reported by the auditor (never repinned) ----------
    LIVE = {"public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)": "fe82f5381d426136f2627803f3b0005d",
            "public.create_partner_order_condition_secure(uuid,text,jsonb,date,uuid,text,text,jsonb)": "e86385fefb25c68d9dd4d0fef6619f27"}
    wp = {k: {"harness": md5_of(k), "live_reported": v} for k, v in LIVE.items()}
    for k, v in wp.items():
        v["equal"] = v["harness"] == v["live_reported"]
        out_dir = pathlib.Path(os.environ.get("CCR2_EVIDENCE", str(work)))
        (out_dir / ("writer-" + k.split("(")[0].split(".")[1] + ".harness.sql")).write_text(psql(f"SELECT pg_get_functiondef('{k}'::regprocedure)").stdout)
    res["writer_pins"] = wp
    check("CCR2 pins dos writers usados registrados vs LIVE (divergência exige diff, não repin)", True, wp)
    check("CCR2 coerência global: todo snapshot casa parceiro/plano/empresa do pedido",
          psql("SELECT count(*) FROM platform_private.b2b_order_condition_snapshots s JOIN public.partner_orders o ON o.id=s.order_id JOIN public.partner_accounts a ON a.id=o.partner_id "
               "WHERE s.partner_id<>o.partner_id OR s.plan_id<>o.payment_plan_id OR s.organization_id<>a.commercial_owner_organization_id").stdout.strip() == "0")

    # ---------- LIVE hash comparison (never repinned) ----------
    if LIVE_MODE:
        man = json.loads((PKG.parents[4] / "scripts/commercial-plans-tenant-20261108/manifest.json").read_text())["candidate_functions"]
        rows = json.loads(psql("SELECT json_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                               "WHERE n.nspname IN ('public','platform_private') AND p.prokind='f'").stdout.strip())
        def norm(k): return k if "." in k.split("(")[0] else "public." + k
        def key(k): return k[len("public."):] if k.startswith("public.") else k  # regprocedure::text omits public. (search_path)
        posplans = {norm(k): {"mirror": rows.get(key(norm(k))), "live_post_pin": v, "equal": rows.get(key(norm(k))) == v} for k, v in man.items()}
        res["posplans_vs_post_pins"] = posplans
        check("CCR2 LIVE: os 25 corpos POSPLANOS no espelho = pins do POST cc1f6cc (POST PASS relatado pelo auditor)", all(x["equal"] for x in posplans.values()),
              {k: v for k, v in posplans.items() if not v["equal"]})
        used = [k for k in rows if any(t in k for t in ("b2b_", "partner_order", "commercial_plan", "c2p1_", "_cpp_", "b2b_condition", "c2_external"))]
        pinned = {key(k) for k in posplans} | {key(k) for k in live_bodies.LIVE}
        res["used_without_live_pin"] = sorted(k for k in used if k not in pinned)
        res["used_md5_mirror"] = {k: rows[k] for k in sorted(used)}
        pathlib.Path(os.environ.get("CCR2_EVIDENCE", str(work)), "live-hash-request.json").write_text(json.dumps(
            {"note": "Assinaturas exercitadas no espelho SEM md5 LIVE confirmado; auditor deve ler md5(pg_get_functiondef) no ref canônico. Nunca repinar no harness.",
             "signatures": {k: rows[k] for k in res["used_without_live_pin"]}}, indent=2, ensure_ascii=False) + "\n")
        posmd5 = lambda: {k: md5_of(k) for k in posplans}
    else:
        posmd5 = lambda: {}
    # ---------- rollback 96 + reinstall ----------
    pm0 = posmd5(); d0 = counts3()
    bad = (PKG / "96-ccr2-rollback.sql.review").read_text().replace(pins["__MD5_CHECK__"], "0" * 32, 1)
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
    check("CCR2 rollback/reinstall 81 preserva todos os writers POSPLANOS (md5 idênticos)", posmd5() == pm0, pm0)
    check("CCR2 rollback/reinstall 81 preserva dados (pedidos/snapshots/idempotência/versões/atribuições/planos)", counts3() == d0, (d0, counts3()))
    r = runsql("96-ccr2-rollback.sql.review"); check("CCR2 rollback final antes do rollback B3 do harness", r.returncode == 0, r.stderr[-300:])
    check("CCR2 rollback final preserva POSPLANOS e dados", posmd5() == pm0 and counts3() == d0, (counts3(),))
    if LIVE_MODE:
        res["b3_rollback_04"] = "NOT_RUN: pinned to pre-cc1f6cc publish body; needs its own reviewed package (never repinned here)"
    pathlib.Path(os.environ.get("CCR2_EVIDENCE", str(work)), "hook-results.json").write_text(json.dumps(res, indent=2, ensure_ascii=False) + "\n")
    if not (PKG / "pins.json").exists():
        (PKG / "pins.json").write_text(json.dumps(pins, indent=2) + "\n")
