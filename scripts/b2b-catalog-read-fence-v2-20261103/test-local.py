#!/usr/bin/env python3
"""PG DESCARTÁVEL — catálogo B2B v2 (ramos exclusivos). Reproduz o GREEN FALSO do v1 (admin FSF com org_partner = parceiro
AR Bio lia o catálogo) e prova o v2 nas duas linhas de base: PRODUÇÃO (helpers ausentes) e HOMOLOG pós-rollback v1
(helpers com corpo deny).

Corpos REAIS: os 12 helpers canônicos (captura 02/11; auditor confirmou byte-idênticos prod/homolog), catálogo
b5684d35+delta v4 / 1391adc2, núcleos 60651fe8/fa5e890d com a cerca v4, catalog_tenant_actor 5e0ce9cc,
catalog_tenant_seller v4 e o pacote v1 (02-install / 04-rollback) exatamente como entregue.
COSTURAS SINTÉTICAS (declaradas): auth.uid/auth.jwt, platform_private.entitlements_for_user,
public.is_valid_b2b_partner_user e esquema mínimo das tabelas. Não é prova JWT/RLS hospedada."""
import hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
V1 = HERE.parent / "b2b-catalog-read-fence-20261103"
CAP = HERE / "captured"
def cap(name, md5):
    t = (CAP / name).read_text(); assert hashlib.md5(t.encode()).hexdigest() == md5, name; return t
CAT1 = cap("public.get_partner_catalog_secure.b5684d35.live-20261101.sql", "b5684d350603d1db77ab9f1db0f4b253")
CAT2 = cap("public.get_partner_catalog_secure.1391adc2.live-20261101.sql", "1391adc2133b922e2dcea4b1d3e26820")
B2B = cap("public.fn_b2b_resolve_base_unit_price.60651fe8.live-20261101.sql", "60651fe823452436d807b9b175c3865c")
CAN = cap("public.fn_catalogo_preco_canonico.fa5e890d.live-20261101.sql", "fa5e890dc647392efc238460ac16d6a2")
ACTOR = cap("platform_private.catalog_tenant_actor.5e0ce9cc.live-20261101.sql", "5e0ce9cc9122f1c21d76e29a13de8b59")
HELPERS = json.loads((CAP / "helpers-manifest.json").read_text())
HELPER_ORDER = ["platform_private.platform_actor_access_ready", "public.is_platform_superadmin", "platform_private.has_role", "public.has_role",
                "platform_private.h15_actor_organization", "public.h15_actor_organization", "public._saas_user_has_feature",
                "public.can_view_catalog_internal", "platform_private.b2b_actor_scope", "platform_private.b2b_internal_commercial_actor",
                "platform_private.c2_internal_order_target_reason", "platform_private.c1b_catalog_visibility_scope"]
HELPER_SQL = {n: cap(f"helper.{n}.{HELPERS[n]['md5'][:8]}.sql", HELPERS[n]["md5"]) for n in HELPER_ORDER}
CANDIDATE = (HERE / "candidate/b2b_catalog_read_v2.sql").read_text()

sys.path.insert(0, str(HERE.parent / "tenant-exclusive-catalog-20261101"))
import fence_section, ae_section  # noqa: E402
SELLER_FN = re.search(r"CREATE FUNCTION platform_private\.catalog_tenant_seller.*?\$f\$;", (HERE.parent / "tenant-exclusive-catalog-20261101/homolog-clean/01-migrate.homolog-clean.sql.review").read_text(), re.S).group(0)

SIG_CAT1 = "public.get_partner_catalog_secure(uuid)"; SIG_CAT2 = "public.get_partner_catalog_secure(uuid,boolean)"
SIG_WB = "public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date)"; SIG_WC = "public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric)"
SIG_CB = "platform_private.fn_b2b_resolve_base_unit_price__tenant_core(uuid,uuid,uuid,text,numeric,date)"
SIG_CC = "platform_private.fn_catalogo_preco_canonico__tenant_core(uuid,uuid,text,numeric)"
SIG_ACT = "platform_private.catalog_tenant_actor(text)"; SIG_FENCE = "platform_private.tenant_catalog_fence(text,uuid[])"
SIG_RD = "platform_private.b2b_partner_catalog_reader(uuid)"; SIG_PR = "platform_private.b2b_partner_catalog_item_price(uuid,uuid,uuid,text,numeric,date)"
BASE_SIGS = [SIG_WB, SIG_WC, SIG_CB, SIG_CC, SIG_CAT1, SIG_CAT2, SIG_ACT, SIG_FENCE]
AUDITOR_PINS = {SIG_WB: "87418209", SIG_WC: "b201e49e", SIG_CB: "ab6404d", SIG_CC: "7b7f90d", SIG_CAT1: "d3217db", SIG_CAT2: "1391adc", SIG_FENCE: "8c6e3ec"}

GUARD_A = "  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;\n"
DELTAS = [  # (assinatura, trecho, substituto, ocorrências)
    (SIG_CB, "public.fn_catalogo_preco_canonico(", "platform_private.fn_catalogo_preco_canonico__tenant_core(", 1),
    (SIG_CAT1, "public.fn_b2b_resolve_base_unit_price(p_partner_id, v_pid, v_mid, ", "platform_private.b2b_partner_catalog_item_price(p_partner_id, v_pid, v_mid, ", 3),
    (SIG_CAT1, GUARD_A, GUARD_A + "  PERFORM platform_private.b2b_partner_catalog_reader(p_partner_id);\n", 1),
]

