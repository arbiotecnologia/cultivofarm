"""PostgreSQL DESCARTÁVEL (socket Unix, sem PG* do ambiente). Nunca hosted.
Compõe: definições capturadas verbatim (a00/a10/audit/helpers/policies/triggers/ACL/default ACL) +
helpers EXATOS extraídos da fundação 01 (gate/catalog_ownership_enabled/catalog_reader_org) + stubs
sintéticos declarados (auth.uid via GUC de teste, has_role/is_platform_superadmin, tabelas mínimas).
Executa o pacote ORIGINAL (RED) e o CANDIDATO (GREEN). Saída: diretório único com checks.json/logs.
Uso: python3 harness.py <out_dir_novo>
"""
import hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile, time
sys.dont_write_bytecode = True
H = pathlib.Path(__file__).resolve().parent
PKG = H.parent
ROOT = PKG.parents[1]
sys.path.insert(0, str(PKG)); import build  # noqa: E402
EV = ROOT / "docs/auditorias/evidencias/reconciliacao-fiscal-catalogo-20261101/original-80c64c38"
ORIG = EV / "files/scripts/fiscal-tenant-catalog-20261101"
FOUND = ROOT / "scripts/rbac-audit/proposed-tenant-catalog-ownership.sql"
OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=False)
LOG = open(OUT / "harness.log", "w")
checks = []

A, B = "a0000000-0000-4000-8000-00000000000a", "b0000000-0000-4000-8000-00000000000b"
UA, UB, UG, USA, UF, UX = (f"c0000000-0000-4000-8000-00000000000{i}" for i in "1234 5 6".replace(" ", ""))
PA, PB, PG_ = "d0000000-0000-4000-8000-0000000000a1", "d0000000-0000-4000-8000-0000000000b1", "d0000000-0000-4000-8000-0000000000c1"


def check(cid, scenario, expected, actual, kind="PG_DISPOSABLE_CAPTURED_DEFS_SYNTHETIC_AUTH"):
    r = dict(id=cid, scenario=scenario, expected=expected, actual=actual,
             status="PASS" if expected == actual else "FAIL", kind=kind)
    checks.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)
    (OUT / "checks.json").write_text(json.dumps(checks, indent=1, ensure_ascii=False))


