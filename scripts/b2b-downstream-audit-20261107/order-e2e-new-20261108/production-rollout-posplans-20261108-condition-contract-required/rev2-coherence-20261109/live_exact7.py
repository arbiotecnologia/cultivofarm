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
    sql = ["BEGIN;", LOGISTICS_SEAM]
    res["live_exact7_seams"] = ["REDUCED logistics schema seam (empty ordens_servico/entregas if absent) + delivery_context_20261030 DDL from real_triggers.py",
                                "Auth: request.jwt.claims set by harness (not hosted JWT)"]
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
    for x in cap:
        sql.append(x["definition"].rstrip("\n") + ";")
    sql.append("COMMIT;")
    f = pathlib.Path(out_dir) / "live-exact-7" / "overlay.sql"; f.write_text("\n".join(sql) + "\n")
    r = psql("\n".join(sql))
    res["live_exact7_install"] = {"rc": r.returncode, "err": (r.stderr or "")[-3000:], "deps_absent_before": deps_pre,
                                  "overlay_sha256": hashlib.sha256(f.read_bytes()).hexdigest()}
    check("CCR2 LIVE7: 7 corpos LIVE + dependência real da etapa 41 instalados no espelho", r.returncode == 0, (r.stderr or "")[-400:])
    if r.returncode != 0:
        return False
    md = {x["sig"]: {"mirror": md5_of(x["sig"]), "live": x["md5"], "mirror_before": hashlib.md5((pre[x["sig"]] + "\n").encode()).hexdigest()} for x in cap}
    res["live_exact7_md5"] = md
    check("CCR2 LIVE7: md5(pg_get_functiondef) dos 7 no espelho = captura produção 09/11", all(v["mirror"] == v["live"] for v in md.values()),
          {k: v for k, v in md.items() if v["mirror"] != v["live"]})
    res["live_exact7_deps_md5_unconfirmed"] = {n + "(...)": psql(f"SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname||'.'||p.proname='{n}'").stdout.strip() for n in DEPS}
    check("CCR2 LIVE7: gate logístico permanece fechado (enabled=false)", psql(f"SELECT bool_and(NOT enabled) FROM {GATE}").stdout.strip() == "t")

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
        r = psql(f"BEGIN;{prefix}SELECT set_config('request.jwt.claims', json_build_object('sub','{uid}','role','authenticated')::text, true) \\g /dev/null\nSELECT platform_private.c2_partner_order_attempt_authz('{uid}','{partner}')::text;ROLLBACK;")
        return r.returncode, (r.stderr or "").strip()[-300:]
    rc, e = authz(UB, P); res["live_exact7_behaviour"]["attempt_authz_own"] = [rc, e]
    check("CCR2 LIVE7 attempt_authz: comprador no próprio parceiro autorizado", rc == 0 and "ERROR" not in e, e)
    rc, e = authz(UB, PF); res["live_exact7_behaviour"]["attempt_authz_cross_tenant"] = [rc, e]
    check("CCR2 LIVE7 attempt_authz: parceiro de outra empresa negado", "ERROR" in e, e)
    rc, e = authz(UB, P, f"UPDATE public.partner_users SET revoked_at=now() WHERE user_id='{UB}';"); res["live_exact7_behaviour"]["attempt_authz_revoked"] = [rc, e]
    check("CCR2 LIVE7 attempt_authz: vínculo revogado negado", "ERROR" in e, e)
    r = psql("SELECT count(*) FILTER (WHERE platform_private.b2b_resale_delivery_status_transition_valid_v1(o, (jsonb_populate_record(o, jsonb_build_object('status','entregue'))))) FROM public.partner_orders o")
    check("CCR2 LIVE7 transição de entrega de revenda falsa com gate OFF para todos os pedidos", r.returncode == 0 and r.stdout.strip() == "0", (r.stdout, r.stderr[-200:]))
    r = psql("BEGIN; UPDATE public.partner_orders SET status='em_producao' WHERE id=(SELECT id FROM public.partner_orders WHERE c2_external_origin_snapshot IS NOT NULL OR internal_origin_snapshot IS NOT NULL LIMIT 1); ROLLBACK;")
    res["live_exact7_behaviour"]["guard_operational_update"] = (r.stderr or "").strip()[-300:]
    check("CCR2 LIVE7 guarda LIVE bloqueia avanço operacional com gate OFF", "B2B_INTERNAL_DOWNSTREAM_UNVERIFIED" in r.stderr or "B2B_INTERNAL_UNSEALED_OPERATION" in r.stderr, r.stderr[-300:])
    return True