A = "a0000000-0000-0000-0000-00000000000a"; F = "f0000000-0000-0000-0000-00000000000f"; Z = "e0000000-0000-0000-0000-00000000000e"
P1 = "7e52de9a-0000-0000-0000-000000000001"; PF = "e770d10e-0000-0000-0000-000000000002"; P2 = "11111111-0000-0000-0000-000000000002"
P3 = "11111111-0000-0000-0000-000000000003"; PREV = "11111111-0000-0000-0000-000000000004"; PZ = "11111111-0000-0000-0000-000000000005"
USERS = ["buyer", "fsf_admin_rh", "buyer_other", "buyer_two_links", "buyer_revoked_link", "buyer_tenant_mismatch", "buyer_no_feature",
         "buyer_inactive_profile", "buyer_provisional", "tecnico", "buyer_and_tecnico", "internal_A", "internal_A_no_pedidos", "internal_F",
         "super", "buyer_z", "no_role"]
U = {k: f"00000000-0000-0000-0000-0000000000{i:02d}" for i, k in enumerate(USERS, start=1)}
PR = {k: f"22222222-0000-0000-0000-0000000000{i:02d}" for i, k in enumerate(
    ["a_partner_price", "a_volume_price", "a_hidden", "a_b2b_false", "a_inactive", "f_b2b", "a_sem_preco"], start=1)}
MI = "33333333-0000-0000-0000-000000000001"

SCHEMA = """
DO $$BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
CREATE TYPE public.app_role AS ENUM ('superadmin','administrador','gestor','gestor_comercial','consultor_tecnico','tecnico_agronomo','operador_onfarm',
  'producao','administrativo','financeiro','parceiro_b2b','parceiro_b2b_tecnico','produtor');
CREATE TABLE public.organizations(id uuid PRIMARY KEY, ativo boolean, status text, partner_account_id uuid);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean, senha_provisoria boolean);
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
CREATE TABLE public.platform_org_admin_invites(user_id uuid, access_operation_status text, access_valid_after timestamptz);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, ativo boolean, deleted_at timestamptz, commercial_owner_organization_id uuid, client_id uuid);
CREATE TABLE public.partner_users(user_id uuid, partner_id uuid, tenant_id uuid, revoked_at timestamptz, valid_from timestamptz);
CREATE TABLE public.clientes(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE public.produtos(id uuid PRIMARY KEY, nome text, codigo text, ativo boolean, b2b_enabled boolean, owner_organization_id uuid,
  familia_catalogo text, tipo text, funcao_completa text, dose_ml_ha numeric, valor_ha_brl numeric, valor_litro_brl numeric, valor_dose_brl numeric,
  ncm text, cfop text, custo_unitario numeric);
CREATE TABLE public.microrganismos(id uuid PRIMARY KEY, nome text, codigo text, ativo boolean, b2b_enabled boolean, owner_organization_id uuid,
  nome_cientifico text, funcao_agronomica text, dose_ml_ha numeric, valor_litro_brl numeric, valor_dose_brl numeric);
CREATE TABLE public.product_technical_profiles(produto_id uuid, status_validacao text, resumo_curto text, explicacao_b2b text, beneficio_combinado text,
  explicacao_produtor text, indicacoes_uso text, cuidados_aplicacao text);
CREATE TABLE public.microorganism_technical_profiles(microrganismo_id uuid, status_validacao text, resumo_curto text, explicacao_b2b text,
  beneficios_agronomicos text, explicacao_produtor text, indicacoes_uso text, cuidados_aplicacao text, mecanismo_acao text);
CREATE TABLE public.catalog_tenant_visibility(organization_id uuid, entity_type text, hidden boolean, produto_id uuid, microrganismo_id uuid);
CREATE TABLE public.partner_product_prices(partner_id uuid, product_id uuid, microrganismo_id uuid, preco_tabela numeric, ativo boolean,
  valid_from date, valid_until date, is_current boolean);
CREATE TABLE public.catalogo_volumes(produto_id uuid, microrganismo_id uuid, ativo boolean, preco_litro_brl numeric, preco_brl numeric, volume_ml numeric);
CREATE TABLE public.product_target_recommendations(produto_id uuid, ativo boolean);
CREATE TABLE public.microorganism_targets(microrganismo_id uuid, ativo boolean);
CREATE TABLE public.catalog_technical_sources(entidade_id uuid, entidade_tipo text);
-- ===== COSTURAS SINTÉTICAS =====
CREATE TABLE public.stub_entitlements(uid uuid, feature_key text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub','')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims', true),'')::jsonb $$;
CREATE FUNCTION platform_private.entitlements_for_user(u uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE AS $$ SELECT s.feature_key FROM public.stub_entitlements s WHERE s.uid=u $$;
CREATE FUNCTION public.is_valid_b2b_partner_user(u uuid, p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM public.partner_users x WHERE x.user_id=u AND x.partner_id=p AND x.revoked_at IS NULL) $$;
"""

