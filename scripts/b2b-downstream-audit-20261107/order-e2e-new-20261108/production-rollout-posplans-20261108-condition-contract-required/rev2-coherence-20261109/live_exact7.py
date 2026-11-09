"""Mirror-only overlay: install the 7 bodies the auditor read in production (09/11, ref swzpzcwiasxmjutrmvkm) VERBATIM.

Source: live-exact-7/capture-20261109.json (md5(definition) re-verified on load; mismatch = abort, never repin).
Real dependency of the LIVE guard: platform_private.b2b_resale_delivery_status_transition_valid_v1 (+ order_valid_v1 and the
singleton gate table) copied verbatim from the installed step 41 package; gate row stays enabled=false (logistics OFF).
No stub replaces b2b_actor_scope / c2_partner_order_attempt_authz: both run their real bodies against real fixture links.
Declared Auth seam (harness, not LIVE): auth.uid() = request.jwt.claim.sub set by the harness under SET ROLE.
"""
import hashlib, json, pathlib, re

PKG = pathlib.Path(__file__).resolve().parent
ROOT = PKG.parents[4]
CAP = PKG / "live-exact-7" / "capture-20261109.json"
S41 = ROOT / "scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/production-rollout-posplans-20261108/41-logistics-install.sql.review"
GATE = "platform_private.b2b_resale_logistics_gate_v1"
DEPS = ["platform_private.b2b_resale_delivery_order_valid_v1", "platform_private.b2b_resale_delivery_status_transition_valid_v1"]


CAP06 = ROOT / "scripts/b2b-order-payment-terms-read-20261106/captured"
# Real LIVE captures of 06/11 already in the repo; installed only where the mirror lacks the function name (never replacing a body).
CAP06_FILES = ["public.is_valid_b2b_partner_user.0bb0dea0.live-20261106.sql", "platform_private.b2b_phase1_partner_visible.915f516e.live-20261106.sql",
               "public.b2b_phase1_partner_visible.6b3defc0.live-20261106.sql",
               "platform_private.b2b_owner_internal_partner_readable.fa72ca18.live-20261106.sql",
               "platform_private.b2b_phase1_order_visible.8504f07f.live-20261106.sql"]


def capture():
    c = json.loads(CAP.read_text())
    for x in c:
        if hashlib.md5(x["definition"].encode()).hexdigest() != x["md5"]:
            raise SystemExit("LIVE_EXACT7_CAPTURE_TAMPERED " + x["sig"])
    return c


def fn41(name):
    t = S41.read_text(); a = t.index("CREATE FUNCTION " + name + "(")
    b = t.index("$$;", t.index("AS $$", a) + 5) + 3
    revoke = re.search(r"\nREVOKE ALL ON FUNCTION " + re.escape(name) + r"\([^\n]*;\n", t[b:b + 400])
    return t[a:b] + "\n" + (revoke.group(0) if revoke else "")


def gate_sql():
    t = S41.read_text(); a = t.index("CREATE TABLE " + GATE + "(")
    b = t.index("REVOKE ALL ON " + GATE, a); b = t.index(";\n", b) + 2
    return t[a:b]


# Declared REDUCED schema seam (B3 harness has no logistics tables). Created only if absent, EMPTY, no grants, columns limited
# to those referenced by the verbatim step-41 bodies. Not LIVE schema (LIVE entregas has 85 columns); only lets the real bodies compile.
# delivery_context_20261030 DDL copied verbatim from scripts/b2b-solid-packaging-order-20261106/real_triggers.py.
LOGISTICS_SEAM = """DO $s$ BEGIN
 IF to_regclass('public.ordens_servico') IS NULL THEN
  CREATE TABLE public.ordens_servico(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, partner_order_id uuid REFERENCES public.partner_orders(id),
   partner_order_item_id uuid, origem text, produto_id uuid, microrganismo_id uuid);
  REVOKE ALL ON public.ordens_servico FROM PUBLIC; END IF;
 IF to_regclass('public.entregas') IS NULL THEN
  CREATE TABLE public.entregas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, partner_order_id uuid, receivable_id uuid,
   ordem_servico_id uuid REFERENCES public.ordens_servico(id), ordem_servico_onfarm_id uuid, cliente_id uuid, produto_id uuid, status text, quantidade_entregue numeric);
  REVOKE ALL ON public.entregas FROM PUBLIC; END IF;
END $s$;
CREATE TABLE IF NOT EXISTS platform_private.delivery_context_20261030(txid bigint NOT NULL PRIMARY KEY, actor uuid NOT NULL, organization_id uuid NOT NULL,
  action text NOT NULL, target uuid, consumed boolean DEFAULT false NOT NULL, item uuid, delivery uuid, mutation text);"""


