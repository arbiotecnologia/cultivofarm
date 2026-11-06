#!/usr/bin/env python3
"""PG DESCARTÁVEL — TENANT_DISPLAY_NAME_V1. Executa 01/02/03/04 exatamente como gerados, sobre os corpos REAIS capturados
de produção (h15_actor_organization, platform_actor_access_ready, b2b_commercial_partner_projection e wrapper público).
Sem rede, sem hospedagem, sem writes remotos.
COSTURAS SINTÉTICAS (declaradas): auth.uid/auth.jwt via request.jwt.claims local; esquema mínimo; helpers da projeção
substituídos por stubs dirigidos por tabela (b2b_commercial_context, b2b_phase1_partner_visible, is_valid_b2b_partner_user,
has_role, entitlements_for_user, b2b_own_obligations_owner, c2_owner_order_create_allowed). Não é prova JWT/RLS hospedada."""
import hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
CAP = HERE / "captured"
sys.path.insert(0, str(HERE)); import generate as G  # noqa: E402
BODIES = [G.cap("platform_private.platform_actor_access_ready.048249c0.live-20261106.sql", G.PINS["platform_private.platform_actor_access_ready(uuid)"]),
          G.cap("platform_private.h15_actor_organization.64e10608.live-20261106.sql", G.PINS["platform_private.h15_actor_organization()"]),
          G.PROJ,
          G.cap("get_my_commercial_partner_projection.730a1748.live-20261106.sql", G.PINS["public.get_my_commercial_partner_projection()"])]
A = "a0000000-0000-0000-0000-00000000000a"; F = "f0000000-0000-0000-0000-00000000000f"; X = "c0000000-0000-0000-0000-00000000000c"
P1 = "7e52de9a-0000-0000-0000-000000000001"
USERS = ["admin_a", "consultor_a", "financeiro_a", "cliente_a", "buyer_a", "buyer_revoked", "user_f", "inativo", "provisorio",
         "convite_processando", "org_inativa", "sem_perfil"]
U = {k: f"00000000-0000-0000-0000-0000000000{i:02d}" for i, k in enumerate(USERS, start=1)}

SCHEMA = f"""
DO $$BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
CREATE TABLE public.organizations(id uuid PRIMARY KEY, ativo boolean, status text, nome text, nome_fantasia text, razao_social text, cnpj text, email_corporativo text);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean, senha_provisoria boolean);
CREATE TABLE public.platform_org_admin_invites(user_id uuid, access_operation_status text, access_valid_after timestamptz);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, codigo text, razao_social text, nome_fantasia text, ativo boolean, deleted_at timestamptz, commercial_owner_organization_id uuid);
CREATE TABLE public.partner_users(user_id uuid, partner_id uuid, tenant_id uuid, revoked_at timestamptz, valid_from timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub','')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims', true),'')::jsonb $$;
-- ===== COSTURAS SINTÉTICAS (projeção B2B) =====
CREATE FUNCTION platform_private.b2b_commercial_context() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN EXISTS(SELECT 1 FROM public.partner_users WHERE user_id=auth.uid()) THEN jsonb_build_object(
    'partner_id','{P1}','commercial_owner_organization_id','{A}','papel','gestor','mode','commercial_owner','contract','C2_MULTIPROFILE_V1',
    'actor_id',auth.uid(),'tenant_id','{A}','external_roles',jsonb_build_array('parceiro_b2b'),'manager',true,'technician',false,'producer_links_valid',true) END $$;
CREATE FUNCTION platform_private.b2b_phase1_partner_visible(uuid, boolean) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.is_valid_b2b_partner_user(u uuid, p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM public.partner_users x WHERE x.user_id=u AND x.partner_id=p AND x.revoked_at IS NULL) $$;
CREATE FUNCTION public.has_role(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE AS $$ VALUES ('catalogo_precos'),('fichas_tecnicas') $$;
CREATE FUNCTION platform_private.b2b_own_obligations_owner(uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION platform_private.c2_owner_order_create_allowed(uuid, uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
"""
FIX = f"""
INSERT INTO public.organizations VALUES ('{A}',true,'ativa','arbio-legal','AR Bio','AR BIO LTDA','00000000000100','x@a'),
 ('{F}',true,'ativa','FSF Agro',NULL,'FSF LTDA','00000000000200','x@f'), ('{X}',false,'suspensa','Inativa',NULL,NULL,NULL,NULL);
INSERT INTO public.profiles VALUES
 ('{U['admin_a']}','{A}',true,false),('{U['consultor_a']}','{A}',true,false),('{U['financeiro_a']}','{A}',true,false),('{U['cliente_a']}','{A}',true,false),
 ('{U['buyer_a']}','{A}',true,false),('{U['buyer_revoked']}','{A}',true,false),('{U['user_f']}','{F}',true,false),
 ('{U['inativo']}','{A}',false,false),('{U['provisorio']}','{A}',true,true),('{U['convite_processando']}','{A}',true,false),('{U['org_inativa']}','{X}',true,false);
INSERT INTO public.platform_org_admin_invites VALUES ('{U['convite_processando']}','processing',NULL);
INSERT INTO public.partner_accounts VALUES ('{P1}','P-001','Parceiro Comprador LTDA','Comprador Teste',true,NULL,'{A}');
INSERT INTO public.partner_users VALUES ('{U['buyer_a']}','{P1}','{A}',NULL,now()-interval '1 day'),('{U['buyer_revoked']}','{P1}','{A}',now(),now()-interval '1 day');
"""
SOCK = [""]; PORT = "55441"
def psql(sql, check=True):
    r = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", "t", "-At", "-c", sql], capture_output=True, text=True)
    if check and r.returncode: raise RuntimeError(r.stderr)
    return r