def fixtures():
    rows = [f"INSERT INTO public.organizations VALUES ('{A}',true,'ativa',NULL),('{F}',true,'ativa','{PF}'),('{Z}',true,'ativa',NULL);",
            f"INSERT INTO public.partner_accounts VALUES ('{P1}',true,NULL,'{A}',NULL),('{PF}',true,NULL,'{A}',NULL),('{P2}',true,NULL,'{A}',NULL),"
            f"('{P3}',true,NULL,'{F}',NULL),('{PREV}',false,NULL,'{A}',NULL),('{PZ}',true,NULL,'{Z}',NULL);"]
    prof = {"buyer": A, "fsf_admin_rh": F, "buyer_other": A, "buyer_two_links": A, "buyer_revoked_link": A, "buyer_tenant_mismatch": F,
            "buyer_no_feature": A, "buyer_inactive_profile": A, "buyer_provisional": A, "tecnico": A, "buyer_and_tecnico": A,
            "internal_A": A, "internal_A_no_pedidos": A, "internal_F": F, "super": A, "buyer_z": Z, "no_role": A}
    for u, o in prof.items():
        rows.append(f"INSERT INTO public.profiles VALUES ('{U[u]}','{o}',{str(u != 'buyer_inactive_profile').lower()},{str(u == 'buyer_provisional').lower()});")
    roles = {"buyer": ["parceiro_b2b"], "fsf_admin_rh": ["administrador"], "buyer_other": ["parceiro_b2b"], "buyer_two_links": ["parceiro_b2b"],
             "buyer_revoked_link": ["parceiro_b2b"], "buyer_tenant_mismatch": ["parceiro_b2b"], "buyer_no_feature": ["parceiro_b2b"],
             "buyer_inactive_profile": ["parceiro_b2b"], "buyer_provisional": ["parceiro_b2b"], "tecnico": ["parceiro_b2b_tecnico"],
             "buyer_and_tecnico": ["parceiro_b2b", "parceiro_b2b_tecnico"], "internal_A": ["gestor_comercial"], "internal_A_no_pedidos": ["administrador"],
             "internal_F": ["administrador"], "super": ["superadmin"], "buyer_z": ["parceiro_b2b"], "no_role": []}
    for u, rs in roles.items():
        for r in rs: rows.append(f"INSERT INTO public.user_roles VALUES ('{U[u]}','{r}');")
    links = [("buyer", P1, A, None), ("buyer_other", P2, A, None), ("buyer_two_links", P1, A, None), ("buyer_two_links", P2, A, None),
             ("buyer_revoked_link", P1, A, "now()"), ("buyer_tenant_mismatch", P1, A, None), ("buyer_no_feature", P1, A, None),
             ("buyer_inactive_profile", P1, A, None), ("buyer_provisional", P1, A, None), ("tecnico", P1, A, None), ("buyer_and_tecnico", P1, A, None),
             ("buyer_z", PZ, Z, None)]
    for u, p, t, rv in links:
        rows.append(f"INSERT INTO public.partner_users VALUES ('{U[u]}','{p}','{t}',{rv or 'NULL'},NULL);")
    for u in USERS:
        if u not in ("buyer_no_feature",): rows.append(f"INSERT INTO public.stub_entitlements VALUES ('{U[u]}','catalogo_precos');")
        if u in ("internal_A", "internal_F", "fsf_admin_rh"): rows.append(f"INSERT INTO public.stub_entitlements VALUES ('{U[u]}','pedidos_b2b');")
    rows.append(f"""INSERT INTO public.produtos(id,nome,codigo,ativo,b2b_enabled,owner_organization_id,familia_catalogo,tipo,dose_ml_ha,valor_litro_brl,ncm,cfop,custo_unitario) VALUES
 ('{PR['a_partner_price']}','Quimico A','QA',true,true,'{A}','quimico','fungicida',500,NULL,'3808.92.99','5102',11.5),
 ('{PR['a_volume_price']}','Adubo A','FA',true,true,'{A}','fertilizante_adubo','solo',2000,NULL,'3105.90.90','5102',7),
 ('{PR['a_hidden']}','Oculto A','HA',true,true,'{A}','quimico','inseticida',500,90,'x','x',1),
 ('{PR['a_b2b_false']}','Interno A','IA',true,false,'{A}','quimico','inseticida',500,90,'x','x',1),
 ('{PR['a_inactive']}','Inativo A','XA',false,true,'{A}','quimico','inseticida',500,90,'x','x',1),
 ('{PR['f_b2b']}','FSF prod','FS',true,true,'{F}','quimico','fungicida',500,80,'x','x',1),
 ('{PR['a_sem_preco']}','Sem preco A','SA',true,true,'{A}','biologico','inoculante',100,NULL,'x','x',1);""")
    rows.append(f"INSERT INTO public.microrganismos VALUES ('{MI}','Bacillus A','MA',true,true,'{A}','B. subtilis','solubilizador',200,120,12);")
    rows.append(f"INSERT INTO public.product_technical_profiles(produto_id,status_validacao,resumo_curto) VALUES ('{PR['a_partner_price']}','aprovado','Resumo QA');")
    rows.append(f"INSERT INTO public.catalog_tenant_visibility VALUES ('{A}','produto',true,'{PR['a_hidden']}',NULL);")
    rows.append(f"INSERT INTO public.partner_product_prices VALUES ('{P1}','{PR['a_partner_price']}',NULL,150,true,NULL,NULL,true),('{PF}','{PR['a_partner_price']}',NULL,140,true,NULL,NULL,true);")
    rows.append(f"INSERT INTO public.catalogo_volumes VALUES ('{PR['a_volume_price']}',NULL,true,40,800,20000);")
    return "\n".join(rows)

