#!/usr/bin/env python3
"""Pacote de ALINHAMENTO EXCLUSIVO HOMOLOG (vrlcdwmlytukrjezrrnf) — preparação; NUNCA aplicar daqui.

Entrada: comparativo READ ONLY homolog × produção (anexo 02/11, sha256 pinado) + capturas READ ONLY de produção já
materializadas (corpos de função com md5, 1339 colunas, constraints, FKs, índices, 232 policies, 255 gatilhos, grants).
Saída (*.sql.review, gerados — nunca editar à mão):
  00-homolog-pre.sql.review           READ ONLY: impressão digital homolog, estado exato das 459 assinaturas/45 colunas,
                                      dependências, drift de constraints/índices; aborta fora do estado capturado.
  01-homolog-align.sql.review         uma transação: tabelas/colunas/nulabilidade, 225 corpos de produção (md5 conferido; faixa SMTP fechada),
                                      constraints/índices/policies/gatilhos/grants capturados, ACL nega-por-padrão, POST.
  02-homolog-catalog-gate.sql.review  READ ONLY: libera a variante de instalação limpa do catálogo (00/01 do pacote do
                                      catálogo, byte-idênticos e pinados) somente após o 01 deste pacote; 02-chain-purge
                                      de produção NÃO se aplica à homologação.
  03-homolog-readiness-probe.sql.review READ ONLY: estado das contas/empresas para a etapa JWT (sem escrita).
  09-homolog-align-rollback-deny.sql.review  rollback só restritivo (revoga EXECUTE das funções criadas).
"""
import collections, hashlib, json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
EV = ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101"
INPUT = ROOT / "docs/auditorias/evidencias/homolog-alinhamento-20261102/homolog-alinhamento-input-20261102.json"
INPUT_SHA = "799da8a507f085fd947d5f8eca09f3df9462097cde3fb6b44289eab5c0f35761"
CAT_PKG = ROOT / "scripts/tenant-exclusive-catalog-20261101"

HOMOLOG_REF, PROD_REF = "vrlcdwmlytukrjezrrnf", "swzpzcwiasxmjutrmvkm"
ARB_H, FSF_H = "c809e74f-486b-44b2-b2f4-4088f53421bb", "dcf50a75-579a-4828-a0fc-1d8eadcb4b8a"
# trava homolog obrigatória (preservada; nunca recriada nem alterada por este pacote)
HOMOLOG_TRAVA = "a00_homolog_validation_no_receivable"


def sha(p): return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


assert sha(INPUT) == INPUT_SHA, "comparativo homolog divergente do anexo pinado"
D = json.loads(INPUT.read_text())
assert D["production_ref"] == PROD_REF and D["homolog_ref"] == HOMOLOG_REF
PROD_ORGS = [o["id"] for o in json.loads((EV / "live-readonly-20261101/orgs.json").read_text())["orgs"]]


def norm(schema, sig):
    return sig if schema == "public" or sig.startswith(schema + ".") else schema + "." + sig


def fq(sig):
    return sig if "." in sig.split("(")[0] else "public." + sig


# ---- corpos de produção (md5 conferido) ----
BODY = {}
for f in (json.loads((EV / "captura-helpers-20261102/helpers-fechamento-20261102.json").read_text())["functions"]
          + json.loads((EV / "captura-agregadoras-20261102/fechamento-agregadoras-20261102.json").read_text())["functions"]):
    BODY[norm(f["schema_name"], f["signature"])] = f["definition"]
for f in json.loads((EV / "live-input-20261101-1516/catalogo-exclusivo-input.json").read_text())["functions"]:
    BODY.setdefault(norm(f["schema"], f["signature"]), f["definition"])
EXTRA25 = {e["signature"] for e in json.loads((EV / "live-input-20261101-1516/extra-global-25.json").read_text())}

FN = D["functions"]
STATE = {}
for f in FN:
    st = "equal" if f["actual_md5"] == f["expected_md5"] else ("absent" if not f["actual_md5"] else "divergent")
    STATE[f["signature"]] = (st, f["expected_md5"], f["actual_md5"])
CNT = collections.Counter(v[0] for v in STATE.values())
assert CNT == {"equal": 204, "absent": 192, "divergent": 63}, CNT
for s, (st, exp, _) in STATE.items():
    if s in BODY: assert hashlib.md5(BODY[s].encode()).hexdigest() == exp, s
NO_BODY = sorted(s for s, v in STATE.items() if v[0] != "equal" and s not in BODY)
assert set(NO_BODY) == EXTRA25 and all(STATE[s][0] == "absent" for s in NO_BODY), "sem corpo fora das 25 globais ausentes"
# Faixa SMTP por empresa: a relação-tipo platform_private.tenant_smtp_dispatch_jobs é criada FECHADA a partir da
# definição capturada (schema-helpers-extras-20261102: 18 colunas, 9 constraints, RLS ligada, 0 policies); as 5
# funções entram com o corpo de produção (md5) e ACL só do owner — NUNCA o gatilho que enfileira (sem ativação),
# nenhum worker, nenhum grant de dispatch/tabela.
SMTP_LANE_FNS = sorted([
    "platform_private.tenant_smtp_lane_enqueue_solicitacao()",
    "platform_private.tenant_smtp_lane_log(platform_private.tenant_smtp_dispatch_jobs,text,text,uuid)",
    "platform_private.tenant_smtp_lane_ready(uuid)",
    "platform_private.tenant_smtp_lane_recipient(uuid,uuid)",
    "platform_private.tenant_smtp_lane_source_reason(uuid,uuid,uuid,uuid)"])
SMTP_LANE_TRIGGERS = {("portal_solicitacoes", "tenant_smtp_lane_solicitacao_atribuida")}
SMTP_TYPE = "platform_private.tenant_smtp_dispatch_jobs"
assert all(STATE[x][0] == "absent" for x in SMTP_LANE_FNS)
_X = json.loads((EV / "captura-extras-20261102/schema-helpers-extras-20261102.json").read_text())
SMTP_COLS = sorted([c for c in _X["columns"] if c["schema_name"] == "platform_private" and c["table_name"] == "tenant_smtp_dispatch_jobs"], key=lambda c: c["position"])
SMTP_CONS = [c for c in _X["constraints"] if c["schema_name"] == "platform_private" and c["table_name"] == "tenant_smtp_dispatch_jobs"]
SMTP_REL = [r for r in _X["relations"] if r["nspname"] == "platform_private" and r["relname"] == "tenant_smtp_dispatch_jobs"]

# Dependência REAL descoberta no 1º 10 hospedado (03/11): platform_actor_access_ready lê platform_org_admin_invites.access_*.
# 6 colunas nullable sem default, idênticas em produção e homolog (captura extras). Auditor aplicou na homolog como
# align_homolog_invite_access_columns; 06 é o registro revisável/idempotente desse delta (não reaplicar onde já existe).
INVITE_TABLE = "platform_org_admin_invites"
INVITE_ACCESS_COLS = [(c["column_name"], c["type_sql"]) for c in sorted(_X["columns"], key=lambda c: c["position"])
                      if c["schema_name"] == "public" and c["table_name"] == INVITE_TABLE and c["column_name"].startswith("access_")]
assert INVITE_ACCESS_COLS == [("access_operation_id", "uuid"), ("access_operation_kind", "text"), ("access_operation_status", "text"),
                              ("access_requested_at", "timestamp with time zone"), ("access_expires_at", "timestamp with time zone"),
                              ("access_valid_after", "timestamp with time zone")], INVITE_ACCESS_COLS
assert all(not c["not_null"] and c["default_expression"] is None for c in _X["columns"] if c["table_name"] == INVITE_TABLE and c["column_name"].startswith("access_"))
ID_RH, ID_T4, ID_ARBAD, ID_PARTNER_FSF = ("86a2b787-83e8-4274-934c-adc8440339cc", "321e643b-e5c7-4b08-bf2d-be3aaaade53e",
                                          "c95f9261-a3bb-48f2-80e6-bb653e4b916f", "e770d10e-5efc-46e3-9b03-fdd6b982a6f1")
assert (len(SMTP_COLS), len(SMTP_CONS), len(SMTP_REL)) == (18, 9, 1) and SMTP_REL[0]["relrowsecurity"]
assert not [p for p in _X["policies"] if "tenant_smtp_dispatch_jobs" in json.dumps(p)]
SMTP_FK_REFS = sorted({re.search(r"REFERENCES (\w+)\(", c["definition"]).group(1) for c in SMTP_CONS if c["type"] == "f"})   # public.*
# faixa SMTP por empresa: fechada por AUSÊNCIA (AGENTS) — corpos capturados nunca instalados, mesmo com a relação fechada presente
INSTALL = sorted(s for s, v in STATE.items() if v[0] != "equal" and s in BODY and s not in SMTP_LANE_FNS)   # 225
CREATE_NEW = [s for s in INSTALL if STATE[s][0] == "absent"]                                  # 167
REPLACE = [s for s in INSTALL if STATE[s][0] == "divergent"]                                  # 63
assert (len(INSTALL), len(CREATE_NEW), len(REPLACE)) == (225, 162, 63)

