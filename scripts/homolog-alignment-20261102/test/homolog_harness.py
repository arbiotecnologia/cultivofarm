#!/usr/bin/env python3
"""PostgreSQL DESCARTÁVEL — prova do pacote de alinhamento EXCLUSIVO HOMOLOG. Zero hosted.

Linha de base homolog SIMULADA, declarada:
  1. esquema real capturado de produção (harness_real: 59 tabelas + 68 extras, constraints, policies, gatilhos, grants)
     com os corpos REAIS de produção (434 com md5 conferido) — identidade real (user_roles/profiles espelhados de membros);
  2. degradado para o estado do comparativo homolog: 192 funções ausentes (DROP ... CASCADE), 63 divergentes (corpo de
     produção + marcador → md5 diferente; o corpo homolog real NÃO foi capturado, por isso o md5 'actual' dessas 63 é
     substituído SOMENTE aqui), 42 colunas ausentes (3 tabelas), 3 nulabilidades homolog;
  3. empresas/IDs homolog reais (c809e74f… onboarding, dcf50a75… ativa), 7 produtos sem pai de tenant, contas sintéticas;
  4. trava `a00_homolog_validation_no_receivable` SINTÉTICA (o corpo homolog não foi capturado).
Nada aqui é prova JWT/RLS hospedada.
"""
import hashlib, json, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
PKG = HERE.parent
ROOT = PKG.parent.parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/homolog-align-run"); OUT.mkdir(parents=True, exist_ok=True)
CAT_TEST = ROOT / "scripts/tenant-exclusive-catalog-20261101/test"
sys.argv = [sys.argv[0], str(OUT / "catalog-harness-scratch")]
sys.path[:0] = [str(CAT_TEST), str(PKG)]
import harness as H            # noqa: E402
import harness_real as HR      # noqa: E402
import build as B              # noqa: E402

checks = []
NEG = {}


def check(cid, scen, exp, act, kind="PG_DISPOSABLE_HOMOLOG_BASELINE_SIMULATED"):
    r = dict(id=cid, scenario=scen, expected=exp, actual=act, status="PASS" if exp == act else "FAIL", kind=kind)
    checks.append(r); print(json.dumps(r, ensure_ascii=False)[:600], flush=True)


ARB, FSF = B.ARB_H, B.FSF_H
U = H.U
UHA, UHF, UHB, UHS = U(801), U(802), U(803), U(804)       # admin AR Bio, admin FSF (papel do rh@), comprador (teste4), superadmin
PRODS = [U(700 + i) for i in range(7)]
SEED = (f"INSERT INTO public.organizations(id,nome,ativo,status) VALUES ('{ARB}','AR Bio HOMOL',true,'onboarding'),('{FSF}','FSF HOMOL',true,'ativa');\n"
        f"INSERT INTO platform_private.members VALUES ('{UHA}','{ARB}',true,false),('{UHF}','{FSF}',true,false),('{UHB}','{ARB}',false,false),('{UHS}',NULL,false,true);\n"
        "INSERT INTO public.produtos(id,nome,codigo) VALUES " + ",".join(f"('{p}','Produto homolog {i}','PH{i}')" for i, p in enumerate(PRODS)) + ";\n"
        "INSERT INTO public.profiles(user_id, organization_id, ativo, senha_provisoria) SELECT user_id, org, true, false FROM platform_private.members WHERE org IS NOT NULL;\n")
TRAVA = ("CREATE FUNCTION public.homolog_validation_no_receivable_synthetic() RETURNS trigger LANGUAGE plpgsql AS $t$ BEGIN "
         "IF NEW.receivable_generated IS TRUE THEN RAISE EXCEPTION 'homolog_validation_no_receivable'; END IF; RETURN NEW; END $t$;\n"
         f"CREATE TRIGGER {B.HOMOLOG_TRAVA} BEFORE INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.homolog_validation_no_receivable_synthetic();")


def fx(stmts):
    """defaults temporários de fixture só para colunas existentes na linha de base homolog"""
    out = []
    for l in stmts.splitlines():
        if any(f"public.{t} " in l or f"public.{t}\"" in l for t in B.NEW_TABLES): continue
        if any(f"public.{t} " in l and (f" {c} " in l or f'"{c}"' in l) for t, c in B.ADD_COLS): continue
        out.append(l)
    return "\n".join(out)


def pre_do(txt):
    i = txt.index("DO $pre$"); return txt[i:txt.index("$pre$;", i + 8) + 6]