def runfile(name):
    return subprocess.run(["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", "t", "-f", str(HERE / name)], capture_output=True, text=True)
def call(who, sql):
    if who == "anon": pre = "SELECT set_config('request.jwt.claims','{\"role\":\"anon\"}',true); SET LOCAL ROLE anon;"
    elif who == "no_sub": pre = "SELECT set_config('request.jwt.claims','{\"role\":\"authenticated\"}',true); SET LOCAL ROLE authenticated;"
    else:
        sub = U.get(who, "00000000-0000-0000-0000-0000000000ff")
        pre = f"SELECT set_config('request.jwt.claims','{json.dumps({'role': 'authenticated', 'sub': sub, 'iat': 1700000000})}',true); SET LOCAL ROLE authenticated;"
    r = psql(f"BEGIN; {pre} SELECT 'JSON:'||coalesce(({sql})::text,'null'); ROLLBACK;", check=False)
    if r.returncode:
        m = re.search(r"ERROR:\s+(.*)", r.stderr); return ("ERR", m.group(1).strip() if m else r.stderr[-200:])
    return (None, json.loads([l for l in r.stdout.splitlines() if l.startswith("JSON:")][-1][5:]))

def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="tdn-", dir="/tmp")); tmp.chmod(0o777); SOCK[0] = str(tmp)
    su = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
    subprocess.run(su + ["initdb", "-D", str(tmp / "d"), "-U", "postgres", "-A", "trust"], check=True, capture_output=True)
    subprocess.run(su + ["pg_ctl", "-D", str(tmp / "d"), "-o", f"-p {PORT} -k {tmp} -c listen_addresses=''", "-l", str(tmp / "log"), "-w", "start"], check=True, capture_output=True)
    rep = {"kind": "disposable_pg", "hosted": False, "remote_writes": False, "package": "TENANT_DISPLAY_NAME_V1",
           "synthetic_seams": ["auth.uid/auth.jwt locais", "esquema mínimo", "helpers da projeção B2B (stubs)"]}
    checks = {}; ok = True
    def chk(n, c, d=None):
        nonlocal ok; checks[n] = {"pass": bool(c), **({"detail": d} if d is not None else {})}; ok &= bool(c)
    try:
        subprocess.run(["psql", "-X", "-q", "-h", str(tmp), "-p", PORT, "-U", "postgres", "-d", "postgres", "-c", "CREATE DATABASE t"], check=True, capture_output=True)
        rep["pg_version"] = psql("SHOW server_version").stdout.strip()
        psql(SCHEMA)
        for b in BODIES: psql(b)
        psql("REVOKE ALL ON FUNCTION platform_private.b2b_commercial_partner_projection() FROM PUBLIC; GRANT EXECUTE ON FUNCTION platform_private.b2b_commercial_partner_projection() TO authenticated, service_role;"
             "REVOKE ALL ON FUNCTION public.get_my_commercial_partner_projection() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_my_commercial_partner_projection() TO authenticated, service_role;")
        psql(FIX)
        cap_pins = {s: psql(f"SELECT md5(pg_get_functiondef('{s}'::regprocedure))").stdout.strip() for s in G.PINS}
        chk("captured_bodies_reproduce_production_pins", cap_pins == G.PINS, cap_pins)
        before = {w: call(w, "SELECT public.get_my_commercial_partner_projection()") for w in ("buyer_a", "buyer_revoked", "consultor_a")}
        r = runfile("01-pre.sql.readonly"); chk("pre_all_true", r.returncode == 0 and set(r.stdout.strip().split("|")) == {"t"}, r.stdout.strip() or r.stderr[-300:])
        r = runfile("02-install.sql.review"); chk("install_ok", r.returncode == 0, r.stderr[-500:] or None)
        r = runfile("03-post.sql.readonly"); chk("post_all_true", r.returncode == 0 and set(r.stdout.strip().split("|")) == {"t"}, r.stdout.strip() or r.stderr[-300:])
        r = runfile("02-install.sql.review"); chk("rerun_aborts", r.returncode != 0 and "PRE_DRIFT" in r.stderr)
        acl = psql("SELECT array_to_string(proacl,',') FROM pg_proc WHERE oid='public.tenant_display_name_v1()'::regprocedure").stdout.strip()
        chk("display_grant_only_authenticated", "authenticated=X/" in acl and "anon=" not in acl and not any(e.startswith("=") for e in acl.split(",")), acl)
        chk("onboarding_state_absent_untouched", psql("SELECT to_regprocedure('public.org_onboarding_state()') IS NULL").stdout.strip() == "t")

        m = {}
        F_ = "SELECT public.tenant_display_name_v1()"
        for who in USERS + ["anon", "no_sub"]: m[who] = call(who, F_)
        for who, org, name in [("admin_a", A, "AR Bio"), ("consultor_a", A, "AR Bio"), ("financeiro_a", A, "AR Bio"), ("cliente_a", A, "AR Bio"),
                               ("buyer_a", A, "AR Bio"), ("user_f", F, "FSF Agro")]:
            e, v = m[who]
            chk(f"allow_{who}", e is None and v == {"contract": "TENANT_DISPLAY_NAME_V1", "organization_id": org, "name": name}, m[who])
        for who in ["inativo", "provisorio", "convite_processando", "org_inativa", "sem_perfil", "anon", "no_sub"]:
            chk(f"deny_{who}", m[who][0] == "ERR", m[who])
        chk("no_sensitive_keys", all(set(v) == {"contract", "organization_id", "name"} for e, v in m.values() if e is None))

        after = {w: call(w, "SELECT public.get_my_commercial_partner_projection()") for w in before}
        e, v = after["buyer_a"]
        chk("projection_permitted_buyer_gets_seller", e is None and v.get("seller") == {"organization_id": A, "name": "AR Bio"}, after["buyer_a"])
        chk("projection_other_keys_unchanged", e is None and {k: x for k, x in v.items() if k != "seller"} == before["buyer_a"][1])
        e2, v2 = after["buyer_revoked"]
        chk("projection_not_permitted_seller_null", e2 is None and v2.get("seller") is None and {k: x for k, x in v2.items() if k != "seller"} == before["buyer_revoked"][1], after["buyer_revoked"])
        chk("projection_non_partner_still_null", after["consultor_a"] == before["consultor_a"] == (None, None), after["consultor_a"])
        chk("seller_never_buyer_partner_name", e is None and v["seller"]["name"] not in ("Comprador Teste", "Parceiro Comprador LTDA"))

        r = runfile("04-rollback-deny.sql.review"); chk("rollback_ok", r.returncode == 0, r.stderr[-400:] or None)
        chk("rollback_projection_exact_capture", psql(f"SELECT md5(pg_get_functiondef('{G.PROJ_SIG}'::regprocedure))").stdout.strip() == G.PINS[G.PROJ_SIG])
        chk("rollback_display_denied", call("admin_a", F_)[0] == "ERR")
        chk("rollback_projection_output_restored", call("buyer_a", "SELECT public.get_my_commercial_partner_projection()") == before["buyer_a"])
        rep["matrix"] = m
    except Exception as ex:
        ok = False; rep["exception"] = str(ex)[-1500:]
    finally:
        subprocess.run(su + ["pg_ctl", "-D", str(tmp / "d"), "-m", "immediate", "stop"], capture_output=True); shutil.rmtree(tmp, ignore_errors=True)
    rep["checks"] = checks; rep["result"] = "PASS" if ok else "FAIL"
    (HERE / "evidence-local-pg.json").write_text(json.dumps(rep, indent=1, ensure_ascii=False, default=str) + "\n")
    print(json.dumps({"result": rep["result"], "failed": {k: v for k, v in checks.items() if not v["pass"]}, "exception": rep.get("exception")}, ensure_ascii=False, indent=1)[:4000])
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
