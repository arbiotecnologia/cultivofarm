#!/usr/bin/env python3
"""PG DESCARTÁVEL — COMMERCIAL_KPIS_TENANT_V1. Executa 01/02/03/04 exatamente como estão sobre os corpos REAIS capturados
de produção (rpc_commercial_kpis 96771c88, h15_actor_organization, platform_actor_access_ready, platform_private.has_role).
Sem rede, sem hospedagem, sem writes remotos (variáveis PG* do ambiente são removidas; só socket local).
COSTURAS SINTÉTICAS (declaradas): auth.uid/auth.jwt via request.jwt.claims local; esquema mínimo; enum de status reduzido.
Não é prova JWT/RLS hospedada."""
import json, os, pathlib, re, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
TDN = HERE.parent / "tenant-display-name-20261106" / "captured"
BODIES = [TDN / "platform_private.platform_actor_access_ready.048249c0.live-20261106.sql",
          HERE / "captured" / "platform_private.has_role.c5af5b55.live-20261106.sql",
          TDN / "platform_private.h15_actor_organization.64e10608.live-20261106.sql",
          HERE / "captured" / "public.rpc_commercial_kpis.96771c88.live-20261106.sql"]
PINS = {"public.rpc_commercial_kpis(date,date,uuid,uuid,text)": "96771c88d76993b92267bfe66113fc9d",
        "platform_private.h15_actor_organization()": "64e10608403238a41a9baf92857ca881",
        "platform_private.platform_actor_access_ready(uuid)": "048249c0c2106c3761e26eacb8d0de84",
        "platform_private.has_role(uuid,public.app_role)": "c5af5b55de6d79da9b73a33948746ae2"}
A = "a0000000-0000-0000-0000-00000000000a"; F = "f0000000-0000-0000-0000-00000000000f"; X = "c0000000-0000-0000-0000-00000000000c"
PA1 = "aa000000-0000-0000-0000-000000000001"; PA2 = "aa000000-0000-0000-0000-000000000002"; PA3 = "aa000000-0000-0000-0000-000000000003"
PF1 = "ff000000-0000-0000-0000-000000000001"; C1 = "cc000000-0000-0000-0000-000000000001"; NOPE = "dd000000-0000-0000-0000-000000000099"
USERS = ["admin_a", "gestor_a", "admin_f", "consultor_a", "financeiro_a", "parceiro_a", "inativo_a", "provisorio_a",
         "convite_a", "org_inativa", "sem_perfil", "revogado_a"]
U = {k: f"00000000-0000-0000-0000-0000000000{i:02d}" for i, k in enumerate(USERS, start=1)}
ROLES = [("admin_a", "administrador"), ("gestor_a", "gestor_comercial"), ("admin_f", "administrador"), ("consultor_a", "consultor_tecnico"),
         ("financeiro_a", "financeiro"), ("parceiro_a", "parceiro_b2b"), ("inativo_a", "administrador"), ("provisorio_a", "administrador"),
         ("convite_a", "administrador"), ("org_inativa", "administrador"), ("sem_perfil", "administrador"), ("revogado_a", "gestor_comercial")]

SCHEMA = """
DO $$BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT USAGE ON SCHEMA platform_private TO authenticated;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor_comercial','consultor_tecnico','financeiro','parceiro_b2b');
CREATE TYPE public.partner_order_status AS ENUM ('rascunho','solicitado','em_analise_comercial','aprovado','aguardando_ajuste_comercial','cancelado');
CREATE TABLE public.organizations(id uuid PRIMARY KEY, ativo boolean, nome text);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean, senha_provisoria boolean);
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
CREATE TABLE public.platform_org_admin_invites(user_id uuid, access_operation_status text, access_valid_after timestamptz);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, commercial_owner_organization_id uuid, created_at timestamptz, consultor_responsavel uuid, commercial_region text);
CREATE TABLE public.partner_orders(id serial PRIMARY KEY, partner_id uuid, status public.partner_order_status, total numeric, created_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub','')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims', true),'')::jsonb $$;
"""
WRAP = """CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SET search_path TO ''
AS $function$ SELECT platform_private.has_role(_user_id,_role); $function$;
REVOKE ALL ON FUNCTION public.rpc_commercial_kpis(date,date,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_commercial_kpis(date,date,uuid,uuid,text) TO authenticated, service_role;"""