SOCK = [""]; DB = ["postgres"]
def psql(sql, check=True, db=None):
    r = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", db or DB[0], "-At",
                        "-c", "\\set VERBOSITY verbose", "-c", sql], capture_output=True, text=True)
    if check and r.returncode: raise RuntimeError(r.stderr)
    return r
def runfile(path, db=None):
    return subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", db or DB[0], "-f", str(path)], capture_output=True, text=True)
def md5_of(sig): return psql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))").stdout.strip()
def exists(sig): return psql(f"SELECT to_regprocedure('{sig}') IS NOT NULL").stdout.strip() == "t"
def acl_open(sig): return [r for r in ("anon", "authenticated", "service_role") if psql(f"SELECT has_function_privilege('{r}','{sig}','EXECUTE')").stdout.strip() == "t"]
def lit(s): return "'" + s.replace("'", "''") + "'"

def call(who, sql):
    if who == "anon":
        pre = "SELECT set_config('request.jwt.claims','{\"role\":\"anon\"}',true); SET LOCAL ROLE anon;"
    else:
        claims = json.dumps({"role": "authenticated", "sub": U[who], "exp": 4102444800, "iat": 1700000000})
        pre = f"SELECT set_config('request.jwt.claims','{claims}',true); SET LOCAL ROLE authenticated;"
    r = psql(f"BEGIN; {pre} SELECT 'JSON:'||replace(coalesce(json_agg(t)::text,'[]'),E'\\n',' ') FROM ({sql}) t; ROLLBACK;", check=False)
    if r.returncode:
        m = re.search(r"ERROR:\s+([0-9A-Z]{5}):\s+(.*)", r.stderr)
        return (m.group(1), m.group(2).strip()) if m else ("?????", r.stderr.strip()[:200])
    return (None, json.loads([l for l in r.stdout.splitlines() if l.startswith("JSON:")][-1][5:]))

Q = lambda p: f"SELECT * FROM public.get_partner_catalog_secure('{p}', true)"
FISCAL_KEYS = {"ncm", "cfop", "custo_unitario", "price_source", "cst", "csosn", "aliquota", "owner_organization_id"}
EXPECTED_DTO = {"item_id", "item_tipo", "product_id", "produto_nome", "produto_codigo", "descricao_curta", "preco_tabela", "desconto_percentual",
                "preco_parceiro", "produto_ativo", "resumo_curto", "explicacao_b2b", "beneficios_principais", "ficha_status", "ficha_aprovada",
                "valor_dose_brl", "valor_litro_brl", "valor_ha_brl", "unidade_preco_principal", "familia_catalogo", "catalog_contract", "ficha_conteudo"}
A_ITEMS = sorted([PR["a_partner_price"], PR["a_volume_price"], PR["a_sem_preco"], MI])

DENY_CASES = [  # (nome, ator, parceiro, mensagem esperada ou None p/ qualquer 42501)
    ("CASO_REAL_fsf_admin_rh_org_partner_PF", "fsf_admin_rh", PF, "forbidden_partner"),
    ("fsf_admin_rh_le_P1_teste4", "fsf_admin_rh", P1, "forbidden_partner"),
    ("fsf_admin_rh_le_PZ_vendedor_sem_itens", "fsf_admin_rh", PZ, "forbidden_partner"),
    ("buyer_le_PF", "buyer", PF, "forbidden_partner"), ("buyer_le_P2", "buyer", P2, "forbidden_partner"),
    ("buyer_le_PZ_sem_itens", "buyer", PZ, "forbidden_partner"),
    ("buyer_other_P2_le_P1", "buyer_other", P1, "forbidden_partner"), ("buyer_two_links_count2", "buyer_two_links", P1, "forbidden_partner"),
    ("buyer_revoked_link", "buyer_revoked_link", P1, "forbidden_partner"), ("buyer_tenant_mismatch_org_F", "buyer_tenant_mismatch", P1, "forbidden_partner"),
    ("buyer_sem_feature_catalogo", "buyer_no_feature", P1, "forbidden_partner"), ("buyer_perfil_inativo", "buyer_inactive_profile", P1, None),
    ("buyer_senha_provisoria", "buyer_provisional", P1, None), ("tecnico", "tecnico", P1, "forbidden_financial_terms"),
    ("buyer_e_tecnico", "buyer_and_tecnico", P1, "forbidden_financial_terms"), ("internal_A_sem_pedidos_b2b", "internal_A_no_pedidos", P1, "forbidden_partner"),
    ("internal_A_le_P3_fsf", "internal_A", P3, "forbidden_partner"), ("internal_F_le_P1", "internal_F", P1, "forbidden_partner"),
    ("internal_F_le_PF", "internal_F", PF, "forbidden_partner"),
    ("sem_papel", "no_role", P1, "forbidden_role"), ("superadmin", "super", P1, "b2b_catalog_platform_actor_denied"),
    ("parceiro_inativo", "buyer", PREV, "partner_not_found"), ("anon", "anon", P1, None),
]

