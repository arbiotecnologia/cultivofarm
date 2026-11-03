#!/usr/bin/env python3
"""PostgreSQL DESCARTÁVEL v2 — catálogo exclusivo por tenant. Zero hosted.

Esquema gerado a partir das 151 FKs REAIS capturadas READ ONLY (fks.tsv: nomes e definições exatas, inclusive
ON DELETE/ON UPDATE e a FK de produto_composicao_declaracoes -> produto_composicao_conjuntos(produto_id)).
Colunas não-FK são sintéticas mínimas. IDs das 5 organizações reais usados como dados. Auth/membership são
stubs (PG_DISPOSABLE_SYNTHETIC_AUTH) — não é prova JWT/RLS hospedada.
"""
import collections, json, os, pathlib, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
PKG = HERE.parent
ROOT = PKG.parent.parent
TSV = ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/live-readonly-20261101/fks.tsv"
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/tenant-catalog-run"); OUT.mkdir(parents=True, exist_ok=True)
LOG = open(OUT / "harness.log", "w")
checks = []


def check(cid, scen, exp, act, kind="PG_DISPOSABLE_SYNTHETIC_AUTH"):
    r = dict(id=cid, scenario=scen, expected=exp, actual=act, status="PASS" if exp == act else "FAIL", kind=kind)
    checks.append(r); print(json.dumps(r, ensure_ascii=False), flush=True)