def fixtures():
    s = [f"INSERT INTO public.organizations VALUES ('{A}',true,'AR Bio'),('{F}',true,'FSF'),('{X}',false,'Inativa');"]
    org = {k: A for k in USERS}; org["admin_f"] = F; org["org_inativa"] = X
    for k in USERS:
        if k == "sem_perfil": continue
        s.append(f"INSERT INTO public.profiles VALUES ('{U[k]}','{org[k]}',{'false' if k == 'inativo_a' else 'true'},{'true' if k == 'provisorio_a' else 'false'});")
    s += [f"INSERT INTO public.user_roles VALUES ('{U[k]}','{r}');" for k, r in ROLES]
    s.append(f"INSERT INTO public.platform_org_admin_invites VALUES ('{U['convite_a']}','processing',NULL);")
    s.append(f"""INSERT INTO public.partner_accounts VALUES ('{PA1}','{A}',now(),NULL,'GO'),('{PA2}','{A}',now(),'{C1}','MG'),
      ('{PA3}','{A}',now()-interval '100 days',NULL,'MG'),('{PF1}','{F}',now(),'{C1}','MG');""")
    s.append(f"""INSERT INTO public.partner_orders(partner_id,status,total,created_at) VALUES
      ('{PA1}','aprovado',100,now()),('{PA1}','solicitado',50,now()),('{PA1}','em_analise_comercial',30,now()),
      ('{PA2}','aguardando_ajuste_comercial',20,now()),('{PA2}','rascunho',5,now()),('{PA3}','aprovado',999,now()-interval '90 days'),
      ('{PF1}','aprovado',1000,now()),('{PF1}','solicitado',7.20,now()),('{PF1}','em_analise_comercial',447,now());""")
    return "\n".join(s)

SOCK = [""]; PORT = "55443"
ENV = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
def psql(sql, check=True):
    r = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", "t", "-At", "-c", sql], capture_output=True, text=True, env=ENV)
    if check and r.returncode: raise RuntimeError(r.stderr)
    return r
def runfile(p):
    return subprocess.run(["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", "t", "-f", str(p)], capture_output=True, text=True, env=ENV)
def call(who, args="NULL::date,NULL::date,NULL::uuid,NULL::uuid,NULL::text", default_dates=True):
    if who == "anon": pre = "SELECT set_config('request.jwt.claims','{\"role\":\"anon\"}',true); SET LOCAL ROLE anon;"
    elif who == "no_sub": pre = "SELECT set_config('request.jwt.claims','{\"role\":\"authenticated\"}',true); SET LOCAL ROLE authenticated;"
    elif who == "service_role": pre = "SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true); SET LOCAL ROLE service_role;"
    else:
        pre = f"SELECT set_config('request.jwt.claims','{json.dumps({'role': 'authenticated', 'sub': U[who], 'iat': 1700000000})}',true); SET LOCAL ROLE authenticated;"
    sql = f"SELECT public.rpc_commercial_kpis({args})" if not default_dates else f"SELECT public.rpc_commercial_kpis(p_partner_id => {args})" if args.startswith("'") else "SELECT public.rpc_commercial_kpis()"
    r = psql(f"BEGIN; {pre} SELECT 'JSON:'||coalesce(({sql})::text,'null'); ROLLBACK;", check=False)
    if r.returncode:
        m = re.search(r"ERROR:\s+(.*)", r.stderr); return ("ERR", m.group(1).strip() if m else r.stderr[-200:])
    return (None, json.loads([l for l in r.stdout.splitlines() if l.startswith("JSON:")][-1][5:]))
def kw(**k):
    return "SELECT public.rpc_commercial_kpis(" + ",".join(f"{a} => {v}" for a, v in k.items()) + ")"
def callsql(who, sql):
    pre = f"SELECT set_config('request.jwt.claims','{json.dumps({'role': 'authenticated', 'sub': U[who], 'iat': 1700000000})}',true); SET LOCAL ROLE authenticated;"
    r = psql(f"BEGIN; {pre} SELECT 'JSON:'||coalesce(({sql})::text,'null'); ROLLBACK;", check=False)
    if r.returncode:
        m = re.search(r"ERROR:\s+(.*)", r.stderr); return ("ERR", m.group(1).strip() if m else r.stderr[-200:])
    return (None, json.loads([l for l in r.stdout.splitlines() if l.startswith("JSON:")][-1][5:]))