def run_matrix():
    m = {"buyer_P1": call("buyer", Q(P1)), "buyer_P1_single_arg": call("buyer", f"SELECT * FROM public.get_partner_catalog_secure('{P1}')"),
         "buyer_z_PZ_zero_itens": call("buyer_z", Q(PZ)), "internal_A_P1": call("internal_A", Q(P1)), "internal_A_PF": call("internal_A", Q(PF)),
         "buyer_public_b2b_wrapper": call("buyer", f"SELECT public.fn_b2b_resolve_base_unit_price('{P1}','{PR['a_partner_price']}',NULL,'litro',NULL,current_date) v"),
         "buyer_public_canonical": call("buyer", f"SELECT public.fn_catalogo_preco_canonico('{PR['a_volume_price']}',NULL,'litro',NULL) v"),
         "internal_A_public_canonical_own": call("internal_A", f"SELECT public.fn_catalogo_preco_canonico('{PR['a_volume_price']}',NULL,'litro',NULL) v"),
         "internal_A_public_canonical_fsf": call("internal_A", f"SELECT public.fn_catalogo_preco_canonico('{PR['f_b2b']}',NULL,'litro',NULL) v"),
         "buyer_direct_core": call("buyer", f"SELECT platform_private.fn_b2b_resolve_base_unit_price__tenant_core('{P1}','{PR['f_b2b']}',NULL,'litro',NULL,current_date) v"),
         "buyer_direct_helper": call("buyer", f"SELECT platform_private.b2b_partner_catalog_item_price('{P1}','{PR['a_partner_price']}',NULL,'litro',NULL,current_date) v"),
         "buyer_direct_reader": call("buyer", f"SELECT platform_private.b2b_partner_catalog_reader('{P1}') v")}
    for name, who, p, _ in DENY_CASES: m[name] = call(who, Q(p))
    return m

def judge_green(m):
    ok = {}
    b = m["buyer_P1"]
    ok["buyer_teste4_le_4_itens"] = b[0] is None and sorted(r["item_id"] for r in b[1]) == A_ITEMS
    if b[0] is None:
        rows = {r["item_id"]: r for r in b[1]}
        ok["preco_parceiro_150"] = rows[PR["a_partner_price"]]["valor_litro_brl"] == 150
        ok["preco_canonico_40_litro_80_ha"] = rows[PR["a_volume_price"]]["valor_litro_brl"] == 40 and rows[PR["a_volume_price"]]["valor_ha_brl"] == 80
        ok["sem_preco_sob_consulta"] = rows[PR["a_sem_preco"]]["unidade_preco_principal"] == "sob_consulta"
        ok["familias"] = [rows[PR["a_partner_price"]]["familia_catalogo"], rows[PR["a_volume_price"]]["familia_catalogo"], rows[MI]["familia_catalogo"]] == ["quimico", "fertilizante_adubo", "biologico"]
        keys = set().union(*[set(r) for r in b[1]])
        ok["dto_exato_sem_fiscal"] = keys == EXPECTED_DTO and not (keys & FISCAL_KEYS)
    ok["single_arg_ok"] = m["buyer_P1_single_arg"][0] is None
    ok["buyer_z_zero_itens_200_vazio"] = m["buyer_z_PZ_zero_itens"] == (None, [])
    ok["internal_A_le_P1_4_itens"] = m["internal_A_P1"][0] is None and len(m["internal_A_P1"][1]) == 4
    ok["internal_A_le_PF_carteira_propria"] = m["internal_A_PF"][0] is None and len(m["internal_A_PF"][1]) == 4
    for name, _, _, msg in DENY_CASES:
        r = m[name]; ok["NEGA_" + name] = r[0] == "42501" and (msg is None or r[1] == msg)
    ok["wrappers_publicos_negam_comprador"] = m["buyer_public_b2b_wrapper"] == ("42501", "tenant_catalog_fence_denied") and m["buyer_public_canonical"] == ("42501", "tenant_catalog_fence_denied")
    ok["wrapper_publico_interno_proprio_40"] = m["internal_A_public_canonical_own"] == (None, [{"v": 40}])
    ok["wrapper_publico_interno_fsf_negado"] = m["internal_A_public_canonical_fsf"] == ("42501", "tenant_catalog_fence_denied")
    for k in ("buyer_direct_core", "buyer_direct_helper", "buyer_direct_reader"): ok[k + "_negado"] = m[k][0] == "42501" and "permission denied" in m[k][1]
    return ok

def pin_block(pins, tag):
    rows = ", ".join(f"('{s}','{h}')" for s, h in pins)
    return (f"  FOR r IN SELECT * FROM (VALUES {rows}) t(sig, md5) LOOP\n"
            f"    IF to_regprocedure(r.sig) IS NULL OR md5(pg_get_functiondef(to_regprocedure(r.sig))) <> r.md5 THEN RAISE EXCEPTION '{tag}_DRIFT:%', r.sig; END IF;\n  END LOOP;\n")
def acl_check(sigs, roles, tag):
    arr = ",".join(f"'{s}'" for s in sigs); rr = ",".join(f"'{r}'" for r in roles)
    return (f"  IF EXISTS (SELECT 1 FROM unnest(ARRAY[{arr}]) s, unnest(ARRAY[{rr}]) g WHERE to_regprocedure(s) IS NOT NULL AND has_function_privilege(g, s, 'EXECUTE')) THEN RAISE EXCEPTION '{tag}_ACL_OPEN'; END IF;\n")
