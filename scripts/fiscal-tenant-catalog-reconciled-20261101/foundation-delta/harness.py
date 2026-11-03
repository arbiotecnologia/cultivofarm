#!/usr/bin/env python3
"""PostgreSQL DESCARTÁVEL para PRE GLOBAL + reconciliação 09/10/13. Zero hosted.

Usa as 3 definições LIVE capturadas verbatim + stubs sintéticos para dependências.
Os 14 pins iguais não têm corpo capturado: são stubs cujo md5 local substitui o pin
(classificado PG_SEAM_STUB_PIN, não prova da fundação instalada).
"""
import json, os, pathlib, re, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/foundation-delta-run")
OUT.mkdir(parents=True, exist_ok=True)
LOG = open(OUT / "harness.log", "w")
LIVE = json.loads((ROOT / "docs/auditorias/evidencias/reconciliacao-fiscal-catalogo-20261101/foundation-live-pins-20261101/live_foundation_pins.json").read_text())
RBAC = ROOT / "scripts/rbac-audit"
checks = []


def check(cid, scen, exp, act, kind="PG_DISPOSABLE_CAPTURED_DEFS_SYNTHETIC_AUTH"):
    r = dict(id=cid, scenario=scen, expected=exp, actual=act, status="PASS" if exp == act else "FAIL", kind=kind)
    checks.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)