CAP23 = PKG / "live-exact-7" / "capture-23-20261109.json"
S31 = ROOT / "scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/production-rollout-posplans-20261108/31-physical-install.sql.review"
S61 = ROOT / "scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/production-rollout-posplans-20261108/61-pilot-containment-install.sql.review"
# Real step-61 objects (installed in production, POST62 pins resale_pilot_delivery_scope_v1 = 2350b653…); copied verbatim by line range.
S61_RANGES = [(22, 42), (44, 67), (112, 127)]
S61_DELIVERY_SCOPE_POST = "2350b6535c4b6289f47c200c03000dfb"


def capture23():
    c = json.loads(CAP23.read_text())
    for x in c:
        if hashlib.md5(x["definition"].encode()).hexdigest() != x["md5"]:
            raise SystemExit("LIVE23_CAPTURE_TAMPERED " + x["signature"])
    return c


def s61_sql():
    L = S61.read_text().splitlines()
    return "\n".join("\n".join(L[a - 1:b]) for a, b in S61_RANGES) + "\n"


# Declared REDUCED seams so the verbatim LIVE bodies compile (all absent-only, empty, no grants):
#  - finished_product_gate_v1 DDL verbatim from installed step 31 (row enabled=false);
#  - estoque_produto(id) and entregas.estoque_produto_id referenced by step-61 delivery scope;
#  - profiles.senha_provisoria (LIVE NOT NULL DEFAULT false), platform_org_admin_invites(user_id, access_operation_status,
#    access_valid_after) read by platform_actor_access_ready; authz_tickets(txid,scope,target) read by has_ticket.
SEAMS23 = """DO $s$ BEGIN
 IF to_regclass('platform_private.finished_product_gate_v1') IS NULL THEN
  CREATE TABLE platform_private.finished_product_gate_v1(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
  INSERT INTO platform_private.finished_product_gate_v1(singleton,enabled) VALUES(true,false);
  REVOKE ALL ON platform_private.finished_product_gate_v1 FROM PUBLIC; END IF;
 IF to_regclass('public.estoque_produto') IS NULL THEN CREATE TABLE public.estoque_produto(id uuid PRIMARY KEY DEFAULT gen_random_uuid()); REVOKE ALL ON public.estoque_produto FROM PUBLIC; END IF;
 IF to_regclass('platform_private.authz_tickets') IS NULL THEN CREATE TABLE platform_private.authz_tickets(txid bigint NOT NULL, scope text NOT NULL, target uuid); REVOKE ALL ON platform_private.authz_tickets FROM PUBLIC; END IF;
 IF to_regclass('public.platform_org_admin_invites') IS NULL THEN CREATE TABLE public.platform_org_admin_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, access_operation_status text, access_valid_after timestamptz); REVOKE ALL ON public.platform_org_admin_invites FROM PUBLIC; END IF;
END $s$;
ALTER TABLE public.entregas ADD COLUMN IF NOT EXISTS estoque_produto_id uuid;
ALTER TABLE public.platform_org_admin_invites ADD COLUMN IF NOT EXISTS access_operation_status text, ADD COLUMN IF NOT EXISTS access_valid_after timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS senha_provisoria boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
DO $j$ BEGIN IF to_regprocedure('auth.jwt()') IS NULL THEN
 -- Declared Auth seam (Supabase shape): claims from request.jwt.claims; iat absent -> access_valid_after branch inert.
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
END IF; END $j$;"""

# Real hosted capture of 22/10 (contracts-c2 integral hosted-capture.json fns[98]); NOT reconfirmed 09/11 -> declared, capture requested.
HC = ROOT / "scripts/contracts-c2-20261022/integral/hosted-capture.json"
def hosted_fn(name):
    for f in json.loads(HC.read_text())["fns"]:
        if f.get("def", "").startswith("CREATE OR REPLACE FUNCTION " + name + "("):
            return f["def"]
    raise SystemExit("HOSTED_CAPTURE_MISSING " + name)