def delta_sql(sig, a, b, n):
    return (f"DO $d$ DECLARE v text := pg_get_functiondef('{sig}'::regprocedure); BEGIN\n"
            f"  IF (length(v) - length(replace(v, {lit(a)}, ''))) / length({lit(a)}) <> {n} THEN RAISE EXCEPTION 'DELTA_COUNT:{sig}'; END IF;\n"
            f"  EXECUTE replace(v, {lit(a)}, {lit(b)});\nEND $d$;\n")
DENY_HELPERS = (f"CREATE OR REPLACE FUNCTION platform_private.b2b_partner_catalog_reader(p_partner_id uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$\n"
                "BEGIN RAISE EXCEPTION 'b2b_catalog_reader_closed' USING ERRCODE='42501'; END $f$;\n"
                "CREATE OR REPLACE FUNCTION platform_private.b2b_partner_catalog_item_price(p_partner_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric, p_ref_date date)\n"
                " RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$\nBEGIN RAISE EXCEPTION 'b2b_catalog_reader_closed' USING ERRCODE='42501'; END $f$;\n"
                f"REVOKE ALL ON FUNCTION {SIG_RD} FROM PUBLIC, anon, authenticated, service_role;\nREVOKE ALL ON FUNCTION {SIG_PR} FROM PUBLIC, anon, authenticated, service_role;\n")
PRIV = [SIG_CB, SIG_CC, SIG_ACT, SIG_FENCE]

def generate(base_pins, helper_pins, deny_pins, post_pins):
    helpers_absent = f"  IF to_regprocedure('{SIG_RD}') IS NOT NULL OR to_regprocedure('{SIG_PR}') IS NOT NULL THEN RAISE EXCEPTION 'PRE_PROD_HELPERS_PRESENT'; END IF;\n"
    pre_prod = pin_block(base_pins + helper_pins, "PRE_PROD") + acl_check(PRIV, ["anon", "authenticated"], "PRE_PROD") + helpers_absent
    pre_homo = pin_block(base_pins + helper_pins + deny_pins, "PRE_HOMOLOG") + acl_check(PRIV + [SIG_RD, SIG_PR], ["anon", "authenticated", "service_role"][:2] + ["service_role"], "PRE_HOMOLOG")
    hdr = "-- Gerado por test-local.py (v2). Revisão do auditor; NÃO aplicar pelo agente. Nunca editar à mão.\n"
    files = {
        "01a-pre-producao.sql.review": hdr + "-- PRE (READ ONLY) linha de base PRODUÇÃO: helpers AUSENTES.\nBEGIN READ ONLY;\nDO $pre$ DECLARE r record; BEGIN\n" + pre_prod + "END $pre$;\nROLLBACK;\n",
        "01b-pre-homolog-pos-rollback-v1.sql.review": hdr + "-- PRE (READ ONLY) linha de base HOMOLOG após 04-rollback v1: helpers EXISTEM com corpo deny (md5 pinado), sem EXECUTE de cliente.\nBEGIN READ ONLY;\nDO $pre$ DECLARE r record; BEGIN\n" + pre_homo + "END $pre$;\nROLLBACK;\n",
    }
    post_chk = pin_block(post_pins, "POST") + acl_check(PRIV + [SIG_RD, SIG_PR], ["anon", "authenticated", "service_role"], "POST")
    install = (hdr + "-- INSTALL v2: aceita EXATAMENTE uma das duas linhas de base (01a produção ou 01b homolog); qualquer outra aborta.\nBEGIN;\nSET LOCAL lock_timeout = '3s';\n"
               "DO $pre$ DECLARE r record; v_prod boolean := true; v_homo boolean := true; BEGIN\n"
               "  BEGIN\n" + pre_prod.replace("\n  ", "\n    ") + "  EXCEPTION WHEN raise_exception THEN v_prod := false; END;\n"
               "  BEGIN\n" + pre_homo.replace("\n  ", "\n    ") + "  EXCEPTION WHEN raise_exception THEN v_homo := false; END;\n"
               "  IF v_prod = v_homo THEN RAISE EXCEPTION 'PRE_NO_KNOWN_BASELINE prod=% homolog=%', v_prod, v_homo; END IF;\nEND $pre$;\n"
               + CANDIDATE.rstrip() + "\n" + "".join(delta_sql(*d) for d in DELTAS) + "DO $post$ DECLARE r record; BEGIN\n" + post_chk + "END $post$;\nCOMMIT;\n")
    files["02-install-v2.sql.review"] = install
    files["03-post-v2.sql.review"] = hdr + "-- POST (READ ONLY).\nBEGIN READ ONLY;\nDO $post$ DECLARE r record; BEGIN\n" + post_chk + "END $post$;\nROLLBACK;\n"
    files["04-rollback-v2-deny.sql.review"] = (hdr + "-- ROLLBACK v2 para o estado DENY (= linha de base 01b): comprador volta a 42501 tenant_catalog_fence_denied;\n"
        "-- helpers ficam com corpo deny e sem EXECUTE de cliente (nunca DROP). Não restaura acesso algum.\nBEGIN;\nSET LOCAL lock_timeout = '3s';\n"
        "DO $pre$ DECLARE r record; BEGIN\n" + pin_block(post_pins, "RB_PRE") + "END $pre$;\n"
        + "".join(delta_sql(s, b, a, n) for s, a, b, n in reversed(DELTAS)) + DENY_HELPERS
        + "DO $post$ DECLARE r record; BEGIN\n" + pre_homo + "END $post$;\nCOMMIT;\n")
    for n, t in files.items(): (HERE / n).write_text(t)