EXP_A = {"pedidos_total": 5, "pedidos_aprovados": 1, "pedidos_em_negociacao": 1, "pedidos_aguardando_ajuste": 1,
         "receita_prevista": 180, "receita_aprovada": 100, "parceiros_ativos": 2, "parceiros_novos": 2}
EXP_F = {"pedidos_total": 3, "pedidos_aprovados": 1, "pedidos_em_negociacao": 1, "pedidos_aguardando_ajuste": 0,
         "receita_prevista": 1454.20, "receita_aprovada": 1000, "parceiros_ativos": 1, "parceiros_novos": 1}

def main():
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="kpi-", dir="/tmp")); tmp.chmod(0o777); SOCK[0] = str(tmp)
    su = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
    subprocess.run(su + ["initdb", "-D", str(tmp / "d"), "-U", "postgres", "-A", "trust"], check=True, capture_output=True, env=ENV)
    subprocess.run(su + ["pg_ctl", "-D", str(tmp / "d"), "-o", f"-p {PORT} -k {tmp} -c listen_addresses=''", "-l", str(tmp / "log"), "-w", "start"], check=True, capture_output=True, env=ENV)
    rep = {"kind": "disposable_pg", "hosted": False, "remote_writes": False, "package": "COMMERCIAL_KPIS_TENANT_V1",
           "synthetic_seams": ["auth.uid/auth.jwt locais", "esquema mínimo", "enum de status reduzido"]}
    checks = {}; ok = True
    def chk(n, c, d=None):
        nonlocal ok; checks[n] = {"pass": bool(c), **({"detail": d} if d is not None else {})}; ok &= bool(c)
    try:
        subprocess.run(["psql", "-X", "-q", "-h", str(tmp), "-p", PORT, "-U", "postgres", "-d", "postgres", "-c", "CREATE DATABASE t"], check=True, capture_output=True, env=ENV)
        rep["pg_version"] = psql("SHOW server_version").stdout.strip()
        psql(SCHEMA)
        for b in BODIES: psql(b.read_text())
        psql(WRAP); psql(fixtures())
        got = {s: psql(f"SELECT md5(pg_get_functiondef('{s}'::regprocedure))").stdout.strip() for s in PINS}
        chk("captured_bodies_reproduce_production_pins", got == PINS, got)
        # ANTES: reproduz o vazamento do corpo vivo (admin F vê pedidos de A)
        e, v = call("admin_f")
        chk("before_vulnerable_cross_tenant_leak_reproduced", e is None and v["pedidos_total"] == 8 and v["parceiros_novos"] == 3, v)

        r = runfile(HERE / "01-pre.sql.readonly"); chk("pre_all_true", r.returncode == 0 and set(r.stdout.strip().split("|")) == {"t"}, r.stdout.strip() or r.stderr[-300:])
        r = runfile(HERE / "02-install.sql.review"); chk("install_ok", r.returncode == 0, r.stderr[-500:] or None)
        r = runfile(HERE / "03-post.sql.readonly"); chk("post_all_true", r.returncode == 0 and set(r.stdout.strip().split("|")) == {"t"}, r.stdout.strip() or r.stderr[-300:])
        r = runfile(HERE / "02-install.sql.review"); chk("rerun_aborts_pre_drift", r.returncode != 0 and "PRE_DRIFT" in r.stderr)

        m = {w: call(w) for w in USERS + ["anon", "no_sub", "service_role"]}
        rep["matrix"] = m
        def num(v): return {k: float(x) for k, x in v.items()}
        chk("positive_admin_a_exact_sums", m["admin_a"][0] is None and num(m["admin_a"][1]) == num(EXP_A), m["admin_a"])
        chk("positive_gestor_a_same_tenant", m["gestor_a"] == m["admin_a"], m["gestor_a"])
        chk("positive_admin_f_only_own_tenant", m["admin_f"][0] is None and num(m["admin_f"][1]) == num(EXP_F), m["admin_f"])
        chk("contract_keys_unchanged", m["admin_a"][0] is None and set(m["admin_a"][1]) == set(EXP_A))
        for w in ["consultor_a", "financeiro_a", "parceiro_a", "inativo_a", "provisorio_a", "convite_a", "org_inativa", "sem_perfil", "anon", "no_sub", "service_role"]:
            e, d = m[w]; chk(f"deny_{w}", e == "ERR" and ("forbidden" in d or "permission denied" in d), m[w])
        # filtro de parceiro estrangeiro/inexistente negado; próprio aplicado
        chk("deny_foreign_partner_filter", callsql("admin_a", kw(p_partner_id=f"'{PF1}'::uuid")) == ("ERR", "forbidden"))
        chk("deny_foreign_partner_filter_f_to_a", callsql("admin_f", kw(p_partner_id=f"'{PA1}'::uuid")) == ("ERR", "forbidden"))
        chk("deny_unknown_partner_same_message", callsql("admin_a", kw(p_partner_id=f"'{NOPE}'::uuid")) == ("ERR", "forbidden"))
        e, v = callsql("admin_a", kw(p_partner_id=f"'{PA2}'::uuid"))
        chk("own_partner_filter", e is None and v["pedidos_total"] == 2 and float(v["receita_prevista"]) == 0 and v["parceiros_novos"] == 2, v)
        # consultor/região de outro tenant não vazam
        e, v = callsql("admin_a", kw(p_consultor=f"'{C1}'::uuid"))
        chk("consultor_filter_own_only", e is None and v["pedidos_total"] == 2 and v["parceiros_ativos"] == 1 and v["parceiros_novos"] == 1, v)
        e, v = callsql("admin_a", kw(p_region="'MG'"))
        chk("region_filter_own_only", e is None and v["pedidos_total"] == 2 and v["parceiros_novos"] == 1 and float(v["receita_aprovada"]) == 0, v)
        e, v = callsql("admin_f", kw(p_region="'GO'"))
        chk("region_foreign_only_zero", e is None and v["pedidos_total"] == 0 and v["parceiros_novos"] == 0, v)
        e, v = callsql("admin_a", kw(p_from="(now()::date - 120)", p_to="now()::date"))
        chk("period_includes_old_own_only", e is None and v["pedidos_total"] == 6 and float(v["receita_aprovada"]) == 1099 and v["parceiros_novos"] == 3, v)
        # revogação: papel removido → negado na chamada seguinte
        before = call("revogado_a"); psql(f"DELETE FROM public.user_roles WHERE user_id='{U['revogado_a']}'"); after = call("revogado_a")
        chk("revocation_denies_next_call", before[0] is None and after == ("ERR", "forbidden"), [before, after])
        psql(f"UPDATE public.profiles SET organization_id='{F}' WHERE user_id='{U['gestor_a']}'")
        e, v = call("gestor_a"); chk("tenant_switch_follows_profile", e is None and num(v) == num(EXP_F), v)
        psql(f"UPDATE public.profiles SET organization_id='{A}' WHERE user_id='{U['gestor_a']}'")
        acl = psql("SELECT array_to_string(proacl,',') FROM pg_proc WHERE oid='public.rpc_commercial_kpis(date,date,uuid,uuid,text)'::regprocedure").stdout.strip()
        chk("acl_no_anon_no_public", "anon=" not in acl and not any(x.startswith("=") for x in acl.split(",")), acl)

        r = runfile(HERE / "04-rollback-deny.sql.review"); chk("rollback_ok", r.returncode == 0, r.stderr[-400:] or None)
        chk("rollback_denies_admin", call("admin_a") == ("ERR", "forbidden"))
        chk("rollback_never_restores_vulnerable", psql("SELECT md5(pg_get_functiondef('public.rpc_commercial_kpis(date,date,uuid,uuid,text)'::regprocedure))").stdout.strip() != PINS["public.rpc_commercial_kpis(date,date,uuid,uuid,text)"])
    except Exception as ex:
        ok = False; rep["exception"] = str(ex)[-1500:]
    finally:
        subprocess.run(su + ["pg_ctl", "-D", str(tmp / "d"), "-m", "immediate", "stop"], capture_output=True, env=ENV); shutil.rmtree(tmp, ignore_errors=True)
    rep["checks"] = checks; rep["result"] = "PASS" if ok else "FAIL"
    (HERE / "evidence-local-pg.json").write_text(json.dumps(rep, indent=1, ensure_ascii=False, default=str) + "\n")
    print(json.dumps({"result": rep["result"], "n_checks": len(checks), "failed": {k: v for k, v in checks.items() if not v["pass"]}, "exception": rep.get("exception")}, ensure_ascii=False, indent=1)[:4000])
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