# ACL efetiva REAL de produção das 459 (owner/definer/md5/grantee/privilégio/grant option), casada por schema+nome+md5
ACL_FILE = ROOT / "docs/auditorias/evidencias/homolog-alinhamento-20261102/funcoes-acl-producao-20261102.json"
assert hashlib.sha256(ACL_FILE.read_bytes()).hexdigest() == "c49f11f825fa6cb3791354477554d6f8f97c5c9e57df90dfc2d3708dfb1853c7"
_A = collections.defaultdict(list)
for _f in json.loads(ACL_FILE.read_text()): _A[(_f["schema"], _f["name"], _f["md5"])].append(_f)
PROD_ACL = {}
for _s, (_st, _exp, _act) in STATE.items():
    _sch, _nm = fq(_s).split("(")[0].split(".")
    _c = _A[(_sch, _nm, _exp)]; assert len(_c) == 1, _s
    PROD_ACL[_s] = _c[0]
assert len(PROD_ACL) == 459


def prod_exec(s):
    """papéis com EXECUTE em produção; PUBLIC quando ACL nula (default) ou entrada '=X'."""
    f = PROD_ACL[s]
    if f["acl"] is None: return {"PUBLIC", f["owner"]}
    return {("PUBLIC" if g["grantee"] in ("PUBLIC", "") else g["grantee"]) for g in f["grants"] if g["privilege"] == "EXECUTE"}


CLOSED_B2B_PANELS = ["public.rpc_b2b_carteira_kpis(date,date)", "public.rpc_b2b_executive_dashboard()", "public.rpc_b2b_revenue_forecast(uuid)"]
assert all(STATE[x.replace("public.", "")][0] == "equal" for x in CLOSED_B2B_PANELS)
CRON_EXPECTED_INACTIVE = 7   # pré-voo real 02/11: cron.job com 7 jobs, TODOS active=false; nunca reativar/excluir


def header(defn):
    """(args, result) exatamente como pg_get_function_arguments/pg_get_function_result do corpo de produção."""
    i = defn.index("(", defn.index("FUNCTION ")); depth = 0
    for j in range(i, len(defn)):
        depth += {"(": 1, ")": -1}.get(defn[j], 0)
        if depth == 0: break
    args = defn[i + 1:j]
    m = re.match(r"\s*RETURNS (.*)\n", defn[j + 1:])
    return args, m.group(1)


BUILTIN_T = {"uuid", "text", "jsonb", "json", "integer", "bigint", "smallint", "numeric", "boolean", "date", "real",
             "timestamp with time zone", "timestamp without time zone", "double precision", "interval", "bytea",
             "text[]", "uuid[]", "integer[]", "jsonb[]", "character varying", "time without time zone"}


def arg_types(sig):
    inner = sig[sig.index("(") + 1:-1]
    return [t.strip() for t in inner.split(",") if t.strip()] if inner else []


DEP_TYPES = sorted({t for s in CREATE_NEW for t in arg_types(s) if t not in BUILTIN_T and t != SMTP_TYPE})   # SMTP_TYPE criada aqui

# ---- esquema real das 59 tabelas ----
CONSOL = json.loads((EV / "consolidado-20261101-1534/consolidado-catalogo-20261101.json").read_text())["files"]["catalogo-schema-input.json"]
CONS = json.loads((EV / "captura-constraints-enums-20261102/schema-constraints-enums-20261102.json").read_text())
FKS = [l.split("\t") for l in (EV / "live-readonly-20261101/fks.tsv").read_text().splitlines() if l.strip()]
TABLES = sorted({c["table_name"] for c in CONSOL["columns"]})
assert len(TABLES) == 59 and len(CONSOL["columns"]) == 1339
COLS = {(c["table_name"], c["column_name"]): c for c in CONSOL["columns"]}
DIFFS = D["columns"]["diffs"]
MISSING = [(x["table_name"], x["column_name"]) for x in DIFFS if x["kind"] == "missing"]
CHANGED = [(x["table_name"], x["column_name"], x["expected"]["is_nullable"], x["actual"]["is_nullable"]) for x in DIFFS if x["kind"] == "changed"]
assert len(MISSING) == 42 and len(CHANGED) == 3
for t, c in MISSING: assert COLS[(t, c)] == next(x["expected"] for x in DIFFS if (x["table_name"], x["column_name"]) == (t, c))
NEW_TABLES = sorted(t for t in TABLES if all((t, c["column_name"]) in MISSING for c in CONSOL["columns"] if c["table_name"] == t))
assert NEW_TABLES == ["catalog_tenant_visibility", "produto_composicao_conjuntos", "produto_composicao_declaracoes"], NEW_TABLES
ADD_COLS = [(t, c) for t, c in MISSING if t not in NEW_TABLES]


def coltype(c):
    if c["data_type"] == "USER-DEFINED": return "public." + c["udt_name"]
    if c["data_type"] == "ARRAY":
        return {"_text": "text[]", "_uuid": "uuid[]", "_int4": "integer[]", "_numeric": "numeric[]"}[c["udt_name"]]
    return c["data_type"]


def coldef(c):
    s = f'"{c["column_name"]}" {coltype(c)}'
    if c["column_default"]: s += f" DEFAULT {c['column_default']}"
    if c["is_nullable"] == "NO": s += " NOT NULL"
    return s


for t, c in ADD_COLS:   # NOT NULL sem default em tabela existente exigiria tabela vazia: nenhum caso na captura
    assert COLS[(t, c)]["is_nullable"] == "YES" or COLS[(t, c)]["column_default"], (t, c)

CONSTRAINTS = [(x["table_name"], x["conname"], x["definition"]) for x in CONS["constraints"] if x["table_name"] in TABLES]
FKS59 = sorted({(f[0], f[2], f[3]) for f in FKS if f[0] in TABLES})
INDEXES = sorted({(p["data"]["tablename"], p["data"]["indexname"], p["data"]["indexdef"]) for p in CONSOL["policies_and_indexes"]
                  if p["kind"] == "index" and p["data"]["tablename"] in TABLES})
CON_NAMES = {n for _, n, _ in CONSTRAINTS} | {n for _, n, _ in FKS59}
INDEXES_FREE = [i for i in INDEXES if i[1] not in CON_NAMES]       # índices não sustentados por constraint
POLICIES = [p["data"] for p in CONSOL["policies_and_indexes"] if p["kind"] == "policy"]
TRIGGERS_ALL = [(t["table_name"], t["tgname"], t["definition"]) for t in CONSOL["triggers"]]
assert len(TRIGGERS_ALL) == 255 and all(any((t, n) == (a, b) for a, b, _ in TRIGGERS_ALL) for t, n in SMTP_LANE_TRIGGERS)
TRIGGERS = [x for x in TRIGGERS_ALL if (x[0], x[1]) not in SMTP_LANE_TRIGGERS]
GRANTS = [(g["table_name"], g["grantee"], sorted(g["privileges"].strip("{}").split(","))) for g in CONSOL["grants"]]
POLICY_TABLES = sorted({p["tablename"] for p in POLICIES})
DESTRUCTIVE = ("TRUNCATE", "TRIGGER", "REFERENCES")
CLIENT_ROLES = ("PUBLIC", "anon", "authenticated")
CONFIRMED_TRUNCATE_OPEN = ["microorganism_fiscal_profiles", "partner_order_items", "partner_orders", "product_fiscal_profiles", "produto_conformidade_perfis"]
assert set(CONFIRMED_TRUNCATE_OPEN) <= set(TABLES)
assert (len(POLICIES), len(TRIGGERS), len(GRANTS)) == (232, 254, 164)


def lit(x): return "NULL" if x is None else "'" + str(x).replace("'", "''") + "'"


def vals(rows): return ",\n  ".join("(" + ",".join(lit(v) for v in r) + ")" for r in rows)


def arr(xs): return "ARRAY[" + ",".join(lit(x) for x in xs) + "]::text[]"


def policy_sql(p):
    roles = ", ".join(p["roles"])
    s = f'CREATE POLICY "{p["policyname"]}" ON public.{p["tablename"]} AS {p["permissive"]} FOR {p["cmd"]} TO {roles}'
    if p["qual"]: s += f" USING ({p['qual']})"
    if p["with_check"]: s += f" WITH CHECK ({p['with_check']})"
    return s + ";"