def main():
    global PORT
    if not shutil.which("initdb"): print("initdb ausente"); return 2
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="b2bcat2-", dir="/tmp")); tmp.chmod(0o777); PORT = "55438"; SOCK[0] = str(tmp)
    su = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
    subprocess.run(su + ["initdb", "-D", str(tmp / "d"), "-U", "postgres", "-A", "trust"], check=True, capture_output=True)
    subprocess.run(su + ["pg_ctl", "-D", str(tmp / "d"), "-o", f"-p {PORT} -k {tmp} -c listen_addresses=''", "-l", str(tmp / "log"), "-w", "start"], check=True, capture_output=True)
    rep = {"kind": "disposable_pg", "hosted": False, "real_helpers": {n: HELPERS[n]["md5"] for n in HELPER_ORDER},
           "synthetic_seams": ["auth.uid", "auth.jwt", "platform_private.entitlements_for_user", "public.is_valid_b2b_partner_user", "esquema mínimo"]}
    ok = True
    try:
        psql("CREATE DATABASE base", db="postgres"); DB[0] = "base"
        psql(SCHEMA)
        for n in HELPER_ORDER: psql(HELPER_SQL[n])
        for body in (ACTOR, SELLER_FN, CAN, B2B, CAT1, CAT2): psql(body)
        for s in (SIG_ACT, "platform_private.catalog_tenant_seller(uuid)"): psql(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon, authenticated, service_role")
        out = []
        fence_section.FENCED[:] = [r for r in fence_section.FENCED if r[0] in (SIG_WC, SIG_WB)]; fence_section.CLOSED_PLATFORM[:] = []
        psql("CREATE TABLE public.ledger(step text, detail jsonb);"); fence_section.fence_sql(out.append, "public.ledger", lit)
        for s in out: psql(s)
        for sig, reps in ae_section.DELTAS:
            if sig != "get_partner_catalog_secure(uuid)": continue
            v = psql(f"SELECT pg_get_functiondef('{SIG_CAT1}'::regprocedure)").stdout
            for a, b, n in reps: assert v.count(a) == n; v = v.replace(a, b)
            psql(v)
        for s in (SIG_CAT1, SIG_CAT2): psql(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION {s} TO authenticated")
        psql(fixtures())
        base_pins = [(s, md5_of(s)) for s in BASE_SIGS]
        helper_sigs = {n: psql(f"SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname||'.'||p.proname='{n}'").stdout.strip() for n in HELPER_ORDER}
        helper_pins = [(helper_sigs[n], md5_of(helper_sigs[n])) for n in HELPER_ORDER]
        rep["helper_md5_in_pg_equals_capture"] = all(h == HELPERS[n]["md5"] for (s, h), n in zip(helper_pins, HELPER_ORDER)); ok &= rep["helper_md5_in_pg_equals_capture"]
        rep["base_pins_vs_auditor"] = {s: {"pg": h, "auditor_prefix": AUDITOR_PINS.get(s), "match": AUDITOR_PINS.get(s) is None or h.startswith(AUDITOR_PINS[s])} for s, h in base_pins}
        ok &= all(v["match"] for v in rep["base_pins_vs_auditor"].values())
        psql("CREATE DATABASE prod TEMPLATE base", db="postgres"); psql("CREATE DATABASE homo TEMPLATE base", db="postgres")

        # ===== HOMOLOG: v1 (GREEN falso) → rollback v1 → v2 =====
        DB[0] = "homo"
        x = runfile(V1 / "02-install.sql.review"); assert x.returncode == 0, x.stderr
        v1 = run_matrix()
        rep["RED_v1_green_falso"] = {"CASO_REAL_fsf_admin_rh_org_partner_PF": v1["CASO_REAL_fsf_admin_rh_org_partner_PF"][0] is None and len(v1["CASO_REAL_fsf_admin_rh_org_partner_PF"][1]),
                                     "buyer_P1": v1["buyer_P1"][0] is None and len(v1["buyer_P1"][1])}
        ok &= rep["RED_v1_green_falso"]["CASO_REAL_fsf_admin_rh_org_partner_PF"] == 4  # reproduz o vazamento real
        x = runfile(V1 / "04-rollback-deny-safe.sql.review"); assert x.returncode == 0, x.stderr
        deny_pins = [(SIG_RD, md5_of(SIG_RD)), (SIG_PR, md5_of(SIG_PR))]
        rep["homolog_pos_rollback_v1_base_pins_iguais"] = [(s, md5_of(s)) for s in BASE_SIGS] == base_pins; ok &= rep["homolog_pos_rollback_v1_base_pins_iguais"]
        red = run_matrix(); rep["RED_estado_deny"] = {"buyer_P1": red["buyer_P1"], "fsf_admin_rh_PF": red["CASO_REAL_fsf_admin_rh_org_partner_PF"]}
        ok &= red["buyer_P1"] == ("42501", "tenant_catalog_fence_denied")
        # pins pós-instalação: calculados numa transação descartada
        tmp_sql = tmp / "calc.sql"
        tmp_sql.write_text("BEGIN;\n" + CANDIDATE + "".join(delta_sql(*d) for d in DELTAS) +
                           "".join(f"SELECT '{s}', md5(pg_get_functiondef('{s}'::regprocedure));\n" for s in BASE_SIGS + [SIG_RD, SIG_PR]) + "ROLLBACK;\n")
        r = subprocess.run(["psql", "-X", "-q", "-At", "-F", "|", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", "homo", "-f", str(tmp_sql)], capture_output=True, text=True)
        post_pins = [tuple(l.split("|")) for l in r.stdout.strip().splitlines() if "|" in l]; assert len(post_pins) == len(BASE_SIGS) + 2, r.stderr
        post_pins = post_pins + helper_pins
        generate(base_pins, helper_pins, deny_pins, post_pins)
        rep["pre_homolog_on_homolog"] = runfile(HERE / "01b-pre-homolog-pos-rollback-v1.sql.review").returncode == 0
        rep["pre_producao_on_homolog_aborts"] = runfile(HERE / "01a-pre-producao.sql.review").returncode != 0
        x = runfile(HERE / "02-install-v2.sql.review"); rep["install_homolog"] = x.returncode == 0
        if x.returncode: rep["install_homolog_err"] = x.stderr[-600:]
        rep["post_homolog"] = runfile(HERE / "03-post-v2.sql.review").returncode == 0
        x = runfile(HERE / "02-install-v2.sql.review"); rep["rerun_aborts_homolog"] = x.returncode != 0 and "PRE_NO_KNOWN_BASELINE" in x.stderr
        rep["acl_after_homolog"] = {s: acl_open(s) for s in PRIV + [SIG_RD, SIG_PR]}
        g = run_matrix(); rep["green_homolog"] = gh = judge_green(g)
        rep["green_homolog_detail_fsf"] = g["CASO_REAL_fsf_admin_rh_org_partner_PF"]
        ok &= all([rep["pre_homolog_on_homolog"], rep["pre_producao_on_homolog_aborts"], rep["install_homolog"], rep["post_homolog"], rep["rerun_aborts_homolog"]])
        ok &= all(v == [] for v in rep["acl_after_homolog"].values()) and all(gh.values())
        x = runfile(HERE / "04-rollback-v2-deny.sql.review"); rep["rollback_v2_homolog"] = x.returncode == 0
        if x.returncode: rep["rollback_err"] = x.stderr[-600:]
        rb = run_matrix()
        rep["after_rollback_v2"] = {"buyer_P1": rb["buyer_P1"], "fsf_admin_rh_PF": rb["CASO_REAL_fsf_admin_rh_org_partner_PF"], "internal_A_P1_itens": len(rb["internal_A_P1"][1]) if rb["internal_A_P1"][0] is None else rb["internal_A_P1"]}
        rep["after_rollback_v2_equals_01b"] = runfile(HERE / "01b-pre-homolog-pos-rollback-v1.sql.review").returncode == 0
        ok &= rep["rollback_v2_homolog"] and rep["after_rollback_v2_equals_01b"] and rb["buyer_P1"] == ("42501", "tenant_catalog_fence_denied") and rb["CASO_REAL_fsf_admin_rh_org_partner_PF"][0] == "42501"
        ok &= rb["internal_A_P1"][0] is None

        # ===== PRODUÇÃO: helpers ausentes → v2 =====
        DB[0] = "prod"
        rep["pre_producao_on_prod"] = runfile(HERE / "01a-pre-producao.sql.review").returncode == 0
        rep["pre_homolog_on_prod_aborts"] = runfile(HERE / "01b-pre-homolog-pos-rollback-v1.sql.review").returncode != 0
        x = runfile(HERE / "02-install-v2.sql.review"); rep["install_prod"] = x.returncode == 0
        if x.returncode: rep["install_prod_err"] = x.stderr[-600:]
        rep["post_prod"] = runfile(HERE / "03-post-v2.sql.review").returncode == 0
        gp = run_matrix(); rep["green_prod"] = gpj = judge_green(gp)
        ok &= all([rep["pre_producao_on_prod"], rep["pre_homolog_on_prod_aborts"], rep["install_prod"], rep["post_prod"]]) and all(gpj.values())
        rep["post_pins"] = dict(post_pins[:len(BASE_SIGS) + 2]); rep["deny_pins"] = dict(deny_pins)
    finally:
        subprocess.run(su + ["pg_ctl", "-D", str(tmp / "d"), "-m", "immediate", "stop"], capture_output=True); shutil.rmtree(tmp, ignore_errors=True)
    rep["result"] = "PASS" if ok else "FAIL"
    (HERE / "evidence-local.json").write_text(json.dumps(rep, indent=1, ensure_ascii=False, default=str) + "\n")
    print(json.dumps({k: v for k, v in rep.items() if k not in ("green_homolog", "green_prod")}, indent=1, ensure_ascii=False, default=str)[:7000])
    print("green_homolog_fail:", [k for k, v in rep.get("green_homolog", {}).items() if not v]); print("green_prod_fail:", [k for k, v in rep.get("green_prod", {}).items() if not v])
    return 0 if ok else 1

if __name__ == "__main__": sys.exit(main())
