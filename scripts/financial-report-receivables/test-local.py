#!/usr/bin/env python3
"""Disposable local PostgreSQL. Synthetic auth/roles; NOT JWT/RLS homologation."""
import subprocess, tempfile, pathlib, hashlib, re, sys, os, shutil
H = pathlib.Path(__file__).parent
d = tempfile.mkdtemp(prefix="arrep-", dir="/tmp"); os.chmod(d, 0o777); data = f"{d}/data"; sock = d
PRE = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
run = lambda *a: subprocess.run(PRE + list(a), check=True, capture_output=True, text=True)
run("initdb", "-D", data, "-U", "postgres", "--auth=trust")
run("pg_ctl", "-D", data, "-l", f"{d}/log", "-o", f"-k {sock} -h \"\" -p 55499", "-w", "start")
def psql(sql, user="postgres", ok=True):
    p = subprocess.run(["psql", "-h", sock, "-p", "55499", "-U", user, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAtX"],
                       input=sql, capture_output=True, text=True)
    if ok and p.returncode: raise SystemExit(p.stderr)
    return p
results = []
def check(name, cond):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name)
try:
    psql("""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA auth, platform_private TO authenticated, anon, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.sub', true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor','financeiro','producao');
CREATE TABLE public.organizations(id uuid PRIMARY KEY, ativo boolean);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean);
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
CREATE TABLE public.clientes(id uuid PRIMARY KEY, organization_id uuid, nome text, razao_social text);
CREATE TABLE public.financial_categories(id uuid PRIMARY KEY, name text);
CREATE TABLE public.accounts_receivable(id uuid PRIMARY KEY, organization_id uuid, customer_id uuid REFERENCES public.clientes, category_id uuid, status text, description text);
CREATE TABLE public.accounts_receivable_installments(id uuid PRIMARY KEY, organization_id uuid, receivable_id uuid REFERENCES public.accounts_receivable, due_date date, original_amount numeric, received_amount numeric, discount_amount numeric, status text);
CREATE FUNCTION platform_private.platform_actor_access_ready(u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id); $$;
CREATE FUNCTION platform_private.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles x WHERE x.user_id=u AND x.role=r) $$;
CREATE FUNCTION public.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $$ SELECT platform_private.has_role(u,r) $$;
CREATE FUNCTION public.fn_authz_uid_scope_ok(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT auth.uid() IS NULL OR (_uid IS NOT NULL AND _uid = auth.uid()) OR public.has_role(auth.uid(), 'administrador'::app_role); $$;
CREATE FUNCTION public.is_financial_staff(_uid uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN IF NOT public.fn_authz_uid_scope_ok(_uid) THEN RETURN false; END IF;
 RETURN has_role(_uid,'administrador') OR has_role(_uid,'gestor') OR has_role(_uid,'financeiro'); END; $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform_private, public, auth TO authenticated;
-- tenants A/B
INSERT INTO public.organizations VALUES ('aaaaaaaa-0000-0000-0000-000000000000',true),('bbbbbbbb-0000-0000-0000-000000000000',true);
INSERT INTO public.profiles VALUES
 ('a1000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000',true),
 ('b1000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000',true),
 ('b2000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000',true),
 ('b3000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000',false);
INSERT INTO public.user_roles VALUES ('a1000000-0000-0000-0000-000000000000','financeiro'),
 ('b1000000-0000-0000-0000-000000000000','administrador'),('b2000000-0000-0000-0000-000000000000','producao'),
 ('b3000000-0000-0000-0000-000000000000','financeiro');
INSERT INTO public.financial_categories VALUES ('c0000000-0000-0000-0000-000000000000','Vendas');
INSERT INTO public.clientes VALUES ('ca000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','Cliente A',null),
 ('cb000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','Cliente B',null);
INSERT INTO public.accounts_receivable VALUES
 ('ra000000-0000-0000-0000-000000000000'::text::uuid,'aaaaaaaa-0000-0000-0000-000000000000','ca000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-000000000000','OPEN','AR A')
""".replace("'ra000000-0000-0000-0000-000000000000'::text::uuid", "'da000000-0000-0000-0000-000000000000'") + """,
 ('db000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','cb000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-000000000000','OPEN','AR B'),
 ('dc000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','ca000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-000000000000','OPEN','AR B incoerente cliente A'),
 ('dd000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','cb000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-000000000000','CANCELED','AR B cancelada');
INSERT INTO public.accounts_receivable_installments VALUES
 ('ea000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','da000000-0000-0000-0000-000000000000','2026-10-10',100,0,0,'OPEN'),
 ('eb000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','db000000-0000-0000-0000-000000000000','2026-10-11',200,50,0,'PARTIAL'),
 ('ec000000-0000-0000-0000-000000000000','aaaaaaaa-0000-0000-0000-000000000000','db000000-0000-0000-0000-000000000000','2026-10-12',300,0,0,'OPEN'),
 ('ed000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','dc000000-0000-0000-0000-000000000000','2026-10-12',400,0,0,'OPEN'),
 ('ee000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','dd000000-0000-0000-0000-000000000000','2026-10-12',500,0,0,'OPEN'),
 ('ef000000-0000-0000-0000-000000000000','bbbbbbbb-0000-0000-0000-000000000000','db000000-0000-0000-0000-000000000000','2026-12-01',600,0,0,'OPEN');
""")
    base = (H/"baseline.function.sql").read_text()
    psql(base + "\nREVOKE ALL ON FUNCTION public.get_report_receivables(jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_report_receivables(jsonb) TO service_role;")
    live_md5 = psql("SELECT md5(pg_get_functiondef('public.get_report_receivables(jsonb)'::regprocedure))").stdout.strip()
    check("baseline pg_get_functiondef md5 == live 970a18…", live_md5 == "970a18caa86f578cd31de2a56f002f6f")
    # Helper fingerprints are local stubs: substitute only those three literals.
    hm = {k: psql(f"SELECT md5(pg_get_functiondef('{k}'::regprocedure))").stdout.strip() for k in
          ["platform_private.h15_actor_organization()", "platform_private.has_role(uuid,public.app_role)", "platform_private.platform_actor_access_ready(uuid)"]}
    live = ["64e10608403238a41a9baf92857ca881", "c5af5b55de6d79da9b73a33948746ae2", "048249c0c2106c3761e26eacb8d0de84"]
    def local(sql):
        for l, v in zip(live, hm.values()): sql = sql.replace(l, v)
        return sql
    check("baseline denies authenticated (ACL fechada)", psql("SET ROLE authenticated; SET test.sub='b1000000-0000-0000-0000-000000000000'; SELECT * FROM public.get_report_receivables('{}');", ok=False).returncode != 0)
    check("preflight PASS on baseline", psql(local((H/"preflight-readonly.sql").read_text())).returncode == 0)
    check("postflight FAILS on baseline", psql(local((H/"postflight-readonly.sql").read_text()), ok=False).returncode != 0)
    check("candidate applies (pre/post guards)", psql(local((H/"candidate.sql.review").read_text()), ok=False).returncode == 0)
    check("candidate re-apply blocked by pre guard", psql(local((H/"candidate.sql.review").read_text()), ok=False).returncode != 0)
    acl = psql("SELECT proacl::text FROM pg_proc WHERE oid='public.get_report_receivables(jsonb)'::regprocedure").stdout.strip()
    check(f"candidate ACL exact ({acl})", acl == "{postgres=X/postgres,authenticated=X/postgres}")
    def q(sub, f, role="authenticated"):
        return psql(f"SET ROLE {role}; SET test.sub='{sub}'; SELECT string_agg(installment_id::text, ',' ORDER BY installment_id) FROM public.get_report_receivables('{f}'::jsonb);", ok=False)
    F = '{"from":"2026-10-01","to":"2026-10-31"}'
    r = q("b1000000-0000-0000-0000-000000000000", F)
    check("B admin sees only coherent B rows (eb)", r.returncode == 0 and r.stdout.strip() == "eb000000-0000-0000-0000-000000000000")
    r = q("a1000000-0000-0000-0000-000000000000", F)
    check("A financeiro sees only A row (ea)", r.returncode == 0 and r.stdout.strip() == "ea000000-0000-0000-0000-000000000000")
    for name, sub, f in [
        ("producao denied", "b2000000-0000-0000-0000-000000000000", F),
        ("inactive profile denied", "b3000000-0000-0000-0000-000000000000", F),
        ("no auth.uid denied", "", F),
        ("B customer from A denied 42501", "b1000000-0000-0000-0000-000000000000", '{"from":"2026-10-01","to":"2026-10-31","customer_id":"ca000000-0000-0000-0000-000000000000"}'),
        ("unknown key (organization_id) rejected", "b1000000-0000-0000-0000-000000000000", '{"from":"2026-10-01","to":"2026-10-31","organization_id":"aaaaaaaa-0000-0000-0000-000000000000"}'),
        ("missing to rejected", "b1000000-0000-0000-0000-000000000000", '{"from":"2026-10-01"}'),
        ("to<from rejected", "b1000000-0000-0000-0000-000000000000", '{"from":"2026-10-31","to":"2026-10-01"}'),
        ("invalid status rejected", "b1000000-0000-0000-0000-000000000000", '{"from":"2026-10-01","to":"2026-10-31","status":"X"}'),
        ("invalid date rejected", "b1000000-0000-0000-0000-000000000000", '{"from":"2026-02-31","to":"2026-10-31"}'),
        ("non-object rejected", "b1000000-0000-0000-0000-000000000000", '[]'),
    ]:
        check(name, q(sub, f).returncode != 0)
    check("anon denied", q("b1000000-0000-0000-0000-000000000000", F, "anon").returncode != 0)
    psql("DELETE FROM public.user_roles WHERE user_id='b1000000-0000-0000-0000-000000000000'")
    check("revoked role denied on next call (no stale JWT)", q("b1000000-0000-0000-0000-000000000000", F).returncode != 0)
    psql("INSERT INTO public.user_roles VALUES ('b1000000-0000-0000-0000-000000000000','administrador'); UPDATE public.organizations SET ativo=false WHERE id='bbbbbbbb-0000-0000-0000-000000000000'")
    check("inactive tenant denied", q("b1000000-0000-0000-0000-000000000000", F).returncode != 0)
    psql("UPDATE public.organizations SET ativo=true")
    r = q("b1000000-0000-0000-0000-000000000000", '{"from":"2026-10-01","to":"2026-10-31","status":"PARTIAL","customer_id":"cb000000-0000-0000-0000-000000000000"}')
    check("B status+own customer filter", r.returncode == 0 and r.stdout.strip() == "eb000000-0000-0000-0000-000000000000")
    check("postflight PASS on candidate", psql(local((H/"postflight-readonly.sql").read_text()), ok=False).returncode == 0)
    check("rollback applies", psql(local((H/"rollback.sql.review").read_text()), ok=False).returncode == 0)
    m = psql("SELECT md5(pg_get_functiondef('public.get_report_receivables(jsonb)'::regprocedure)) || ' ' || proacl::text FROM pg_proc WHERE oid='public.get_report_receivables(jsonb)'::regprocedure").stdout.strip()
    check(f"rollback restores exact baseline md5+ACL", m == "970a18caa86f578cd31de2a56f002f6f {postgres=X/postgres,service_role=X/postgres}")
    check("preflight PASS after rollback", psql(local((H/"preflight-readonly.sql").read_text()), ok=False).returncode == 0)
finally:
    subprocess.run(PRE + ["pg_ctl", "-D", data, "-m", "immediate", "stop"], capture_output=True); shutil.rmtree(d, True)
bad = [n for n, ok in results if not ok]
print(f"{len(results)-len(bad)}/{len(results)} PASS"); sys.exit(1 if bad else 0)