EXTRA_REAL = ["platform_private.assert_b2b_partner_scope"]


def install23(psql, check, res, out_dir):
    """Install the 23 bodies read in production on 09/11 verbatim, one transaction each, with the exact LIVE proacl."""
    cap = capture23(); d = out_dir / "live-23"; d.mkdir(exist_ok=True)
    r = psql("BEGIN;\n" + SEAMS23 + "\nCOMMIT;"); res["live23_seams"] = {"rc": r.returncode, "err": (r.stderr or "")[-800:]}
    if psql("SELECT to_regprocedure('platform_private.resale_pilot_delivery_scope_v1(text,text,uuid,uuid,uuid)') IS NULL").stdout.strip() == "t":
        r = psql("BEGIN;\n" + s61_sql() + "COMMIT;"); res["live23_s61"] = {"rc": r.returncode, "err": (r.stderr or "")[-800:]}
    res["live23_extra_real_unconfirmed"] = {}
    for n in EXTRA_REAL:
        if psql(f"SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname||'.'||p.proname='{n}'").stdout.strip() == "0":
            body = hosted_fn(n); r = psql("BEGIN;\n" + body.rstrip("\n") + ";\nREVOKE ALL ON FUNCTION " + n + "(uuid,uuid) FROM PUBLIC;\nCOMMIT;")
            res["live23_extra_real_unconfirmed"][n] = {"source": "contracts-c2-20261022 hosted-capture 22/10", "rc": r.returncode, "err": (r.stderr or "")[-300:],
                "md5_mirror": psql(f"SELECT md5(pg_get_functiondef('{n}(uuid,uuid)'::regprocedure))").stdout.strip()}
    out = {}
    for x in cap:
        sig = x["signature"]
        before = psql(f"SELECT coalesce((SELECT pg_get_functiondef(p) FROM to_regprocedure('{sig}') p WHERE p IS NOT NULL),'<<ABSENT>>')").stdout.rstrip("\n")
        (d / (sig.split("(")[0] + ".mirror-before.sql")).write_text(before + "\n")
        mb = hashlib.md5((before + "\n").encode()).hexdigest() if before != "<<ABSENT>>" else None
        sql = ["BEGIN;"]
        if before != "<<ABSENT>>":
            rt_m = psql(f"SELECT pg_get_function_result('{sig}'::regprocedure)").stdout.strip()
            rt_l = re.search(r"\n RETURNS (.*)\n", x["definition"]).group(1)
            ar_m = psql(f"SELECT pg_get_function_arguments('{sig}'::regprocedure)").stdout.strip()
            ar_l = re.search(r"FUNCTION [^(]+\((.*?)\)\n", x["definition"]).group(1)
            if rt_m != rt_l or ar_m != ar_l:
                sql.append(f"DROP FUNCTION {sig};")  # no CASCADE: fails if anything depends on the old shape
        sql.append(x["definition"].rstrip("\n") + ";")
        sql.append(f"REVOKE ALL ON FUNCTION {sig} FROM PUBLIC, anon, authenticated, service_role;")
        for g, p in re.findall(r"([a-z_]*)=([A-Za-z*]+)/", x["acl"].strip("{}")):
            if g != "postgres" and "X" in p:
                sql.append(f"GRANT EXECUTE ON FUNCTION {sig} TO {g or 'PUBLIC'};")
        sql.append("COMMIT;")
        r = psql("\n".join(sql))
        post = psql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure)), coalesce(proacl::text,'') FROM pg_proc WHERE oid=to_regprocedure('{sig}')").stdout.strip().split("|")
        out[sig] = {"mirror_before": mb, "live": x["md5"], "mirror_after": post[0] if post and post[0] else None,
                    "acl_live": x["acl"], "acl_after": post[1] if len(post) > 1 else None, "rc": r.returncode, "err": (r.stderr or "")[-400:]}
    res["live23"] = out
    bad = {k: v for k, v in out.items() if v["mirror_after"] != v["live"]}
    check("CCR2 LIVE23: md5(pg_get_functiondef) dos 23 no espelho = captura produção 09/11", not bad, bad)
    norm = lambda a: sorted(a.strip("{}").split(",")) if a else []
    badacl = {k: (v["acl_after"], v["acl_live"]) for k, v in out.items() if norm(v["acl_after"]) != norm(v["acl_live"])}
    check("CCR2 LIVE23: ACL (aclitems ordenados) dos 23 no espelho = ACL produção 09/11", not badacl, badacl)
    dsc = psql("SELECT md5(pg_get_functiondef('platform_private.resale_pilot_delivery_scope_v1(text,text,uuid,uuid,uuid)'::regprocedure))").stdout.strip()
    res["live23_s61_delivery_scope_md5"] = dsc
    check("CCR2 LIVE23: resale_pilot_delivery_scope_v1 do repo (etapa 61) = pin POST62", dsc == S61_DELIVERY_SCOPE_POST, dsc)
    return not bad