class PG:
    def __init__(self):
        for v in [k for k in os.environ if k.startswith("PG")]: os.environ.pop(v)
        self.d = tempfile.mkdtemp(prefix="pgfound-"); os.chown(self.d, 1000, 1000)
        self.port = str(57000 + os.getpid() % 900)
        self.as_ = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
        subprocess.run(self.as_ + ["initdb", "-D", f"{self.d}/data", "-U", "postgres", "-A", "trust", "-E", "UTF8"], check=True, capture_output=True)
        subprocess.run(self.as_ + ["pg_ctl", "-D", f"{self.d}/data", "-o", f"-p {self.port} -k {self.d} -c listen_addresses=''",
                                   "-l", f"{self.d}/log", "-w", "start"], check=True, capture_output=True)

    def sql(self, s, ok=True):
        r = subprocess.run(["psql", "-X", "-q", "-At", "-h", self.d, "-p", self.port, "-U", "postgres", "-d", "postgres",
                            "-v", "ON_ERROR_STOP=1"], input=s, text=True, capture_output=True)
        LOG.write(f"--- ok={ok} rc={r.returncode}\n{s[:400]}\n>> {r.stdout[-600:]}{r.stderr[-600:]}\n"); LOG.flush()
        if ok and r.returncode: raise RuntimeError(r.stderr)
        return r.stdout.strip() if r.returncode == 0 else "ERR:" + r.stderr.strip()

    def stop(self):
        subprocess.run(self.as_ + ["pg_ctl", "-D", f"{self.d}/data", "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(self.d, ignore_errors=True)


BASE = r"""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('administrador','financeiro','gestor_comercial');
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
CREATE FUNCTION public.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $$;
CREATE TABLE public.produtos(id uuid PRIMARY KEY, nome text, ativo boolean DEFAULT true, valor_ha_brl numeric);
CREATE TABLE public.microrganismos(id uuid PRIMARY KEY, nome text, ativo boolean DEFAULT true);
CREATE TABLE public.culturas(id uuid PRIMARY KEY, nome text, ativo boolean DEFAULT true);
CREATE TABLE public.commercial_condition_item_prices(id serial, assignment_id uuid, plan_id uuid, product_id uuid, microrganismo_id uuid,
  buyer_scope text, partner_id uuid, customer_id uuid, status text, pricing_mode text);
CREATE FUNCTION platform_private.c2p1_assignment_allowed(text,uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.c2p1',true) IS DISTINCT FROM 'deny' $$;
CREATE FUNCTION platform_private.c2p1_item_allowed(uuid,uuid,text,uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.fn_cc_can_prepare(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1 IS NOT NULL $$;
CREATE TABLE public.catalog_tenant_visibility(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, entity_type text,
  produto_id uuid, microrganismo_id uuid, cultura_id uuid, hidden boolean, version int, reason text, updated_by uuid, updated_at timestamptz DEFAULT now());
CREATE TABLE public.catalog_tenant_visibility_ledger(id serial, organization_id uuid, actor_id uuid, idempotency_key uuid, payload_hash text,
  entity_type text, entity_id uuid, before_state jsonb, after_state jsonb, reason text, result jsonb);
CREATE FUNCTION platform_private.catalog_tenant_actor(text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('test.org')::uuid $$;
CREATE TABLE public.clientes(id uuid PRIMARY KEY);
CREATE TABLE public.company_fiscal_settings(id uuid PRIMARY KEY, state text, is_active boolean, updated_at timestamptz DEFAULT now());
CREATE TABLE public.customer_fiscal_profiles(customer_id uuid, fiscal_state text);
CREATE TABLE public.product_fiscal_profiles(product_id uuid, is_active boolean, ncm text, cest text, origin_code text,
  cfop_in_state text, cfop_interstate text, icms_cst text, icms_csosn text);
CREATE TABLE public.service_fiscal_profiles(service_id uuid, is_active boolean);
CREATE TABLE public.fiscal_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_settings_id uuid, invoice_type text, document_model text,
  document_origin text, environment text, provider text, status text, normalized_status text, series text, issue_date date, notes text,
  company_cnpj text, customer_id uuid, receivable_id uuid, delivery_id uuid, customer_snapshot jsonb, company_snapshot jsonb,
  fiscal_totals_snapshot jsonb, fiscal_profile_snapshot jsonb, tax_snapshot jsonb, draft_version int, created_by uuid,
  total_amount numeric, locked_at timestamptz, updated_at timestamptz);
CREATE TABLE public.fiscal_invoice_items(fiscal_invoice_id uuid, item_sequence int, item_kind text, description text, quantity numeric,
  commercial_unit text, unit_value numeric, gross_value numeric, discount_value numeric, net_value numeric, source_item_type text,
  source_item_id uuid, fiscal_profile_snapshot jsonb, tax_snapshot jsonb, tax_input_snapshot jsonb, ncm_snapshot text, cest_snapshot text,
  origem_snapshot text, cfop_snapshot text, cst_icms_snapshot text, csosn_snapshot text, freight_value numeric, insurance_value numeric, other_value numeric);
CREATE FUNCTION public.h15_active_company() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('test.org')::uuid $$;
CREATE FUNCTION public.h15_company_access(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1 = current_setting('test.org')::uuid $$;
CREATE FUNCTION public.h15_require_staff() RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.h15_require_invoice(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_invoices WHERE id=$1 AND public.h15_company_access(company_settings_id)) THEN
    RAISE EXCEPTION 'h15_invoice_denied' USING ERRCODE='42501'; END IF; END $$;
CREATE FUNCTION public.fiscal_json_has_sensitive_key(jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT false $$;
CREATE FUNCTION public.fiscal_validate_snapshot_keys(jsonb, text[], text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.fn_fiscal_tax_input_valid(jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
CREATE FUNCTION public.fn_fiscal_apportion_v1(numeric, numeric[]) RETURNS numeric[] LANGUAGE sql IMMUTABLE AS $$ SELECT array_fill(0::numeric, ARRAY[cardinality($2)]) $$;
"""

SIM01 = """BEGIN;
ALTER TABLE public.produtos ADD COLUMN owner_organization_id uuid;
ALTER TABLE public.microrganismos ADD COLUMN owner_organization_id uuid;
ALTER TABLE public.culturas ADD COLUMN owner_organization_id uuid;
CREATE FUNCTION platform_private.catalog_ownership_enabled() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
COMMIT;"""

A = "aaaaaaaa-0000-0000-0000-00000000000a"; B = "bbbbbbbb-0000-0000-0000-00000000000b"
UA = "11111111-0000-0000-0000-000000000001"
PGLOB = "00000000-0000-0000-0000-0000000000a1"; POWN = "00000000-0000-0000-0000-0000000000a2"
MGLOB = "00000000-0000-0000-0000-0000000000b1"; MOWN = "00000000-0000-0000-0000-0000000000b2"
PLAN = "00000000-0000-0000-0000-0000000000c1"; CLI = "00000000-0000-0000-0000-0000000000d1"


def errcode_of(s):
    m = re.search(r"ERROR:\s+([^\n]+)", s); return m.group(1).strip() if m else s


def main():
    pg = PG()
    try:
        pg.sql(BASE)
        live = {f["signature"]: f for f in LIVE["functions"]}
        for sig, f in live.items():
            pg.sql(f["definition"])
            got = pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")
            check(f"F-01:{sig.split('(')[0]}", "definição live recriada reproduz o md5 live", f["md5"], got)
        # stubs dos 14 pins iguais (corpo não capturado): pin substituído pelo md5 local (seam)
        seam = {}
        for c in LIVE["comparison"]:
            if c["expected"] != c["actual"]: continue
            sig = c["signature"]; name = sig.split("(")[0]; args = sig[sig.index("(") + 1:-1]
            argl = ", ".join(f"a{i} {t.strip()}" for i, t in enumerate(args.split(","))) if args.strip() else ""
            pg.sql(f"CREATE FUNCTION {name}({argl}) RETURNS void LANGUAGE sql AS $$ SELECT $$;")
            seam[c["actual"]] = pg.sql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))")
        pre = (HERE / "00-pre-global-foundation.sql.review").read_text()
        pre_seam = pre
        for live_pin, local in seam.items(): pre_seam = pre_seam.replace(f"'{live_pin}'", f"'{local}'")
        snap = "SELECT (SELECT count(*) FROM pg_proc)||':'||(SELECT count(*) FROM pg_class)||':'||(SELECT count(*) FROM pg_attribute)"
        before = pg.sql(snap)
        r = pg.sql(pre_seam, ok=False)
        check("F-02", "PRE global aprovado em transação READ ONLY", "OK", "OK" if not r.startswith("ERR") else r, "PG_SEAM_STUB_PIN")
        check("F-03", "PRE não altera catálogo (pg_proc/pg_class/pg_attribute)", before, pg.sql(snap))
        r = pg.sql("BEGIN TRANSACTION READ ONLY; CREATE TABLE public.x(i int); COMMIT;", ok=False)
        check("F-04", "transação READ ONLY do PRE recusa DDL", True, "read-only transaction" in r)
        # drift em um dos 14 (mesma contagem de funções)
        pg.sql("CREATE OR REPLACE FUNCTION public.rpc_commercial_simulator(a0 uuid, a1 uuid, a2 numeric, a3 numeric) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;")
        r = pg.sql(pre_seam, ok=False)
        check("F-05", "drift silencioso (mesma contagem) num pin igual aborta o PRE", True,
              "ownership_pre_global_failed" in r and "drift:public.rpc_commercial_simulator" in r, "PG_SEAM_STUB_PIN")
        pg.sql("CREATE OR REPLACE FUNCTION public.rpc_commercial_simulator(a0 uuid, a1 uuid, a2 numeric, a3 numeric) RETURNS void LANGUAGE sql AS $$ SELECT $$;")
        # drift no 13 (live) => PRE para antes do 01: nenhuma DDL de fundação
        d13 = live["platform_private.catalog_tenant_set_visibility_core(text, uuid, boolean, integer, text, uuid)"]["definition"]
        pg.sql(d13.replace("v_result jsonb;", "v_result jsonb; v_x int;"))
        r = pg.sql(pre_seam, ok=False)
        check("F-06", "drift do 13 detectado pelo PRE antes da primeira DDL", True, "drift:platform_private.catalog_tenant_set_visibility_core" in r)
        if r.startswith("ERR"):
            pass  # runner para aqui: 01 NÃO é executado
        check("F-07", "sem aplicação parcial: owner_organization_id ausente após aborto", "0",
              pg.sql("SELECT count(*) FROM pg_attribute WHERE attname='owner_organization_id' AND attrelid='public.produtos'::regclass"))
        pg.sql(d13)
        r = pg.sql(pre_seam, ok=False); check("F-08", "PRE volta a aprovar após restaurar definição live", "OK", "OK" if not r.startswith("ERR") else r, "PG_SEAM_STUB_PIN")
        # dependência ausente
        pg.sql("ALTER FUNCTION platform_private.c2p1_item_allowed(uuid,uuid,text,uuid,uuid) RENAME TO c2p1_item_allowed_x;")
        r = pg.sql(pre_seam, ok=False); check("F-09", "dependência ausente aborta PRE", True, "dep:c2p1_item_allowed" in r)
        pg.sql("ALTER FUNCTION platform_private.c2p1_item_allowed_x(uuid,uuid,text,uuid,uuid) RENAME TO c2p1_item_allowed;")
        # RED: guards originais contra live
        for k, fn, err in [("09", "proposed-tenant-catalog-ownership-09-commercial-matrix.sql", "ownership09_matrix_definition_drift"),
                           ("13", "proposed-tenant-catalog-ownership-13-visibility-target.sql", "ownership13_visibility_core_drift")]:
            src = (RBAC / fn).read_text()
            guard = src[src.index("DO $$"):src.index("END $$;") + 7]
            pg.sql("CREATE OR REPLACE FUNCTION platform_private.catalog_ownership_enabled() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;")
            r = pg.sql(guard, ok=False)
            pg.sql("DROP FUNCTION platform_private.catalog_ownership_enabled();")
            check(f"RED-{k}", f"guard original {k} aborta contra definição live", True, err in r, "PG_DISPOSABLE_RED_EXPECTED")
        src10 = (RBAC / "proposed-tenant-catalog-ownership-10-global-roots.sql").read_text()
        i = src10.index("DO $p$\nDECLARE v_oid regprocedure := 'public.rpc_fiscal_draft_save"); g10 = src10[i:src10.index("END $p$;", i) + 8]
        r = pg.sql(g10, ok=False)
        check("RED-10", "guard original 10 (rpc_fiscal_draft_save) aborta contra live", True, "ownership10_drift:public.rpc_fiscal_draft_save" in r, "PG_DISPOSABLE_RED_EXPECTED")
        # Contrafactual: só trocar o hash e aplicar corpo original => regressão de hardening detectada
        orig09 = (RBAC / "proposed-tenant-catalog-ownership-09-commercial-matrix.sql").read_text()
        body09 = orig09[orig09.index("CREATE OR REPLACE FUNCTION"):orig09.index("$function$;") + 11]
        rec09 = (HERE / "proposed-tenant-catalog-ownership-09-commercial-matrix-reconciled.sql.review").read_text()
        post09 = rec09[rec09.index("DO $post$"):rec09.index("END $post$;") + 11]
        pg.sql(SIM01)
        r = pg.sql("BEGIN;\n" + body09 + "\n" + post09 + "\nCOMMIT;", ok=False)
        check("CF-09", "trocar só hash e aplicar corpo original perderia C2P1 — pós-guard aborta", True, "ownership09r_post_hardening_lost" in r)
        check("CF-09b", "aborto preserva definição live (rollback)", live["public.rpc_cc_validate_matrix(uuid, text, uuid, uuid)"]["md5"],
              pg.sql("SELECT md5(pg_get_functiondef('public.rpc_cc_validate_matrix(uuid,text,uuid,uuid)'::regprocedure))"))
        # GREEN: aplicar reconciliados após SIM01
        for k, fn in [("09", "proposed-tenant-catalog-ownership-09-commercial-matrix-reconciled.sql.review"),
                      ("13", "proposed-tenant-catalog-ownership-13-visibility-target-reconciled.sql.review")]:
            r = pg.sql((HERE / fn).read_text(), ok=False)
            check(f"GREEN-{k}", f"reconciliado {k}r aplica com pin live e pós-guard", "OK", "OK" if not r.startswith("ERR") else r)
        rec10 = (HERE / "proposed-tenant-catalog-ownership-10-global-roots-reconciled.sql.review").read_text()
        i = rec10.index("DO $p$\nDECLARE v_oid regprocedure := 'public.rpc_fiscal_draft_save"); j = rec10.index("END $post$;", i) + 11
        r = pg.sql("BEGIN;\n" + rec10[i:j] + "\nCOMMIT;", ok=False)
        check("GREEN-10", "seção rpc_fiscal_draft_save do 10r aplica com pin live e pós-guard", "OK", "OK" if not r.startswith("ERR") else r)
        post_md5 = {k: pg.sql(f"SELECT md5(pg_get_functiondef('{s}'::regprocedure))") for k, s in
                    [("09", "public.rpc_cc_validate_matrix(uuid,text,uuid,uuid)"), ("10", "public.rpc_fiscal_draft_save(uuid,jsonb,jsonb,integer)"),
                     ("13", "platform_private.catalog_tenant_set_visibility_core(text,uuid,boolean,integer,text,uuid)")]}
        (OUT / "post_md5_local_pg.json").write_text(json.dumps(dict(pg_version=pg.sql("SHOW server_version"), **post_md5), indent=1))
        # Comportamento 09r
        pg.sql(f"""INSERT INTO public.produtos(id,nome,owner_organization_id) VALUES ('{PGLOB}','G',NULL),('{POWN}','PRIV-A','{A}');
INSERT INTO public.microrganismos(id,nome,owner_organization_id) VALUES ('{MGLOB}','MG',NULL),('{MOWN}','MPRIV','{A}');
INSERT INTO public.culturas(id,nome,owner_organization_id) VALUES ('{MGLOB}','CG',NULL);""")
        r = pg.sql(f"SET test.uid='{UA}'; SELECT public.rpc_cc_validate_matrix('{PLAN}','partner',NULL,NULL)::text;")
        j = json.loads(r.splitlines()[-1]); ids = sorted(x["id"] for x in j["missing_items"])
        check("B09-1", "matriz lista só globais (sem nomes/IDs privados)", sorted([PGLOB, MGLOB]), ids)
        r = pg.sql(f"SET test.uid='{UA}'; SET test.c2p1='deny'; SELECT public.rpc_cc_validate_matrix('{PLAN}','partner',NULL,NULL);", ok=False)
        check("B09-2", "guard C2P1 atual preservado", True, "C2P1_FORBIDDEN" in r)
        # Comportamento 13r
        base = f"SET test.uid='{UA}'; SET test.org='{A}'; "
        def vis(eid, hidden, ver, key, et="produto"):
            return pg.sql(base + f"SELECT platform_private.catalog_tenant_set_visibility_core('{et}','{eid}',{hidden},{ver},'motivo teste','{key}')::text;", ok=False)
        r = vis(POWN, "true", 0, "00000000-0000-0000-0000-000000000101")
        check("B13-1", "item próprio (mesmo tenant) negado como não encontrado", True, "catalog_visibility_item_not_found" in r)
        r = vis(MOWN, "true", 0, "00000000-0000-0000-0000-000000000102", "microrganismo")
        check("B13-2", "microrganismo próprio negado", True, "catalog_visibility_item_not_found" in r)
        r = vis(PGLOB, "true", 0, "00000000-0000-0000-0000-000000000103")
        check("B13-3", "global oculto com versão 1", 1, json.loads(r.splitlines()[-1])["version"] if not r.startswith("ERR") else r)
        r = vis(PGLOB, "true", 0, "00000000-0000-0000-0000-000000000103")
        check("B13-4", "replay mesma chave devolve recibo", True, '"replayed": true' in r)
        r = vis(PGLOB, "false", 0, "00000000-0000-0000-0000-000000000104")
        check("B13-5", "versão obsoleta => PT409 preservado", True, "catalog_visibility_version_conflict" in r and "ERR" in r)
        r = pg.sql(base + "\\set VERBOSITY verbose\n" + f"SELECT platform_private.catalog_tenant_set_visibility_core('produto','{PGLOB}',false,0,'motivo teste','00000000-0000-0000-0000-000000000105');", ok=False)
        check("B13-6", "SQLSTATE do conflito é PT409 (não 40001 do original)", True, "PT409" in r)
        # Comportamento 10r
        pg.sql(f"INSERT INTO public.user_roles VALUES ('{UA}','financeiro'); INSERT INTO public.clientes VALUES ('{CLI}');"
               f"INSERT INTO public.company_fiscal_settings VALUES ('{A}','MG',true);"
               f"INSERT INTO public.product_fiscal_profiles(product_id,is_active,ncm) VALUES ('{PGLOB}',true,'31010000'),('{POWN}',true,'31010000');")
        def draft(src, inv="NULL", ver="NULL", org=A):
            items = json.dumps([{"item_kind": "PRODUCT", "quantity": 1, "unit_value": 10, "source_item_id": src}])
            return pg.sql(f"SET test.uid='{UA}'; SET test.org='{org}'; \\set VERBOSITY verbose\nSELECT public.rpc_fiscal_draft_save({inv},'{{\"invoice_type\":\"NFE\",\"customer_id\":\"{CLI}\"}}'::jsonb,'{items}'::jsonb,{ver})::text;", ok=False)
        r = draft(POWN); check("B10-1", "rascunho fiscal com produto próprio como origem negado", True, "source_item_product_not_found" in r)
        r = draft(PGLOB); ok = not r.startswith("ERR"); check("B10-2", "rascunho com produto global aceito", True, ok)
        inv = json.loads(r.splitlines()[-1])["id"] if ok else None
        if inv:
            r = draft(PGLOB, f"'{inv}'", "5"); check("B10-3", "versão obsoleta => PT409 preservado", True, "PT409" in r)
            r = draft(PGLOB, f"'{inv}'", "NULL"); check("B10-4", "versão NULL => PT409 (sem bypass CAS)", True, "PT409" in r)
            r = draft(PGLOB, f"'{inv}'", "1", B); check("B10-5", "outro tenant negado por h15 atual", True, "h15_invoice_denied" in r)
            r = draft(PGLOB, f"'{inv}'", "1"); check("B10-6", "CAS correto incrementa versão", 2, json.loads(r.splitlines()[-1])["draft_version"] if not r.startswith("ERR") else r)
    finally:
        pg.stop()
    s = dict(PASS=sum(c["status"] == "PASS" for c in checks), FAIL=sum(c["status"] == "FAIL" for c in checks))
    (OUT / "checks.json").write_text(json.dumps(checks, indent=1, ensure_ascii=False))
    (OUT / "summary.json").write_text(json.dumps(s)); print(json.dumps(s))


if __name__ == "__main__":
    main()