class PG:
    def __init__(self):
        for v in [k for k in os.environ if k.startswith("PG")]: os.environ.pop(v)
        self.d = tempfile.mkdtemp(prefix="pgtenantcat-"); os.chown(self.d, 1000, 1000)
        self.port = str(58000 + os.getpid() % 900)
        self.as_ = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
        subprocess.run(self.as_ + ["initdb", "-D", f"{self.d}/data", "-U", "postgres", "-A", "trust", "-E", "UTF8"], check=True, capture_output=True)
        subprocess.run(self.as_ + ["pg_ctl", "-D", f"{self.d}/data", "-o", f"-p {self.port} -k {self.d} -c listen_addresses=''",
                                   "-l", f"{self.d}/log", "-w", "start"], check=True, capture_output=True)

    def sql(self, s, ok=True):
        r = subprocess.run(["psql", "-X", "-q", "-At", "-h", self.d, "-p", self.port, "-U", "postgres", "-d", "postgres",
                            "-v", "ON_ERROR_STOP=1"], input=s, text=True, capture_output=True)
        LOG.write(f"--- ok={ok} rc={r.returncode}\n{s[:400]}\n>> {r.stdout[-700:]}{r.stderr[-1500:]}\n"); LOG.flush()
        if ok and r.returncode: raise RuntimeError(r.stderr[-3000:])
        return r.stdout.strip() if r.returncode == 0 else "ERR:" + r.stderr.strip()

    def stop(self):
        subprocess.run(self.as_ + ["pg_ctl", "-D", f"{self.d}/data", "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(self.d, ignore_errors=True)


# organizações REAIS (metadados autorizados)
CF, HOM, REFIL = "8eae2bc1-ad00-4402-9f57-564258e493ca", "442444d9-263f-45d9-a991-a679498d06c3", "4e537fd6-4632-4c70-a782-386dba3e8f9f"
FSF, ARB = "8f57c7dd-0557-4041-b401-7a00f7244626", "007bb519-cba0-4704-be2c-cb93ad010048"
U = lambda n: f"00000000-0000-0000-0000-{n:012d}"
UA, UF, USA, UB2B, UREF = U(901), U(902), U(903), U(904), U(905)
P1, P2, P3, P4, P5 = U(1), U(2), U(3), U(4), U(5)
M1, M2, M3 = U(11), U(12), U(13)
C1, C2 = U(21), U(22)
PF, ORD, LOTF, LOTA, CLIF, TALF, TALA, FAZF, D1, V1, RULE_ORPHAN, RC1 = (U(n) for n in range(31, 43))
EXTRA = {
    "organizations": "nome text, ativo boolean, status text",
    "produtos": "nome text NOT NULL, codigo text UNIQUE, descricao text, tipo public.tipo_produto NOT NULL, classe_catalogo text, familia_catalogo text, "
                "modo_acao text, modo_aplicacao text, funcao_completa text, e_insumo boolean DEFAULT false, b2b_enabled boolean NOT NULL DEFAULT true, dose_ml_ha numeric, "
                "estoque_minimo numeric, valor_dose_brl numeric, valor_ha_brl numeric, valor_litro_brl numeric, ativo boolean DEFAULT true, "
                "created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()",
    "microrganismos": "nome text UNIQUE", "culturas": "nome text UNIQUE",
    "partner_accounts": "commercial_owner_organization_id uuid", "partner_orders": "partner_id uuid, internal_origin_snapshot jsonb, c2_external_origin_snapshot jsonb, receivable_generated boolean DEFAULT false",
    "partner_simulations": "partner_id uuid", "clientes": "organization_id uuid", "fazendas": "organization_id uuid",
    "os_faturamento_base": "ordem_servico_id uuid", "product_fiscal_profiles": "is_active boolean, ncm text",
    "partner_order_items": "qty numeric", "microorganism_regulatory_publication_snapshots": "payload jsonb",
    "objetivos_visita_sugestoes": "texto text",
}
NOID = {"commercial_campaign_products", "produto_composicao_conjuntos"}
# colunas NOT NULL extras exigidas pelo esquema REAL nos INSERTs de cenário (harness_real.py preenche; sintético vazio)
REQ_COLS = {}
# guard de recebível: stub sintético devolve receivable_blocked_origin; harness_real usa o corpo LIVE (ator AR Bio, código real)
RECV_CODES = ("receivable_blocked_origin",)
RECV_AS = lambda: ""
ACL8_RPC = False
EXTRA_FK_NAMES = ()   # FKs das relações extras (captura própria) não entram na contagem das 151
EXTRA_TESTS = None
HOMOLOG_FILES = None      # (pre, mig) da variante homolog-clean quando a bateria roda sobre ela
HOOK_BEFORE_PRE1 = None
HOOK_AFTER_MIG1 = None   # harness_real.py injeta cenários que exigem colunas/policies/gatilhos reais
def rc(root):
    d = REQ_COLS.get(root, {})
    return "".join(", " + k for k in d), "".join(", " + v for v in d.values())


def schema():
    fks = [l.split("\t") for l in TSV.read_text().splitlines() if l.strip()]
    cols = collections.defaultdict(set); tables = set()
    for src, tgt, con, dfn in fks:
        tables.add(src)
        if tgt != "auth.users": tables.add(tgt)
        c = dfn.split("(")[1].split(")")[0]; cols[src].add(c)
    # tipos REAIS de produtos (captura schema-input): tipo = enum tipo_produto NOT NULL sem default; b2b_enabled NOT NULL DEFAULT true
    out = ["CREATE TYPE public.tipo_produto AS ENUM ('inoculante','fungicida','inseticida','solo','solubilizador');",
           "CREATE TABLE auth.users(id uuid PRIMARY KEY);"]
    for t in sorted(tables):
        parts = [] if t in NOID else ["id uuid PRIMARY KEY DEFAULT gen_random_uuid()"]
        for c in sorted(cols[t]):
            parts.append(f"{c} uuid" + (" NOT NULL UNIQUE" if t == "produto_composicao_conjuntos" and c == "produto_id" else ""))
        if t in EXTRA: parts.append(EXTRA[t])
        out.append(f"CREATE TABLE public.{t}({', '.join(parts)});")
    for src, tgt, con, dfn in fks:
        out.append(f"ALTER TABLE public.{src} ADD CONSTRAINT {con} {dfn};")
    return "\n".join(out), len(fks), len(tables)


BASE = f"""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
-- dependências do catalog_tenant_actor LIVE (o corpo real é carregado entre as 104 funções); stubs sintéticos:
CREATE TYPE public.app_role AS ENUM ('administrador','gestor','cliente');
CREATE TABLE platform_private.members(user_id uuid, org uuid, mutate boolean, sa boolean DEFAULT false);
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT org FROM platform_private.members WHERE user_id=auth.uid() $$;
CREATE FUNCTION public.is_platform_superadmin(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT coalesce((SELECT sa FROM platform_private.members WHERE user_id=u),false) $$;
CREATE FUNCTION public._saas_user_has_feature(u uuid, f text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT true $$;
CREATE FUNCTION platform_private.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT coalesce((SELECT mutate FROM platform_private.members WHERE user_id=u),false) AND r IN ('administrador','gestor') $$;
CREATE FUNCTION public.can_view_catalog_internal(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS (SELECT 1 FROM platform_private.members WHERE user_id=u) $$;
"""
AFTER = f"""
CREATE TABLE public.partner_financial_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid, auto_generate_receivable boolean);
CREATE TABLE public.company_fiscal_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, nfe_enabled boolean, nfse_enabled boolean, production_enabled boolean);
CREATE TABLE public.fiscal_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, invoice_type text);
CREATE TABLE public.fiscal_invoice_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fiscal_invoice_id uuid REFERENCES public.fiscal_invoices(id),
  source_item_type text, source_item_id uuid, fiscal_profile_snapshot jsonb);
CREATE FUNCTION public.fii_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fiscal_item_immutable'; END $$;
CREATE TRIGGER a00_fii_immutable BEFORE UPDATE ON public.fiscal_invoice_items FOR EACH ROW EXECUTE FUNCTION public.fii_immutable();
-- stub SINTÉTICO do guard de recebível (o corpo LIVE não está neste anexo): contém as duas barreiras de origem
CREATE FUNCTION public.generate_b2b_receivable_secure(p uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.partner_orders o WHERE o.id=p AND (o.internal_origin_snapshot IS NOT NULL
     OR o.c2_external_origin_snapshot->>'contract' = 'C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1')) THEN
    RAISE EXCEPTION 'receivable_blocked_origin'; END IF; END $$;
CREATE UNIQUE INDEX pfp_one_active ON public.product_fiscal_profiles(product_id) WHERE is_active;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY legado_leitura_global ON public.produtos FOR SELECT TO authenticated USING (true);
CREATE POLICY legado_escrita ON public.produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE FUNCTION public.poi_sealed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'partner_order_item_sealed'; END $$;
CREATE TRIGGER a10_poi_sealed BEFORE UPDATE ON public.partner_order_items FOR EACH ROW EXECUTE FUNCTION public.poi_sealed();
CREATE FUNCTION public.snap_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'snapshot_immutable'; END $$;
CREATE TRIGGER a00_snap_immutable BEFORE UPDATE OR DELETE ON public.microorganism_regulatory_publication_snapshots FOR EACH ROW EXECUTE FUNCTION public.snap_immutable();
CREATE FUNCTION public.lote_noop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER z_lote_disabled BEFORE UPDATE ON public.lotes FOR EACH ROW EXECUTE FUNCTION public.lote_noop();
ALTER TABLE public.lotes DISABLE TRIGGER z_lote_disabled;
"""
DATA = f"""
ALTER TABLE public.produtos ALTER COLUMN tipo SET DEFAULT 'inoculante';  -- só para semear fixtures; removido abaixo
INSERT INTO public.organizations(id,nome,ativo,status) VALUES ('{CF}','CultivoFarm',true,'ativa'),('{HOM}','Homolog',true,'onboarding'),
  ('{REFIL}','REFIL',true,'rascunho'),('{FSF}','FSF tenant',true,'ativa'),('{ARB}','AR Bio',true,'ativa');
INSERT INTO platform_private.members VALUES ('{UA}','{ARB}',true,false),('{UF}','{FSF}',true,false),('{UB2B}','{FSF}',false,false),
  ('{UREF}','{REFIL}',true,false),('{USA}',NULL,false,true);
INSERT INTO public.partner_accounts(id,commercial_owner_organization_id) VALUES ('{PF}','{ARB}');   -- parceiro FSF dentro da AR Bio
INSERT INTO public.partner_orders(id,partner_id) VALUES ('{ORD}','{PF}');
INSERT INTO public.clientes(id,organization_id) VALUES ('{CLIF}','{FSF}');
INSERT INTO public.fazendas(id,organization_id) VALUES ('{FAZF}','{FSF}');
INSERT INTO public.produtos(id,nome,codigo,valor_ha_brl) VALUES ('{P1}','Bio X','BX',100),('{P2}','Sem uso','SU',1),
  ('{P3}','Só FSF','SF',2),('{P4}','Insumo Y','IY',3),('{P5}','Base M1','BM',4);
INSERT INTO public.microrganismos(id,nome,product_id) VALUES ('{M1}','M1','{P5}'),('{M2}','M2 sem uso',NULL),('{M3}','M3',NULL);
INSERT INTO public.culturas(id,nome) VALUES ('{C1}','Soja'),('{C2}','Sem uso');
INSERT INTO public.talhoes(id,organization_id,fazenda_id,cultura_id) VALUES ('{TALF}','{FSF}','{FAZF}','{C1}'),('{TALA}','{ARB}',NULL,'{C1}');
INSERT INTO public.registros_consultor(id,talhao_id) VALUES ('{RC1}','{TALA}');
INSERT INTO public.visitas_campo(cliente_id,talhao_id,cultura_id,registro_consultor_id) VALUES (NULL,'{TALA}','{C1}','{RC1}');
INSERT INTO public.objetivos_visita_sugestoes(cultura_id,texto) VALUES ('{C1}','a'),('{C2}','b');
INSERT INTO public.partner_order_items(order_id,product_id,qty) VALUES ('{ORD}','{P1}',3);
INSERT INTO public.commercial_price_rules(partner_id,product_id) VALUES ('{PF}','{P1}');
INSERT INTO public.partner_product_prices(partner_id,product_id) VALUES ('{PF}','{P1}');
INSERT INTO public.lotes(id,organization_id,produto_id) VALUES ('{LOTF}','{FSF}','{P1}'),('{LOTA}','{ARB}',NULL);
UPDATE public.lotes SET microrganismo_id='{M1}' WHERE id='{LOTA}';
INSERT INTO public.estoque_produto(lote_id,produto_id) VALUES ('{LOTF}','{P1}');
INSERT INTO public.estoque_produto(lote_id,produto_id,reservado_para_cliente_id) VALUES ('{LOTA}','{P3}','{CLIF}');  -- lote ARB reservado a cliente FSF
INSERT INTO public.entregas(organization_id,produto_id) VALUES ('{FSF}','{P3}');
INSERT INTO public.entregas(organization_id,produto_id) VALUES (NULL,'{P3}');            -- sem tenant derivável: anulado
INSERT INTO public.ordens_servico_onfarm(cliente_id,produto_id) VALUES ('{CLIF}','{P3}');
INSERT INTO public.ordens_servico(organization_id,microrganismo_id) VALUES ('{FSF}','{M3}');
INSERT INTO public.product_fiscal_profiles(product_id,is_active,ncm) VALUES ('{P1}',true,'31010000');
INSERT INTO public.formulacoes(produto_id,microrganismo_id,component_insumo_id) VALUES ('{P1}','{M3}','{P4}');
INSERT INTO public.produto_composicao_conjuntos(produto_id) VALUES ('{P1}');
INSERT INTO public.produto_composicao_declaracoes(produto_id,microrganismo_id) VALUES ('{P1}','{M3}');
INSERT INTO public.catalogo_volumes(id,produto_id) VALUES ('{V1}','{P1}');
INSERT INTO public.microorganism_regulatory_dossiers(id,microorganism_id) VALUES ('{D1}','{M1}');
INSERT INTO public.microorganism_regulatory_presentations(dossier_id,catalog_volume_id) VALUES ('{D1}','{V1}');
INSERT INTO public.microorganism_regulatory_publication_snapshots(dossier_id,microorganism_id,payload) VALUES ('{D1}','{M1}','{{"v":1}}');
INSERT INTO public.partner_orders(id,partner_id,internal_origin_snapshot,c2_external_origin_snapshot)
  SELECT gen_random_uuid(),'{PF}', CASE WHEN g<=4 THEN '{{"origin":"internal"}}'::jsonb END,
         CASE WHEN g>4 THEN '{{"contract":"C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1"}}'::jsonb END FROM generate_series(1,7) g;
INSERT INTO public.partner_financial_settings(partner_id,auto_generate_receivable) VALUES ('{PF}',true),('{PF}',true),('{PF}',true),('{PF}',false);
INSERT INTO public.company_fiscal_settings(organization_id,nfe_enabled,nfse_enabled,production_enabled) VALUES ('{ARB}',false,false,false);
INSERT INTO public.fiscal_invoices(id,organization_id,invoice_type) VALUES ('{U(51)}','{ARB}','NFE'),('{U(52)}','{ARB}','NFSE'),('{U(53)}','{FSF}','NFE');
INSERT INTO public.fiscal_invoice_items(fiscal_invoice_id,source_item_type,source_item_id,fiscal_profile_snapshot) VALUES
  ('{U(51)}','produto','{P1}','{{"ncm":"31010000"}}'),('{U(52)}','servico','{U(59)}','{{}}'),('{U(53)}','produto','{P3}','{{"ncm":"31010000"}}');
INSERT INTO public.commercial_campaign_products(product_id) VALUES ('{P2}');          -- campanha sem tenant: descartada
INSERT INTO public.catalog_tenant_visibility(organization_id,produto_id) VALUES ('{ARB}','{P1}');
ALTER TABLE public.produtos ALTER COLUMN tipo DROP DEFAULT;
"""


FNJSON = ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/live-input-20261101-1516/catalogo-exclusivo-input.json"


def load_live_functions(pg):
    """Carrega os 104 corpos LIVE capturados (byte-exatos) com check_function_bodies=off; devolve falhas."""
    fails = []
    for f in json.loads(FNJSON.read_text())["functions"]:
        r = pg.sql("SET check_function_bodies=off;\n" + f["definition"] + "\n;", ok=False)
        if r.startswith("ERR"): fails.append((f["signature"], r[:200]))
    return fails


EXTRA25 = json.loads((ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/live-input-20261101-1516/extra-global-25.json").read_text())


CONSOL = json.loads((ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/consolidado-20261101-1534/consolidado-catalogo-20261101.json").read_text())
WRAPPERS25 = {w["signature"]: w for w in CONSOL["files"]["wrappers-globais-adicionais.json"]}


def load_extra25_stubs(pg):
    """Pacote consolidado trouxe os 25 corpos LIVE completos: carregados verbatim (check_function_bodies=off).
    Devolve {md5_live: md5_local} SOMENTE para os que não reproduzirem o md5 capturado (registrados como stub)."""
    sub = {}; LOADED.clear()
    for e in EXTRA25:
        sig = e["signature"]; name, args = sig.split("(", 1); args = args[:-1]
        fq = name if "." in name else "public." + name
        w = WRAPPERS25.get(sig)
        r = pg.sql("SET check_function_bodies=off;\n" + w["definition"] + "\n;", ok=False) if w else "ERR:missing"
        if r.startswith("ERR"):
            al = ", ".join(f"a{i} {t}" for i, t in enumerate(args.split(","))) if args else ""
            pg.sql(f"CREATE FUNCTION {fq}({al}) RETURNS void LANGUAGE sql AS 'SELECT NULL';"); LOADED.append((sig, "stub", r[:160]))
        else:
            LOADED.append((sig, "live", ""))
        got = pg.sql(f"SELECT md5(pg_get_functiondef('{fq}({args})'::regprocedure));")
        if got != e["md5"]: sub[e["md5"]] = got
    return sub


LOADED = []


def as_user(uid, role="authenticated"):
    claims = json.dumps(dict(role=role, sub=uid or "", exp=4102444800)) if uid else ""
    return f"SET ROLE {role}; SET test.uid='{uid or ''}'; SET request.jwt.claims='{claims}';\n"
def val(r): return r.splitlines()[-1] if r and not r.startswith("ERR") else r


def main():
    pre = (PKG / (HOMOLOG_FILES[0] if HOMOLOG_FILES else "00-pre-global.sql.review")).read_text()
    mig = (PKG / (HOMOLOG_FILES[1] if HOMOLOG_FILES else "01-migrate.sql.review")).read_text()
    pre_do = pre[pre.index("DO $pre$"):pre.index("$pre$;", pre.index("DO $pre$") + 8) + 6]
    ddl, nfk, ntab = schema()
    pg = PG()
    try:
        pg.sql(BASE); pg.sql(ddl); pg.sql(AFTER)
        ff = load_live_functions(pg)
        (OUT / "live-function-load-failures.json").write_text(json.dumps(ff, indent=1))
        check("SCH-2", "104 funções LIVE carregadas byte-exatas", 0, len(ff), kind="PG_DISPOSABLE_LIVE_FUNCTION_BODIES")
        sub = load_extra25_stubs(pg)
        pg.sql(DATA)
        r = pg.sql(pre, ok=False)
        check("PRE-9", "25 wrappers globais carregados com corpos LIVE e md5 capturado reproduzido (sem stub, sem drift)", "25|0|0",
              f"{sum(1 for x in LOADED if x[1]=='live')}|{len(sub)}|{r.count('fn_drift:')}", kind="PG_DISPOSABLE_LIVE_FUNCTION_BODIES")
        for a, b in sub.items(): pre = pre.replace(a, b); mig = mig.replace(a, b)   # SUBSTITUIÇÃO SINTÉTICA só no harness
        pre_do = pre[pre.index("DO $pre$"):pre.index("$pre$;", pre.index("DO $pre$") + 8) + 6]
        w0 = CONSOL["files"]["wrappers-globais-adicionais.json"][0]
        r = pg.sql("BEGIN; SET check_function_bodies=off;\n" + w0["definition"].replace("$function$", "$function$ ", 1).replace("BEGIN", "BEGIN -- drift\n", 1) + "\n;\n" + pre_do + "\nROLLBACK;", ok=False)
        check("PRE-9b", "wrapper global alterado (drift real de corpo): PRE aborta", True, "fn_drift:" in r)
        check("SCH-1", "esquema descartável carrega as 151 FKs reais com definições exatas", "151",
              pg.sql("SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid::regclass::text NOT LIKE 'platform_private.%' AND conrelid::regclass::text <> 'fiscal_invoice_items'" + (" AND conname NOT IN (" + ",".join("'" + n + "'" for n in EXTRA_FK_NAMES) + ")" if EXTRA_FK_NAMES else "")),
              kind="PG_DISPOSABLE_REAL_FK_DEFS")
        q = lambda s: pg.sql("RESET ROLE;\n" + s)
        # Estado hospedado real (02/11): 04 aplicado em homolog e produção. RED: ACL pré-04 -> PRE aborta;
        # GREEN: 04 exato (mesmo arquivo pinado) -> PRE aprova. Nunca regrant.
        r = pg.sql(f"BEGIN; GRANT TRUNCATE ON public.partner_orders TO authenticated;\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-ACL-RED", "TRUNCATE de cliente aberto (estado pré-04) aborta o PRE", True, "client_destructive_acl_not_hardened:partner_orders:authenticated:TRUNCATE" in r)
        r04 = pg.sql((ROOT / "scripts/homolog-alignment-20261102/04-client-destructive-acl-hardening.sql.review").read_text(), ok=False)
        check("PRE-ACL-04", "04 revisado/aplicado reproduzido na linha de base", "OK", "OK" if not r04.startswith("ERR") else r04[-800:])
        if HOOK_BEFORE_PRE1: HOOK_BEFORE_PRE1(pg, pre_do, (PKG / "00-pre-global.sql.review").read_text())
        r = pg.sql(pre, ok=False); check("PRE-1", "PRE aprova estado com FKs reais (READ ONLY)", "OK", "OK" if not r.startswith("ERR") else r[-800:])
        r = pg.sql(f"BEGIN; CREATE TABLE public.zz(p uuid REFERENCES public.culturas(id));\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-2", "FK real nova para raiz (culturas) não mapeada aborta", True, "fk_unmapped:zz.p" in r)
        r = pg.sql(f"BEGIN; ALTER TABLE public.formulacoes DROP CONSTRAINT formulacoes_component_insumo_id_fkey;\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-3", "FK esperada ausente (drift) aborta", True, "fk_missing:formulacoes.component_insumo_id" in r)
        r = pg.sql(f"BEGIN; ALTER TABLE public.clientes RENAME COLUMN organization_id TO organization_id_renamed;\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-4", "coluna de pai usada na derivação ausente aborta", True, "dep_column_missing:clientes.organization_id" in r)
        r = pg.sql(f"BEGIN; ALTER TABLE public.culturas ADD COLUMN owner_organization_id uuid;\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-5", "instalação parcial em qualquer raiz detectada", True, "partial:public.culturas.owner_organization_id" in r)
        r = pg.sql(f"BEGIN; CREATE UNIQUE INDEX mx ON public.microrganismos(lower(nome));\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-6", "índice único não pinado (expressão) em raiz aborta", True, "unique_index_drift:unexpected" in r)
        r = pg.sql(f"BEGIN; ALTER TABLE public.produto_composicao_declaracoes DROP CONSTRAINT produto_composicao_declaracoes_produto_id_fkey;\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-7", "FK de 2º nível (declaração->conjunto) exigida", True, "fk_missing:produto_composicao_declaracoes.produto_id->produto_composicao_conjuntos" in r)
        r = pg.sql(f"BEGIN; ALTER FUNCTION public.fn_catalogo_sync_mestre_preco(uuid,uuid) SET work_mem='1MB';\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-8", "drift de corpo em função consumidora capturada aborta", True, "fn_drift:fn_catalogo_sync_mestre_preco" in r)
        r = pg.sql(f"BEGIN; INSERT INTO public.entregas(organization_id,lote_id,produto_id) VALUES ('{ARB}','{LOTF}','{P1}');\n" + mig.replace("BEGIN;", "", 1).replace("COMMIT;", "") + "\nROLLBACK;", ok=False)
        check("DIV-1", "cadeias de tenant divergentes (entrega ARB x lote FSF): aborta, sem COALESCE", True, "tenant_catalog_chain_divergence" in r)
        r = pg.sql(f"BEGIN; INSERT INTO public.ordens_servico(id) VALUES ('4a5af44d-ea5a-4810-8b99-ea601fad8547');\n{pre_do}\nROLLBACK;", ok=False)
        check("CHN-1", "cadeia sem empresa ainda presente: migração aborta (manutenção 02 é pré-requisito)", True, "chain_not_purged_run_maintenance_02:ordens_servico" in r)
        r = pg.sql(f"BEGIN; UPDATE public.company_fiscal_settings SET nfe_enabled=true;\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-10", "fiscal ligado aborta PRE", True, "fiscal_enabled" in r)
        r = pg.sql(f"BEGIN; DROP FUNCTION public.generate_b2b_receivable_secure(uuid);\n{pre_do}\nROLLBACK;", ok=False)
        check("PRE-11", "guard de origem do recebível ausente aborta PRE", True, "receivable_origin_guard_missing" in r)
        inj = mig.replace("CREATE TEMP TABLE tc_guard_post", "UPDATE public.partner_orders SET receivable_generated=true WHERE c2_external_origin_snapshot IS NOT NULL;\nCREATE TEMP TABLE tc_guard_post", 1)
        r = pg.sql(inj, ok=False)
        check("POST-1", "injeção de falha: recebível marcado durante a migração aborta no POST", True, "post:receivable_or_fiscal_guard_changed" in r)
        # negativo: regra órfã referenciada por snapshot de pedido não pode ser descartada
        pg.sql(f"INSERT INTO public.commercial_price_rules(id,product_id) VALUES ('{RULE_ORPHAN}','{P1}');"
               f"ALTER TABLE public.partner_order_items DISABLE TRIGGER a10_poi_sealed;"
               f"UPDATE public.partner_order_items SET price_rule_id_snapshot='{RULE_ORPHAN}';"
               f"ALTER TABLE public.partner_order_items ENABLE TRIGGER a10_poi_sealed;")
        r = pg.sql(mig, ok=False)
        check("MIG-0", "regra sem tenant referenciada por snapshot de pedido: aborta (não descarta)", True, "tenant_catalog_discard_blocked" in r)
        check("MIG-0b", "aborto não deixa coluna/mapa (transação única)", "0|false",
              q("SELECT (SELECT count(*) FROM pg_attribute WHERE attrelid='public.produtos'::regclass AND attname='owner_organization_id')||'|'||(to_regclass('platform_private.tenant_catalog_map') IS NOT NULL)"))
        pg.sql(f"ALTER TABLE public.partner_order_items DISABLE TRIGGER a10_poi_sealed; UPDATE public.partner_order_items SET price_rule_id_snapshot=NULL;"
               f"ALTER TABLE public.partner_order_items ENABLE TRIGGER a10_poi_sealed;")
        aq = "SELECT count(*) FROM unnest(ARRAY['partner_orders','partner_order_items','microorganism_fiscal_profiles','product_fiscal_profiles','produto_conformidade_perfis']) t, unnest(ARRAY['anon','authenticated']) rl WHERE to_regclass('public.'||t) IS NOT NULL AND has_table_privilege(rl,'public.'||t,'TRUNCATE')"
        nq = "SELECT count(*) FROM unnest(ARRAY['partner_orders','partner_order_items','microorganism_fiscal_profiles','product_fiscal_profiles','produto_conformidade_perfis']) t WHERE to_regclass('public.'||t) IS NOT NULL"
        q(f"DO $g$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['partner_orders','partner_order_items','microorganism_fiscal_profiles','product_fiscal_profiles','produto_conformidade_perfis'] LOOP IF to_regclass('public.'||t) IS NOT NULL THEN EXECUTE format('GRANT TRUNCATE, TRIGGER, REFERENCES ON public.%I TO anon, authenticated', t); END IF; END LOOP; END $g$;")
        n5 = q(nq); check("ACL-RED", "RED: pais de pedido/perfis fiscais com TRUNCATE para anon/authenticated (estado capturado de produção)", str(2*int(n5)), q(aq))
        r = pg.sql(mig, ok=False)
        check("ACL-MIG-RED", "migração com destrutiva de cliente reaberta aborta no PRE embutido (exige estado pós-04, não fecha silenciosamente)", True,
              "client_destructive_acl_not_hardened:partner_orders" in r)
        r04 = pg.sql((ROOT / "scripts/homolog-alignment-20261102/04-client-destructive-acl-hardening.sql.review").read_text(), ok=False)
        check("ACL-MIG-04", "04 reaplicado localmente restaura o estado endurecido (CRUD preservado)", "OK", "OK" if not r04.startswith("ERR") else r04[-800:])
        r = pg.sql(mig, ok=False); check("MIG-1", "migração transacional completa (regra órfã não referenciada descartada)", "OK", "OK" if not r.startswith("ERR") else r[-1500:])
        if HOOK_AFTER_MIG1: HOOK_AFTER_MIG1(pg)
        check("ACL-GREEN", "GREEN: migração fecha TRUNCATE de cliente em pais de pedido/perfis fiscais; POST interno exige", "0|" + n5, q(aq) + "|" + q(nq))
        own = lambda tbl, col, where="TRUE", t2="produtos": q(f"SELECT string_agg(DISTINCT p.owner_organization_id::text, ',') FROM public.{tbl} x JOIN public.{t2} p ON p.id=x.{col} WHERE {where}")
        check("MIG-2", "produtos: ARB {P1,P3,P4,P5} + FSF {P1,P3,P4} = 7; sem global", "7|0",
              q("SELECT count(*)||'|'||count(*) FILTER (WHERE owner_organization_id IS NULL) FROM public.produtos"))
        check("MIG-3", "ARB tem 4 e FSF tem 3 produtos", f"{ARB}:4,{FSF}:3",
              q("SELECT string_agg(owner_organization_id||':'||n, ',' ORDER BY owner_organization_id::text) FROM (SELECT owner_organization_id, count(*) n FROM public.produtos GROUP BY 1) z"))
        check("MIG-4", "empresas sem uso (CultivoFarm/Homolog/REFIL) começam com catálogo vazio", "0",
              q(f"SELECT count(*) FROM public.produtos WHERE owner_organization_id IN ('{CF}','{HOM}','{REFIL}')"))
        check("MIG-5", "item do pedido do parceiro FSF -> cópia da AR Bio (vendedor), não do tenant FSF", ARB, own("partner_order_items", "product_id"))
        check("MIG-6", "lote/estoque do tenant FSF -> cópia FSF", f"{FSF}|{FSF}", own("lotes", "produto_id") + "|" + own("estoque_produto", "produto_id", "x.lote_id='" + LOTF + "'"))
        check("MIG-6b", "estoque do lote ARB reservado a cliente FSF -> dono do LOTE (ARB)", ARB,
              own("estoque_produto", "produto_id", "x.lote_id='" + LOTA + "'"))
        check("MIG-7", "P1 tem cópias distintas ARB e FSF", "2",
              q(f"SELECT count(DISTINCT new_id) FROM platform_private.tenant_catalog_map WHERE root='produtos' AND old_id='{P1}'"))
        check("MIG-8", "componente/microrganismo da formulação no mesmo tenant do produto pai (2 cópias)", "2|0",
              q("SELECT count(*)||'|'||count(*) FILTER (WHERE a.owner_organization_id<>b.owner_organization_id OR a.owner_organization_id<>m.owner_organization_id) FROM public.formulacoes f JOIN public.produtos a ON a.id=f.produto_id JOIN public.produtos b ON b.id=f.component_insumo_id JOIN public.microrganismos m ON m.id=f.microrganismo_id"))
        check("MIG-9", "microrganismo M1 (lote ARB) copiado para ARB com product_id -> cópia ARB de P5", "1|0",
              q("SELECT count(*)||'|'||count(*) FILTER (WHERE m.owner_organization_id<>p.owner_organization_id) FROM public.microrganismos m JOIN public.produtos p ON p.id=m.product_id"))
        check("MIG-10", "microrganismos: ARB {M1,M3} + FSF {M3}; M2 sem uso removido", "3",
              q("SELECT count(*) FROM public.microrganismos"))
        check("MIG-11", "culturas: C1 em ARB e FSF; C2 sem uso removida", "2", q("SELECT count(*) FROM public.culturas"))
        check("MIG-12", "sugestões de visita seguem a cultura por tenant (C1×2; C2 removida)", "2", q("SELECT count(*) FROM public.objetivos_visita_sugestoes"))
        check("MIG-13", "talhão FSF/ARB -> cultura do próprio tenant", "0",
              q("SELECT count(*) FROM public.talhoes t JOIN public.culturas c ON c.id=t.cultura_id WHERE c.owner_organization_id<>t.organization_id"))
        check("MIG-14", "visita derivada pelo talhão ARB -> cultura ARB", ARB, own("visitas_campo", "cultura_id", t2="culturas"))
        check("MIG-15", "declaração de composição (FK 2º nível) copiada junto do conjunto por tenant", "2|2",
              q("SELECT (SELECT count(*) FROM public.produto_composicao_conjuntos)||'|'||(SELECT count(*) FROM public.produto_composicao_declaracoes)"))
        check("MIG-16", "dossiê/snapshot/apresentação do M1 copiados para ARB; apresentação -> volume ARB", "1|1|1|" + ARB,
              q("SELECT (SELECT count(*) FROM public.microorganism_regulatory_dossiers)||'|'||(SELECT count(*) FROM public.microorganism_regulatory_publication_snapshots)||'|'||(SELECT count(*) FROM public.microorganism_regulatory_presentations)||'|'||(SELECT p.owner_organization_id FROM public.microorganism_regulatory_presentations a JOIN public.catalogo_volumes v ON v.id=a.catalog_volume_id JOIN public.produtos p ON p.id=v.produto_id)"))
        check("MIG-17", "entrega sem tenant derivável: vínculo anulado e registrado (sem tenant inventado)", "1|1",
              q("SELECT (SELECT count(*) FROM public.entregas WHERE produto_id IS NULL)||'|'||(SELECT count(*) FROM platform_private.tenant_catalog_migration_ledger WHERE step='unresolved_nullified' AND detail->>'table'='entregas')"))
        check("MIG-18", "campanha e regra sem tenant descartadas com snapshot", "0|0|2",
              q("SELECT (SELECT count(*) FROM public.commercial_campaign_products)||'|'||(SELECT count(*) FROM public.commercial_price_rules WHERE partner_id IS NULL)||'|'||(SELECT count(*) FROM platform_private.tenant_catalog_migration_ledger WHERE step='unresolved_discarded' AND jsonb_array_length(detail->'rows')>0)"))
        check("MIG-19", "triggers restaurados exatamente (selado O, snapshot O, desligado D)", "O|O|D",
              q("SELECT (SELECT tgenabled FROM pg_trigger WHERE tgname='a10_poi_sealed')::text||'|'||(SELECT tgenabled FROM pg_trigger WHERE tgname='a00_snap_immutable')::text||'|'||(SELECT tgenabled FROM pg_trigger WHERE tgname='z_lote_disabled')::text"))
        r = pg.sql("UPDATE public.partner_order_items SET qty=4;", ok=False)
        check("MIG-20", "imutabilidade do item selado volta a valer", True, "partner_order_item_sealed" in r)
        check("MIG-21", "códigos únicos por tenant (BX em ARB e FSF)", "2", q("SELECT count(*) FROM public.produtos WHERE codigo='BX'"))
        check("MIG-22", "ownership NOT NULL nas 3 raízes", "NO,NO,NO", q("SELECT string_agg(is_nullable, ',') FROM information_schema.columns WHERE column_name='owner_organization_id' AND table_name IN ('produtos','microrganismos','culturas')"))
        check("MIG-23", "nenhuma FK repontada usou UPDATE genérico por organization_id (sem coluna no item de pedido)", "0",
              q("SELECT count(*) FROM information_schema.columns WHERE table_name='partner_order_items' AND column_name='organization_id'"))
        check("OWN-1", "formulações/volumes: dono explícito NOT NULL e igual ao dono do produto/micro", "0|0",
              q("SELECT (SELECT count(*) FROM public.formulacoes f LEFT JOIN public.produtos p ON p.id=f.produto_id WHERE f.owner_organization_id IS NULL OR (f.produto_id IS NOT NULL AND p.owner_organization_id IS DISTINCT FROM f.owner_organization_id))"
                "||'|'||(SELECT count(*) FROM public.catalogo_volumes v LEFT JOIN public.produtos p ON p.id=v.produto_id WHERE v.owner_organization_id IS NULL OR (v.produto_id IS NOT NULL AND p.owner_organization_id IS DISTINCT FROM v.owner_organization_id))"))
        r = pg.sql(f"INSERT INTO public.catalogo_volumes(produto_id, owner_organization_id) SELECT id, '{FSF}' FROM public.produtos WHERE owner_organization_id='{ARB}' LIMIT 1;", ok=False)
        check("OWN-2", "volume com produto de outra empresa negado (mesmo como owner do banco)", True, "tenant_catalog_cross_tenant_reference" in r)
        r = pg.sql(f"UPDATE public.formulacoes SET owner_organization_id='{FSF}' WHERE owner_organization_id='{ARB}';", ok=False)
        check("OWN-3", "dono de formulação imutável", True, "tenant_catalog_owner_immutable" in r or "cross_tenant" in r)
        check("OWN-4", "microrganismos.product_id não anulado: vínculos apontam para produto do mesmo dono", "0",
              q("SELECT count(*) FROM public.microrganismos m JOIN public.produtos p ON p.id=m.product_id WHERE p.owner_organization_id<>m.owner_organization_id"))
        check("MIG-25", "item NF-e ARB -> cópia ARB do produto (sem FK; tenant = emitente)", ARB,
              own("fiscal_invoice_items", "source_item_id", "x.fiscal_invoice_id='" + U(51) + "'"))
        check("MIG-26", "item NFS-e (serviço) intacto", U(59), q(f"SELECT source_item_id FROM public.fiscal_invoice_items WHERE fiscal_invoice_id='{U(52)}'"))
        check("MIG-27", "item NF-e FSF -> cópia FSF", FSF, own("fiscal_invoice_items", "source_item_id", "x.fiscal_invoice_id='" + U(53) + "'"))
        check("MIG-28", "snapshot fiscal JSON (chaves whitelist, sem id de catálogo) inalterado", '{"ncm": "31010000"}',
              q(f"SELECT fiscal_profile_snapshot::text FROM public.fiscal_invoice_items WHERE fiscal_invoice_id='{U(51)}'"))
        check("MIG-29", "sem geração: 0 recebíveis, 0 pedidos gerados, 7 origens bloqueantes, 3 settings auto preservados", "0|0|7|3",
              q("SELECT (SELECT count(*) FROM public.accounts_receivable)||'|'||(SELECT count(*) FROM public.partner_orders WHERE receivable_generated)||'|'||(SELECT count(*) FROM public.partner_orders WHERE internal_origin_snapshot IS NOT NULL OR c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1')||'|'||(SELECT count(*) FROM public.partner_financial_settings WHERE auto_generate_receivable)"))
        check("MIG-30", "guard de recebível bloqueia pedido existente após migração", True,
              any(c in pg.sql(RECV_AS() + "SELECT public.generate_b2b_receivable_secure((SELECT id FROM public.partner_orders WHERE c2_external_origin_snapshot IS NOT NULL LIMIT 1));", ok=False) for c in RECV_CODES))
        check("ACL-12", "todas as sobrecargas globais (>=59) sem EXECUTE para authenticated/anon", "0",
              q("SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','platform_private') AND p.proname LIKE '%global%' AND p.proname NOT LIKE 'global_product_fiscal%' AND (has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE'))"))
        check("ACL-13", "funções globais presentes no teste", True, int(q("SELECT count(*) FROM pg_proc WHERE proname LIKE '%global%'")) >= 59)
        # acesso
        check("ACL-1", "admin ARB vê só produtos da ARB", "4|0",
              val(pg.sql(as_user(UA) + f"SELECT count(*)||'|'||count(*) FILTER (WHERE owner_organization_id<>'{ARB}') FROM public.produtos;")))
        check("ACL-2", "usuário FSF (inclusive comprador B2B) não lê catálogo ARB", "0",
              val(pg.sql(as_user(UB2B) + f"SELECT count(*) FROM public.produtos WHERE owner_organization_id='{ARB}';")))
        check("ACL-3", "Superadmin sem tenant: zero linhas (sem bypass global)", "0|0|0",
              val(pg.sql(as_user(USA) + "SELECT (SELECT count(*) FROM public.produtos)||'|'||(SELECT count(*) FROM public.microrganismos)||'|'||(SELECT count(*) FROM public.culturas);")))
        r = pg.sql(as_user(None, "anon") + "SELECT count(*) FROM public.produtos;", ok=False); check("ACL-4", "anon negado em produtos", True, "permission denied" in r)
        r = pg.sql(as_user(None, "anon") + "SELECT count(*) FROM public.microrganismos;", ok=False); check("ACL-4b", "anon negado em microrganismos", True, "permission denied" in r)
        r = pg.sql(as_user(UA) + f"INSERT INTO public.produtos(id,nome,owner_organization_id) VALUES (gen_random_uuid(),'Direto','{ARB}');", ok=False)
        check("ACL-5", "escrita direta em produtos negada (só RPC)", True, "permission denied" in r)
        r = pg.sql(as_user(UA) + "SELECT public.platform_create_global_product('{}'::jsonb,NULL::text,NULL::uuid);", ok=False)
        check("ACL-6", "escritor do catálogo global fechado no servidor", True, "permission denied" in r)
        check("ACL-7", "perfil fiscal (descendente) restrito ao tenant", "1", val(pg.sql(as_user(UA) + "SELECT count(*) FROM public.product_fiscal_profiles;")))
        if ACL8_RPC:   # v2.8: escrita direta das raízes auxiliares fechada; o escritor é o RPC por empresa
            check("ACL-8", "microrganismo: escritor (RPC) cria no PRÓPRIO tenant (dono derivado no servidor)", ARB,
                  val(pg.sql(as_user(UA) + "SELECT public.tenant_catalog_root_save('microrganismos', NULL, '{\"nome\":\"Novo M\",\"tipo\":\"bacteria\"}'::jsonb, NULL, gen_random_uuid())->>'organization_id';")))
        else:
            check("ACL-8", "microrganismo: escritor existente cria no PRÓPRIO tenant (dono derivado no servidor)", ARB,
                  val(pg.sql(as_user(UA) + "INSERT INTO public.microrganismos(nome) VALUES ('Novo M') RETURNING owner_organization_id;")))
        r = pg.sql(as_user(UA) + f"INSERT INTO public.microrganismos(nome,owner_organization_id) VALUES ('Hack','{FSF}');", ok=False)
        check("ACL-9", "microrganismo com tenant alheio negado", True, "row-level security" in r or (ACL8_RPC and "permission denied" in r))
        r = save(UREF, "NULL", {"nome": "Refil 1"}, "NULL", K(14)) if False else None
        check("ACL-10", "REFIL (empresa nova) vê catálogo vazio", "0|0|0",
              val(pg.sql(as_user(UREF) + "SELECT (SELECT count(*) FROM public.produtos)||'|'||(SELECT count(*) FROM public.microrganismos)||'|'||(SELECT count(*) FROM public.culturas);")))
        check("ACL-11", "apresentação regulatória visível só ao dono do dossiê", "1|0",
              val(pg.sql(as_user(UA) + "SELECT count(*) FROM public.microorganism_regulatory_presentations;")) + "|" +
              val(pg.sql(as_user(UF) + "SELECT count(*) FROM public.microorganism_regulatory_presentations;")))
        # RPC
        def save(uid, pid, payload, exp, key):
            payload = dict(payload)
            if pid == "NULL" and "tipo" not in payload and not payload.pop("_raw", False): payload["tipo"] = "inoculante"
            payload.pop("_raw", None)
            return pg.sql(as_user(uid) + f"SELECT public.tenant_product_save({pid},'{json.dumps(payload)}'::jsonb,{exp},'{key}')::text;", ok=False)
        K = lambda n: f"00000000-0000-0000-0000-{n + 5000:012d}"
        r = save(UA, "NULL", {"nome": "Novo Bio", "valor_ha_brl": 10}, "NULL", K(1)); check("RPC-1", "admin ARB cria produto próprio", True, '"replayed": false' in r)
        pa = json.loads(val(r))
        r = save(UF, "NULL", {"nome": "Novo Bio"}, "NULL", K(2)); check("RPC-2", "mesmo nome em outro tenant permitido", True, '"replayed": false' in r)
        r = save(UA, "NULL", {"nome": "novo bio "}, "NULL", K(3)); check("RPC-3", "duplicado normalizado no mesmo tenant negado", True, "tenant_product_duplicate_name" in r)
        r = save(UA, "NULL", {"nome": "Novo Bio", "valor_ha_brl": 10}, "NULL", K(1)); check("RPC-4", "replay mesma chave devolve recibo", True, '"replayed": true' in r)
        r = save(UA, "NULL", {"nome": "Outro"}, "NULL", K(1)); check("RPC-5", "mesma chave, payload diferente negado", True, "idempotency_conflict" in r)
        r = save(UF, f"'{pa['product_id']}'", {"nome": "Hack"}, f"'{pa['updated_at']}'", K(4)); check("RPC-6", "outro tenant não altera", True, "tenant_product_not_found" in r)
        r = save(UA, f"'{pa['product_id']}'", {"nome": "X2"}, "'2000-01-01T00:00:00Z'", K(5)); check("RPC-7", "CAS obsoleto => PT409", True, "version_conflict" in r)
        r = save(UA, f"'{pa['product_id']}'", {"nome": "X2"}, "NULL", K(6)); check("RPC-8", "CAS ausente negado", True, "cas_required" in r)
        r = save(UA, "NULL", {"nome": "Z", "owner_organization_id": FSF}, "NULL", K(7)); check("RPC-9", "tenant no payload proibido", True, "field_forbidden" in r)
        r = save(UA, "NULL", {"nome": "Neg", "valor_ha_brl": -1}, "NULL", K(8)); check("RPC-10", "valor negativo negado", True, "out_of_range" in r)
        r = save(UA, f"'{pa['product_id']}'", {"descricao": "ok"}, f"'{pa['updated_at']}'", K(9)); check("RPC-11", "edição com CAS correto", True, '"replayed": false' in r)
        up = json.loads(val(r))
        # revisão independente f588e1d8 (#2/#3): tipos reais da coluna
        r = save(UA, "NULL", {"nome": "Sem B2B", "tipo": "fungicida"}, "NULL", K(20))
        check("TYP-1", "criação com enum real tipo_produto (sem 42804)", True, '"replayed": false' in r)
        check("TYP-2", "b2b_enabled omitido = false (default LIVE true não libera B2B)", "fungicida|false",
              val(pg.sql(f"SELECT tipo||'|'||b2b_enabled FROM public.produtos WHERE id='{json.loads(val(r))['product_id']}';")) if '"replayed"' in r else r)
        r = save(UA, "NULL", {"nome": "Enum Ruim", "tipo": "INVALID"}, "NULL", K(21)); check("TYP-3", "enum inválido recusado (22P02)", True, "invalid input value for enum" in r)
        r = save(UA, "NULL", {"nome": "Sem tipo", "_raw": True}, "NULL", K(22)); check("TYP-4", "criação sem tipo recusada antes do INSERT", True, "tenant_product_tipo_required" in r)
        r = save(UA, "NULL", {"nome": "B2B nulo", "b2b_enabled": None}, "NULL", K(23)); check("TYP-5", "b2b_enabled null recusado (sem 23502)", True, "boolean_invalid:b2b_enabled" in r)
        r = save(UA, "NULL", {"nome": "Com B2B", "b2b_enabled": True}, "NULL", K(24)); check("TYP-6", "b2b_enabled true explícito aceito", True, '"replayed": false' in r)
        r = save(UA, f"'{pa['product_id']}'", {"tipo": "solo"}, f"'{up['updated_at']}'", K(25)); check("TYP-7", "UPDATE CASE com enum tipado", True, '"replayed": false' in r)
        up = json.loads(val(r)) if '"replayed"' in r else up
        r = pg.sql(as_user(UA) + f"SELECT public.tenant_product_set_archived('{pa['product_id']}',true,'{up['updated_at']}','{K(10)}')::text;", ok=False)
        check("RPC-12", "arquivamento com CAS", True, '"ativo": false' in r)
        check("RPC-13", "lista padrão oculta arquivados (+2 TYP)", "6", val(pg.sql(as_user(UA) + "SELECT count(*) FROM public.tenant_product_list();")))
        check("RPC-14", "lista com arquivados (+2 TYP)", "7", val(pg.sql(as_user(UA) + "SELECT count(*) FROM public.tenant_product_list(true);")))
        r = save(USA, "NULL", {"nome": "SA"}, "NULL", K(11)); check("RPC-15", "Superadmin negado pelo ator LIVE (sem bypass)", True, "catalog_visibility_platform_actor_denied" in r)
        r = save(UB2B, "NULL", {"nome": "B2B"}, "NULL", K(12)); check("RPC-16", "membro sem papel gestor/admin negado pelo ator LIVE", True, "catalog_visibility_role_denied" in r)
        r = pg.sql(as_user(None, "anon") + f"SELECT public.tenant_product_save(NULL,'{{}}',NULL,'{K(13)}');", ok=False); check("RPC-17", "anon sem EXECUTE", True, "permission denied" in r)
        r = pg.sql(f"RESET ROLE; UPDATE public.produtos SET owner_organization_id='{FSF}' WHERE owner_organization_id='{ARB}';", ok=False)
        check("RPC-18", "dono imutável (produtos)", True, "tenant_catalog_owner_immutable" in r)
        r = pg.sql(f"RESET ROLE; UPDATE public.culturas SET owner_organization_id='{FSF}' WHERE owner_organization_id='{ARB}';", ok=False)
        check("RPC-18b", "dono imutável (culturas)", True, "tenant_catalog_owner_immutable" in r)
        r = pg.sql("RESET ROLE; DELETE FROM public.tenant_product_audit;", ok=False); check("RPC-19", "auditoria imutável", True, "tenant_product_audit_immutable" in r)
        check("RPC-20", "auditoria registra create/update/archive", "archive,create,update",
              q("SELECT string_agg(DISTINCT action, ',' ORDER BY action) FROM public.tenant_product_audit"))
        # revisão 02/11: políticas separadas — leitura (read_catalog) NUNCA autoriza escrita; escrita = ator canônico 'mutate'
        q("GRANT SELECT, INSERT, UPDATE, DELETE ON public.culturas, public.microrganismos TO authenticated;")
        for root in ("culturas", "microrganismos"):
            nown = val(pg.sql(as_user(UB2B) + f"SELECT count(*) FROM public.{root};"))
            check(f"POL-{root}-1", f"{root}: leitor (sem papel admin/gestor) lê o próprio tenant", True, nown.isdigit() and int(nown) >= 0)
            kc, kv = rc(root)
            r = pg.sql(as_user(UB2B) + f"INSERT INTO public.{root}(id{kc}) VALUES (gen_random_uuid(){kv});", ok=False)
            check(f"POL-{root}-2", f"{root}: leitor NÃO insere (RLS de escrita exige 'mutate')", True, "row-level security" in r)
            r = pg.sql(as_user(UB2B) + f"UPDATE public.{root} SET owner_organization_id=owner_organization_id RETURNING id;", ok=False)
            check(f"POL-{root}-3", f"{root}: leitor NÃO atualiza (0 linhas)", True, (not r.startswith("ERR")) and r.strip() == "" or "row-level security" in r)
            r = pg.sql(as_user(UB2B) + f"DELETE FROM public.{root} RETURNING id;", ok=False)
            check(f"POL-{root}-4", f"{root}: leitor NÃO exclui (0 linhas)", True, (not r.startswith("ERR")) and r.strip() == "")
            r = pg.sql(as_user(UF) + f"INSERT INTO public.{root}(id{kc}) VALUES (gen_random_uuid(){kv}) RETURNING owner_organization_id;", ok=False)
            check(f"POL-{root}-5", f"{root}: gestor FSF insere e dono é derivado do servidor (FSF)", FSF, val(r))
            r = pg.sql(as_user(UF) + f"INSERT INTO public.{root}(id, owner_organization_id{kc}) VALUES (gen_random_uuid(), '{ARB}'{kv});", ok=False)
            check(f"POL-{root}-6", f"{root}: gestor FSF não grava com dono AR Bio", True, "row-level security" in r)
            r = pg.sql(as_user(UF) + f"UPDATE public.{root} SET owner_organization_id=owner_organization_id WHERE owner_organization_id='{ARB}' RETURNING id;", ok=False)
            check(f"POL-{root}-7", f"{root}: gestor FSF não altera linhas AR Bio (invisíveis)", True, (not r.startswith("ERR")) and r.strip() == "")
            r = pg.sql(as_user(USA) + f"INSERT INTO public.{root}(id{kc}) VALUES (gen_random_uuid(){kv});", ok=False)
            check(f"POL-{root}-8", f"{root}: Superadmin sem bypass", True, "row-level security" in r)
            r = pg.sql(as_user(None, "anon") + f"SELECT count(*) FROM public.{root};", ok=False)
            check(f"POL-{root}-9", f"{root}: anon sem acesso", True, "permission denied" in r)
        check("POL-10", "nenhuma policy FOR ALL nas raízes/descendentes do catálogo", "0",
              q("SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'tenant_catalog_%' AND cmd='ALL'"))
        # v2.6: escritoras reescritas (REWRITE_TENANT_WRITER)
        ma = q(f"SELECT id FROM public.microrganismos WHERE owner_organization_id='{ARB}' ORDER BY nome LIMIT 1")
        pa_ = q(f"SELECT id FROM public.produtos WHERE owner_organization_id='{ARB}' ORDER BY nome LIMIT 1")
        pf_ = q(f"SELECT id FROM public.produtos WHERE owner_organization_id='{FSF}' ORDER BY nome LIMIT 1")
        assoc = lambda u, m, pr: pg.sql(as_user(u) + f"SELECT id||'>'||coalesce(product_id::text,'NULL') FROM public.rpc_associate_microorganism_fiscal_product('{m}', {pr});", ok=False)
        check("WR-1", "associação: gestor AR Bio não liga micro AR Bio a produto FSF", True, "product_not_found" in assoc(UA, ma, f"'{pf_}'"))
        check("WR-2", "associação: gestor AR Bio liga micro e produto do próprio tenant", f"{ma}>{pa_}", val(assoc(UA, ma, f"'{pa_}'")))
        check("WR-3", "associação: gestor FSF não enxerga micro AR Bio", True, "not_found" in assoc(UF, ma, "NULL"))
        check("WR-4", "associação: leitor sem admin/gestor/financeiro negado pela autorização específica (decisão 02/11)", True, "catalog_fiscal_association_role_denied" in assoc(UB2B, ma, "NULL"))
        check("WR-5", "associação: Superadmin sem bypass", True, "catalog_visibility_platform_actor_denied" in assoc(USA, ma, "NULL"))
        check("WR-6", "associação: anon sem EXECUTE", True, "permission denied" in pg.sql(as_user(None, "anon") + f"SELECT * FROM public.rpc_associate_microorganism_fiscal_product('{ma}', NULL);", ok=False))
        q(f"SET session_replication_role=replica; INSERT INTO public.catalogo_volumes(id, produto_id, owner_organization_id) VALUES (gen_random_uuid(), '{pa_}', '{FSF}'); SET session_replication_role=origin;")
        r = pg.sql(f"RESET ROLE; SELECT public.fn_catalogo_sync_mestre_preco('{pa_}', NULL);", ok=False)
        check("WR-7", "sincronização de preço: volume de outro tenant ligado ao produto aborta (sem COALESCE)", True, "tenant_chain_divergence:catalogo_volumes" in r)
        if EXTRA_TESTS: EXTRA_TESTS(pg, q, check, as_user, val)
        r = pg.sql(mig, ok=False); check("MIG-24", "reexecução bloqueada pelo PRE", True, "partial:" in r)
    finally:
        pg.stop()
    s = dict(PASS=sum(c["status"] == "PASS" for c in checks), FAIL=sum(c["status"] == "FAIL" for c in checks), fks=nfk, tables=ntab)
    (OUT / "checks.json").write_text(json.dumps(checks, indent=1, ensure_ascii=False)); (OUT / "summary.json").write_text(json.dumps(s)); print(json.dumps(s))


if __name__ == "__main__":
    main()