class PG:
    def __init__(self, name):
        for v in [k for k in os.environ if k.startswith("PG")]:
            os.environ.pop(v)
        self.d = tempfile.mkdtemp(prefix=f"pgfisc-{name}-"); os.chown(self.d, 1000, 1000)
        self.port = str(56000 + (os.getpid() + len(name)) % 900)
        self.as_ = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
        subprocess.run(self.as_ + ["initdb", "-D", f"{self.d}/data", "-U", "postgres", "-A", "trust", "-E", "UTF8"], check=True, capture_output=True)
        subprocess.run(self.as_ + ["pg_ctl", "-D", f"{self.d}/data", "-o", f"-p {self.port} -k {self.d} -c listen_addresses=''",
                                   "-l", f"{self.d}/log", "-w", "start"], check=True, capture_output=True)

    def psql(self):
        return ["psql", "-X", "-q", "-At", "-h", self.d, "-p", self.port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"]

    def sql(self, s, ok=True):
        r = subprocess.run(self.psql(), input=s, text=True, capture_output=True)
        LOG.write(f"--- SQL ok={ok} rc={r.returncode}\n{s[:600]}\n>> {r.stdout[-800:]}{r.stderr[-800:]}\n"); LOG.flush()
        if ok and r.returncode:
            raise RuntimeError(r.stderr)
        return (r.stdout.strip() if r.returncode == 0 else "ERR:" + r.stderr.strip())

    def stop(self):
        subprocess.run(self.as_ + ["pg_ctl", "-D", f"{self.d}/data", "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(self.d, ignore_errors=True)


def as_user(uid, role="authenticated"):
    return f"SET ROLE {role}; SET test.uid='{uid or ''}';\n"


def foundation_piece(start, end_marker):
    t = FOUND.read_text(); a = t.index(start); b = t.index(end_marker, a); return t[a:b]


def stub(pg):
    live = build.LIVE; fisc = build.FISC
    pg.sql("""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO postgres, anon, authenticated, service_role;
CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA cf_user_guards_v1;
GRANT USAGE ON SCHEMA auth, platform_private TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('test.uid',true),'')::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT jsonb_build_object('iat',extract(epoch from now())::bigint)$$;
CREATE TYPE public.app_role AS ENUM ('superadmin','administrador','gestor','financeiro','consultor');
CREATE TABLE public.organizations(id uuid PRIMARY KEY, ativo boolean, status text);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean, senha_provisoria boolean);
CREATE TABLE public.platform_org_admin_invites(user_id uuid, access_operation_status text, access_valid_after timestamptz);
CREATE TABLE public.user_roles(user_id uuid, role public.app_role, PRIMARY KEY(user_id, role));
CREATE FUNCTION platform_private.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2)$$;
CREATE FUNCTION public.is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role='superadmin')$$;
CREATE FUNCTION public.mask_sensitive_jsonb(jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$SELECT $1$$;
CREATE FUNCTION public.fiscal_rtc_has_sensitive_key(jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT false$$;
CREATE TABLE public.fiscal_audit_log(id bigserial PRIMARY KEY, table_name text, record_id uuid, action text, changed_by uuid, old_values jsonb, new_values jsonb);
CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY); INSERT INTO cf_user_guards_v1.state VALUES(true);
CREATE TABLE public.produtos(id uuid PRIMARY KEY, nome text, codigo text, familia_catalogo text, ativo boolean DEFAULT true);
""")
    cols = [c for c in live["columns"] if c["table"] == "product_fiscal_profiles"]
    typ = {"timestamp with time zone": "timestamptz", "ARRAY": "text[]"}
    defs = []
    for c in cols:
        t = typ.get(c["type"], c["type"]); d = ""
        if c["column"] == "id": d = " DEFAULT gen_random_uuid()"
        if c["column"] in ("created_at", "updated_at"): d = " DEFAULT now()"
        if c["column"] == "ibs_cbs_configuration": d = " NOT NULL DEFAULT '{}'::jsonb"
        if c["column"] == "profile_status": d = " DEFAULT 'DRAFT'"
        defs.append(f'{c["column"]} {t}{d}')
    pg.sql(f"CREATE TABLE public.product_fiscal_profiles({', '.join(defs)});")
    for con in build.FISC["constraints"]:
        pg.sql(f"ALTER TABLE public.product_fiscal_profiles ADD {con};")
    pg.sql("CREATE UNIQUE INDEX pfp_one_active ON public.product_fiscal_profiles(product_id) WHERE is_active;")
    # captured function bodies verbatim
    for sig in ["platform_private.platform_actor_access_ready(uuid)", "platform_private.h15_actor_organization()",
                "platform_private.global_product_fiscal_write_ready()", "platform_private.global_product_fiscal_read_ready()",
                "platform_private.global_product_fiscal_statement_gate()", "platform_private.global_product_fiscal_before_write()",
                "fiscal_audit_trigger()"]:
        f = build.fn(sig); pg.sql(f["definition"] + ";")
        rp = build.regproc(sig)
        pg.sql(f"REVOKE ALL ON FUNCTION {rp} FROM PUBLIC, anon, authenticated, service_role;")
        for a in f["acl"]:
            who = a.split("=")[0]
            if who and who != "postgres":
                pg.sql(f"GRANT EXECUTE ON FUNCTION {rp} TO {who};")
    pg.sql("ALTER TABLE public.product_fiscal_profiles ENABLE ROW LEVEL SECURITY;")
    for p in live["policies"]:
        if p["tablename"] != "product_fiscal_profiles":
            continue
        s = f'CREATE POLICY {p["policyname"]} ON public.product_fiscal_profiles AS {p["permissive"]} FOR {p["cmd"]} TO {",".join(p["roles"])}'
        if p["qual"]: s += f' USING ({p["qual"]})'
        if p["with_check"]: s += f' WITH CHECK ({p["with_check"]})'
        pg.sql("SET search_path=public; " + s + ";")
    for t in build.triggers():
        pg.sql(t + ";")
    # products table grants as captured (SELECT anon/auth); no write grants (foundation PRE requires that)
    pg.sql("REVOKE ALL ON public.produtos FROM anon, authenticated; GRANT SELECT ON public.produtos TO anon, authenticated;")
    # synthetic identities
    pg.sql(f"""
INSERT INTO public.organizations VALUES ('{A}',true,'ativa'),('{B}',true,'ativa');
INSERT INTO public.profiles VALUES ('{UA}','{A}',true,false),('{UB}','{B}',true,false),('{UG}','{A}',true,false),
 ('{USA}',NULL,true,false),('{UF}','{A}',true,false),('{UX}','{A}',false,false);
INSERT INTO public.user_roles VALUES ('{UA}','administrador'),('{UB}','administrador'),('{UG}','gestor'),('{USA}','superadmin'),('{UF}','financeiro'),('{UX}','administrador');
INSERT INTO public.produtos(id,nome,codigo,familia_catalogo) VALUES ('{PG_}','Global','G1','biologico');
""")


def foundation(pg, enabled=True):
    """Exact foundation 01 fragments (gate + enabled + reader_org) + column; NOT the whole foundation."""
    pg.sql("ALTER TABLE public.produtos ADD COLUMN owner_organization_id uuid;")
    pg.sql(foundation_piece("CREATE TABLE platform_private.catalog_ownership_gate", "-- ---------------------------------------------------------------- normalização"))
    pg.sql(foundation_piece("CREATE FUNCTION platform_private.catalog_reader_org()", "-- Lock consultivo comum"))
    pg.sql(f"INSERT INTO public.produtos(id,nome,codigo,owner_organization_id) VALUES ('{PA}','Proprio A','A1','{A}'),('{PB}','Proprio B','B1','{B}');")
    if enabled:
        pg.sql("UPDATE platform_private.catalog_ownership_gate SET enabled=true, readers_certified_at=now();")


def code(err):
    m = re.search(r"ERROR:\s+([^\n]+)", err or ""); return m.group(1)[:80] if m else err[:80]


SAVE = "SELECT public.tenant_owned_product_fiscal_save('{p}',{exp},'{v}'::jsonb,'motivo local sintetico','{k}')"
K1, K2, K3 = "90000000-0000-4000-8000-000000000001", "90000000-0000-4000-8000-000000000002", "90000000-0000-4000-8000-000000000003"


def enable_local(pg):
    """Simulação LOCAL da etapa separada de GRANT/gate (nunca hosted)."""
    pg.sql("GRANT EXECUTE ON FUNCTION public.tenant_owned_product_fiscal_save(uuid,timestamptz,jsonb,text,uuid), public.tenant_owned_product_fiscal_list(integer,integer) TO authenticated;"
           "UPDATE platform_private.owned_fiscal_gate SET enabled=true;")


def fidelity(pg, prefix):
    m = build.pre_pins_meta() if hasattr(build, "pre_pins_meta") else None
    for sig in build.PINNED_FUNCS:
        got = pg.sql(f"SELECT md5(pg_get_functiondef('{build.regproc(sig)}'::regprocedure))")
        check(f"{prefix}-FID-{sig}", "stub body == captured body", "same", "same" if got == build.md5(build.fn(sig)["definition"]) else got)
    pol = pg.sql("SELECT string_agg(l, E'\\n' ORDER BY l COLLATE \"C\") FROM (SELECT policyname||'|'||cmd||'|'||permissive||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'~')||'|'||coalesce(with_check,'~') l FROM pg_policies WHERE tablename='product_fiscal_profiles') x")
    check(f"{prefix}-FID-policies", "stub policies == captura", "\n".join(build.policies()), pol)
    gr = pg.sql("SELECT string_agg(DISTINCT grantee||':'||privilege_type, E'\\n' ORDER BY grantee||':'||privilege_type) FROM information_schema.role_table_grants WHERE table_name='product_fiscal_profiles' AND grantee IN ('anon','authenticated','service_role')")
    check(f"{prefix}-FID-grants", "stub grants == captura", "\n".join(build.grants()), gr)
    da = pg.sql("SELECT string_agg(a::text, ',' ORDER BY a::text) FROM pg_default_acl d, unnest(d.defaclacl) a WHERE defaclrole='postgres'::regrole AND defaclnamespace='public'::regnamespace AND defaclobjtype='f'")
    check(f"{prefix}-FID-default-acl", "stub default-acl == captura", ",".join(build.default_acl()), da)


def run_original():
    pg = PG("orig")
    try:
        stub(pg)
        pre_no_found = pg.sql((ORIG / "install.sql.review").read_text(), ok=False)
        check("RED-01", "original PRE sem fundação aborta", True, "catalog ownership not installed" in pre_no_found, "PG_DISPOSABLE")
        foundation(pg)
        fidelity(pg, "RED")
        # drift same count: alter predicate, keep 4 policies
        pg.sql("ALTER POLICY product_fiscal_profiles_read ON public.product_fiscal_profiles USING (true);")
        r = pg.sql((ORIG / "install.sql.review").read_text(), ok=False)
        check("RED-02", "original PRE detecta predicado alterado com mesma contagem", False, not r.startswith("ERR"),
              "PG_DISPOSABLE_RED_EXPECTED_FAIL")
        pg.stop(); pg = PG("orig2"); stub(pg); foundation(pg)
        pg.sql((ORIG / "install.sql.review").read_text())
        check("RED-03", "original: authenticated SEM EXECUTE no writer após install (default ACL real)", False,
              pg.sql("SELECT has_function_privilege('authenticated','public.tenant_owned_product_fiscal_save(uuid,timestamptz,jsonb,text,uuid)','EXECUTE')") == "t",
              "PG_DISPOSABLE_RED_EXPECTED_FAIL")
        check("RED-04", "original: service_role sem EXECUTE nos helpers privados", False,
              pg.sql("SELECT has_function_privilege('service_role','platform_private.owned_fiscal_actor(boolean)','EXECUTE')") == "t",
              "PG_DISPOSABLE_RED_EXPECTED_FAIL")
        pg.sql("UPDATE platform_private.owned_fiscal_gate SET enabled=true;")
        r = pg.sql(as_user(UA) + SAVE.format(p=PA, exp="NULL", v='{"ncm":"31010000"}', k=K1) + ";", ok=False)
        check("RED-05", "original: admin A grava perfil próprio com a10 composto (positivo do harness reduzido)", "ok",
              "ok" if not r.startswith("ERR") else code(r), "PG_DISPOSABLE_RED_EXPECTED_FAIL")
    finally:
        pg.stop()


def run_candidate():
    s = build.build()
    pg = PG("cand")
    try:
        stub(pg)
        r = pg.sql(s, ok=False)
        check("G-01", "PRE sem fundação aborta", True, "catalog ownership not installed" in r)
        foundation(pg)
        fidelity(pg, "G")
        # drift probes (each rolled back)
        probes = {
            "G-02 predicado alterado mesma contagem": "ALTER POLICY product_fiscal_profiles_read ON public.product_fiscal_profiles USING (true);",
            "G-03 corpo a10 alterado": build.fn("platform_private.global_product_fiscal_before_write()")["definition"].replace("FISCAL_FORBIDDEN", "FISCAL_FORBIDDEN_X") + ";",
            "G-04 trigger desabilitado": "ALTER TABLE public.product_fiscal_profiles DISABLE TRIGGER a10_global_product_fiscal_authorize;",
            "G-05 ACL write_ready alterada": "GRANT EXECUTE ON FUNCTION platform_private.global_product_fiscal_write_ready() TO anon;",
            "G-06 default ACL alterada": "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;",
            "G-07 grant de tabela alterado": "REVOKE TRUNCATE ON public.product_fiscal_profiles FROM anon;",
            "G-08 constraint de status alterada": "ALTER TABLE public.product_fiscal_profiles DROP CONSTRAINT product_fiscal_profiles_profile_status_check;",
        }
        for name, drift in probes.items():
            body = s.replace("BEGIN;\nSET LOCAL lock_timeout", "BEGIN;\n" + drift + "\nSET LOCAL lock_timeout", 1)
            r = pg.sql(body, ok=False)
            check(name.split(" ")[0], name, True, r.startswith("ERR") and "PRE:" in r)
        check("G-09", "nenhum objeto criado após PRE abortado", "f", pg.sql("SELECT to_regclass('platform_private.owned_fiscal_gate') IS NOT NULL"))
        pg.sql(s)
        check("G-10", "install + POST ok, gate desligado", "f", pg.sql("SELECT enabled FROM platform_private.owned_fiscal_gate"))
        for role in ("anon", "authenticated", "service_role"):
            for sig in ["public.tenant_owned_product_fiscal_save(uuid,timestamptz,jsonb,text,uuid)", "public.tenant_owned_product_fiscal_list(integer,integer)",
                        "platform_private.owned_fiscal_actor(boolean)", "platform_private.owned_fiscal_enabled()"]:
                check(f"G-11-{role}-{sig.split('(')[0]}", f"{role} sem EXECUTE {sig}", "f",
                      pg.sql(f"SELECT has_function_privilege('{role}','{sig}','EXECUTE')"))
        pg.sql("CREATE FUNCTION public.zz_default_acl_probe() RETURNS int LANGUAGE sql AS $$SELECT 1$$;")
        check("G-12", "controle: função nova em public recebe default ACL authenticated (prova que default ACL é real)", "t",
              pg.sql("SELECT has_function_privilege('authenticated','public.zz_default_acl_probe()','EXECUTE')"))
        check("G-13", "rerun recusado", True, "rerun refused" in pg.sql(s, ok=False))
        check("G-14", "gate desligado nega mesmo com GRANT local", "owned_fiscal_forbidden",
              (pg.sql("GRANT EXECUTE ON FUNCTION public.tenant_owned_product_fiscal_save(uuid,timestamptz,jsonb,text,uuid) TO authenticated;" + as_user(UA) + SAVE.format(p=PA, exp="NULL", v='{"ncm":"31010000"}', k=K1) + ";", ok=False)).split("ERROR:  ")[-1][:22])
        enable_local(pg)
        r = pg.sql(as_user(UA) + SAVE.format(p=PA, exp="NULL", v='{"ncm":"31010000"}', k=K1) + ";")
        rc = json.loads(r.splitlines()[-1])
        check("G-15", "admin A cria DRAFT no próprio item pela via canônica (a00+a10 compostos)", ["DRAFT", A, False],
              [rc["profile_status"], rc["organization_id"], rc["idempotent"]])
        check("G-16", "permissão consumida; auditoria fiscal registrou INSERT com ator A", "0|1",
              pg.sql(f"SELECT (SELECT count(*) FROM platform_private.owned_fiscal_write_permits)||'|'||(SELECT count(*) FROM public.fiscal_audit_log WHERE action='INSERT' AND changed_by='{UA}')"))
        check("G-17", "updated_at do recibo tem fuso e micros (formato servidor)", True,
              bool(re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}:\d{2}$", rc["updated_at"])))
        r2 = json.loads(pg.sql(as_user(UA) + SAVE.format(p=PA, exp="NULL", v='{"ncm":"31010000"}', k=K1) + ";").splitlines()[-1])
        check("G-18", "replay idempotente sem duplicar", [True, "1"], [r2["idempotent"], pg.sql(f"SELECT count(*) FROM public.product_fiscal_profiles WHERE product_id='{PA}'")])
        check("G-19", "mesma chave outro payload PT409", "owned_fiscal_key_conflict",
              code(pg.sql(as_user(UA) + SAVE.format(p=PA, exp="NULL", v='{"ncm":"31010001"}', k=K1) + ";", ok=False)))
        check("G-20", "CAS ausente PT409", "owned_fiscal_stale", code(pg.sql(as_user(UA) + SAVE.format(p=PA, exp="NULL", v='{"ncm":"31010002"}', k=K2) + ";", ok=False)))
        check("G-21", "CAS errado PT409", "owned_fiscal_stale", code(pg.sql(as_user(UA) + SAVE.format(p=PA, exp="'2020-01-01T00:00:00Z'", v='{"ncm":"31010002"}', k=K2) + ";", ok=False)))
        r3 = json.loads(pg.sql(as_user(UA) + SAVE.format(p=PA, exp=f"'{rc['updated_at']}'", v='{"ncm":"31010002"}', k=K2) + ";").splitlines()[-1])
        check("G-22", "CAS correto atualiza com token estritamente maior", True, r3["updated_at"] > rc["updated_at"] and r3["profile_status"] == "DRAFT")
        check("G-23", "A não grava item de B", "owned_fiscal_forbidden", code(pg.sql(as_user(UA) + SAVE.format(p=PB, exp="NULL", v='{}', k=K3) + ";", ok=False)))
        check("G-24", "A não grava item global pela RPC", "owned_fiscal_forbidden", code(pg.sql(as_user(UA) + SAVE.format(p=PG_, exp="NULL", v='{}', k=K3) + ";", ok=False)))
        before = pg.sql(f"SELECT updated_at FROM public.product_fiscal_profiles WHERE product_id='{PA}'")
        r = pg.sql(as_user(UA) + f"UPDATE public.product_fiscal_profiles SET ncm='99999999' WHERE product_id='{PA}';", ok=False)
        after = pg.sql(f"SELECT updated_at FROM public.product_fiscal_profiles WHERE product_id='{PA}'")
        check("G-25", "A update direto no próprio perfil: zero linhas alteradas (RLS) e nada muda", True, (r == "" or r.startswith("ERR")) and before == after)
        r = pg.sql(as_user(UA) + f"INSERT INTO public.product_fiscal_profiles(product_id,is_active) VALUES ('{PB}',true);", ok=False)
        check("G-26", "A insert direto negado", True, r.startswith("ERR"))
        r = pg.sql(as_user(UA) + f"INSERT INTO platform_private.owned_fiscal_write_permits VALUES (txid_current(),'{PA}','{UA}','{A}','UPDATE');", ok=False)
        check("G-27", "cliente não forja permissão privada", True, "permission denied" in r)
        # permit forged by owner for another txid is ignored; SA direct path on owned row is denied
        pg.sql(f"INSERT INTO platform_private.owned_fiscal_write_permits VALUES (1,'{PA}','{USA}','{A}','UPDATE');")
        r = pg.sql(as_user(USA) + f"UPDATE public.product_fiscal_profiles SET ncm='88888888' WHERE product_id='{PA}' RETURNING 1;", ok=False)
        check("G-28", "SA não grava perfil de item próprio (permissão de outra transação não vale)", True,
              r.startswith("ERR") or r == "")
        pg.sql("DELETE FROM platform_private.owned_fiscal_write_permits;")
        r = pg.sql(f"SET ROLE postgres; SET test.uid='{UA}'; SET owned_fiscal.permit='on'; SET app.tenant='{A}';\n"
                   f"UPDATE public.product_fiscal_profiles SET ncm='77777777' WHERE product_id='{PA}';", ok=False)
        check("G-29", "GUC forjada + ator A sem permissão não passa a10 (mesmo como dono da tabela)", "FISCAL_FORBIDDEN", code(r))
        check("G-30", "SA via RPC negado", "owned_fiscal_forbidden", code(pg.sql(as_user(USA) + SAVE.format(p=PA, exp="NULL", v='{}', k=K3) + ";", ok=False)))
        # global guard preserved
        pg.sql(as_user(USA) + f"INSERT INTO public.product_fiscal_profiles(product_id,is_active,ncm) VALUES ('{PG_}',true,'31010000');")
        g1 = pg.sql(f"SELECT updated_at FROM public.product_fiscal_profiles WHERE product_id='{PG_}'")
        pg.sql(as_user(USA) + f"UPDATE public.product_fiscal_profiles SET ncm='31010009', updated_at='2000-01-01' WHERE product_id='{PG_}';")
        g2 = pg.sql(f"SELECT updated_at FROM public.product_fiscal_profiles WHERE product_id='{PG_}'")
        check("G-31", "SA mantém escrita global e CAS servidor ignora timestamp do cliente", True, g2 > g1)
        r = pg.sql(as_user(UA) + f"UPDATE public.product_fiscal_profiles SET ncm='1' WHERE product_id='{PG_}' RETURNING 1;", ok=False)
        check("G-32", "admin de empresa não grava global", True, r == "" or r.startswith("ERR"))
        r = pg.sql(f"SET ROLE postgres; SET test.uid='{UA}';\nUPDATE public.product_fiscal_profiles SET ncm='1' WHERE product_id='{PG_}';", ok=False)
        check("G-33", "global: ator não-SA negado por a10 mesmo sem RLS", "FISCAL_FORBIDDEN", code(r))
        pg.sql(f"UPDATE public.product_fiscal_profiles SET is_active=false WHERE product_id='{PG_}';", ok=False)
        pg.sql(f"SET ROLE postgres; SET test.uid='{USA}'; UPDATE public.product_fiscal_profiles SET is_active=false WHERE product_id='{PG_}';")
        r = pg.sql(f"SET ROLE postgres; SET test.uid='{USA}'; UPDATE public.product_fiscal_profiles SET ncm='2' WHERE product_id='{PG_}';", ok=False)
        check("G-34", "histórico inativo imutável", "FISCAL_HISTORY_IMMUTABLE", code(r))
        lst = json.loads(pg.sql(as_user(UG) + "GRANT_PLACEHOLDER" .replace("GRANT_PLACEHOLDER", "") + "SELECT public.tenant_owned_product_fiscal_list(10,0);").splitlines()[-1])
        check("G-35", "gestor lê lista da própria empresa", [A, 1], [lst["organization_id"], len(lst["items"])])
        check("G-36", "gestor não grava", "owned_fiscal_forbidden", code(pg.sql(as_user(UG) + SAVE.format(p=PA, exp="NULL", v='{}', k=K3) + ";", ok=False)))
        r4 = pg.sql(as_user(UF) + SAVE.format(p=PA, exp=f"'{r3['updated_at']}'", v='{"ncm":"31010003"}', k=K3) + ";", ok=False)
        check("G-37", "financeiro A grava (papel autorizado)", False, r4.startswith("ERR"))
        lb = json.loads(pg.sql(as_user(UB) + "SELECT public.tenant_owned_product_fiscal_list(10,0);").splitlines()[-1])
        check("G-38", "B lista só os seus (sem perfil de A)", [B, None], [lb["organization_id"], lb["items"][0]["profile"]])
        check("G-39", "B não lê perfil de A por SELECT direto", "0", pg.sql(as_user(UB) + f"SELECT count(*) FROM public.product_fiscal_profiles WHERE product_id='{PA}';").splitlines()[-1])
        check("G-40", "B não reaproveita chave de A", "owned_fiscal_key_conflict",
              code(pg.sql(as_user(UB) + SAVE.format(p=PA, exp="NULL", v='{"ncm":"31010000"}', k=K1) + ";", ok=False)))
        check("G-41", "anon negado", True, pg.sql(as_user(None, "anon") + SAVE.format(p=PA, exp="NULL", v='{}', k=K3) + ";", ok=False).startswith("ERR"))
        check("G-42", "ator inativo negado", "owned_fiscal_forbidden", code(pg.sql(as_user(UX) + SAVE.format(p=PA, exp="NULL", v='{}', k=K3) + ";", ok=False)))
        r = pg.sql(as_user(UA) + "BEGIN ISOLATION LEVEL REPEATABLE READ;\n" + SAVE.format(p=PA, exp="NULL", v='{}', k="90000000-0000-4000-8000-000000000009") + ";\nCOMMIT;", ok=False)
        check("G-43", "snapshot de transação (REPEATABLE READ) negado", "owned_fiscal_isolation_unsupported", code(r))
        check("G-44", "profile_status no payload 22023", "owned_fiscal_invalid", code(pg.sql(as_user(UA) + SAVE.format(p=PA, exp="NULL", v='{"profile_status":"VALIDATED"}', k="90000000-0000-4000-8000-00000000000a") + ";", ok=False)))
        concurrency(pg)
        # rollback deny-only
        pol_before = pg.sql("SELECT count(*) FROM pg_policies WHERE tablename='product_fiscal_profiles'")
        rec_before = pg.sql("SELECT count(*) FROM platform_private.owned_fiscal_receipts")
        pg.sql((PKG / "rollback.sql.review").read_text())
        check("G-60", "rollback: negado, policies e recibos preservados", [True, pol_before, rec_before],
              [pg.sql(as_user(UA) + SAVE.format(p=PA, exp="NULL", v='{}', k="90000000-0000-4000-8000-0000000000ff") + ";", ok=False).startswith("ERR"),
               pg.sql("SELECT count(*) FROM pg_policies WHERE tablename='product_fiscal_profiles'"),
               pg.sql("SELECT count(*) FROM platform_private.owned_fiscal_receipts")])
        pg.sql((PKG / "acl-closure.sql.review").read_text())
        privs = pg.sql("SELECT string_agg(r||':'||p||'='||has_table_privilege(r,'public.product_fiscal_profiles',p)::text, ',' ORDER BY r,p) FROM unnest(ARRAY['anon','authenticated']) r, unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES','SELECT','INSERT','UPDATE']) p")
        check("G-61", "fechamento inativo TRUNCATE/TRIGGER/REFERENCES (sem TRUNCATE real), fluxos mantidos",
              "anon:INSERT=true,anon:REFERENCES=false,anon:SELECT=true,anon:TRIGGER=false,anon:TRUNCATE=false,anon:UPDATE=true,authenticated:INSERT=true,authenticated:REFERENCES=false,authenticated:SELECT=true,authenticated:TRIGGER=false,authenticated:TRUNCATE=false,authenticated:UPDATE=true", privs, "PG_DISPOSABLE_METADATA_ONLY")
    finally:
        pg.stop()


def wait_lock(pg, pattern, timeout=8):
    for _ in range(timeout * 10):
        if pg.sql(f"SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%{pattern}%' AND pid<>pg_backend_pid()") != "0":
            return True
        time.sleep(0.1)
    return False


def concurrency(pg, prefix="G", deny=True):
    cur = lambda: pg.sql(f"SELECT updated_at FROM public.product_fiscal_profiles WHERE product_id='{PA}' AND is_active")
    scenarios = [
        (f"{prefix}-50", "controle: espera lock do perfil e grava sem revogação", None, False),
        (f"{prefix}-51", "revogação de papel concorrente durante espera do lock do perfil", f"DELETE FROM public.user_roles WHERE user_id='{UA}' AND role='administrador';", True),
    ]
    for i, (cid, name, revoke, expect_deny) in enumerate(scenarios):
        holder = subprocess.Popen(pg.psql(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        holder.stdin.write(f"BEGIN; SELECT 1 FROM public.product_fiscal_profiles WHERE product_id='{PA}' AND is_active FOR UPDATE;\n"); holder.stdin.flush()
        time.sleep(0.4)
        key = f"91000000-0000-4000-8000-00000000000{i}"
        writer = subprocess.Popen(pg.psql(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        writer.stdin.write(as_user(UA) + SAVE.format(p=PA, exp=f"'{cur()}'", v='{"ncm":"3101000' + str(i) + '"}', k=key) + ";\n"); writer.stdin.close()
        blocked = wait_lock(pg, "tenant_owned_product_fiscal_save")
        if revoke:
            pg.sql(revoke)
        holder.stdin.write("COMMIT;\n"); holder.stdin.close(); holder.wait(10)
        out, err = writer.communicate(timeout=15)
        LOG.write(f"--- concurrency {cid} blocked={blocked}\n{out}\n{err}\n")
        denied = "owned_fiscal_forbidden" in err
        check(cid, name if prefix == "G" else "mutação: " + name, [True, expect_deny and deny], [blocked, denied],
              "PG_DISPOSABLE_CONCURRENCY_READ_COMMITTED" if prefix == "G" else "PG_DISPOSABLE_MUTATION_SENSITIVITY")
        if revoke:
            pg.sql(f"INSERT INTO public.user_roles VALUES ('{UA}','administrador') ON CONFLICT DO NOTHING;")
    # profile deactivation in flight: writer waits on profiles FOR SHARE then re-checks
    rev = subprocess.Popen(pg.psql(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    rev.stdin.write(f"BEGIN; UPDATE public.profiles SET ativo=false WHERE user_id='{UA}';\n"); rev.stdin.flush(); time.sleep(0.4)
    writer = subprocess.Popen(pg.psql(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    writer.stdin.write(as_user(UA) + SAVE.format(p=PA, exp=f"'{cur()}'", v='{"ncm":"31010099"}', k="91000000-0000-4000-8000-0000000000aa") + ";\n"); writer.stdin.close()
    blocked = wait_lock(pg, "tenant_owned_product_fiscal_save")
    rev.stdin.write("COMMIT;\n"); rev.stdin.close(); rev.wait(10)
    out, err = writer.communicate(timeout=15)
    LOG.write(f"--- concurrency G-52 blocked={blocked}\n{out}\n{err}\n")
    if prefix == "G":
        check("G-52", "desativação de profile em andamento: writer espera FOR SHARE e reautoriza (nega)", [True, True],
              [blocked, "owned_fiscal_forbidden" in err], "PG_DISPOSABLE_CONCURRENCY_READ_COMMITTED")
    else:  # sem FOR SHARE o writer não serializa com a revogação em andamento: grava antes dela
        check(f"{prefix}-52", "mutação sem FOR SHARE: escrita não negada (prova que o FOR SHARE é o que serializa)", False,
              "owned_fiscal_forbidden" in err, "PG_DISPOSABLE_MUTATION_SENSITIVITY")
    pg.sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{UA}';")


RECHECK_AFTER_PROFILE = """  -- reautorização obrigatória depois da espera pelo lock do perfil (revisão independente)
  IF platform_private.owned_fiscal_actor(true) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'owned_fiscal_forbidden' USING ERRCODE='42501'; END IF;
  -- serializa com revogação de profile em andamento e reautoriza novamente
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR SHARE;
  IF platform_private.owned_fiscal_actor(true) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'owned_fiscal_forbidden' USING ERRCODE='42501'; END IF;
"""
TRIGGER_RECHECK = "IF NOT FOUND OR platform_private.owned_fiscal_actor(true) IS DISTINCT FROM v_owner THEN"


def run_mutations():
    """Prova de sensibilidade: sem rechecks pós-lock, a10 ainda nega (defesa em profundidade);
    sem rechecks no writer E no a10, a revogação concorrente passa — o teste discrimina."""
    base = build.build()
    assert RECHECK_AFTER_PROFILE in base and TRIGGER_RECHECK in base
    for prefix, text, deny in [("MUT1-writer-sem-recheck", base.replace(RECHECK_AFTER_PROFILE, ""), True),
                               ("MUT2-writer-e-a10-sem-recheck", base.replace(RECHECK_AFTER_PROFILE, "").replace(TRIGGER_RECHECK, "IF NOT FOUND THEN"), False)]:
        pg = PG(prefix[:4].lower())
        try:
            stub(pg); foundation(pg); pg.sql(text); enable_local(pg)
            pg.sql(as_user(UA) + SAVE.format(p=PA, exp="NULL", v='{"ncm":"31010000"}', k=K1) + ";")
            concurrency(pg, prefix, deny)
        finally:
            pg.stop()


if __name__ == "__main__":
    try:
        run_original()
        run_candidate()
        run_mutations()
    finally:
        s = {"PASS": sum(c["status"] == "PASS" for c in checks), "FAIL": sum(c["status"] == "FAIL" for c in checks)}
        (OUT / "summary.json").write_text(json.dumps(s)); print(json.dumps(s))