def run(psql0, check, md5_of, call_sql, res, out_dir, ids):
    psql = lambda q: psql0(q, check=False)
    cap = capture()
    sigs = [x["sig"] for x in cap]
    pre = {}
    d = out_dir / "live-exact-7"; d.mkdir(exist_ok=True)
    for s in sigs:
        r = psql(f"SELECT CASE WHEN to_regprocedure('{s}') IS NULL THEN '<<ABSENT>>' ELSE pg_get_functiondef('{s}'::regprocedure) END")
        pre[s] = r.stdout.rstrip("\n")
        (d / (s.split("(")[0] + ".mirror-before.sql")).write_text(pre[s] + "\n")
    deps_pre = {n: psql(f"SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname||'.'||p.proname='{n}'").stdout.strip() for n in DEPS}
    # Declared FIXTURE seam: LIVE is_valid_b2b_partner_user requires pu.valid_from<=now(); the mirror backfill left it NULL on the
    # synthetic links. Set it to a past instant (no link added/removed, revoked_at untouched).
    # LIVE: partner_users.valid_from timestamptz NOT NULL DEFAULT now() (auditor 09/11). Synthetic rows created before this
    # column existed in the mirror get now() (their creation instant in this run); then the LIVE constraint/default is applied.
    FIX = ("UPDATE public.partner_users SET valid_from=now() WHERE valid_from IS NULL;"
           " ALTER TABLE public.partner_users ALTER COLUMN valid_from SET DEFAULT now(), ALTER COLUMN valid_from SET NOT NULL;")
    sql = ["BEGIN;", LOGISTICS_SEAM, FIX]
    res["live_exact7_seams"] = ["REDUCED logistics schema seam (empty ordens_servico/entregas if absent) + delivery_context_20261030 DDL from real_triggers.py",
                                "Auth: request.jwt.claims set by harness (not hosted JWT)", "FIXTURE: partner_users.valid_from = LIVE shape timestamptz NOT NULL DEFAULT now() (NULL synthetic rows -> now())"]
    if psql(f"SELECT to_regclass('{GATE}') IS NULL").stdout.strip() == "t":
        sql.append(gate_sql())
    res["live_exact7_cap06_installed"] = []
    for fn_ in CAP06_FILES:
        sch, name = fn_.split(".")[0], fn_.split(".")[1]
        if psql(f"SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='{sch}' AND p.proname='{name}'").stdout.strip() == "0":
            sql.append((CAP06 / fn_).read_text().rstrip().rstrip(";") + ";"); res["live_exact7_cap06_installed"].append(fn_)
    for n in DEPS:
        if deps_pre[n] == "0":
            sql.append(fn41(n))
    res["live_exact7_drop_recreate"] = {}
    for x in cap:
        sig = x["sig"]
        rt_live = re.search(r"\n RETURNS (.*)\n", x["definition"]).group(1)
        rt_mirror = psql(f"SELECT pg_get_function_result('{sig}'::regprocedure)").stdout.strip() if pre[sig] != "<<ABSENT>>" else None
        args_live = re.search(r"FUNCTION [^(]+\((.*?)\)\n", x["definition"]).group(1)
        args_mirror = psql(f"SELECT pg_get_function_arguments('{sig}'::regprocedure)").stdout.strip() if pre[sig] != "<<ABSENT>>" else None
        if rt_mirror is not None and (rt_mirror != rt_live or args_mirror != args_live):
            # Return/OUT shape differs (mirror body was a reduced stub): DROP without CASCADE (fails if a dependency exists),
            # recreate verbatim, then restore exactly the mirror's previous proacl (no new grantee/privilege).
            acl = psql(f"SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid='{sig}'::regprocedure").stdout.strip()
            res["live_exact7_drop_recreate"][sig] = {"mirror_result": rt_mirror, "live_result": rt_live, "mirror_args": args_mirror, "live_args": args_live, "mirror_acl_restored": acl}
            sql.append(f"DROP FUNCTION {sig};")
            sql.append(x["definition"].rstrip("\n") + ";")
            sql.append(f"REVOKE ALL ON FUNCTION {sig} FROM PUBLIC;")
            for item in re.findall(r"([a-z_]*)=([A-Za-z*]+)/", acl.strip("{}")):
                if item[0] and item[0] != "postgres" and "X" in item[1]:
                    sql.append(f"GRANT EXECUTE ON FUNCTION {sig} TO {item[0]};")
                elif item[0] == "" and "X" in item[1]:
                    sql.append(f"GRANT EXECUTE ON FUNCTION {sig} TO PUBLIC;")
            continue
        sql.append(x["definition"].rstrip("\n") + ";")
    sql.append("COMMIT;")
    f = pathlib.Path(out_dir) / "live-exact-7" / "overlay.sql"; f.write_text("\n".join(sql) + "\n")
    r = psql("\n".join(sql))
    res["live_exact7_install"] = {"rc": r.returncode, "err": (r.stderr or "")[-3000:], "deps_absent_before": deps_pre,
                                  "overlay_sha256": hashlib.sha256(f.read_bytes()).hexdigest()}
    check("CCR2 LIVE7: 7 corpos LIVE + dependência real da etapa 41 instalados no espelho", r.returncode == 0, (r.stderr or "")[-400:])
    if r.returncode != 0:
        return False
    acl_after = {x["sig"]: psql(f"SELECT coalesce(proacl::text,'') FROM pg_proc WHERE oid='{x['sig']}'::regprocedure").stdout.strip() for x in cap}
    res["live_exact7_acl_after"] = acl_after
    for sig, v in res["live_exact7_drop_recreate"].items():
        check(f"CCR2 LIVE7: {sig} recriado com ACL idêntica à do espelho anterior", sorted(acl_after[sig].strip("{}").split(",")) == sorted(v["mirror_acl_restored"].strip("{}").split(",")) or (acl_after[sig] in ("", "{postgres=X/postgres}") and v["mirror_acl_restored"] in ("", "{postgres=X/postgres}")), (acl_after[sig], v))
    md = {x["sig"]: {"mirror": md5_of(x["sig"]), "live": x["md5"], "mirror_before": hashlib.md5((pre[x["sig"]] + "\n").encode()).hexdigest()} for x in cap}
    res["live_exact7_md5"] = md
    check("CCR2 LIVE7: md5(pg_get_functiondef) dos 7 no espelho = captura produção 09/11", all(v["mirror"] == v["live"] for v in md.values()),
          {k: v for k, v in md.items() if v["mirror"] != v["live"]})
    res["live_exact7_deps_md5_unconfirmed"] = {n + "(...)": psql(f"SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname||'.'||p.proname='{n}'").stdout.strip() for n in DEPS}
    check("CCR2 LIVE7: gate logístico permanece fechado (enabled=false)", psql(f"SELECT bool_and(NOT enabled) FROM {GATE}").stdout.strip() == "t")
    check("CCR2 LIVE7: gate logístico enabled count = 0 (como produção)", psql(f"SELECT count(*) FILTER (WHERE enabled) FROM {GATE}").stdout.strip() == "0")
    check("CCR2 LIVE: partner_users.valid_from timestamptz NOT NULL DEFAULT now()",
          psql("SELECT format_type(atttypid,atttypmod)||'|'||attnotnull||'|'||pg_get_expr(d.adbin,d.adrelid) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE attrelid='public.partner_users'::regclass AND attname='valid_from'").stdout.strip() == "timestamp with time zone|t|now()")
    install23(psql, check, res, out_dir)

    UB, P, PF, UB2 = ids["UB"], ids["P"], ids["PF"], ids["UB2"]
    def scope(prefix=""):
        r = psql(f"BEGIN;{prefix}SELECT row_to_json(s) FROM platform_private.b2b_actor_scope('{UB}') s;ROLLBACK;")
        lines = [l for l in r.stdout.splitlines() if l.startswith("{")]
        return (json.loads(lines[-1]) if lines else None), (r.stderr or "").strip()[-300:]
    ok, e0 = scope(); res.setdefault("live_exact7_behaviour", {})["actor_scope_positive"] = ok or e0
    check("CCR2 LIVE7 b2b_actor_scope: vínculo real válido resolve o próprio parceiro", bool(ok) and ok.get("user_partner") == P and ok.get("partner_valid") is True, ok or e0)
    for name, mut in [("revogado", f"UPDATE public.partner_users SET revoked_at=now() WHERE user_id='{UB}';"),
                      ("tenant divergente", f"UPDATE public.partner_users SET tenant_id=(SELECT commercial_owner_organization_id FROM public.partner_accounts WHERE id='{PF}') WHERE user_id='{UB}';"),
                      ("valid_from futuro", f"UPDATE public.partner_users SET valid_from=now()+interval '1 day' WHERE user_id='{UB}';"),
                      ("parceiro inativo", f"UPDATE public.partner_accounts SET ativo=false WHERE id='{P}';")]:
        j, e = scope(mut); res["live_exact7_behaviour"]["actor_scope_" + name] = j or e
        check(f"CCR2 LIVE7 b2b_actor_scope negado ({name}): user_partner não resolve", j is not None and j.get("user_partner") is None, j or e)

    def authz(uid, partner, prefix=""):
        r = psql(f"BEGIN;{prefix}SELECT set_config('request.jwt.claims', json_build_object('sub','{uid}','role','authenticated')::text, true), set_config('request.jwt.claim.sub','{uid}',true) \\g /dev/null\nSELECT public.get_user_partner_id()::text AS gup;\nSELECT platform_private.c2_partner_order_attempt_authz('{uid}','{partner}')::text;ROLLBACK;")
        return r.returncode, ((r.stderr or "").strip()[:300] + " | stdout:" + r.stdout.strip()[-120:])
    rc, e = authz(UB, P); res["live_exact7_behaviour"]["attempt_authz_own"] = [rc, e]
    check("CCR2 LIVE7 attempt_authz: comprador no próprio parceiro autorizado", rc == 0 and "ERROR" not in e, e)
    rc, e = authz(UB, PF); res["live_exact7_behaviour"]["attempt_authz_cross_tenant"] = [rc, e]
    check("CCR2 LIVE7 attempt_authz: parceiro de outra empresa negado", "ERROR" in e, e)
    rc, e = authz(UB, P, f"UPDATE public.partner_users SET revoked_at=now() WHERE user_id='{UB}';"); res["live_exact7_behaviour"]["attempt_authz_revoked"] = [rc, e]
    check("CCR2 LIVE7 attempt_authz: vínculo revogado negado (get_user_partner_id/c2_order_actor_scope LIVE 09/11)", "ERROR" in e, e)
    r = psql("SELECT count(*) FILTER (WHERE platform_private.b2b_resale_delivery_status_transition_valid_v1(o, (jsonb_populate_record(o, jsonb_build_object('status','entregue'))))) FROM public.partner_orders o")
    check("CCR2 LIVE7 transição de entrega de revenda falsa com gate OFF para todos os pedidos", r.returncode == 0 and r.stdout.strip() == "0", (r.stdout, r.stderr[-200:]))
    r = psql(f"BEGIN; SELECT set_config('request.jwt.claim.sub','{ids['UADM']}',true), set_config('request.jwt.claims', json_build_object('sub','{ids['UADM']}')::text, true); UPDATE public.partner_orders SET status='em_producao' WHERE id=(SELECT id FROM public.partner_orders WHERE platform_private.c2_external_origin_contract_valid(c2_external_origin_snapshot) IS TRUE AND status::text NOT IN ('cancelado','reprovado') LIMIT 1); ROLLBACK;")
    res["live_exact7_behaviour"]["guard_operational_update"] = (r.stderr or "").strip()[:600]
    res["live_exact7_behaviour"]["guard_operational_target_found"] = psql("SELECT count(*) FROM public.partner_orders WHERE platform_private.c2_external_origin_contract_valid(c2_external_origin_snapshot) IS TRUE AND status::text NOT IN ('cancelado','reprovado')").stdout.strip()
    check("CCR2 LIVE7 guarda LIVE bloqueia avanço operacional com gate OFF", "B2B_INTERNAL_DOWNSTREAM_UNVERIFIED" in r.stderr or "B2B_INTERNAL_UNSEALED_OPERATION" in r.stderr, r.stderr[-300:])
    return True