def main():
    HR.IDENTITY_STUBS = "SELECT 1;"          # identidade REAL de produção (sem stubs) até depois do POST
    HR.ENTITLEMENTS_STUB = "SELECT 1;"
    HR.DATA = SEED
    H.schema = HR.real_schema
    ddl, _, _ = H.schema()
    pg = HR.RealPG()
    q = lambda s: pg.sql("RESET ROLE;\n" + s)
    try:
        pg.sql(HR.BASE); pg.sql(ddl); pg.sql(HR.AFTER)
        H.load_live_functions(pg); H.load_extra25_stubs(pg)
        pg.sql(HR.DATA_SENTINEL)
        inst = HR.INFO.get("install", {})
        # ---- equivalência de produção: os 434 corpos com md5 exato ----
        fix = []
        for s in B.INSTALL + [x for x in B.STATE if B.STATE[x][0] == "equal"]:
            if q(f"SELECT coalesce(md5(pg_get_functiondef(to_regprocedure('{B.fq(s)}'))),'')") != B.STATE[s][1]:
                r = pg.sql("SET check_function_bodies=off;\n" + B.BODY[s] + ";", ok=False)
                fix.append((s, r[:120] if r.startswith("ERR") else "reloaded"))
        bad = [s for s in B.BODY if s in B.STATE and q(f"SELECT coalesce(md5(pg_get_functiondef(to_regprocedure('{B.fq(s)}'))),'')") != B.STATE[s][1]]
        check("BASE-1", "434 corpos de produção presentes com md5 exato antes da degradação", 0, len(bad), kind="PG_DISPOSABLE_REAL_BODIES")
        (OUT / "prod-equivalence.json").write_text(json.dumps(dict(reloaded=fix, still_bad=bad, install_summary={k: (len(v) if isinstance(v, list) else v) for k, v in inst.items()}), indent=1))
        before = dict(pol=q("SELECT count(*) FROM pg_policies WHERE schemaname='public'"), trg=q("SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal"))
        # ---- degradação para o estado homolog do comparativo ----
        pg.sql("SET client_min_messages=warning;")
        absent = [s for s in B.STATE if B.STATE[s][0] == "absent"]
        for s in absent:
            pg.sql(f"DROP FUNCTION IF EXISTS {B.fq(s)} CASCADE;", ok=False)
        override = {}
        # corpos REAIS divergentes da homolog (captura READ ONLY 02/11, md5 = comparativo 63/63); sem hash artificial
        HREAL = {hashlib.md5(f["definition"].encode()).hexdigest(): f["definition"] for f in json.loads(
            (B.EV.parent / "homolog-alinhamento-20261102/homolog-corpos-divergentes-20261102.json").read_text())}
        assert hashlib.sha256((B.EV.parent / "homolog-alinhamento-20261102/homolog-corpos-divergentes-20261102.json").read_bytes()).hexdigest() == "20ac273329b5679ca5948f420c1a4f4d9749ed1ddf2e2961570409e50856de10"
        for s in B.REPLACE:
            d = HREAL[B.STATE[s][2]]
            r = pg.sql("SET check_function_bodies=off;\n" + d + ";", ok=False)
            override[s] = q(f"SELECT md5(pg_get_functiondef(to_regprocedure('{B.fq(s)}')))") if not r.startswith("ERR") else "ERR"
        for t in B.NEW_TABLES: pg.sql(f"DROP TABLE public.{t} CASCADE;")
        for t, c in B.ADD_COLS: pg.sql(f"ALTER TABLE public.{t} DROP COLUMN {c} CASCADE;")
        for t, c, e, a in B.CHANGED: pg.sql(f"ALTER TABLE public.{t} ALTER COLUMN {c} {'SET' if a == 'NO' else 'DROP'} NOT NULL;")
        pg.sql(TRAVA)
        # cron real da homolog (pré-voo 02/11): 7 jobs, TODOS inativos — conteúdo sintético declarado, só o estado é pinado
        pg.sql("CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE SCHEMA IF NOT EXISTS cron; CREATE TABLE IF NOT EXISTS cron.job(jobid bigint PRIMARY KEY, schedule text, command text, nodename text, nodeport int, database text, username text, active boolean NOT NULL DEFAULT true, jobname text);"
               "INSERT INTO cron.job SELECT g, '*/5 * * * *', 'SELECT 1', 'localhost', 5432, 'postgres', 'postgres', false, 'homolog_job_'||g FROM generate_series(1,7) g ON CONFLICT DO NOTHING;")
        # homolog real não tem a relação-tipo SMTP
        pg.sql("DROP TABLE IF EXISTS platform_private.tenant_smtp_dispatch_jobs CASCADE;", ok=False)
        # estado legado homolog adicional (sintético, declarado): policy permissiva fora da captura, restritiva fora da captura,
        # policy capturada com predicado divergente e grant anon de escrita a mais
        pol0 = B.POLICIES[0]
        pg.sql("CREATE POLICY homolog_legado_aberto ON public.produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);"
               "CREATE POLICY homolog_legado_restritivo ON public.produtos AS RESTRICTIVE FOR DELETE TO authenticated USING (false);"
               f'DROP POLICY IF EXISTS "{pol0["policyname"]}" ON public.{pol0["tablename"]};'
               f'CREATE POLICY "{pol0["policyname"]}" ON public.{pol0["tablename"]} FOR ALL TO authenticated USING (true);'
               "GRANT INSERT, UPDATE, DELETE ON public.produtos TO anon;")
        after = dict(pol=q("SELECT count(*) FROM pg_policies WHERE schemaname='public'"), trg=q("SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal"))
        (OUT / "homolog-baseline.json").write_text(json.dumps(dict(before=before, after=after, divergent_md5_override=override), indent=1))
        check("BASE-2", "63 divergentes com corpo REAL homolog: md5 instalado = md5 homolog do comparativo", 63, sum(1 for s, h in override.items() if h == B.STATE[s][2]), kind="PG_DISPOSABLE_REAL_HOMOLOG_BODIES")
        acl_q = "SELECT string_agg(has_table_privilege(rl,'public.'||t,'TRUNCATE')::text, ',' ORDER BY t, rl) FROM unnest(ARRAY['microorganism_fiscal_profiles','partner_order_items','partner_orders','product_fiscal_profiles','produto_conformidade_perfis']) t, unnest(ARRAY['anon','authenticated']) rl"
        crud_q = "SELECT count(*) FROM unnest(ARRAY[" + ",".join(f"'{t}'" for t in B.TABLES) + "]) t, unnest(ARRAY['anon','authenticated','service_role']) rl, unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) pv WHERE has_table_privilege(rl,'public.'||t,pv)"
        exp_crud = str(sum(1 for t, g, pr in B.GRANTS for x in pr if x in ('SELECT','INSERT','UPDATE','DELETE')))
        check("ACL-RED", "RED: grants capturados dão TRUNCATE a anon/authenticated nas 5 tabelas confirmadas", ",".join(["true"]*10), q(acl_q))
        pre = B.pre_sql(override); align = B.align_sql(override); P = pre_do(pre)
        (OUT / "00-pre.harness.sql").write_text(pre)
        # ---- PRE ----
        r = pg.sql(pre, ok=False)
        check("PRE-ACL-RED", "PRE aborta com ACL capturada pré-04 (destrutiva de cliente aberta)", True, "client_destructive_acl_not_hardened:partner_orders:authenticated:TRUNCATE" in r)
        r04 = pg.sql(B.client_acl_hardening_sql(), ok=False)   # estado hospedado real: 04 já aplicado em homolog e produção
        check("PRE-ACL-04", "04 aplicado na linha de base (espelha o estado hospedado endurecido)", "OK", "OK" if not r04.startswith("ERR") else r04[-800:])
        r = pg.sql(pre, ok=False); check("PRE-1", "PRE aprova a linha de base homolog (READ ONLY)", "OK", "OK" if not r.startswith("ERR") else r[-1500:])
        neg = [
            ("PRE-2", f"INSERT INTO public.organizations(id,nome,ativo,status) VALUES ('{H.ARB}','AR Bio PROD',true,'ativa');", "not_homolog:production_org_present", "empresa de produção presente: não é homologação"),
            ("PRE-3", f"DELETE FROM public.profiles WHERE organization_id='{FSF}'; DELETE FROM public.organizations WHERE id='{FSF}';", "not_homolog:homolog_orgs_absent", "empresa homolog ausente"),
            ("PRE-4", f"ALTER TABLE public.partner_orders DISABLE TRIGGER {B.HOMOLOG_TRAVA};", "homolog_trava_missing_or_disabled", "trava homolog desligada"),
            ("PRE-5", "UPDATE public.company_fiscal_settings SET nfe_enabled=true; INSERT INTO public.company_fiscal_settings(organization_id,nfe_enabled) VALUES ('" + ARB + "',true);", "fiscal_enabled", "fiscal ligado"),
            ("PRE-6", "UPDATE cron.job SET active=true WHERE jobid=3;", "cron_jobs_active:1", "um dos 7 jobs reativado"),
            ("PRE-6b", "INSERT INTO cron.job(jobid,schedule,command,database,username,active,jobname) VALUES (8,'* * * * *','SELECT 1','postgres','postgres',false,'extra');", "cron_jobs_count_drift:8", "job extra (inativo) = drift"),
            ("PRE-6c", "DELETE FROM cron.job WHERE jobid=7;", "cron_jobs_count_drift:6", "job excluído = drift"),
            ("PRE-7", f"ALTER FUNCTION {B.fq(next(s for s in B.STATE if B.STATE[s][0]=='equal'))} SET work_mem='1MB';", "fn_drift_equal:", "função 'igual' com drift"),
            ("PRE-8", f"ALTER FUNCTION {B.fq(B.REPLACE[0])} SET work_mem='1MB';", "fn_drift_divergent:", "divergente fora do md5 homolog capturado"),
            ("PRE-9", "SET check_function_bodies=off;\n" + B.BODY[B.CREATE_NEW[0]] + ";", "fn_unexpected_present:", "função ausente já presente (instalação parcial)"),
            ("PRE-10", "ALTER TABLE public.produtos ADD COLUMN familia_catalogo text;", "column_unexpected_present:produtos.familia_catalogo", "coluna ausente já presente"),
            ("PRE-11", "CREATE TABLE public.catalog_tenant_visibility(x int);", "table_unexpected_present:catalog_tenant_visibility", "tabela ausente já presente"),
            ("PRE-12", "ALTER TABLE public.envase ALTER COLUMN quantidade DROP NOT NULL; ALTER TABLE public.envase ALTER COLUMN quantidade SET NOT NULL;", "nullability_drift:envase.quantidade", "nulabilidade fora do capturado"),
            ("PRE-13", "CREATE TABLE platform_private.homolog_alignment_ledger(id int);", "already_aligned_or_partial", "ledger presente (reexecução)"),
            ("PRE-14", "SET check_function_bodies=off;\n" + B.BODY["platform_private.tenant_smtp_lane_ready(uuid)"] + ";", "fn_unexpected_present:platform_private.tenant_smtp_lane_ready(uuid)", "faixa SMTP fechada já presente"),
        ]
        cname, ctab, cdef = next((n, t, d) for t, n, d in B.CONSTRAINTS if d.startswith("CHECK") and t not in B.NEW_TABLES
                                 and not any(c in d for tt, c in B.ADD_COLS if tt == t) and t == "partner_accounts")
        neg.append(("PRE-15", f"ALTER TABLE public.{ctab} DROP CONSTRAINT {cname}; ALTER TABLE public.{ctab} ADD CONSTRAINT {cname} CHECK (true) NOT VALID;", f"constraint_drift:{ctab}.{cname}", "constraint mesmo nome com definição diferente"))
        for cid, mut, needle, scen in neg:
            r = pg.sql("BEGIN;\nSET LOCAL session_replication_role = replica;\n" + fx(HR.FX_SET) + "\n" + mut + "\n" + fx(HR.FX_DROP)
                       + "\nSET LOCAL session_replication_role = origin;\n" + P + "\nROLLBACK;", ok=False)
            NEG[cid] = r[-600:]
            check(cid, f"PRE aborta: {scen}", True, needle in r)
        # envase NULL bloqueia SET NOT NULL (o PRE conta as linhas)
        # fixture SINTÉTICA em transação revertida: linha legada de envase com NULL (gatilhos de fixture suspensos só nela)
        r = pg.sql("BEGIN;\nSET LOCAL session_replication_role = replica;\n" + fx(HR.FX_SET) + "\nINSERT INTO public.envase(id, quantidade, volume_por_unidade) VALUES (gen_random_uuid(), NULL, NULL);\n"
                   + fx(HR.FX_DROP) + "\nSET LOCAL session_replication_role = origin;\n" + P + "\nROLLBACK;", ok=False)
        NEG["PRE-16"] = r[-600:]
        check("PRE-16", "linha legada de envase com NULL bloqueia o SET NOT NULL (contagem real)", True, "envase_null_rows_block_not_null:1" in r)
        # ---- atomicidade ----
        r = pg.sql(B.align_sql(override, inject_fail=True), ok=False)
        check("ATM-1", "falha injetada depois dos corpos: aborta", True, "homolog_alignment_injected_failure" in r)
        check("ATM-2", "aborto não deixa ledger/coluna/função (transação única)", "false|0|false",
              q(f"SELECT (to_regclass('{B.LEDGER}') IS NOT NULL)||'|'||(SELECT count(*) FROM pg_attribute WHERE attrelid='public.produtos'::regclass AND attname='familia_catalogo')||'|'||(to_regprocedure('{B.fq(B.CREATE_NEW[0])}') IS NOT NULL)"))
        # ---- alinhamento ----
        snap0 = q("SELECT md5(string_agg(to_jsonb(o)::text,'|' ORDER BY id)) FROM public.organizations o") + "|" + q("SELECT md5(string_agg(id::text,'|' ORDER BY id)) FROM auth.users")
        r = pg.sql(align, ok=False)
        (OUT / "align-result.txt").write_text(r[-6000:])
        check("ALN-1", "alinhamento completo em uma transação, POST interno aprovado", "OK", "OK" if not r.startswith("ERR") else r[-2500:])
        if r.startswith("ERR"): return
        check("ALN-2", "459: 429 com md5 de produção, 25 globais e 5 SMTP seguem ausentes", "429|0|0",
              q("SELECT count(*) FILTER (WHERE md5(pg_get_functiondef(to_regprocedure(s)))=h)||'|'||count(*) FILTER (WHERE to_regprocedure(s) IS NULL AND h IS NULL) FROM (VALUES "
                + ",".join(f"('{B.fq(s)}','{B.STATE[s][1]}')" for s in B.STATE if s not in B.NO_BODY and s not in B.SMTP_LANE_FNS) + ") m(s,h)") + "|" +
              q("SELECT count(*) FROM unnest(ARRAY[" + ",".join(f"'{B.fq(s)}'" for s in B.NO_BODY) + "]) s WHERE to_regprocedure(s) IS NOT NULL"))
        check("ALN-3", "colunas/nulabilidade: 1339 iguais à captura", "1339", q(
            "SELECT count(*) FROM information_schema.columns c JOIN (VALUES " + ",".join(f"('{c['table_name']}','{c['column_name']}','{c['is_nullable']}')" for c in B.CONSOL['columns']) +
            ") m(t,col,n) ON c.table_schema='public' AND c.table_name=m.t AND c.column_name=m.col AND c.is_nullable=m.n"))
        check("ALN-4", "232 policies capturadas exatas; permissiva legada removida; restritiva legada mantida", "232|0|1", q(
            "SELECT count(*) FROM pg_policies p JOIN (VALUES " + ",".join(f"('{p['tablename']}','{p['policyname'].replace(chr(39), chr(39)*2)}')" for p in B.POLICIES) + ") m(t,n) ON p.schemaname='public' AND p.tablename=m.t AND p.policyname=m.n")
            + "|" + q("SELECT count(*) FROM pg_policies WHERE policyname='homolog_legado_aberto'") + "|" + q("SELECT count(*) FROM pg_policies WHERE policyname='homolog_legado_restritivo'"))
        check("ALN-5", "policy capturada com predicado divergente substituída e registrada no ledger", "1", q(
            f"SELECT count(*) FROM {B.LEDGER}, jsonb_array_elements(detail) e WHERE step='policies' AND e ? 'replaced' AND e->'replaced'->>'policyname' = '{pol0['policyname'].replace(chr(39), chr(39)*2)}'"))
        check("ALN-6", "254 gatilhos capturados com definição exata (faixa SMTP fora); trava homolog mantida (fora da captura, registrada)", "254|1|1", q(
            "SELECT count(*) FROM (VALUES " + ",".join("('%s','%s','%s')" % (t, n, d.replace("'", "''")) for t, n, d in B.TRIGGERS) + ") m(t,n,d) JOIN pg_trigger g ON g.tgrelid=('public.'||m.t)::regclass AND g.tgname=m.n AND pg_get_triggerdef(g.oid)=m.d")
            + "|" + q(f"SELECT count(*) FROM pg_trigger WHERE tgname='{B.HOMOLOG_TRAVA}' AND tgenabled<>'D'")
            + "|" + q(f"SELECT count(*) FROM {B.LEDGER}, jsonb_array_elements(detail) e WHERE step='triggers' AND e->>'kept_uncaptured' LIKE '%{B.HOMOLOG_TRAVA}'"))
        check("ALN-7", "grant anon de escrita a mais em produtos revogado (grants = captura)", "false|false|false",
              q("SELECT has_table_privilege('anon','public.produtos','INSERT')||'|'||has_table_privilege('anon','public.produtos','UPDATE')||'|'||has_table_privilege('anon','public.produtos','DELETE')"))
        dq = "SELECT count(*) FROM unnest(ARRAY[" + ",".join(f"'{t}'" for t in B.TABLES) + "]) t, unnest(ARRAY['public','anon','authenticated']) rl, unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES']) pv WHERE has_table_privilege(rl,'public.'||t,pv)"
        check("ACL-GREEN-1", "GREEN: alinhamento fecha TRUNCATE/TRIGGER/REFERENCES de cliente nas 59 tabelas (inclui 5 confirmadas)", "0|" + ",".join(["false"]*10), q(dq) + "|" + q(acl_q))
        check("ACL-GREEN-2", "CRUD capturado (SELECT/INSERT/UPDATE/DELETE) preservado e service_role intacto", exp_crud + "|t", q(crud_q) + "|" + q("SELECT has_table_privilege('service_role','public.partner_orders','TRUNCATE')"))
        check("ACL-GREEN-3", "ledger lista os itens destrutivos da captura NÃO reconcedidos (linha de base já endurecida pelo 04)", str(sum(1 for t, g, pr in B.GRANTS if g in ('anon','authenticated') for x in pr if x in B.DESTRUCTIVE)),
              q(f"SELECT detail->>'count' FROM {B.LEDGER} WHERE step='table_acl_client_destructive_stripped'"))
        # 04 avulso: RED reaberto -> GREEN, CRUD intacto, idempotente; herança por role-membro aborta (não mascara)
        q("GRANT TRUNCATE, TRIGGER ON public.partner_orders TO authenticated; GRANT REFERENCES ON public.partner_order_items TO anon;")
        check("ACL-04-RED", "RED: permissão destrutiva reaberta", "true|true", q("SELECT has_table_privilege('authenticated','public.partner_orders','TRUNCATE')||'|'||has_table_privilege('anon','public.partner_order_items','REFERENCES')"))
        h = B.client_acl_hardening_sql(); r1 = pg.sql(h, ok=False); r2 = pg.sql(h, ok=False)
        check("ACL-04-GREEN", "04 fecha, preserva CRUD e é idempotente", "OK|OK|0|" + exp_crud, ("ERR" if r1.startswith("ERR") else "OK") + "|" + ("ERR" if r2.startswith("ERR") else "OK") + "|" + q(dq) + "|" + q(crud_q))
        q("CREATE ROLE hal_trunc_member NOLOGIN; GRANT TRUNCATE ON public.partner_orders TO hal_trunc_member; GRANT hal_trunc_member TO authenticated;")
        r3 = pg.sql(h, ok=False)
        check("ACL-04-INHERIT", "TRUNCATE herdado por role-membro: 04 aborta em vez de declarar fechado", True, "post:client_destructive_acl" in r3 and "partner_orders:authenticated:TRUNCATE" in r3)
        q("REVOKE hal_trunc_member FROM authenticated; REVOKE ALL ON public.partner_orders FROM hal_trunc_member; DROP ROLE hal_trunc_member;")
        pr_ = pg.sql(B.client_acl_probe_sql(), ok=False)
        check("ACL-05", "sonda somente leitura roda sem escrita e reporta 0 abertos", True, not pr_.startswith("ERR") and pr_.strip().splitlines()[-1].strip() in ("0", "ROLLBACK") )
        check("ALN-8", "nenhuma das 225 funções instaladas executável por anon", "0", q(
            "SELECT count(*) FROM unnest(ARRAY[" + ",".join(f"'{B.fq(s)}'" for s in B.INSTALL) + "]) s WHERE has_function_privilege('anon', to_regprocedure(s), 'EXECUTE')"))
        ncreate_auth = q("SELECT count(*) FROM unnest(ARRAY[" + ",".join(f"'{B.fq(s)}'" for s in B.CREATE_NEW) + "]) s WHERE has_function_privilege('authenticated', to_regprocedure(s), 'EXECUTE')")
        exp_auth = str(len([s for s in B.CREATE_NEW if s in B.GRANT_AUTH]))
        check("ALN-9", "funções criadas: authenticated só nas derivadas (front/policies/fecho INVOKER); demais fechadas", exp_auth, ncreate_auth)
        check("ALN-10", "empresas e auth.users intactos (md5 antes = depois)", snap0,
              q("SELECT md5(string_agg(to_jsonb(o)::text,'|' ORDER BY id)) FROM public.organizations o") + "|" + q("SELECT md5(string_agg(id::text,'|' ORDER BY id)) FROM auth.users"))
        check("ALN-11", "7 produtos homolog preservados pelo alinhamento", "7", q("SELECT count(*) FROM public.produtos"))
        check("ALN-12", "RLS ligada nas 3 tabelas criadas (sem policy de cliente: só service_role, como na captura)", "3|false",
              q("SELECT count(*) FROM pg_class WHERE relrowsecurity AND oid IN ('public.catalog_tenant_visibility'::regclass,'public.produto_composicao_conjuntos'::regclass,'public.produto_composicao_declaracoes'::regclass)")
              + "|" + q("SELECT has_table_privilege('authenticated','public.catalog_tenant_visibility','SELECT')::text"))
        r = pg.sql(align, ok=False); check("ALN-13", "reexecução do 01 aborta antes de qualquer DDL", True, "already_aligned_or_partial" in r)
        r = pg.sql(B.rollback_sql().replace("BEGIN;", "BEGIN;", 1).replace("COMMIT;", "ROLLBACK;"), ok=False)
        check("RB-1", "rollback restritivo executa (testado em transação revertida)", True, not r.startswith("ERR"))
        # ---- variante limpa do catálogo ----
        gate_full, _ = B.catalog_gate_sql()
        gate, pins = B.catalog_gate_sql(skip_identity=True)   # identidades provadas na suíte identity-fixtures (IDFX-GATE)
        gdo = gate[gate.index("DO $gate$"):gate.index("$gate$;", gate.index("DO $gate$") + 9) + 7]
        drops = " ".join(f"ALTER TABLE public.platform_org_admin_invites DROP COLUMN IF EXISTS {c};" for c, _ in B.INVITE_ACCESS_COLS)
        r = pg.sql(f"BEGIN; {drops}\n{gdo}\nROLLBACK;", ok=False)   # estado homolog anterior ao delta do auditor
        (OUT / "cat0-cols-red.txt").write_text(r[-3000:])
        check("CAT-0-COLS-RED", "gate recusa sem as 6 colunas access_* de convites (dependência real de platform_actor_access_ready)", True,
              all(f"gate_invite_access_column:{c}" in r for c, _ in B.INVITE_ACCESS_COLS))
        ic = B.invite_access_columns_sql(); r1 = pg.sql(ic, ok=False); r2 = pg.sql(ic, ok=False)
        check("INV-06", "06 adiciona as 6 colunas nullable sem default e é idempotente (sem dados/grants)", "OK|OK|6|0",
              ("ERR" if r1.startswith("ERR") else "OK") + "|" + ("ERR" if r2.startswith("ERR") else "OK") + "|" + q(
              "SELECT count(*)||'|'||count(*) FILTER (WHERE attnotnull OR atthasdef) FROM pg_attribute WHERE attrelid='public.platform_org_admin_invites'::regclass AND attname LIKE 'access\\_%' AND NOT attisdropped"))
        r = pg.sql(gate_full, ok=False)
        check("CAT-0-ID-RED", "gate completo recusa sem o 10 aplicado (ledger/estado final de rh e teste4)", True, "identity_fixtures_not_applied" in r)
        r = pg.sql(gate, ok=False); check("CAT-0", "gate homolog do catálogo aprovado no estado atual (01 + colunas access_*)", "OK", "OK" if not r.startswith("ERR") else r[-1200:])
        r = pg.sql("BEGIN; CREATE TABLE platform_private.chain_purge_maintenance_ledger(id int);\n" + gate.split("BEGIN TRANSACTION READ ONLY;", 1)[1].replace("COMMIT;", "ROLLBACK;"), ok=False)
        check("CAT-0b", "gate recusa homologação onde a manutenção 02 de produção tenha rodado", True, "production_chain_purge_must_not_run_here" in r)
        cpre = (B.CAT_PKG / B.CAT_FILES[0]).read_text(); cmig = (B.CAT_PKG / B.CAT_FILES[1]).read_text()
        check("ALN-SMTP", "faixa SMTP fechada por ausência: 5 funções e gatilho ausentes", "0|0", q(
            "SELECT (SELECT count(*) FROM unnest(ARRAY[" + ",".join(f"'{s}'" for s in B.SMTP_LANE_FNS) + "]) s WHERE to_regprocedure(s) IS NOT NULL)||'|'||(SELECT count(*) FROM pg_trigger WHERE tgname='tenant_smtp_lane_solicitacao_atribuida')"))
        check("ALN-CRON", "cron preservado: 7 jobs, todos inativos, nenhum reativado/excluído", "7|0", q("SELECT count(*)||'|'||count(*) FILTER (WHERE active) FROM cron.job"))
        check("CAT-0c", "arquivos da variante limpa conferem com os hashes do gate", True,
              all(hashlib.sha256((B.CAT_PKG / f).read_bytes()).hexdigest() == pins[f] for f in B.CAT_FILES))
        # homolog REAL tem produto_anexos (só homolog; captura READ ONLY 03/11): instalada verbatim na baseline simulada
        sys.path.insert(0, str(B.CAT_PKG / "test")); import homolog_only_anexos as HAX
        q(HAX.DDL + f"INSERT INTO public.produto_anexos(produto_id,titulo,url) SELECT id,'bula','https://x/h' FROM public.produtos LIMIT 1;")
        prod_pre = (B.CAT_PKG / "00-pre-global.sql.review").read_text()
        r = pg.sql(prod_pre, ok=False)
        check("CAT-1-HAX", "PRE de PRODUÇÃO na homolog real também aborta fk_unmapped:produto_anexos (nunca relaxado)", True,
              "fk_unmapped:produto_anexos.produto_id->produtos" in r)
        check("CAT-1", "PRE de PRODUÇÃO recusa a homologação (25 globais ausentes) — variante é necessária e declarada", True, r.count("fn_missing:") == 25)
        r = pg.sql(cpre, ok=False); check("CAT-2", "PRE da variante limpa aprova a homologação alinhada", "OK", "OK" if not r.startswith("ERR") else r[-2500:])
        pg.sql(HR.ENTITLEMENTS_STUB_REAL if hasattr(HR, "ENTITLEMENTS_STUB_REAL") else ENT_STUB())
        r = pg.sql(cmig, ok=False)
        (OUT / "catalog-migrate-result.txt").write_text(r[-6000:])
        check("CAT-3", "migração da variante limpa aplicada (transação única)", "OK", "OK" if not r.startswith("ERR") else r[-2500:])
        if r.startswith("ERR"): return
        check("CAT-4", "7 produtos homolog sem pai de tenant saem com snapshot integral no ledger; nenhum reatribuído", "0|7", q(
            "SELECT (SELECT count(*) FROM public.produtos)||'|'||(SELECT (detail->>'count') FROM platform_private.tenant_catalog_migration_ledger WHERE step='global_removed' AND detail->>'table'='produtos')"))
        check("CAT-5", "snapshot do ledger contém os 7 ids originais", "7", q(
            "SELECT count(*) FROM platform_private.tenant_catalog_migration_ledger, jsonb_array_elements(detail->'snapshot') e WHERE step='global_removed' AND detail->>'table'='produtos' AND (e->>'id') = ANY(ARRAY["
            + ",".join(f"'{p}'" for p in PRODS) + "])"))
        as_ = lambda u: H.as_user(u)
        save = lambda u, nome: pg.sql(as_(u) + f"SELECT (public.tenant_product_save(NULL, '{{\"nome\":\"{nome}\",\"tipo\":\"inoculante\"}}'::jsonb, NULL, gen_random_uuid()))::text;", ok=False)
        r = save(UHA, "AR Bio onboarding"); check("JWTSIM-1", "AR Bio em onboarding: escrita de catálogo negada pelo guard canônico (controle positivo exige onboarding concluído)", True, "catalog_visibility_tenant_unavailable" in r,
                                                   kind="PG_DISPOSABLE_SYNTHETIC_AUTH")
        (OUT / "jwtsim-1.txt").write_text(r[-1500:])
        # o caminho real é org_onboarding_complete com o JWT do administrador AR Bio; aqui o estado é ajustado SINTETICAMENTE
        q(f"ALTER TABLE public.organizations DISABLE TRIGGER USER; UPDATE public.organizations SET status='ativa' WHERE id='{ARB}'; ALTER TABLE public.organizations ENABLE TRIGGER USER;")
        r = save(UHA, "Bio homolog A"); check("JWTSIM-2", "administrador AR Bio (empresa ativa) cria produto próprio via tenant_product_save", True, not r.startswith("ERR"), kind="PG_DISPOSABLE_SYNTHETIC_AUTH")
        (OUT / "jwtsim-2.txt").write_text(r[-1500:])
        r = save(UHF, "Bio homolog F"); check("JWTSIM-3", "administrador FSF cria produto próprio", True, not r.startswith("ERR"), kind="PG_DISPOSABLE_SYNTHETIC_AUTH")
        check("JWTSIM-4", "donos derivados no servidor: 1 AR Bio + 1 FSF", f"{ARB}:1,{FSF}:1", q(
            "SELECT string_agg(owner_organization_id||':'||n, ',' ORDER BY owner_organization_id::text) FROM (SELECT owner_organization_id, count(*) n FROM public.produtos GROUP BY 1) z"),
              kind="PG_DISPOSABLE_SYNTHETIC_AUTH")
        r = save(UHB, "comprador"); (OUT / "jwtsim-5.txt").write_text(r[-1500:]); check("JWTSIM-5", "comprador (papel do teste4) não grava catálogo", True, "catalog_visibility_role_denied" in r, kind="PG_DISPOSABLE_SYNTHETIC_AUTH")
        check("JWTSIM-6", "FSF não enxerga produto da AR Bio por RLS", "0", pg.sql(as_(UHF) + f"SELECT count(*) FROM public.produtos WHERE owner_organization_id='{ARB}';", ok=False).splitlines()[-1],
              kind="PG_DISPOSABLE_SYNTHETIC_AUTH")
        r = pg.sql(as_(UHA) + f"INSERT INTO public.produtos(nome,tipo,owner_organization_id) VALUES ('direto','inoculante','{ARB}');", ok=False)
        check("JWTSIM-7", "INSERT direto do cliente em produtos negado", True, r.startswith("ERR"), kind="PG_DISPOSABLE_SYNTHETIC_AUTH")
        check("JWTSIM-8", "trava homolog sem recebível segue presente e ligada após o catálogo", "1",
              q(f"SELECT count(*) FROM pg_trigger WHERE tgname='{B.HOMOLOG_TRAVA}' AND tgenabled<>'D'"))
    finally:
        pg.stop()
        s = dict(total=len(checks), passed=sum(c["status"] == "PASS" for c in checks), failed=[c["id"] for c in checks if c["status"] != "PASS"])
        (OUT / "pre-negative-detail.json").write_text(json.dumps(NEG, indent=1, ensure_ascii=False))
        (OUT / "checks.json").write_text(json.dumps(checks, indent=1, ensure_ascii=False))
        (OUT / "summary.json").write_text(json.dumps(s, indent=1))
        print("SUMMARY", json.dumps(s))


def ENT_STUB():
    """Entitlements SINTÉTICOS (planos/assinaturas homolog não capturados): mesma folha declarada do harness do catálogo."""
    return HR.ENTITLEMENTS_STUB_ORIG


HR.ENTITLEMENTS_STUB_ORIG = HR.ENTITLEMENTS_STUB

if __name__ == "__main__":
    main()