def roles_arr(p): return "ARRAY[" + ",".join(lit(r) for r in sorted(p["roles"])) + "]::name[]"


# ---- ACL derivada (ACL de produção não capturada): nega por padrão; authenticated só no necessário ----
SRC_RPCS = set()
for p in (ROOT / "src").rglob("*.ts*"):
    SRC_RPCS |= set(re.findall(r"\.rpc\(\s*['\"]([a-z_0-9]+)['\"]", p.read_text(errors="ignore")))
POL_TXT = "\n".join((p["qual"] or "") + " " + (p["with_check"] or "") for p in POLICIES)
XCAP = json.loads((EV / "captura-extras-20261102/schema-helpers-extras-20261102.json").read_text())
POL_TXT += "\n" + "\n".join(json.dumps(p) for p in XCAP.get("policies", []))
NAME = {s: fq(s).split("(")[0] for s in STATE}            # schema.nome
SHORT = {s: NAME[s].split(".")[1] for s in STATE}


def referenced(txt, sch_short):
    sch, short = sch_short
    if sch == "public":
        return re.search(r"(?<![\w.])(public\.)?" + re.escape(short) + r"\s*\(", txt) is not None
    return re.search(re.escape(sch) + r"\." + re.escape(short) + r"\s*\(", txt) is not None


def is_trigger_fn(s): return s in BODY and header(BODY[s])[1] == "trigger"


def is_definer(s): return s in BODY and "SECURITY DEFINER" in BODY[s].split("AS $", 1)[0]


SEED = {s for s in INSTALL if not is_trigger_fn(s) and (
    (NAME[s].startswith("public.") and SHORT[s] in SRC_RPCS) or referenced(POL_TXT, NAME[s].split(".")))}
GRANT_AUTH = set(SEED)
frontier = [s for s in SEED if not is_definer(s)]           # INVOKER chama helpers com o privilégio do chamador
while frontier:
    s = frontier.pop(); body = BODY[s]
    for o in INSTALL:
        if o in GRANT_AUTH or is_trigger_fn(o): continue
        if referenced(body, NAME[o].split(".")):
            GRANT_AUTH.add(o)
            if not is_definer(o): frontier.append(o)
GRANT_AUTH = sorted(GRANT_AUTH)

LEDGER = "platform_private.homolog_alignment_ledger"


def fingerprint_sql():
    prod = ",".join(lit(o) for o in PROD_ORGS)
    return f"""
  -- 1. impressão digital: SOMENTE a homologação (empresas homolog presentes, nenhuma empresa de produção)
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = {lit(ARB_H)}) OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = {lit(FSF_H)}) THEN
    v_fail := v_fail || 'not_homolog:homolog_orgs_absent'::text; END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id IN ({prod})) THEN v_fail := v_fail || 'not_homolog:production_org_present'::text; END IF;
  IF current_setting('server_version_num')::int < 170000 THEN v_fail := v_fail || 'pg_version_below_17'::text; END IF;
  -- trava homolog preservada (exatamente 1 gatilho habilitado)
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = {lit(HOMOLOG_TRAVA)} AND NOT tgisinternal AND tgenabled <> 'D') <> 1 THEN
    v_fail := v_fail || 'homolog_trava_missing_or_disabled'::text; END IF;
  -- automações e fiscal desligados
  IF to_regclass('cron.job') IS NOT NULL THEN
    -- estado pinado: exatamente {CRON_EXPECTED_INACTIVE} jobs, todos inativos (nunca reativados/excluídos); hash fixado na TX
    EXECUTE 'SELECT count(*) FROM cron.job' INTO v_n; IF v_n <> {CRON_EXPECTED_INACTIVE} THEN v_fail := v_fail || ('cron_jobs_count_drift:'||v_n); END IF;
    EXECUTE 'SELECT count(*) FROM cron.job WHERE active IS DISTINCT FROM false' INTO v_n; IF v_n <> 0 THEN v_fail := v_fail || ('cron_jobs_active:'||v_n); END IF;
    EXECUTE $c$SELECT md5(coalesce(string_agg(concat_ws('|',jobid,jobname,schedule,command,database,username,active),E'\n' ORDER BY jobid),'')) FROM cron.job$c$ INTO v_cron;
    PERFORM set_config('homolog_align.cron_md5', v_cron, true);
  ELSE v_fail := v_fail || 'cron_schema_absent_unexpected'::text; END IF;
  IF to_regclass('public.company_fiscal_settings') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.company_fiscal_settings WHERE nfe_enabled OR nfse_enabled OR production_enabled' INTO v_n;
    IF v_n <> 0 THEN v_fail := v_fail || 'fiscal_enabled'::text; END IF; END IF;"""


def pre_body(pins_override=None):
    """pins_override: SOMENTE o harness descartável substitui o md5 'actual' das 63 divergentes (corpo homolog não capturado)."""
    rows = []
    for s in sorted(STATE):
        st, exp, act = STATE[s]
        if pins_override and s in pins_override: act = pins_override[s]
        rows.append((fq(s), st, exp if st == "equal" else act))
    incompatible = [(fq(s),) + header(BODY[s]) for s in REPLACE]
    miss = [(t, c) for t, c in MISSING]
    chg = [(t, c, a) for t, c, e, a in CHANGED]
    return f"""
DECLARE v_fail text[] := ARRAY[]::text[]; r record; v_n bigint; v_cron text;
BEGIN{fingerprint_sql()}
  -- 1b. ACL cliente ENDURECIDA EXATA (04 aplicado em homolog e produção, 02/11): zero TRUNCATE/TRIGGER/REFERENCES de
  --     PUBLIC/anon/authenticated nas {len(TABLES)} tabelas do escopo. Estado pré-04 (capturado) aborta; nunca regrant.
  FOR r IN SELECT t, rl, pv FROM unnest({arr(TABLES)}) t, unnest(ARRAY['public','anon','authenticated']) rl, unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES']) pv
           WHERE to_regclass('public.'||t) IS NOT NULL AND has_table_privilege(rl, 'public.'||t, pv) LOOP
    v_fail := v_fail || ('client_destructive_acl_not_hardened:'||r.t||':'||r.rl||':'||r.pv);
  END LOOP;
  -- 2. não aplicado antes / sem instalação parcial
  IF to_regclass('{LEDGER}') IS NOT NULL THEN v_fail := v_fail || 'already_aligned_or_partial:ledger_present'::text; END IF;
  -- 3. as 459 assinaturas exatamente no estado capturado (204 iguais, 63 divergentes com md5 homolog, 192 ausentes)
  FOR r IN SELECT * FROM (VALUES
  {vals(rows)}) m(sig, st, h) LOOP
    IF r.st = 'absent' THEN
      IF to_regprocedure(r.sig) IS NOT NULL THEN v_fail := v_fail || ('fn_unexpected_present:'||r.sig); END IF;
    ELSIF to_regprocedure(r.sig) IS NULL THEN v_fail := v_fail || ('fn_missing:'||r.sig);
    ELSIF md5(pg_get_functiondef(to_regprocedure(r.sig))) <> r.h THEN v_fail := v_fail || ('fn_drift_'||r.st||':'||r.sig); END IF;
  END LOOP;
  -- 4. tipos de argumento das funções a criar resolvem (relações/enum já existentes)
  FOR r IN SELECT unnest({arr(DEP_TYPES)}) t LOOP
    IF to_regtype(r.t) IS NULL THEN v_fail := v_fail || ('dep_type_missing:'||r.t); END IF;
  END LOOP;
  -- 4b. relação-tipo SMTP: ausente na homolog (será criada fechada) e alvos de FK presentes
  IF to_regclass('{SMTP_TYPE}') IS NOT NULL THEN v_fail := v_fail || 'smtp_relation_unexpected_present'::text; END IF;
  FOR r IN SELECT unnest({arr(SMTP_FK_REFS)}) t LOOP
    IF to_regclass('public.'||r.t) IS NULL THEN v_fail := v_fail || ('smtp_fk_target_missing:'||r.t); END IF; END LOOP;
  -- 5. 42 colunas ausentes (3 tabelas inteiras) e 3 nulabilidades no estado capturado
  FOR r IN SELECT * FROM (VALUES {vals(miss)}) m(t, c) LOOP
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('public.'||r.t) AND attname = r.c AND NOT attisdropped) THEN
      v_fail := v_fail || ('column_unexpected_present:'||r.t||'.'||r.c); END IF;
  END LOOP;
  FOR r IN SELECT unnest({arr(NEW_TABLES)}) t LOOP
    IF to_regclass('public.'||r.t) IS NOT NULL THEN v_fail := v_fail || ('table_unexpected_present:'||r.t); END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES {vals(chg)}) m(t, c, n) LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=r.t AND column_name=r.c AND is_nullable=r.n) THEN
      v_fail := v_fail || ('nullability_drift:'||r.t||'.'||r.c); END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM public.envase WHERE volume_por_unidade IS NULL OR quantidade IS NULL;
  IF v_n <> 0 THEN v_fail := v_fail || ('envase_null_rows_block_not_null:'||v_n); END IF;
  -- 6. constraints/índices capturados: mesmo nome com definição diferente = drift (não se adivinha)
  FOR r IN SELECT * FROM (VALUES {vals(CONSTRAINTS + FKS59)}) m(t, n, d) LOOP
    IF to_regclass('public.'||r.t) IS NOT NULL AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = ('public.'||r.t)::regclass AND conname = r.n
         AND pg_get_constraintdef(oid) <> r.d) THEN v_fail := v_fail || ('constraint_drift:'||r.t||'.'||r.n); END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES {vals(INDEXES_FREE)}) m(t, n, d) LOOP
    IF to_regclass('public.'||r.n) IS NOT NULL AND pg_get_indexdef(to_regclass('public.'||r.n)) <> r.d THEN v_fail := v_fail || ('index_drift:'||r.n); END IF;
  END LOOP;
  -- 7. funções divergentes com cabeçalho incompatível exigiriam DROP: não suportado sem revisão (aborta e lista)
  FOR r IN SELECT * FROM (VALUES {vals(incompatible)}) m(sig, a, res) LOOP
    IF to_regprocedure(r.sig) IS NOT NULL AND (pg_get_function_arguments(to_regprocedure(r.sig)) <> r.a
        OR pg_get_function_result(to_regprocedure(r.sig)) <> r.res) THEN v_fail := v_fail || ('fn_header_incompatible:'||r.sig); END IF;
  END LOOP;
  IF cardinality(v_fail) > 0 THEN RAISE EXCEPTION 'homolog_alignment_pre_failed' USING DETAIL = array_to_string(v_fail, ' | '); END IF;
END"""


