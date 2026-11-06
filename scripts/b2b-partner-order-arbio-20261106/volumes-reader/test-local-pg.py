#!/usr/bin/env python3
"""PG DESCARTÁVEL — B2B_PARTNER_VOLUMES_V1 (02-install.sql.review) sobre a composição de produção do pacote v2.

Reaproveita a composição do pacote ../../b2b-catalog-read-fence-v2-20261103/test-local.py (corpos REAIS capturados dos
12 helpers, catálogo e núcleos; v2 instalado como em produção) e executa os arquivos 01/02/03/04 deste pacote EXATAMENTE
como entregues. Nada é hospedado: cluster local em /tmp, sem rede, sem sessão real, sem writes remotos.
COSTURAS SINTÉTICAS (declaradas, herdadas do v2): auth.uid/auth.jwt via request.jwt.claims local,
platform_private.entitlements_for_user, public.is_valid_b2b_partner_user e esquema mínimo; colunas acrescidas em
organizations (nome/nome_fantasia/razao_social) e catalogo_volumes (id/item_tipo/owner_organization_id/rotulo/ordem).
Não é prova JWT/RLS/Storage hospedada."""
import importlib.util, json, os, pathlib, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
V2DIR = HERE.parents[1] / "b2b-catalog-read-fence-v2-20261103"
spec = importlib.util.spec_from_file_location("v2pkg", V2DIR / "test-local.py")
v2 = importlib.util.module_from_spec(spec); sys.path.insert(0, str(V2DIR)); spec.loader.exec_module(v2)

SIG = "public.get_partner_catalog_volumes_secure(uuid)"
A, F, Z, P1, P2, P3, PREV, PZ, PR, MI, U = v2.A, v2.F, v2.Z, v2.P1, v2.P2, v2.P3, v2.PREV, v2.PZ, v2.PR, v2.MI, v2.U
VOL = {k: f"44444444-0000-0000-0000-0000000000{i:02d}" for i, k in enumerate(
    ["qa_1l", "fa_20l", "hidden", "b2b_false", "inactive_item", "vol_inativo", "f_b2b", "micro", "zero", "dono_errado"], start=1)}

EXTRA = f"""
ALTER TABLE public.organizations ADD COLUMN nome text, ADD COLUMN nome_fantasia text, ADD COLUMN razao_social text;
UPDATE public.organizations SET nome_fantasia='AR Bio' WHERE id='{A}';
UPDATE public.organizations SET nome='FSF Agro' WHERE id='{F}';
ALTER TABLE public.catalogo_volumes ADD COLUMN id uuid, ADD COLUMN item_tipo text, ADD COLUMN owner_organization_id uuid,
  ADD COLUMN rotulo text, ADD COLUMN ordem int DEFAULT 0;
DELETE FROM public.catalogo_volumes;
INSERT INTO public.catalogo_volumes(id,item_tipo,produto_id,microrganismo_id,ativo,volume_ml,rotulo,ordem,owner_organization_id,preco_brl) VALUES
 ('{VOL['qa_1l']}','produto','{PR['a_partner_price']}',NULL,true,1000,'1 L',0,'{A}',1),
 ('{VOL['fa_20l']}','produto','{PR['a_volume_price']}',NULL,true,20000,'20 L',0,'{A}',800),
 ('{VOL['hidden']}','produto','{PR['a_hidden']}',NULL,true,1000,'1 L',0,'{A}',1),
 ('{VOL['b2b_false']}','produto','{PR['a_b2b_false']}',NULL,true,1000,'1 L',0,'{A}',1),
 ('{VOL['inactive_item']}','produto','{PR['a_inactive']}',NULL,true,1000,'1 L',0,'{A}',1),
 ('{VOL['vol_inativo']}','produto','{PR['a_partner_price']}',NULL,false,5000,'5 L',1,'{A}',1),
 ('{VOL['f_b2b']}','produto','{PR['f_b2b']}',NULL,true,1000,'1 L',0,'{F}',1),
 ('{VOL['micro']}','microrganismo',NULL,'{MI}',true,500,'500 mL',0,'{A}',1),
 ('{VOL['zero']}','produto','{PR['a_volume_price']}',NULL,true,0,'0',2,'{A}',1),
 ('{VOL['dono_errado']}','produto','{PR['a_partner_price']}',NULL,true,2000,'2 L',3,'{F}',1);
"""

def run(who, partner):
    r = v2.call(who, f"SELECT {SIG.split('(')[0]}('{partner}'::uuid) AS r")
    return r

