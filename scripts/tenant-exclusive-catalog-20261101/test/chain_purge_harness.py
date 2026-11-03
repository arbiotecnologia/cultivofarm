#!/usr/bin/env python3
"""PostgreSQL DESCARTÁVEL — manutenção 02 (descarte da cadeia sem empresa). Zero hosted.

v2.6: TODOS os 83 gatilhos e suas 55 funções são instalados VERBATIM da captura READ ONLY de 02/11/2026
(captura-manutencao-20261102.json, sha256 b5d257c5...2a39); nenhum stub. Colunas não capturadas são sintéticas mínimas,
por isso as impressões digitais das 19 linhas são recapturadas localmente (as LIVE conferem com o manifesto no build).
Auth/JWT reais NÃO executados. Cada cenário roda em banco clonado de um template limpo.
"""
import json, os, pathlib, shutil, subprocess, sys, tempfile, time

HERE = pathlib.Path(__file__).resolve().parent
PKG = HERE.parent; ROOT = PKG.parent.parent
CONS = json.loads((ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/consolidado-20261101-1534/consolidado-catalogo-20261101.json").read_text())["files"]
CTX = CONS["descarte-contexto-live.json"]; PINS = CONS["descarte-triggers-pins.json"]; MAN = CONS["descarte-manifesto-live.json"]
SCOLS = CONS["catalogo-schema-input.json"]["columns"]; STRG = {(x["table_name"], x["tgname"]): x for x in CONS["catalogo-schema-input.json"]["triggers"]}
CAP = {"roots": CTX["roots"], "children": {"proof": CTX["proof"][0]["id"], "quality": CTX["quality"][0]["id"],
       "movements": sorted(m["id"] for m in CTX["movements"])}}
MAINT0 = (PKG / "02-chain-purge-maintenance.sql.review").read_text()
CAPM = json.loads((ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/captura-manutencao-20261102/captura-manutencao-20261102.json").read_text())
PINS = CAPM["triggers"]
MAINT_OLD = subprocess.run(["git", "show", "8c6ea7f:scripts/tenant-exclusive-catalog-20261101/02-chain-purge-maintenance.sql.review"],
                           cwd=ROOT, capture_output=True, text=True, check=True).stdout
CK_IDS = [m["id"] for m in MAN if m["table_name"] == "entrega_checklist"]
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/chain-purge-run"); OUT.mkdir(parents=True, exist_ok=True)
LOG = open(OUT / "harness.log", "w"); checks = []
R = CAP["roots"]; C = CAP["children"]


def check(cid, scen, exp, act):
    r = dict(id=cid, scenario=scen, expected=exp, actual=act, status="PASS" if exp == act else "FAIL", kind="PG_DISPOSABLE_CAPTURED_GUARDS")
    checks.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)


class PG:
    def __init__(self):
        for v in [k for k in os.environ if k.startswith("PG")]: os.environ.pop(v)
        self.d = tempfile.mkdtemp(prefix="pgchain-"); os.chown(self.d, 1000, 1000)
        self.port = str(59000 + os.getpid() % 900)
        self.as_ = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
        subprocess.run(self.as_ + ["initdb", "-D", f"{self.d}/data", "-U", "postgres", "-A", "trust", "-E", "UTF8"], check=True, capture_output=True)
        subprocess.run(self.as_ + ["pg_ctl", "-D", f"{self.d}/data", "-o", f"-p {self.port} -k {self.d} -c listen_addresses=''",
                                   "-l", f"{self.d}/log", "-w", "start"], check=True, capture_output=True)

    def cmd(self, db): return ["psql", "-X", "-q", "-At", "-h", self.d, "-p", self.port, "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1"]

    def sql(self, s, db="postgres", ok=True):
        r = subprocess.run(self.cmd(db), input=s, text=True, capture_output=True)
        LOG.write(f"--- db={db} ok={ok} rc={r.returncode}\n{s[:300]}\n>> {r.stdout[-600:]}{r.stderr[-1500:]}\n"); LOG.flush()
        if ok and r.returncode: raise RuntimeError(r.stderr[-3000:])
        return (r.stdout.strip() + ("\n" + r.stderr.strip() if r.stderr.strip() else "")) if r.returncode == 0 else "ERR:" + r.stderr.strip()

    def stop(self):
        subprocess.run(self.as_ + ["pg_ctl", "-D", f"{self.d}/data", "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(self.d, ignore_errors=True)


SCHEMA = """
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA cf_user_guards_v1;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY); INSERT INTO cf_user_guards_v1.state VALUES (true);
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION platform_private.stock_p1_lote_owned(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.fn_estoque_ctx_read() RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
CREATE TABLE platform_private.delivery_context_20261030(txid bigint, actor uuid, action text, mutation text, organization_id uuid, target uuid, item uuid, delivery uuid);
CREATE TABLE public.clientes(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE public.organizations(id uuid PRIMARY KEY); CREATE TABLE public.organization_subscriptions(id uuid PRIMARY KEY);
CREATE TABLE public.saas_plan_versions(id uuid PRIMARY KEY); CREATE TABLE public.saas_plan_version_features(id uuid PRIMARY KEY);
CREATE TABLE public.saas_features(id uuid PRIMARY KEY); CREATE TABLE public.saas_modules(id uuid PRIMARY KEY);
CREATE TABLE public.organization_feature_overrides(id uuid PRIMARY KEY);
CREATE TABLE public.ordens_servico(id uuid PRIMARY KEY, organization_id uuid, cliente_id uuid, status text);
CREATE TABLE public.programacao_producao(id uuid PRIMARY KEY, organization_id uuid, ordem_servico_id uuid REFERENCES public.ordens_servico(id), ordem_servico_onfarm_id uuid);
CREATE TABLE public.lotes(id uuid PRIMARY KEY, organization_id uuid, programacao_id uuid REFERENCES public.programacao_producao(id), status text);
CREATE TABLE public.laboratorio_esteira_eventos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lote_id uuid, origem_os text);
CREATE TABLE public.controle_qualidade(id uuid PRIMARY KEY, lote_id uuid REFERENCES public.lotes(id), organization_id uuid, resultado text,
  responsavel text, responsavel_id uuid, data_analise date, created_at timestamptz DEFAULT now(), seq int, ph numeric, aparencia text, odor text, concentracao text, contaminacao text);
CREATE TABLE public.envase(id uuid PRIMARY KEY, lote_id uuid REFERENCES public.lotes(id), organization_id uuid, quantidade numeric, volume_por_unidade numeric);
CREATE TABLE public.estoque_produto(id uuid PRIMARY KEY, lote_id uuid REFERENCES public.lotes(id), envase_id uuid REFERENCES public.envase(id));
CREATE TABLE public.estoque_movimentacoes(id uuid PRIMARY KEY, lote_id uuid REFERENCES public.lotes(id), estoque_produto_id uuid REFERENCES public.estoque_produto(id),
  movimentacao_origem_id uuid REFERENCES public.estoque_movimentacoes(id) ON DELETE RESTRICT);
CREATE TABLE public.entregas(id uuid PRIMARY KEY, organization_id uuid, lote_id uuid REFERENCES public.lotes(id), ordem_servico_id uuid REFERENCES public.ordens_servico(id),
  estoque_produto_id uuid, comprovante_id uuid, status text, comprovante_status text, receivable_id uuid, partner_order_id uuid, ordem_servico_onfarm_id uuid,
  financial_status text, reentrega_origem_id uuid REFERENCES public.entregas(id));
CREATE TABLE public.entrega_comprovantes(id uuid PRIMARY KEY, entrega_id uuid REFERENCES public.entregas(id), status text, metadata jsonb DEFAULT '{}',
  arquivo_path text, assinatura_path text, qr_code_path text);
ALTER TABLE public.entregas ADD FOREIGN KEY (comprovante_id) REFERENCES public.entrega_comprovantes(id) ON DELETE SET NULL;
CREATE TABLE public.entrega_checklist(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entrega_id uuid REFERENCES public.entregas(id), item text);
CREATE TABLE public.entrega_termos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entrega_id uuid REFERENCES public.entregas(id), comprovante_id uuid REFERENCES public.entrega_comprovantes(id) ON DELETE SET NULL);
"""
REAL = ["entrega_comprovantes", "entregas", "estoque_produto", "envase", "lotes", "programacao_producao", "ordens_servico"]
def _ty(c):
    if c["data_type"] == "USER-DEFINED": return "text"
    if c["data_type"] == "ARRAY": return c["udt_name"][1:] + "[]"
    return c["data_type"]
# colunas REAIS capturadas (tipos base; enums como text; sem NOT NULL/defaults para fixtures sintéticas)
for t in REAL:
    for c in SCOLS:
        if c["table_name"] == t and c["column_name"] != "id":
            SCHEMA += f"ALTER TABLE public.{t} ADD COLUMN IF NOT EXISTS {c['column_name']} {_ty(c)};\n"
for t, col, parent in [("entrega_conferencia_itens", "entrega_id", "entregas"), ("entrega_documentos", "entrega_id", "entregas"),
                       ("entrega_etiquetas", "entrega_id", "entregas"), ("entrega_ocorrencias", "entrega_id", "entregas"),
                       ("entrega_reconciliacoes", "entrega_id", "entregas"), ("fiscal_stock_loss_contexts", "lote_id", "lotes"),
                       ("aplicacoes", "ordem_servico_id", "ordens_servico"), ("production_order_link", "ordem_servico_id", "ordens_servico")]:
    SCHEMA += f"CREATE TABLE public.{t}(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), {col} uuid REFERENCES public.{parent}(id));\n"
SCHEMA += """
CREATE TABLE public.estoque_embalagens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lote_id uuid REFERENCES public.lotes(id), envase_id uuid REFERENCES public.envase(id), entrega_id uuid REFERENCES public.entregas(id));
CREATE TABLE public.produto_etiquetas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lote_id uuid REFERENCES public.lotes(id), envase_id uuid REFERENCES public.envase(id), entrega_id uuid REFERENCES public.entregas(id));
CREATE TABLE public.fiscal_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), delivery_id uuid REFERENCES public.entregas(id));
CREATE TABLE public.fiscal_invoice_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entrega_id uuid REFERENCES public.entregas(id), lote_id uuid REFERENCES public.lotes(id));
CREATE MATERIALIZED VIEW public.mv_esteira_laboratorio AS SELECT count(*) AS n FROM public.lotes;
"""
OS_, PP, LT, EV, EP, EN = R["ordens_servico"], R["programacao_producao"], R["lotes"], R["envase"], R["estoque_produto"], R["entregas"]
PR, CQ, MV1, MV2 = C["proof"], C["quality"], "619cde9e-3199-4b3a-bb35-de4bc2f9132c", "3f40d033-36f0-4dc2-bf01-750f10433fb6"
DATA = f"""
INSERT INTO public.ordens_servico VALUES ('{OS_}',NULL,NULL,'concluida');
INSERT INTO public.programacao_producao VALUES ('{PP}',NULL,'{OS_}',NULL);
INSERT INTO public.lotes VALUES ('{LT}',NULL,'{PP}','aprovado');
INSERT INTO public.controle_qualidade(id,lote_id,organization_id,resultado) VALUES ('{CQ}','{LT}',NULL,'aprovado');
INSERT INTO public.envase VALUES ('{EV}','{LT}',NULL,10,1);
INSERT INTO public.estoque_produto VALUES ('{EP}','{LT}','{EV}');
INSERT INTO public.estoque_movimentacoes VALUES ('{MV1}','{LT}','{EP}',NULL),('{MV2}','{LT}','{EP}','{MV1}');
INSERT INTO public.entregas(id,organization_id,lote_id,ordem_servico_id,estoque_produto_id,status,comprovante_status) VALUES ('{EN}',NULL,'{LT}','{OS_}','{EP}','separado','pendente');
INSERT INTO public.entrega_comprovantes(id,entrega_id,status) VALUES ('{PR}','{EN}','gerado');
UPDATE public.entregas SET comprovante_id='{PR}' WHERE id='{EN}';
INSERT INTO public.entrega_checklist(id,entrega_id,item) SELECT x::uuid,'{EN}','item' FROM unnest(ARRAY{CK_IDS}) x;
-- dados FORA do escopo que devem permanecer intactos
INSERT INTO public.ordens_servico VALUES ('00000000-0000-0000-0000-0000000000a1','007bb519-cba0-4704-be2c-cb93ad010048',NULL,'em_cq');
INSERT INTO public.programacao_producao VALUES ('00000000-0000-0000-0000-0000000000a2','007bb519-cba0-4704-be2c-cb93ad010048','00000000-0000-0000-0000-0000000000a1',NULL);
INSERT INTO public.lotes VALUES ('00000000-0000-0000-0000-0000000000a3','007bb519-cba0-4704-be2c-cb93ad010048','00000000-0000-0000-0000-0000000000a2','aprovado');
"""


import re, hashlib
REFRESH = CTX["refresh"][0]["definition"]
SUBST = {}


def triggers():
    out = ["SET check_function_bodies = off;", "CREATE SCHEMA IF NOT EXISTS private;", REFRESH.rstrip() + ";"]
    seen = set()
    for p in PINS:
        fn = p["function_definition"].split("(")[0].split()[-1]
        if fn not in seen:
            seen.add(fn); out.append(p["function_definition"].rstrip() + ";")
    for p in PINS: out.append(p["trigger_definition"].rstrip() + ";")
    return "\n".join(out)


def localize(pg, db, text=None):
    """Pins de gatilho NUNCA são substituídos (corpos reais); só as impressões digitais das linhas sintéticas."""
    m = MAINT0 if text is None else text
    for p in PINS:
        rel, tg = p["table_name"], p["tgname"]
        got = pg.sql(f"SELECT md5(pg_get_triggerdef(t.oid))||'|'||md5(pg_get_functiondef(t.tgfoid))||'|'||t.tgtype FROM pg_trigger t WHERE t.tgrelid='public.{rel}'::regclass AND t.tgname='{tg}';", db)
        if got and got != f"{p['trigger_md5']}|{p['function_md5']}|{p['tgtype']}": SUBST[(rel, tg)] = got
    for r in MAN:
        fp = pg.sql(f"SELECT md5(to_jsonb(x)::text) FROM public.{r['table_name']} x WHERE x.id='{r['id']}';", db)
        m = m.replace(f"'{r['id']}','{r['fingerprint']}'", f"'{r['id']}','{fp}'")
    return m


def ext_digest(pg, db):
    """Impressão digital, calculada pelo TESTE, de todas as linhas de todas as tabelas public fora do manifesto (tabela,id)."""
    tabs = pg.sql("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1;", db).split()
    parts = []
    for t in tabs:
        if t.startswith("__"): continue
        ids = [m["id"] for m in MAN if m["table_name"] == t]
        cond = ("WHERE coalesce(to_jsonb(x)->>'id','') NOT IN (" + ",".join(f"'{i}'" for i in ids) + ")") if ids else ""
        parts.append(t + ":" + pg.sql(f"SELECT md5(coalesce(string_agg(md5(to_jsonb(x)::text), ',' ORDER BY md5(to_jsonb(x)::text)),'')) FROM public.{t} x {cond};", db))
    return hashlib.md5("|".join(parts).encode()).hexdigest()


def counts(pg, db):
    return pg.sql(f"""SELECT (SELECT count(*) FROM public.ordens_servico WHERE id='{OS_}')+(SELECT count(*) FROM public.programacao_producao WHERE id='{PP}')
      +(SELECT count(*) FROM public.lotes WHERE id='{LT}')+(SELECT count(*) FROM public.envase WHERE id='{EV}')+(SELECT count(*) FROM public.estoque_produto WHERE id='{EP}')
      +(SELECT count(*) FROM public.entregas WHERE id='{EN}')+(SELECT count(*) FROM public.entrega_comprovantes WHERE id='{PR}')
      +(SELECT count(*) FROM public.controle_qualidade WHERE id='{CQ}')+(SELECT count(*) FROM public.estoque_movimentacoes WHERE id IN ('{MV1}','{MV2}'))
      +(SELECT count(*) FROM public.entrega_checklist WHERE entrega_id='{EN}');""", db).splitlines()[0]


def to_reg(pg, db):
    if pg.sql("SELECT to_regclass('platform_private.chain_purge_maintenance_ledger') IS NULL;", db).startswith("t"): return "0"
    return pg.sql("SELECT count(*) FROM platform_private.chain_purge_maintenance_ledger;", db).splitlines()[0]


def disabled(pg, db):
    return pg.sql("SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND t.tgenabled<>'O';", db).splitlines()[0]


def main():
    pg = PG(); n = [0]
    try:
        pg.sql("CREATE DATABASE tpl;")
        pg.sql(SCHEMA + DATA, "tpl")
        pg.sql(triggers(), "tpl")
        tg = pg.sql("SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal;", "tpl")
        check("CP-0", "83 gatilhos instalados verbatim da captura 02/11 (23 de DELETE; zero stubs)", "83", tg)
        global MAINT
        MAINT = localize(pg, "tpl")
        check("CP-0b", "pins LIVE (tgtype+definição+corpo) dos 83 gatilhos reproduzidos sem substituição", "0", str(len(SUBST)))
        check("CP-0c", "nenhuma função de gatilho é stub", "0", pg.sql("SELECT count(*) FROM pg_proc WHERE prosrc LIKE '%UNEXPECTED_TRIGGER_FIRED%';", "tpl"))

        def fresh(setup=""):
            n[0] += 1; db = f"t{n[0]}"
            pg.sql(f"CREATE DATABASE {db} TEMPLATE tpl;")
            if setup: pg.sql(setup, db)
            return db

        db = fresh()
        for cid, stmt, needle in [
            ("CP-1", f"DELETE FROM public.estoque_movimentacoes WHERE id='{MV2}';", "append-only"),
            ("CP-2", f"DELETE FROM public.envase WHERE id='{EV}';", "ENVASE_IMUTAVEL"),
            ("CP-3", f"DELETE FROM public.entregas WHERE id='{EN}';", "DELIVERY_MUTATION_CLOSED"),
            ("CP-4", f"DELETE FROM public.controle_qualidade WHERE id='{CQ}';", "CQ_MANUAL_REQUIRES_REVIEWED_RPC"),
            ("CP-5", f"DELETE FROM public.estoque_produto WHERE id='{EP}';", "ESTQ_TENANT_FORBIDDEN"),
            ("CP-6", f"DELETE FROM public.lotes WHERE id='{LT}';", "MANUAL_LOT_DELETE_FORBIDDEN")]:
            check(cid, f"baseline: DELETE comum bloqueado pela proteção real ({needle})", True, needle in pg.sql(stmt, db, ok=False))
        check("CP-7", "baseline: DELETE comum não removeu nada", "19", counts(pg, db))

        # ordem de locks: singleton do gate travado por outra sessão => manutenção espera lock_timeout ANTES de qualquer tabela/DDL
        db = fresh(); d0 = ext_digest(pg, db)
        hold = subprocess.Popen(pg.cmd(db), stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True)
        hold.stdin.write("BEGIN; SELECT 1 FROM cf_user_guards_v1.state FOR UPDATE; SELECT pg_sleep(30);\n"); hold.stdin.flush()
        for _ in range(50):
            if pg.sql("SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid=l.relation WHERE c.relname='state' AND l.mode='RowShareLock' AND l.granted;", db).startswith("1"): break
            time.sleep(0.1)
        r = pg.sql(MAINT, db, ok=False); hold.kill()
        LOG.write("CP-8 raw: " + r[:2000] + "\n")
        check("CP-8", "singleton do gate ocupado: aborta por lock_timeout no passo B (antes de tabelas/ledger)", True,
              "lock timeout" in r and "maint:" not in r and to_reg(pg, db) == "0")
        check("CP-9", "rollback integral: 19 linhas presentes", "19", counts(pg, db))
        check("CP-10", "rollback integral: nenhum gatilho desabilitado", "0", disabled(pg, db))
        check("CP-11", "rollback integral: linhas fora do escopo idênticas", d0, ext_digest(pg, db))

        # falha intermediária real (após excluir checklist/comprovante/entrega): REFRESH real da esteira falha
        db = fresh("DROP MATERIALIZED VIEW public.mv_esteira_laboratorio; CREATE MATERIALIZED VIEW public.mv_esteira_laboratorio AS "
                   f"SELECT 1/(CASE WHEN EXISTS(SELECT 1 FROM public.lotes WHERE id='{LT}') AND NOT EXISTS(SELECT 1 FROM public.entregas WHERE id='{EN}') THEN 0 ELSE 1 END) AS n;")
        d0 = ext_digest(pg, db)
        r = pg.sql(localize(pg, db), db, ok=False); LOG.write("CP-8b raw: " + r[:2000] + "\n")
        check("CP-8b", "falha intermediária real (refresh_esteira após DELETE de entregas) aborta", True, "division by zero" in r and "refresh_esteira_laboratorio" in r)
        check("CP-9b", "rollback após falha intermediária: 19 linhas, 0 gatilhos desabilitados, fora do escopo idêntico, sem ledger",
              "19|0|True|0", f"{counts(pg, db)}|{disabled(pg, db)}|{d0 == ext_digest(pg, db)}|{to_reg(pg, db)}")

        # manutenção segurando o singleton e esperando tabela => DML de estoque concorrente falha rápido (NOWAIT do gate real), sem deadlock
        db = fresh()
        holdA = subprocess.Popen(pg.cmd(db), stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True)
        holdA.stdin.write("BEGIN; LOCK TABLE public.entrega_termos IN ACCESS SHARE MODE; SELECT pg_sleep(30);\n"); holdA.stdin.flush()
        time.sleep(0.5)
        mp = subprocess.Popen(pg.cmd(db), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        mp.stdin.write(localize(pg, db)); mp.stdin.close()
        for _ in range(80):
            if pg.sql("SELECT count(*) FROM pg_locks l JOIN pg_class c ON c.oid=l.relation WHERE c.relname='entrega_termos' AND NOT l.granted;", db).startswith("1"): break
            time.sleep(0.05)
        rc = pg.sql("UPDATE public.programacao_producao SET organization_id=organization_id WHERE id='00000000-0000-0000-0000-0000000000a2';", db, ok=False)
        holdA.kill(); out_m = mp.communicate(timeout=60)[1]
        LOG.write("CP-8c raw: " + rc[:800] + " || " + out_m[:800] + "\n")
        check("CP-8c", "ordem gate→tabelas: DML concorrente recebe NOWAIT do gate real (sem deadlock); manutenção aborta por lock_timeout",
              True, "could not obtain lock" in rc and "deadlock" not in (rc + out_m) and "lock timeout" in out_m and counts(pg, db) == "19")

        # sucesso
        db = fresh(); d0 = ext_digest(pg, db)
        r = pg.sql(MAINT, db, ok=False); LOG.write("CP-12 raw: " + r[:3000] + "\n")
        check("CP-12", "manutenção conclui", True, not r.startswith("ERR"))
        check("CP-12b", "sucesso: todas as linhas fora do manifesto (todas as tabelas public) idênticas", d0, ext_digest(pg, db))
        check("CP-12c", "sucesso: auxiliares removidos; ledger sem anon/authenticated/service_role", "0|false|false|false",
              pg.sql("SELECT (SELECT count(*) FROM pg_proc WHERE proname LIKE '%maint_rows_digest%' OR proname LIKE '%maint_meta_digest%')||'|'||has_table_privilege('anon','platform_private.chain_purge_maintenance_ledger','SELECT')"
                     "||'|'||has_table_privilege('authenticated','platform_private.chain_purge_maintenance_ledger','SELECT')||'|'||has_table_privilege('service_role','platform_private.chain_purge_maintenance_ledger','SELECT');", db))
        check("CP-13", "19 linhas do escopo removidas", "0", counts(pg, db))
        check("CP-14", "todos os gatilhos reabilitados após COMMIT", "0", disabled(pg, db))
        check("CP-15", "dados fora do escopo intactos (OS/programação/lote AR Bio)", "3",
              pg.sql("SELECT (SELECT count(*) FROM public.ordens_servico)+(SELECT count(*) FROM public.programacao_producao)+(SELECT count(*) FROM public.lotes);", db))
        check("CP-16", "registro: pre + committed com snapshot das 19 linhas", "2|9|true",
              pg.sql("SELECT count(*)||'|'||(SELECT jsonb_array_length(detail->'rows'->'checklist') FROM platform_private.chain_purge_maintenance_ledger WHERE step='pre')"
                     "||'|'||bool_or(step='committed') FROM platform_private.chain_purge_maintenance_ledger;", db))
        check("CP-17", "proteção reativa: DELETE comum em lote AR Bio continua bloqueado", True,
              "MANUAL_LOT_DELETE_FORBIDDEN" in pg.sql("DELETE FROM public.lotes WHERE id='00000000-0000-0000-0000-0000000000a3';", db, ok=False))
        pg.sql("SET session_replication_role=replica; INSERT INTO public.estoque_movimentacoes(id,lote_id) VALUES ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a3');", db)
        check("CP-18", "proteção reativa: movimentação nova continua append-only", True,
              "append-only" in pg.sql("DELETE FROM public.estoque_movimentacoes WHERE id='00000000-0000-0000-0000-0000000000b1';", db, ok=False))
        # repetição
        d1 = ext_digest(pg, db)
        r = pg.sql(MAINT, db, ok=False)
        check("CP-19b", "repetição: linhas fora do escopo idênticas", d1, ext_digest(pg, db))
        check("CP-19", "repetição: no-op sem nova exclusão", True, "already_purged_noop" in r)
        check("CP-20", "repetição: dados fora do escopo e movimentação nova preservados", "4",
              pg.sql("SELECT (SELECT count(*) FROM public.ordens_servico)+(SELECT count(*) FROM public.programacao_producao)+(SELECT count(*) FROM public.lotes)+(SELECT count(*) FROM public.estoque_movimentacoes);", db))

        # negativos (cada um em banco limpo); todos devem abortar e deixar 19 linhas e 0 gatilhos desabilitados
        A3 = "00000000-0000-0000-0000-0000000000a3"
        neg = [
            ("CP-21", "registro extra fora do escopo: 10º checklist", f"INSERT INTO public.entrega_checklist(entrega_id) VALUES ('{EN}');", "scope_count_mismatch"),
            ("CP-22", "movimentação extra no lote", f"INSERT INTO public.estoque_movimentacoes(id,lote_id) VALUES (gen_random_uuid(),'{LT}');", "movement_set"),
            ("CP-23", "movimentação externa com origem na cadeia (RESTRICT)", f"INSERT INTO public.estoque_movimentacoes(id,lote_id,movimentacao_origem_id) VALUES (gen_random_uuid(),'{A3}','{MV1}');", "external_dependency:estoque_movimentacoes.movimentacao_origem_id"),
            ("CP-24", "embalagem no lote", f"INSERT INTO public.estoque_embalagens(lote_id) VALUES ('{LT}');", "external_dependency:estoque_embalagens.lote_id"),
            ("CP-25", "termo apontando o comprovante", f"INSERT INTO public.entrega_termos(comprovante_id) VALUES ('{PR}');", "external_dependency:entrega_termos.comprovante_id"),
            ("CP-26", "item fiscal da entrega", f"INSERT INTO public.fiscal_invoice_items(entrega_id) VALUES ('{EN}');", "external_dependency:fiscal_invoice_items.entrega_id"),
            ("CP-27", "segunda CQ no lote", f"INSERT INTO public.controle_qualidade(id,lote_id) VALUES (gen_random_uuid(),'{LT}');", "quality_set"),
            ("CP-28", "lote com empresa (nunca atribuir a AR Bio/FSF)", f"UPDATE public.lotes SET organization_id='007bb519-cba0-4704-be2c-cb93ad010048' WHERE id='{LT}';", "lote_link"),
            ("CP-29", "comprovante congelado (1ª barreira: impressão digital)", f"UPDATE public.entrega_comprovantes SET metadata='{{\"comprovante_snapshot_v1\":{{}}}}' WHERE id='{PR}';", "row_fingerprint_drift:entrega_comprovantes"),
            ("CP-30", "comprovante com arquivo (1ª barreira: impressão digital)", f"UPDATE public.entrega_comprovantes SET arquivo_path='x.pdf' WHERE id='{PR}';", "row_fingerprint_drift:entrega_comprovantes"),
            ("CP-31", "callback não auditado novo", "CREATE FUNCTION public.x() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$; CREATE TRIGGER zz_x BEFORE DELETE ON public.lotes FOR EACH ROW EXECUTE FUNCTION public.x();", "trigger_set_drift"),
            ("CP-32", "definição de gatilho suspenso divergente (mesmo tgtype, WHEN novo)", "DROP TRIGGER trg_envase_material_imutavel ON public.envase; CREATE TRIGGER trg_envase_material_imutavel BEFORE DELETE OR UPDATE ON public.envase FOR EACH ROW WHEN (OLD.id IS NOT NULL) EXECUTE FUNCTION public.fn_envase_material_imutavel();", "trigger_definition_drift:envase.trg_envase_material_imutavel"),
            ("CP-32b", "eventos do gatilho suspenso alterados (só DELETE): tgtype divergente", "DROP TRIGGER trg_envase_material_imutavel ON public.envase; CREATE TRIGGER trg_envase_material_imutavel BEFORE DELETE ON public.envase FOR EACH ROW EXECUTE FUNCTION public.fn_envase_material_imutavel();", "trigger_type_drift:envase.trg_envase_material_imutavel"),
            ("CP-33", "gatilho já desabilitado antes", "ALTER TABLE public.envase DISABLE TRIGGER trg_refresh_esteira_envase;", "trigger_not_enabled_before"),
            ("CP-34", "regra DELETE na tabela", "CREATE RULE r_x AS ON DELETE TO public.envase DO ALSO NOTHING;", "rule_present"),
            ("CP-35", "entrega com recebível", f"UPDATE public.entregas SET receivable_id=gen_random_uuid() WHERE id='{EN}';", "entrega_state"),
        ]
        for cid, scen, setup, needle in neg:
            # setup como owner, contornando gatilhos SOMENTE no banco de teste para fabricar o desvio
            db = fresh("SET session_replication_role=replica;\n" + setup)
            r = pg.sql(MAINT, db, ok=False)
            ok = needle in r and counts(pg, db) == ("20" if cid == "CP-21" else "19") and (disabled(pg, db) == ("1" if cid == "CP-33" else "0"))
            check(cid, f"{scen}: aborta ({needle}), 19 linhas e gatilhos preservados", True, ok)
        for cid, setup in [("CP-29b", f"UPDATE public.entrega_comprovantes SET metadata='{{\"comprovante_snapshot_v1\":{{}}}}' WHERE id='{PR}';"),
                           ("CP-30b", f"UPDATE public.entrega_comprovantes SET arquivo_path='x.pdf' WHERE id='{PR}';")]:
            db = fresh("SET session_replication_role=replica;\n" + setup)
            r = pg.sql(localize(pg, db), db, ok=False)   # pins re-capturados após a alteração: 2ª barreira (estado do comprovante)
            check(cid, "comprovante congelado/com arquivo mesmo com pins atualizados: proof_state aborta", True, "proof_state" in r and counts(pg, db) == "19")
        db = fresh("SET session_replication_role=replica; UPDATE public.entrega_checklist SET item='alterado' WHERE id='" + CK_IDS[0] + "';")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-39", "linha do manifesto alterada após captura: impressão digital aborta", True, "row_fingerprint_drift:entrega_checklist" in r and counts(pg, db) == "19")
        db = fresh("CREATE OR REPLACE FUNCTION public.fn_ledger_append_only() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$ BEGIN RETURN OLD; END $f$;")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-40", "função de proteção enfraquecida (corpo divergente): pin md5 aborta", True, "trigger_function_drift:estoque_movimentacoes.trg_estoque_mov_append_only" in r)
        db = fresh()
        r = pg.sql("BEGIN; ALTER TABLE public.entregas DISABLE TRIGGER zz_delivery_mutation_closed; ALTER TABLE public.entrega_comprovantes DISABLE TRIGGER USER;"
                   f" DELETE FROM public.entrega_comprovantes WHERE id='{PR}';"
                   f" SELECT 'comprovante_id_after='||coalesce(comprovante_id::text,'NULL') FROM public.entregas WHERE id='{EN}'; ROLLBACK;", db, ok=False)
        LOG.write("CP-41 raw: " + r[:2000] + "\n")
        check("CP-41", "RED da ordem v2.4 com corpos reais: excluir comprovante isolado aplica SET NULL (UPDATE em entregas)", True,
              "comprovante_id_after=NULL" in r)
        db = fresh()
        r = pg.sql("SET session_replication_role=replica;\n" + MAINT, db, ok=False)
        check("CP-36", "session_replication_role != origin: aborta", True, "replication_role_not_origin" in r and counts(pg, db) == "19")
        db = fresh()
        r = pg.sql("SET ROLE authenticated;\n" + MAINT, db, ok=False)
        check("CP-37", "papel de API não executa (allowlist)", True, "role_not_allowlisted" in r and counts(pg, db) == "19")
        # ===== achados da revisão independente 02/11 =====
        db = fresh()
        r = pg.sql(localize(pg, db, MAINT_OLD), db, ok=False)
        check("CP-50", "RED: candidato 8c6ea7f (82 pins) aborta trigger_set_drift:unexpected na realidade de 83 gatilhos", True, "trigger_set_drift:unexpected" in r)
        coll = f"SET session_replication_role=replica; INSERT INTO public.estoque_embalagens(id,lote_id) VALUES ('{MV1}','{LT}');"
        collt = f"SET session_replication_role=replica; INSERT INTO public.entrega_termos(id,comprovante_id) VALUES ('{MV1}','{PR}');"
        db = fresh(coll + " DROP TRIGGER trg_entrega_termos_immutability ON public.entrega_termos;")
        r = pg.sql(localize(pg, db, MAINT_OLD), db, ok=False); LOG.write("CP-51 raw: " + r[:1500] + "\n")
        check("CP-51", "RED: 8c6ea7f não acusa a linha colidente na varredura (só a FK RESTRICT do DELETE a detém depois)", True,
              "external_dependency" not in r and "estoque_embalagens_lote_id_fkey" in r)
        db = fresh(collt + " DROP TRIGGER trg_entrega_termos_immutability ON public.entrega_termos;")
        r = pg.sql(localize(pg, db, MAINT_OLD), db, ok=False); LOG.write("CP-51b raw: " + r[:1500] + "\n")
        check("CP-51b", "RED: 8c6ea7f com colisão em FK SET NULL conclui e MUTA linha externa (termo perde comprovante_id)", "ok|0|NULL",
              ("ok" if not r.startswith("ERR") else r[:160]) + "|" + counts(pg, db) + "|" +
              pg.sql(f"SELECT coalesce(comprovante_id::text,'NULL') FROM public.entrega_termos WHERE id='{MV1}';", db))
        db = fresh(collt); d0 = ext_digest(pg, db)
        r = pg.sql(MAINT, db, ok=False)
        check("CP-52c", "GREEN: mesma colisão em FK SET NULL detectada por par e nada muda", "True|19|True",
              f"{'external_dependency:entrega_termos.comprovante_id=1' in r}|{counts(pg, db)}|{d0 == ext_digest(pg, db)}")
        db = fresh(coll); d0 = ext_digest(pg, db)
        r = pg.sql(MAINT, db, ok=False)
        check("CP-52", "GREEN: colisão UUID entre tabelas detectada por par (tabela,id)", True, "external_dependency:estoque_embalagens.lote_id=1" in r)
        check("CP-52b", "colisão: rollback integral e fora do escopo idêntico", "19|True", f"{counts(pg, db)}|{d0 == ext_digest(pg, db)}")
        db = fresh(f"SET session_replication_role=replica; INSERT INTO public.entrega_checklist(id,entrega_id,item) VALUES ('{MV2}','{EN}','x');")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-53", "colisão inversa: checklist com UUID de movimentação do manifesto não vira interno", True, "scope_count_mismatch" in r or "checklist_set" in r)
        db = fresh("ALTER TABLE public.lotes ADD CONSTRAINT lotes_id_org_uq UNIQUE (id, organization_id);"
                   "CREATE TABLE public.x_comp(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), a uuid, b uuid, FOREIGN KEY (a,b) REFERENCES public.lotes(id, organization_id));")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-54", "FK composta para tabela do escopo: rejeitada explicitamente", True, "composite_fk_unsupported:x_comp" in r and counts(pg, db) == "19")
        db = fresh("ALTER TABLE public.lotes ADD CONSTRAINT lotes_prog_uq UNIQUE (programacao_id);"
                   "CREATE TABLE public.x_nonid(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), p uuid REFERENCES public.lotes(programacao_id));")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-55", "FK com alvo diferente de id: rejeitada explicitamente", True, "fk_target_not_id_unsupported:x_nonid" in r and counts(pg, db) == "19")
        db = fresh("CREATE TABLE platform_private.chain_purge_maintenance_ledger(id bigserial PRIMARY KEY, purge_key text NOT NULL, step text NOT NULL, detail jsonb NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp());"
                   "GRANT SELECT, INSERT ON platform_private.chain_purge_maintenance_ledger TO service_role, authenticated, PUBLIC;"
                   "CREATE ROLE ops_reader NOLOGIN; GRANT SELECT ON platform_private.chain_purge_maintenance_ledger TO ops_reader;"
                   "GRANT USAGE ON SEQUENCE platform_private.chain_purge_maintenance_ledger_id_seq TO service_role;")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-56", "ledger pré-existente com grants (service_role/authenticated/PUBLIC/papel extra): revogados, só o dono", "OK|0|0",
              ("OK" if not r.startswith("ERR") else r[:200]) + "|" + pg.sql("SELECT count(*) FROM pg_class c, aclexplode(c.relacl) a WHERE c.relname IN ('chain_purge_maintenance_ledger','chain_purge_maintenance_ledger_id_seq') AND a.grantee<>c.relowner;", db)
              + "|" + counts(pg, db))
        db = fresh("ALTER DEFAULT PRIVILEGES IN SCHEMA platform_private GRANT ALL ON TABLES TO service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA platform_private GRANT ALL ON SEQUENCES TO anon;")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-57", "default ACL que concederia service_role/anon: neutralizada e registrada no ledger", "false|false|true",
              pg.sql("SELECT has_table_privilege('service_role','platform_private.chain_purge_maintenance_ledger','SELECT')||'|'||has_sequence_privilege('anon','platform_private.chain_purge_maintenance_ledger_id_seq','USAGE')"
                     "||'|'||(SELECT jsonb_array_length(detail->'default_acl')>0 FROM platform_private.chain_purge_maintenance_ledger WHERE step='pre');", db))
        db = fresh("CREATE ROLE ledger_owner_x NOLOGIN; CREATE TABLE platform_private.chain_purge_maintenance_ledger(id bigserial PRIMARY KEY, purge_key text NOT NULL, step text NOT NULL, detail jsonb NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp());"
                   "ALTER TABLE platform_private.chain_purge_maintenance_ledger OWNER TO ledger_owner_x;")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-58", "ledger com dono fora da allowlist: aborta", True, "ledger_owner_not_allowlisted" in r and counts(pg, db) == "19")
        db = fresh("CREATE ROLE other_admin SUPERUSER NOLOGIN;")
        r = pg.sql("SET ROLE other_admin;\n" + MAINT, db, ok=False)
        check("CP-59", "superusuário fora da allowlist (current_user): aborta antes de DDL", True, "role_not_allowlisted" in r and to_reg(pg, db) == "0")
        db = fresh()
        r = pg.sql("SET request.jwt.claims = '{\"sub\":\"c95f9261-0000-0000-0000-000000000000\",\"role\":\"authenticated\"}';\n" + MAINT, db, ok=False)
        check("CP-60", "contexto JWT presente: aborta", True, "jwt_context_present" in r and counts(pg, db) == "19")
        db = fresh("CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT 'c95f9261-0000-0000-0000-000000000000'::uuid $$;")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-61", "auth.uid() não nulo: aborta", True, "auth_uid_not_null" in r and counts(pg, db) == "19")
        db = fresh("CREATE FUNCTION public.evt_x() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;"
                   "CREATE EVENT TRIGGER evt_unknown ON ddl_command_end EXECUTE FUNCTION public.evt_x();")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-62", "event trigger habilitado não pinado: aborta antes de qualquer DDL", True, "event_trigger_unreviewed:evt_unknown" in r and to_reg(pg, db) == "0")
        pg.sql("DROP EVENT TRIGGER IF EXISTS evt_unknown;", db)
        db = fresh("CREATE FUNCTION public.evt_y() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;"
                   "CREATE EVENT TRIGGER evt_disabled ON ddl_command_end EXECUTE FUNCTION public.evt_y(); ALTER EVENT TRIGGER evt_disabled DISABLE;")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-63", "event trigger desabilitado não bloqueia e manutenção conclui", "0", counts(pg, db) if not r.startswith("ERR") else r[:200])
        pg.sql("DROP EVENT TRIGGER IF EXISTS evt_disabled;", db)
        # ---- event triggers REAIS capturados (02/11): corpos LIVE verbatim, mesmos nomes/eventos/tags ----
        EVT = json.loads((ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/captura-event-triggers-20261102/event-triggers-20261102.json").read_text())
        def evt_sql(mut=None):
            out = ["CREATE SCHEMA IF NOT EXISTS extensions;"]
            for e in EVT:
                e = dict(e); body = e["definition"]
                if mut: e, body = mut(e, body)
                fn = body.split("FUNCTION ", 1)[1].split("(", 1)[0]
                tags = "" if e["evttags"] is None else " WHEN TAG IN (" + ",".join("'" + t + "'" for t in e["evttags"]) + ")"
                out.append(body + ";")
                out.append(f"CREATE EVENT TRIGGER {e['evtname']} ON {e['evtevent']}{tags} EXECUTE FUNCTION {fn}();")
                if e["evtenabled"] == "A": out.append(f"ALTER EVENT TRIGGER {e['evtname']} ENABLE ALWAYS;")
            return "\n".join(out)
        def drop_evt(db):
            pg.sql(";".join(f"DROP EVENT TRIGGER IF EXISTS {e['evtname']}" for e in EVT) + ";", db)
        db = fresh(evt_sql())
        n_evt = pg.sql("SELECT count(*) FROM pg_event_trigger WHERE evtenabled<>'D';", db)
        r = pg.sql(MAINT, db, ok=False)
        check("CP-E1", "6 event triggers reais (corpos LIVE) instalados: manutenção conclui e remove as 19 linhas", "6/0", f"{n_evt}/" + (counts(pg, db) if not r.startswith("ERR") else r[:200]))
        drop_evt(db)
        for cid, desc, mut, extra in [
            ("CP-E2", "evttags divergentes (pgrst_ddl_watch limitado a CREATE TABLE) abortam",
             lambda e, b: ({**e, "evttags": ["CREATE TABLE"]} if e["evtname"] == "pgrst_ddl_watch" else e, b), ""),
            ("CP-E3", "tags de extensão ampliadas (issue_pg_net_access + ALTER TABLE) abortam",
             lambda e, b: ({**e, "evttags": ["ALTER TABLE", "CREATE EXTENSION"]} if e["evtname"] == "issue_pg_net_access" else e, b), ""),
            ("CP-E4", "corpo divergente (pgrst_drop_watch com comentário) aborta",
             lambda e, b: (e, b.replace("BEGIN", "BEGIN -- drift", 1) if e["evtname"] == "pgrst_drop_watch" else b), ""),
            ("CP-E5", "evtenabled divergente (ENABLE ALWAYS) aborta", lambda e, b: (e, b), "ALTER EVENT TRIGGER pgrst_ddl_watch ENABLE ALWAYS;"),
            ("CP-E6", "evtenabled REPLICA divergente aborta", lambda e, b: (e, b), "ALTER EVENT TRIGGER issue_pg_cron_access ENABLE REPLICA;")]:
            db = fresh(evt_sql(mut) + extra)
            r = pg.sql(MAINT, db, ok=False)
            check(cid, desc + " antes de qualquer DDL, nada removido", True, "event_trigger_unreviewed" in r and to_reg(pg, db) == "0" and counts(pg, db) == "19")
            drop_evt(db)
        db = fresh(evt_sql() + "ALTER EVENT TRIGGER pgrst_drop_watch DISABLE;")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-E7", "pinado desabilitado não dispara nem bloqueia; nenhum gatilho é desativado pela manutenção", "0/O",
              (counts(pg, db) if not r.startswith("ERR") else r[:200]) + "/" + pg.sql("SELECT evtenabled FROM pg_event_trigger WHERE evtname='pgrst_ddl_watch';", db))
        drop_evt(db)
        FQ = ("SELECT md5(string_agg(oid::regprocedure::text||md5(pg_get_functiondef(oid))||coalesce(proacl::text,''), ',' ORDER BY oid::regprocedure::text)) FROM pg_proc "
              "WHERE pronamespace IN ('public'::regnamespace,'platform_private'::regnamespace,'auth'::regnamespace) AND prokind='f';")
        db = fresh(); dd = pg.sql(FQ, db)
        pg.sql(MAINT, db, ok=False)
        check("CP-64", "corpos/ACL de funções idênticos após COMMIT (prova externa ao script)", dd, pg.sql(FQ, db))
        db = fresh("SET session_replication_role=replica; INSERT INTO public.estoque_movimentacoes(id,lote_id) VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a3');")
        d0 = ext_digest(pg, db); r = pg.sql(MAINT, db, ok=False)
        check("CP-65", "linha fora do escopo nas tabelas do descarte (movimentação AR Bio) intacta após sucesso", d0, ext_digest(pg, db))
        db = fresh(f"SET session_replication_role=replica; INSERT INTO public.entrega_termos(id) VALUES ('{EN}');")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-66", "termo sem vínculo com id igual ao da entrega (colisão sem FK) permanece; manutenção conclui", "0|1",
              f"{counts(pg, db)}|" + pg.sql(f"SELECT count(*) FROM public.entrega_termos WHERE id='{EN}';", db))
        db = fresh(f"SET session_replication_role=replica; INSERT INTO public.entrega_termos(entrega_id) VALUES ('{EN}');")
        r = pg.sql(MAINT, db, ok=False)
        check("CP-67", "termo vinculado à entrega (gatilho real 83º): dependência externa aborta", True, "external_dependency:entrega_termos.entrega_id" in r and counts(pg, db) == "19")
        code = "\n".join(l.split("--")[0] for l in MAINT.splitlines())
        bad = code.count("DISABLE TRIGGER ALL") + code.count("DISABLE TRIGGER USER") + MAINT.count("session_replication_role =") + code.upper().count("CASCADE") + code.count("set_config(")
        check("CP-38", "estático: sem DISABLE TRIGGER ALL, replication_role, CASCADE ou GUC", 0, bad)
    finally:
        pg.stop()
        summ = {"PASS": sum(c["status"] == "PASS" for c in checks), "FAIL": sum(c["status"] == "FAIL" for c in checks)}
        (OUT / "results.json").write_text(json.dumps({"summary": summ, "checks": checks}, ensure_ascii=False, indent=1))
        print(json.dumps(summ))


main()