def pre_sql(pins_override=None):
    return ("-- 00 PRE HOMOLOG — alinhamento EXCLUSIVO vrlcdwmlytukrjezrrnf. READ ONLY. NÃO executar em produção.\n"
            "BEGIN TRANSACTION READ ONLY;\nSET LOCAL search_path = public, pg_catalog;\nDO $pre$" + pre_body(pins_override) + " $pre$;\nCOMMIT;\n")


SNAP = """CREATE TEMP TABLE {n} ON COMMIT DROP AS SELECT
  (SELECT md5(coalesce(string_agg(to_jsonb(o)::text, '|' ORDER BY o.id), '')) FROM public.organizations o) AS orgs,
  (SELECT md5(coalesce(string_agg(u.id::text||':'||coalesce(u.email,'')||':'||coalesce(u.encrypted_password,''), '|' ORDER BY u.id), '')) FROM auth.users u) AS auth_users,
  (SELECT md5(coalesce(string_agg((to_jsonb(p) - {prod_added})::text, '|' ORDER BY p.id), '')) FROM public.produtos p) AS produtos,
  (SELECT count(*) FROM public.profiles) AS profiles,
  (SELECT count(*) FROM public.user_roles) AS user_roles;"""


def align_sql(pins_override=None, inject_fail=False):
    s = []; w = s.append
    w("-- 01 ALINHAMENTO HOMOLOG — EXCLUSIVO vrlcdwmlytukrjezrrnf. NO_GO até revisão; o proprietário aplica. Uma transação.")
    w("-- Sem reset de public/auth, sem DROP genérico, sem tocar dados de usuários/empresas; workers/SMTP/fiscal seguem desligados.")
    w("BEGIN;")
    w("SET LOCAL lock_timeout = '10s';\nSET LOCAL statement_timeout = '15min';\nSET LOCAL search_path = public, pg_catalog;")
    w("DO $pre$" + pre_body(pins_override) + " $pre$;")
    w(SNAP.format(n="hal_pre", prod_added=arr([c for t, c in ADD_COLS if t == "produtos"])))
    w(f"""CREATE TABLE {LEDGER}(id bigserial PRIMARY KEY, step text NOT NULL, detail jsonb NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp());
REVOKE ALL ON {LEDGER} FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE {LEDGER}_id_seq FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO {LEDGER}(step, detail) VALUES ('start', jsonb_build_object('input_sha256', {lit(INPUT_SHA)}, 'homolog_ref', {lit(HOMOLOG_REF)},
  'acl_before', (SELECT jsonb_object_agg(oid::regprocedure::text, coalesce(proacl::text,'(default)')) FROM pg_proc
                  WHERE oid = ANY(ARRAY[{",".join("to_regprocedure(" + lit(fq(x)) + ")" for x in REPLACE)}]::oid[]))));""")
    # 1. tabelas novas (colunas reais) e colunas ausentes
    w(f"CREATE TABLE {SMTP_TYPE} (\n  " + ",\n  ".join(f'"{c['column_name']}" {c['type_sql']}' + (f" DEFAULT {c['default_expression']}" if c['default_expression'] else "") + (" NOT NULL" if c['not_null'] else "") for c in SMTP_COLS) + "\n);")
    for c in sorted(SMTP_CONS, key=lambda c: "pufcx".index(c["type"]) if c["type"] in "pufcx" else 9):
        d = re.sub(r"REFERENCES (\w+)\(", r"REFERENCES public.\1(", c["definition"])
        w(f'ALTER TABLE {SMTP_TYPE} ADD CONSTRAINT "{c['name']}" {d};')
    w(f"ALTER TABLE {SMTP_TYPE} ENABLE ROW LEVEL SECURITY;\nREVOKE ALL ON {SMTP_TYPE} FROM PUBLIC, anon, authenticated, service_role;")
    for t in NEW_TABLES:
        cols = [c for c in CONSOL["columns"] if c["table_name"] == t]
        w(f"CREATE TABLE public.{t} (\n  " + ",\n  ".join(coldef(c) for c in cols) + "\n);")
        w(f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;")
    for t, c in ADD_COLS:
        w(f"ALTER TABLE public.{t} ADD COLUMN {coldef(COLS[(t, c)])};")
    for t, c, e, a in CHANGED:
        w(f"ALTER TABLE public.{t} ALTER COLUMN {c} {'SET' if e == 'NO' else 'DROP'} NOT NULL;")
    w(f"INSERT INTO {LEDGER}(step, detail) VALUES ('columns', jsonb_build_object('tables_created', {arr(NEW_TABLES)}, 'columns_added', {len(ADD_COLS)}, 'nullability', {len(CHANGED)}));")
    # 2. constraints (c/p/u/x da captura + FKs reais) e índices ausentes, por nome
    w(f"""DO $con$ DECLARE r record; v_c int := 0; v_i int := 0; BEGIN
  FOR r IN SELECT * FROM (VALUES {vals([(t, n, d, 0) for t, n, d in CONSTRAINTS] + [(t, n, d, 1) for t, n, d in FKS59])}) m(t, n, d, ord) ORDER BY ord LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = ('public.'||r.t)::regclass AND conname = r.n) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', r.t, r.n, r.d); v_c := v_c + 1; END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES {vals(INDEXES_FREE)}) m(t, n, d) LOOP
    IF to_regclass('public.'||r.n) IS NULL THEN EXECUTE r.d; v_i := v_i + 1; END IF;
  END LOOP;
  INSERT INTO {LEDGER}(step, detail) VALUES ('constraints_indexes', jsonb_build_object('constraints_created', v_c, 'indexes_created', v_i));
END $con$;""")
    # 3. corpos de produção: 63 substituídos (cabeçalho compatível provado no PRE) + 167 criados
    w("SET LOCAL check_function_bodies = off;")
    for x in INSTALL:
        w(BODY[x].rstrip() + ";")
    w("RESET check_function_bodies;")
    if inject_fail: w("DO $x$ BEGIN RAISE EXCEPTION 'homolog_alignment_injected_failure'; END $x$;")
    pins = vals([(fq(x), STATE[x][1]) for x in INSTALL])
    w(f"""DO $md5$ DECLARE r record; v_bad text[] := ARRAY[]::text[]; BEGIN
  FOR r IN SELECT * FROM (VALUES {pins}) m(sig, h) LOOP
    IF to_regprocedure(r.sig) IS NULL OR md5(pg_get_functiondef(to_regprocedure(r.sig))) <> r.h THEN v_bad := v_bad || r.sig; END IF;
  END LOOP;
  IF cardinality(v_bad) > 0 THEN RAISE EXCEPTION 'homolog_alignment_fn_md5_mismatch' USING DETAIL = array_to_string(v_bad, ' | '); END IF;
  INSERT INTO {LEDGER}(step, detail) VALUES ('functions', jsonb_build_object('replaced', {len(REPLACE)}, 'created', {len(CREATE_NEW)}, 'md5_verified', {len(INSTALL)},
    'closed_by_absence', {arr(NO_BODY)}));
END $md5$;""")
    # 4. ACL nega-por-padrão
    w(f"""DO $acl$ DECLARE r record; v_pub boolean; BEGIN
  FOR r IN SELECT unnest({arr([fq(x) for x in CREATE_NEW])}) sig LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', r.sig);
  END LOOP;
  FOR r IN SELECT unnest({arr([fq(x) for x in REPLACE])}) sig LOOP   -- existentes: só estreita; PUBLIC vira authenticated explícito
    SELECT has_function_privilege('public', to_regprocedure(r.sig), 'EXECUTE') INTO v_pub;
    IF v_pub THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig); END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
  -- authenticated: allowlist (frontend/policy/INVOKER) ∩ ACL REAL de produção; novas recebem, existentes só se já tinham
  FOR r IN SELECT * FROM (VALUES {vals([(fq(x), STATE[x][0] == "absent") for x in GRANT_AUTH if "authenticated" in prod_exec(x) or "PUBLIC" in prod_exec(x)])}) m(sig, is_new) LOOP
    IF r.is_new THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig); END IF;
  END LOOP;
  -- existentes fora da allowlist ou sem authenticated em produção: estreita
  FOR r IN SELECT unnest({arr([fq(x) for x in REPLACE if x not in GRANT_AUTH or not ("authenticated" in prod_exec(x) or "PUBLIC" in prod_exec(x))])}) sig LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
  -- service_role: só nas novas em que produção concede explicitamente; nunca na faixa SMTP
  FOR r IN SELECT unnest({arr([fq(x) for x in CREATE_NEW if "service_role" in prod_exec(x) and x not in SMTP_LANE_FNS])}) sig LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
  -- 3 painéis B2B sem tenant: continuam fechados (só estreita)
  FOR r IN SELECT unnest({arr(CLOSED_B2B_PANELS)}) sig LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
  INSERT INTO {LEDGER}(step, detail) VALUES ('function_acl', jsonb_build_object('granted_authenticated', {len(GRANT_AUTH)}, 'derived_from',
    'allowlist frontend/policy/INVOKER ∩ ACL real de produção (funcoes-acl-producao-20261102); sem PUBLIC/anon; sem grant option', 'acl_sha256', {lit(hashlib.sha256(ACL_FILE.read_bytes()).hexdigest())}));
END $acl$;""")
    # 5. policies: ausentes criadas; mesmo nome divergente substituída; PERMISSIVE fora da captura removida; RESTRICTIVE mantida
    prow = vals([(p["tablename"], p["policyname"], p["cmd"], p["permissive"], ",".join(sorted(p["roles"])), p["qual"], p["with_check"]) for p in POLICIES])
    creates = "\n".join(f"    WHEN {lit(p['tablename'] + '|' + p['policyname'])} THEN EXECUTE {lit(policy_sql(p))};" for p in POLICIES)
    w(f"""CREATE TEMP TABLE hal_pol ON COMMIT DROP AS SELECT * FROM (VALUES {prow}) m(t, n, cmd, perm, roles, q, wc);
DO $pol$ DECLARE r record; v jsonb := '[]'; BEGIN
  FOR r IN SELECT c.*, p.policyname IS NOT NULL AS present,
                  (p.policyname IS NOT NULL AND (p.cmd <> c.cmd OR p.permissive <> c.perm OR array_to_string(ARRAY(SELECT unnest(p.roles) ORDER BY 1), ',') <> c.roles
                    OR p.qual IS DISTINCT FROM c.q OR p.with_check IS DISTINCT FROM c.wc)) AS drift,
                  to_jsonb(p) AS old
             FROM hal_pol c LEFT JOIN pg_policies p ON p.schemaname='public' AND p.tablename=c.t AND p.policyname=c.n LOOP
    IF r.present AND NOT r.drift THEN CONTINUE; END IF;
    IF r.drift THEN EXECUTE format('DROP POLICY %I ON public.%I', r.n, r.t); v := v || jsonb_build_object('replaced', r.old); END IF;
    CASE r.t||'|'||r.n
{creates}
    END CASE;
    IF NOT r.present THEN v := v || jsonb_build_object('created', r.t||'.'||r.n); END IF;
  END LOOP;
  FOR r IN SELECT p.*, to_jsonb(p) AS old FROM pg_policies p WHERE p.schemaname='public' AND p.tablename = ANY({arr(TABLES)})
            AND NOT EXISTS (SELECT 1 FROM hal_pol c WHERE c.t=p.tablename AND c.n=p.policyname) LOOP
    IF r.permissive = 'PERMISSIVE' THEN EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename); v := v || jsonb_build_object('dropped_uncaptured_permissive', r.old);
    ELSE v := v || jsonb_build_object('kept_uncaptured_restrictive', r.old); END IF;
  END LOOP;
  INSERT INTO {LEDGER}(step, detail) VALUES ('policies', v);
END $pol$;""")
    for t in POLICY_TABLES: w(f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;")
    # 6. gatilhos capturados: ausente criado; mesmo nome divergente substituído; fora da captura mantido e registrado
    trows = vals([(t, n, d) for t, n, d in TRIGGERS])
    w(f"""DO $trg$ DECLARE r record; v jsonb := '[]'; BEGIN
  FOR r IN SELECT m.*, g.oid AS goid, pg_get_triggerdef(g.oid) AS cur FROM (VALUES {trows}) m(t, n, d)
             LEFT JOIN pg_trigger g ON g.tgrelid = ('public.'||m.t)::regclass AND g.tgname = m.n AND NOT g.tgisinternal LOOP
    IF r.goid IS NOT NULL AND r.cur = r.d THEN CONTINUE; END IF;
    IF r.goid IS NOT NULL THEN EXECUTE format('DROP TRIGGER %I ON public.%I', r.n, r.t); v := v || jsonb_build_object('replaced', r.cur); END IF;
    EXECUTE r.d; v := v || jsonb_build_object('created', r.t||'.'||r.n);
  END LOOP;
  FOR r IN SELECT tgrelid::regclass::text rel, tgname, pg_get_triggerdef(oid) d FROM pg_trigger WHERE NOT tgisinternal
            AND tgrelid = ANY(ARRAY(SELECT to_regclass('public.'||x) FROM unnest({arr(TABLES)}) x))
            AND NOT EXISTS (SELECT 1 FROM (VALUES {vals([(t, n) for t, n, _ in TRIGGERS])}) m(t, n) WHERE ('public.'||m.t)::regclass = tgrelid AND m.n = tgname) LOOP
    v := v || jsonb_build_object('kept_uncaptured', r.rel||'.'||r.tgname, 'def', r.d);
  END LOOP;
  INSERT INTO {LEDGER}(step, detail) VALUES ('triggers', v);
END $trg$;""")
    # 7. grants das 59 tabelas = captura exata para anon/authenticated/service_role
    by = collections.defaultdict(dict)
    for t, g, pr in GRANTS: by[t][g] = pr
    # captura NÃO é prova de segurança: TRUNCATE/TRIGGER/REFERENCES nunca vão a anon/authenticated
    # (RLS não protege TRUNCATE). CRUD capturado (SELECT/INSERT/UPDATE/DELETE) preservado; service_role = captura.
    gl, stripped = [], []
    for t in TABLES:
        gl.append(f"REVOKE ALL ON public.{t} FROM PUBLIC, anon, authenticated, service_role;")
        for g, pr in sorted(by[t].items()):
            if g in CLIENT_ROLES:
                stripped += [f"{t}:{g}:{x}" for x in pr if x in DESTRUCTIVE]
                pr = [x for x in pr if x not in DESTRUCTIVE]
            if pr: gl.append(f"GRANT {', '.join(pr)} ON public.{t} TO {g};")
    gl.append(f"INSERT INTO {LEDGER}(step, detail) VALUES ('table_acl_client_destructive_stripped', jsonb_build_object('count', {len(stripped)}, 'items', {lit(json.dumps(stripped))}::jsonb));")
    w("\n".join(gl))
    # 8. POST
    w(post_sql())
    w(SNAP.format(n="hal_post", prod_added=arr([c for t, c in ADD_COLS if t == "produtos"])))
    w(f"""DO $inv$ DECLARE a record; b record; BEGIN
  SELECT * INTO a FROM hal_pre; SELECT * INTO b FROM hal_post;
  IF a IS DISTINCT FROM b THEN RAISE EXCEPTION 'post:out_of_scope_data_changed' USING DETAIL = to_jsonb(a)::text||' -> '||to_jsonb(b)::text; END IF;
  INSERT INTO {LEDGER}(step, detail) VALUES ('done', jsonb_build_object('invariants', to_jsonb(b)));
END $inv$;""")
    w("COMMIT;")
    return "\n".join(s) + "\n"


def post_sql():
    pol = vals([(p["tablename"], p["policyname"]) for p in POLICIES])
    return f"""DO $post$ DECLARE v_fail text[] := ARRAY[]::text[]; r record; v_n bigint; v_cron text; BEGIN
  FOR r IN SELECT * FROM (VALUES {vals([(fq(s), STATE[s][1]) for s in sorted(STATE) if s not in NO_BODY and s not in SMTP_LANE_FNS])}) m(sig, h) LOOP
    IF to_regprocedure(r.sig) IS NULL OR md5(pg_get_functiondef(to_regprocedure(r.sig))) <> r.h THEN v_fail := v_fail || ('post_fn:'||r.sig); END IF;
  END LOOP;
  FOR r IN SELECT unnest({arr([fq(s) for s in NO_BODY])}) sig LOOP
    IF to_regprocedure(r.sig) IS NOT NULL THEN v_fail := v_fail || ('post_global_reappeared:'||r.sig); END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM information_schema.columns c JOIN (VALUES {vals([(c['table_name'], c['column_name'], c['is_nullable']) for c in CONSOL['columns']])}) m(t, col, n)
    ON c.table_schema='public' AND c.table_name=m.t AND c.column_name=m.col AND c.is_nullable=m.n;
  IF v_n <> 1339 THEN v_fail := v_fail || ('post_columns:'||v_n); END IF;
  SELECT count(*) INTO v_n FROM (VALUES {pol}) m(t, n) JOIN pg_policies p ON p.schemaname='public' AND p.tablename=m.t AND p.policyname=m.n;
  IF v_n <> {len(POLICIES)} THEN v_fail := v_fail || ('post_policies:'||v_n); END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename = ANY({arr(TABLES)}) AND permissive='PERMISSIVE'
             AND NOT EXISTS (SELECT 1 FROM (VALUES {pol}) m(t, n) WHERE m.t=tablename AND m.n=policyname)) THEN v_fail := v_fail || 'post_uncaptured_permissive'::text; END IF;
  SELECT count(*) INTO v_n FROM (VALUES {vals([(t, n, d) for t, n, d in TRIGGERS])}) m(t, n, d) JOIN pg_trigger g
    ON g.tgrelid=('public.'||m.t)::regclass AND g.tgname=m.n AND pg_get_triggerdef(g.oid)=m.d;
  IF v_n <> {len(TRIGGERS)} THEN v_fail := v_fail || ('post_triggers:'||v_n); END IF;
  SELECT count(*) INTO v_n FROM unnest({arr(POLICY_TABLES)}) t JOIN pg_class c ON c.oid=('public.'||t)::regclass AND c.relrowsecurity;
  IF v_n <> {len(POLICY_TABLES)} THEN v_fail := v_fail || ('post_rls:'||v_n); END IF;
  FOR r IN SELECT unnest({arr([fq(x) for x in INSTALL])}) sig LOOP
    IF has_function_privilege('anon', to_regprocedure(r.sig), 'EXECUTE') THEN v_fail := v_fail || ('post_anon_execute:'||r.sig); END IF;
  END LOOP;
  FOR r IN SELECT unnest({arr(TABLES)}) t LOOP
    IF has_table_privilege('anon', 'public.'||r.t, 'INSERT') AND NOT EXISTS (SELECT 1 FROM (VALUES {vals([(t,) for t, g, pr in GRANTS if g == 'anon' and 'INSERT' in pr])}) m(x) WHERE m.x=r.t)
      THEN v_fail := v_fail || ('post_anon_insert:'||r.t); END IF;
  END LOOP;
  FOR r IN SELECT t, rl, pv FROM unnest({arr(TABLES)}) t, unnest(ARRAY['public','anon','authenticated']) rl, unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES']) pv WHERE to_regclass('public.'||t) IS NOT NULL LOOP
    IF has_table_privilege(r.rl, 'public.'||r.t, r.pv) THEN v_fail := v_fail || ('post_client_destructive:'||r.t||':'||r.rl||':'||r.pv); END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname = {lit(HOMOLOG_TRAVA)} AND NOT tgisinternal AND tgenabled <> 'D') <> 1 THEN v_fail := v_fail || 'post_homolog_trava'::text; END IF;
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM cron.job' INTO v_n; IF v_n <> {CRON_EXPECTED_INACTIVE} THEN v_fail := v_fail || 'post_cron_count'::text; END IF;
    EXECUTE 'SELECT count(*) FROM cron.job WHERE active IS DISTINCT FROM false' INTO v_n; IF v_n <> 0 THEN v_fail := v_fail || 'post_cron_active'::text; END IF;
    EXECUTE $c$SELECT md5(coalesce(string_agg(concat_ws('|',jobid,jobname,schedule,command,database,username,active),E'\n' ORDER BY jobid),'')) FROM cron.job$c$ INTO v_cron;
    IF v_cron IS DISTINCT FROM nullif(current_setting('homolog_align.cron_md5', true), '') THEN v_fail := v_fail || 'post_cron_drift'::text; END IF;
  ELSE v_fail := v_fail || 'post_cron_schema_absent'::text; END IF;
  FOR r IN SELECT unnest({arr([fq(x) for x in SMTP_LANE_FNS])}) sig LOOP
    IF has_function_privilege('anon', to_regprocedure(r.sig), 'EXECUTE') OR has_function_privilege('authenticated', to_regprocedure(r.sig), 'EXECUTE')
       OR has_function_privilege('service_role', to_regprocedure(r.sig), 'EXECUTE') THEN v_fail := v_fail || ('post_smtp_lane_exec:'||r.sig); END IF; END LOOP;
  IF to_regclass('{SMTP_TYPE}') IS NULL OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = '{SMTP_TYPE}'::regclass)
     OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='platform_private' AND tablename='tenant_smtp_dispatch_jobs')
     OR has_table_privilege('authenticated', '{SMTP_TYPE}', 'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('anon', '{SMTP_TYPE}', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('service_role', '{SMTP_TYPE}', 'SELECT,INSERT,UPDATE,DELETE')
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid = '{SMTP_TYPE}'::regclass) <> {len(SMTP_CONS)}
  THEN v_fail := v_fail || 'post_smtp_relation_not_closed'::text; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_smtp_lane_solicitacao_atribuida' AND NOT tgisinternal) THEN v_fail := v_fail || 'post_smtp_lane_trigger'::text; END IF;
  FOR r IN SELECT unnest({arr(CLOSED_B2B_PANELS)}) sig LOOP
    IF has_function_privilege('authenticated', to_regprocedure(r.sig), 'EXECUTE') OR has_function_privilege('anon', to_regprocedure(r.sig), 'EXECUTE')
    THEN v_fail := v_fail || ('post_b2b_panel_open:'||r.sig); END IF; END LOOP;
  FOR r IN SELECT * FROM (VALUES {vals([(fq(x), "authenticated" in prod_exec(x) or "PUBLIC" in prod_exec(x)) for x in INSTALL if x in GRANT_AUTH])}) m(sig, ok) LOOP
    IF NOT r.ok::boolean THEN v_fail := v_fail || ('post_auth_beyond_production:'||r.sig); END IF; END LOOP;
  FOR r IN SELECT unnest({arr([fq(x) for x in INSTALL])}) sig LOOP
    IF has_function_privilege('anon', to_regprocedure(r.sig), 'EXECUTE') THEN v_fail := v_fail || ('post_anon_exec:'||r.sig); END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = to_regprocedure(r.sig) AND a.is_grantable AND a.grantee <> p.proowner)
    THEN v_fail := v_fail || ('post_grant_option:'||r.sig); END IF; END LOOP;
  IF EXISTS (SELECT 1 FROM public.company_fiscal_settings WHERE nfe_enabled OR nfse_enabled OR production_enabled) THEN v_fail := v_fail || 'post_fiscal'::text; END IF;
  IF cardinality(v_fail) > 0 THEN RAISE EXCEPTION 'homolog_alignment_post_failed' USING DETAIL = array_to_string(v_fail, ' | '); END IF;
END $post$;"""


CAT_FILES = ["homolog-clean/00-pre-global.homolog-clean.sql.review", "homolog-clean/01-migrate.homolog-clean.sql.review"]


def invite_cols_check(prefix="gate"):
    rows = vals([(c, t) for c, t in INVITE_ACCESS_COLS])
    return f"""
  FOR r IN SELECT * FROM (VALUES {rows}) m(c, t) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.{INVITE_TABLE}') AND a.attname = r.c AND NOT a.attisdropped
                     AND format_type(a.atttypid, a.atttypmod) = r.t AND NOT a.attnotnull AND NOT a.atthasdef) THEN
      v_fail := v_fail || ('{prefix}_invite_access_column:'||r.c); END IF;
  END LOOP;"""


def identity_state_sql():
    """Estado FINAL exato do 10 (aplicado na homolog 03/11) + ledger; usado pelo gate do catálogo."""
    return f"""
  -- ledger consultado dinamicamente: a ausência da relação vira falha nomeada, não erro de parse
  IF to_regclass('platform_private.homolog_identity_fixture_ledger') IS NULL THEN v_fail := v_fail || 'identity_fixtures_not_applied'::text;
  ELSE
    EXECUTE $q$SELECT count(DISTINCT step) FROM platform_private.homolog_identity_fixture_ledger
               WHERE (step LIKE 'rh\\_%\\_to\\_final' AND subject=$1) OR (step LIKE 't4\\_%\\_to\\_final' AND subject=$2)
                  OR (step='arbio_admin_invariant' AND subject=$3)$q$ INTO v_n USING {lit(ID_RH)}::uuid, {lit(ID_T4)}::uuid, {lit(ID_ARBAD)}::uuid;
    IF v_n < 3 THEN v_fail := v_fail || 'identity_fixtures_not_applied'::text; END IF;
  END IF;
  IF (SELECT count(*) FROM public.profiles WHERE user_id={lit(ID_RH)} AND organization_id={lit(FSF_H)} AND cliente_id IS NULL AND ativo) <> 1
     OR (SELECT coalesce(array_agg(role::text ORDER BY role::text),'{{}}') FROM public.user_roles WHERE user_id={lit(ID_RH)}) <> ARRAY['administrador']
     OR EXISTS (SELECT 1 FROM public.partner_users WHERE user_id={lit(ID_RH)}) OR EXISTS (SELECT 1 FROM public.user_clientes WHERE user_id={lit(ID_RH)}) THEN
    v_fail := v_fail || 'identity_rh_not_final'::text; END IF;
  IF (SELECT count(*) FROM public.profiles WHERE user_id={lit(ID_T4)} AND organization_id={lit(ARB_H)} AND cliente_id IS NULL AND ativo) <> 1
     OR (SELECT coalesce(array_agg(role::text ORDER BY role::text),'{{}}') FROM public.user_roles WHERE user_id={lit(ID_T4)}) <> ARRAY['parceiro_b2b']
     OR (SELECT count(*) FROM public.partner_users WHERE user_id={lit(ID_T4)}) <> 1
     OR (SELECT count(*) FROM public.partner_users WHERE user_id={lit(ID_T4)} AND partner_id={lit(ID_PARTNER_FSF)} AND papel='gestor' AND revoked_at IS NULL AND tenant_id={lit(ARB_H)}) <> 1
     OR EXISTS (SELECT 1 FROM public.user_clientes WHERE user_id={lit(ID_T4)}) THEN
    v_fail := v_fail || 'identity_teste4_not_final'::text; END IF;
  IF (SELECT count(*) FROM public.profiles WHERE user_id={lit(ID_ARBAD)} AND organization_id={lit(ARB_H)} AND ativo) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id={lit(ID_ARBAD)} AND role::text='administrador') THEN
    v_fail := v_fail || 'identity_arbio_admin_changed'::text; END IF;"""


def invite_access_columns_sql():
    adds = "\n".join(f"  ALTER TABLE public.{INVITE_TABLE} ADD COLUMN IF NOT EXISTS {c} {t};" for c, t in INVITE_ACCESS_COLS)
    return f"""-- 06 HOMOLOG — colunas access_* de {INVITE_TABLE} (dependência real de platform_actor_access_ready).
-- JÁ APLICADO pelo auditor em vrlcdwmlytukrjezrrnf (align_homolog_invite_access_columns, 03/11): NÃO reaplicar lá.
-- Registro revisável e idempotente para cópias homolog novas: só ADD COLUMN IF NOT EXISTS nullable sem default
-- (= captura produção/homolog); nenhum dado, grant, função ou cron tocado.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $ic$ DECLARE v_fail text[] := ARRAY[]::text[]; r record; v_n bigint; v_cron text; BEGIN{fingerprint_sql()}
  IF to_regclass('public.{INVITE_TABLE}') IS NULL THEN v_fail := v_fail || 'invite_table_missing'::text; END IF;
  IF cardinality(v_fail) > 0 THEN RAISE EXCEPTION 'homolog_invite_cols_pre_failed' USING DETAIL = array_to_string(v_fail, ' | '); END IF;
END $ic$;
{adds}
DO $icp$ DECLARE v_fail text[] := ARRAY[]::text[]; r record; BEGIN{invite_cols_check("post")}
  IF cardinality(v_fail) > 0 THEN RAISE EXCEPTION 'homolog_invite_cols_post_failed' USING DETAIL = array_to_string(v_fail, ' | '); END IF;
  IF to_regclass('{LEDGER}') IS NOT NULL THEN
    INSERT INTO {LEDGER}(step, detail) VALUES ('invite_access_columns', jsonb_build_object('columns', {len(INVITE_ACCESS_COLS)}));
  END IF;
END $icp$;
COMMIT;
"""


def catalog_gate_sql(skip_identity=False):
    pins = {f: sha(CAT_PKG / f) for f in CAT_FILES}
    return (f"""-- 02 GATE DO CATÁLOGO NA HOMOLOGAÇÃO — READ ONLY. Variante de instalação LIMPA (homolog), declarada; difere da de
-- produção SOMENTE por aceitar ausentes os 25 wrappers/cores globais (fechados por ausência; se presentes, md5 obrigatório):
--   * executar em seguida, sem alterar um byte: {CAT_FILES[0]} sha256={pins[CAT_FILES[0]]}
--                                              {CAT_FILES[1]} sha256={pins[CAT_FILES[1]]}
--   * 02-chain-purge-maintenance (produção) NÃO se aplica: os 19 ids não existem aqui; o PRE do catálogo confere contagem 0
--     por id real (não há hash fingido). A prova do algoritmo 02 é só em PostgreSQL descartável com fixtures pinadas.
--   * produtos homolog sem pai de tenant (sem lote/pedido/OS/visita) saem do catálogo com snapshot integral no ledger
--     (algoritmo canônico 'global_removed'); fixtures próprias entram depois por tenant_product_save com JWT real.
BEGIN TRANSACTION READ ONLY;
DO $gate$ DECLARE v_fail text[] := ARRAY[]::text[]; v_n bigint; v_cron text; r record; BEGIN{fingerprint_sql()}
  -- estado ATUAL (03/11): 01 aplicado (ledger done), colunas access_* (06/delta do auditor), identidades 10 finais,
  -- SMTP lane ausente, cron 7 inativos, fiscal 0, trava sem recebível ligada (fingerprint acima).{invite_cols_check()}{"" if skip_identity else identity_state_sql()}
  IF (SELECT count(*) FROM pg_proc WHERE proname = ANY({arr([x.split("(")[0].split(".")[-1] for x in SMTP_LANE_FNS])}::name[])) <> 0 THEN v_fail := v_fail || 'smtp_lane_present'::text; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = {lit(ARB_H)}) OR EXISTS (SELECT 1 FROM public.organizations WHERE id IN ({",".join(lit(o) for o in PROD_ORGS)})) THEN
    v_fail := v_fail || 'not_homolog'::text; END IF;
  IF to_regclass('{LEDGER}') IS NULL OR NOT EXISTS (SELECT 1 FROM {LEDGER} WHERE step='done')
     OR NOT EXISTS (SELECT 1 FROM {LEDGER} WHERE step='start' AND detail->>'input_sha256' = {lit(INPUT_SHA)}) THEN
    v_fail := v_fail || 'homolog_alignment_not_applied'::text; END IF;
  IF to_regclass('platform_private.chain_purge_maintenance_ledger') IS NOT NULL THEN v_fail := v_fail || 'production_chain_purge_must_not_run_here'::text; END IF;
  IF to_regclass('platform_private.tenant_catalog_migration_ledger') IS NOT NULL THEN v_fail := v_fail || 'catalog_already_applied'::text; END IF;
  SELECT count(*) INTO v_n FROM public.produtos;
  IF v_n <> 7 THEN v_fail := v_fail || ('homolog_products_not_7:'||v_n); END IF;
  IF EXISTS (SELECT 1 FROM public.microrganismos) OR EXISTS (SELECT 1 FROM public.culturas) OR EXISTS (SELECT 1 FROM public.partner_orders)
     OR EXISTS (SELECT 1 FROM public.entregas) OR EXISTS (SELECT 1 FROM public.fiscal_invoices) THEN v_fail := v_fail || 'homolog_inventory_changed'::text; END IF;
  IF cardinality(v_fail) > 0 THEN RAISE EXCEPTION 'homolog_catalog_gate_failed' USING DETAIL = array_to_string(v_fail, ' | '); END IF;
END $gate$;
COMMIT;
""", pins)


def probe_sql():
    return f"""-- 03 PROBE HOMOLOG — READ ONLY. Estado para a etapa JWT/navegador (nenhuma escrita, nenhuma senha).
BEGIN TRANSACTION READ ONLY;
SELECT 'org' k, id::text, status, ativo::text FROM public.organizations WHERE id IN ({lit(ARB_H)}, {lit(FSF_H)})
UNION ALL SELECT 'auth_user', u.id::text, u.email, (u.email_confirmed_at IS NOT NULL)::text FROM auth.users u
  WHERE lower(u.email) IN ('arbiotecnologia@gmail.com', 'teste4@refilinformatica.com.br', 'rh@refilinformatica.com.br')
UNION ALL SELECT 'profile', p.user_id::text, p.organization_id::text, p.ativo::text FROM public.profiles p
  JOIN auth.users u ON u.id = p.user_id WHERE lower(u.email) IN ('arbiotecnologia@gmail.com', 'teste4@refilinformatica.com.br', 'rh@refilinformatica.com.br')
UNION ALL SELECT 'role', r.user_id::text, r.role::text, NULL FROM public.user_roles r
  JOIN auth.users u ON u.id = r.user_id WHERE lower(u.email) IN ('arbiotecnologia@gmail.com', 'teste4@refilinformatica.com.br', 'rh@refilinformatica.com.br')
UNION ALL SELECT 'partner_user', pu.user_id::text, pu.partner_id::text, pa.commercial_owner_organization_id::text FROM public.partner_users pu
  JOIN public.partner_accounts pa ON pa.id = pu.partner_id JOIN auth.users u ON u.id = pu.user_id
  WHERE lower(u.email) = 'teste4@refilinformatica.com.br'
UNION ALL SELECT 'catalog_products', owner_organization_id::text, count(*)::text, NULL FROM public.produtos GROUP BY owner_organization_id;
COMMIT;
"""


def rollback_sql():
    return (f"""-- 09 ROLLBACK HOMOLOG (somente restritivo). Não restaura corpos antigos nem dropa nada; dado/esquema volta só por backup.
BEGIN;
DO $rb$ DECLARE r record; BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = {lit(ARB_H)}) OR EXISTS (SELECT 1 FROM public.organizations WHERE id IN ({",".join(lit(o) for o in PROD_ORGS)})) THEN
    RAISE EXCEPTION 'not_homolog'; END IF;
  FOR r IN SELECT unnest({arr([fq(x) for x in CREATE_NEW])}) sig LOOP
    IF to_regprocedure(r.sig) IS NOT NULL THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', r.sig); END IF;
  END LOOP;
  INSERT INTO {LEDGER}(step, detail) VALUES ('rollback_deny', jsonb_build_object('revoked', {len(CREATE_NEW)}));
END $rb$;
COMMIT;
""")


def client_acl_hardening_sql():
    return f"""-- 04 RESTRIÇÃO OPERACIONAL ACL CLIENTE (homolog ou produção; pode preceder alinhamento/migração do catálogo).
-- Só REVOKE de TRUNCATE/TRIGGER/REFERENCES de PUBLIC/anon/authenticated nas {len(TABLES)} tabelas do escopo.
-- Não toca SELECT/INSERT/UPDATE/DELETE (CRUD via API/RLS/RPC preservado), service_role, owner, funções nem dados. Idempotente.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $h$ DECLARE r record; v_crud_before bigint; v_crud_after bigint; v_fail text[] := ARRAY[]::text[];
  v_crud text := 'SELECT count(*) FROM unnest($1) t, unnest(ARRAY[''anon'',''authenticated'',''service_role'']) rl, unnest(ARRAY[''SELECT'',''INSERT'',''UPDATE'',''DELETE'']) pv WHERE to_regclass(''public.''||t) IS NOT NULL AND has_table_privilege(rl, ''public.''||t, pv)';
BEGIN
  EXECUTE v_crud INTO v_crud_before USING {arr(TABLES)};
  FOR r IN SELECT t FROM unnest({arr(TABLES)}) t WHERE to_regclass('public.'||t) IS NOT NULL LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM PUBLIC, anon, authenticated', r.t);
  END LOOP;
  EXECUTE v_crud INTO v_crud_after USING {arr(TABLES)};
  IF v_crud_before <> v_crud_after THEN v_fail := v_fail || ('crud_changed:'||v_crud_before||'->'||v_crud_after); END IF;
  FOR r IN SELECT t, rl, pv FROM unnest({arr(TABLES)}) t, unnest(ARRAY['public','anon','authenticated']) rl, unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES']) pv
           WHERE to_regclass('public.'||t) IS NOT NULL AND has_table_privilege(rl, 'public.'||t, pv) LOOP
    v_fail := v_fail || (r.t||':'||r.rl||':'||r.pv);  -- ex.: herdado de role-membro; abortar em vez de mascarar
  END LOOP;
  IF cardinality(v_fail) > 0 THEN RAISE EXCEPTION 'post:client_destructive_acl' USING DETAIL = array_to_string(v_fail, ', '); END IF;
  RAISE NOTICE 'client_destructive_acl_closed tables=% crud_grants_preserved=%', {len(TABLES)}, v_crud_after;
END $h$;
COMMIT;
"""


def client_acl_probe_sql():
    return f"""-- 05 SONDA SOMENTE LEITURA (não destrutiva): nenhuma escrita, nenhum TRUNCATE real; só has_table_privilege.
BEGIN TRANSACTION READ ONLY;
SELECT t AS table_name, rl AS role, pv AS privilege, has_table_privilege(rl, 'public.'||t, pv) AS granted,
       pv IN ('TRUNCATE','TRIGGER','REFERENCES') AND rl <> 'service_role' AS must_be_false
  FROM unnest({arr(TABLES)}) t, unnest(ARRAY['public','anon','authenticated','service_role']) rl,
       unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','TRIGGER','REFERENCES']) pv
 WHERE to_regclass('public.'||t) IS NOT NULL ORDER BY 1, 2, 3;
SELECT count(*) FILTER (WHERE has_table_privilege(rl, 'public.'||t, pv)) AS client_destructive_open
  FROM unnest({arr(TABLES)}) t, unnest(ARRAY['public','anon','authenticated']) rl, unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES']) pv
 WHERE to_regclass('public.'||t) IS NOT NULL;
ROLLBACK;
"""


def main():
    out = {"00-homolog-pre.sql.review": pre_sql(), "01-homolog-align.sql.review": align_sql()}
    gate, pins = catalog_gate_sql()
    out["02-homolog-catalog-gate.sql.review"] = gate
    out["03-homolog-readiness-probe.sql.review"] = probe_sql()
    out["04-client-destructive-acl-hardening.sql.review"] = client_acl_hardening_sql()
    out["05-client-destructive-acl-probe.sql.review"] = client_acl_probe_sql()
    out["06-homolog-invite-access-columns.sql.review"] = invite_access_columns_sql()
    out["09-homolog-align-rollback-deny.sql.review"] = rollback_sql()
    for n, t in out.items(): (HERE / n).write_text(t)
    manifest = dict(input_sha256=INPUT_SHA, homolog_ref=HOMOLOG_REF, counts=dict(CNT), install=len(INSTALL), replace=len(REPLACE),
                    create=len(CREATE_NEW), closed_by_absence=NO_BODY, new_tables=NEW_TABLES, add_columns=ADD_COLS,
                    nullability=CHANGED, dep_types=DEP_TYPES, grant_authenticated=GRANT_AUTH, constraints=len(CONSTRAINTS), fks=len(FKS59),
                    indexes_free=len(INDEXES_FREE), policies=len(POLICIES), triggers=len(TRIGGERS), grants=len(GRANTS),
                    catalog_variant_pins=pins, orgs=dict(ar_bio_homolog=ARB_H, fsf_homolog=FSF_H))
    (HERE / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    sums = {n: sha(HERE / n) for n in sorted(out) + ["manifest.json"]}
    (HERE / "SHA256SUMS.json").write_text(json.dumps(sums, indent=1))
    print(json.dumps(dict(sums=sums, install=len(INSTALL), grant_auth=len(GRANT_AUTH), dep_types=DEP_TYPES), indent=1))


if __name__ == "__main__":
    main()