def main():
    if not shutil.which("initdb"): print("initdb ausente"); return 2
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="b2bvol-", dir="/tmp")); tmp.chmod(0o777)
    v2.PORT = "55439"; v2.SOCK[0] = str(tmp)
    su = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
    subprocess.run(su + ["initdb", "-D", str(tmp / "d"), "-U", "postgres", "-A", "trust"], check=True, capture_output=True)
    subprocess.run(su + ["pg_ctl", "-D", str(tmp / "d"), "-o", f"-p {v2.PORT} -k {tmp} -c listen_addresses=''", "-l", str(tmp / "log"), "-w", "start"], check=True, capture_output=True)
    rep = {"kind": "disposable_pg", "hosted": False, "remote_writes": False, "package": "B2B_PARTNER_VOLUMES_V1",
           "synthetic_seams": ["auth.uid/auth.jwt locais", "entitlements_for_user", "is_valid_b2b_partner_user", "esquema mínimo + colunas acrescidas"]}
    ok = True; checks = {}
    def chk(name, cond, detail=None):
        nonlocal ok
        checks[name] = {"pass": bool(cond), **({"detail": detail} if detail is not None else {})}; ok &= bool(cond)
    try:
        p = v2.psql; p("CREATE DATABASE prod", db="postgres"); v2.DB[0] = "prod"
        p(v2.SCHEMA)
        for n in v2.HELPER_ORDER: p(v2.HELPER_SQL[n])
        for body in (v2.ACTOR, v2.SELLER_FN, v2.CAN, v2.B2B, v2.CAT1, v2.CAT2): p(body)
        for s in (v2.SIG_ACT, "platform_private.catalog_tenant_seller(uuid)"): p(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon, authenticated, service_role")
        out = []
        v2.fence_section.FENCED[:] = [r for r in v2.fence_section.FENCED if r[0] in (v2.SIG_WC, v2.SIG_WB)]; v2.fence_section.CLOSED_PLATFORM[:] = []
        p("CREATE TABLE public.ledger(step text, detail jsonb);"); v2.fence_section.fence_sql(out.append, "public.ledger", v2.lit)
        for s in out: p(s)
        for sig, reps in v2.ae_section.DELTAS:
            if sig != "get_partner_catalog_secure(uuid)": continue
            body = p(f"SELECT pg_get_functiondef('{v2.SIG_CAT1}'::regprocedure)").stdout
            for a, b, n in reps: assert body.count(a) == n; body = body.replace(a, b)
            p(body)
        for s in (v2.SIG_CAT1, v2.SIG_CAT2): p(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION {s} TO authenticated")
        p(v2.fixtures())
        x = v2.runfile(V2DIR / "01a-pre-producao.sql.review"); assert x.returncode == 0, x.stderr
        x = v2.runfile(V2DIR / "02-install-v2.sql.review"); assert x.returncode == 0, x.stderr
        p(EXTRA)
        pins = {s: v2.md5_of(s) for s in (v2.SIG_RD, v2.SIG_CAT1, v2.SIG_CAT2)}
        rep["composition_pins"] = pins
        chk("composition_pins_equal_install_pins", pins == {v2.SIG_RD: "bd985484b69c8fa6e63a920eff518369", v2.SIG_CAT1: "6b56cfb144ebc8dd947473e90e2d7768", v2.SIG_CAT2: "1391adc2133b922e2dcea4b1d3e26820"}, pins)
        pol_before = p("SELECT count(*) FROM pg_policy WHERE polrelid='public.catalogo_volumes'::regclass").stdout.strip()

        pre = subprocess.run(["psql", "-X", "-At", "-h", str(tmp), "-p", v2.PORT, "-U", "postgres", "-d", "prod", "-f", str(HERE / "01-pre.sql.readonly")], capture_output=True, text=True)
        chk("pre_runs_readonly_and_reports_ok", pre.returncode == 0 and pre.stdout.strip().startswith("t|t|t|t|"), pre.stdout.strip() or pre.stderr[-300:])
        x = v2.runfile(HERE / "02-install.sql.review"); chk("install_ok", x.returncode == 0, x.stderr[-400:] or None)
        post = subprocess.run(["psql", "-X", "-At", "-h", str(tmp), "-p", v2.PORT, "-U", "postgres", "-d", "prod", "-f", str(HERE / "03-post.sql.readonly")], capture_output=True, text=True)
        rep["post_output"] = post.stdout.strip() or post.stderr[-300:]
        cols = post.stdout.strip().split("|")
        # definer, anon_denied, authenticated_ok, reader_unchanged; a contagem 11 de policies é da produção (disposable não tem policies).
        chk("post_runs", post.returncode == 0 and len(cols) == 7 and [cols[i] for i in (0, 3, 4, 5)] == ["t"] * 4, rep["post_output"])
        x = v2.runfile(HERE / "02-install.sql.review"); chk("rerun_aborts_target_exists", x.returncode != 0 and "já existe" in x.stderr)
        acl = {r: p(f"SELECT has_function_privilege('{r}','{SIG}','EXECUTE')").stdout.strip() == "t" for r in ("anon", "authenticated", "service_role")}
        public_acl = p(f"SELECT coalesce(array_to_string(proacl,','),'') FROM pg_proc WHERE oid='{SIG}'::regprocedure").stdout.strip()
        chk("grant_only_authenticated", acl["authenticated"] and not acl["anon"] and not any(e.startswith("=") for e in public_acl.split(",")), {"acl": acl, "proacl": public_acl})
        chk("definer_and_search_path", p(f"SELECT prosecdef AND proconfig=ARRAY['search_path=\"\"'] FROM pg_proc WHERE oid='{SIG}'::regprocedure").stdout.strip() == "t")
        chk("policies_unchanged", p("SELECT count(*) FROM pg_policy WHERE polrelid='public.catalogo_volumes'::regclass").stdout.strip() == pol_before)

        m = {}
        def case(name, who, partner):
            err, rows = run(who, partner)  # v2.call → (código, mensagem) na negação; (None, linhas) no sucesso
            m[name] = ((err, rows) if err else None, rows[0]["r"] if (err is None and rows) else None); return m[name]
        err, r = case("buyer_P1", "buyer", P1)
        ids = [v["id"] for v in (r or {}).get("volumes", [])]
        chk("buyer_P1_lists_only_catalog_visible_seller_volumes", err is None and sorted(ids) == sorted([VOL["qa_1l"], VOL["fa_20l"], VOL["micro"]]), {"err": err, "ids": ids})
        chk("buyer_P1_seller_name_is_seller_tenant", err is None and r["seller"]["name"] == "AR Bio" and r["contract"] == "B2B_PARTNER_VOLUMES_V1" and r["partner_id"] == P1)
        chk("buyer_P1_no_price_fields", err is None and all(set(v) == {"id", "item_tipo", "produto_id", "microrganismo_id", "volume_ml", "rotulo", "ordem"} for v in r["volumes"]))
        for name, who, partner in [("anon_P1", "anon", P1), ("buyer_other_partner_P1", "buyer", P2), ("buyer_other_P1", "buyer_other", P1),
                                   ("fsf_admin_rh_PF", "fsf_admin_rh", v2.PF), ("buyer_tenant_mismatch_P1", "buyer_tenant_mismatch", P1),
                                   ("buyer_revoked_link_P1", "buyer_revoked_link", P1), ("buyer_inactive_profile_P1", "buyer_inactive_profile", P1),
                                   ("buyer_provisional_P1", "buyer_provisional", P1), ("buyer_no_feature_P1", "buyer_no_feature", P1),
                                   ("tecnico_P1", "tecnico", P1), ("buyer_and_tecnico_P1", "buyer_and_tecnico", P1), ("super_P1", "super", P1),
                                   ("no_role_P1", "no_role", P1), ("internal_F_P1", "internal_F", P1), ("buyer_inactive_partner", "buyer", PREV),
                                   ("buyer_z_P1", "buyer_z", P1), ("buyer_two_links_P1", "buyer_two_links", P1)]:
            err, r = case(name, who, partner)
            chk(f"deny_{name}", err is not None and r is None, err)
        err, r = case("internal_A_P1", "internal_A", P1)
        chk("supplier_internal_commercial_actor_allowed_by_canonical_reader", err is None and r["seller"]["name"] == "AR Bio", err)
        err, r = case("buyer_z_PZ", "buyer_z", PZ)
        chk("other_tenant_buyer_never_sees_AR_volumes", err is not None or all(v["id"] not in VOL.values() or False for v in (r or {}).get("volumes", [])), {"err": err})
        rep["matrix"] = {k: {"err": list(e) if e else None, "n": (len(v["volumes"]) if v else None)} for k, (e, v) in m.items()}

        x = v2.runfile(HERE / "04-rollback-deny.sql.review"); chk("rollback_ok", x.returncode == 0, x.stderr[-400:] or None)
        err, r = case("buyer_P1_after_rollback", "buyer", P1)
        chk("after_rollback_denied_or_absent", err is not None and r is None, err)
        chk("after_rollback_policies_unchanged", p("SELECT count(*) FROM pg_policy WHERE polrelid='public.catalogo_volumes'::regclass").stdout.strip() == pol_before)
    except Exception as e:  # registra a falha em vez de mascarar
        ok = False; rep["exception"] = str(e)[-1500:]
    finally:
        subprocess.run(su + ["pg_ctl", "-D", str(tmp / "d"), "-m", "immediate", "stop"], capture_output=True); shutil.rmtree(tmp, ignore_errors=True)
    rep["checks"] = checks; rep["result"] = "PASS" if ok else "FAIL"
    (HERE / "evidence-local-pg.json").write_text(json.dumps(rep, indent=1, ensure_ascii=False, default=str) + "\n")
    print(json.dumps({"result": rep["result"], "failed": [k for k, v in checks.items() if not v["pass"]], "exception": rep.get("exception")}, ensure_ascii=False, indent=1))
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
