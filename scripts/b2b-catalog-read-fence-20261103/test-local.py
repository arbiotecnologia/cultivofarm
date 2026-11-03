#!/usr/bin/env python3
"""PostgreSQL DESCARTÁVEL — regressão de leitura do catálogo B2B após a migração de catálogo v4.

Corpos REAIS: get_partner_catalog_secure (b5684d35 + delta v4 do vendedor, 1391adc2), núcleos de preço
(60651fe8, fa5e890d) renomeados pela mesma lógica da cerca v4, tenant_catalog_fence (fence_section.py),
catalog_tenant_actor (5e0ce9cc) e catalog_tenant_seller (migração v4). Os dois invólucros gerados são
comparados byte a byte com a captura de 03/11 (87418209 / b201e49e).
COSTURAS SINTÉTICAS (declaradas): auth.uid, has_role, is_platform_superadmin, b2b_actor_scope,
b2b_internal_commercial_actor, c2_internal_order_target_reason, c1b_catalog_visibility_scope,
h15_actor_organization, _saas_user_has_feature, can_view_catalog_internal e esquema mínimo das tabelas.
Não é prova JWT/RLS hospedada. Gera 01-pre / 02-install / 03-post / 04-rollback com md5 calculado aqui."""
import hashlib, json, os, pathlib, re, shutil, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
CAP = HERE / "captured"
def cap(name, md5):
    t = (CAP / name).read_text(); assert hashlib.md5(t.encode()).hexdigest() == md5, name; return t

CAT1 = cap("public.get_partner_catalog_secure.b5684d35.live-20261101.sql", "b5684d350603d1db77ab9f1db0f4b253")
CAT2 = cap("public.get_partner_catalog_secure.1391adc2.live-20261101.sql", "1391adc2133b922e2dcea4b1d3e26820")
B2B = cap("public.fn_b2b_resolve_base_unit_price.60651fe8.live-20261101.sql", "60651fe823452436d807b9b175c3865c")
CAN = cap("public.fn_catalogo_preco_canonico.fa5e890d.live-20261101.sql", "fa5e890dc647392efc238460ac16d6a2")
ACTOR = cap("platform_private.catalog_tenant_actor.5e0ce9cc.live-20261101.sql", "5e0ce9cc9122f1c21d76e29a13de8b59")
W_B2B = cap("fn_b2b_resolve_base_unit_price.wrapper.87418209.sql", "87418209039589320959c9891e97916c")
W_CAN = cap("fn_catalogo_preco_canonico.wrapper.b201e49e.sql", "b201e49e0158bde0140e018282c047fc")
CANDIDATE = (HERE / "candidate/b2b_catalog_read.sql").read_text()

sys.path.insert(0, str(HERE.parent / "tenant-exclusive-catalog-20261101"))
import fence_section, ae_section  # noqa: E402  (mesma lógica/deltas da migração v4)

SELLER_P = "platform_private.catalog_tenant_seller(p_partner_id)"
SELLER_FN = re.search(r"CREATE FUNCTION platform_private\.catalog_tenant_seller.*?\$f\$;", (HERE.parent / "tenant-exclusive-catalog-20261101/homolog-clean/01-migrate.homolog-clean.sql.review").read_text(), re.S).group(0)

SIG_CAT1 = "public.get_partner_catalog_secure(uuid)"; SIG_CAT2 = "public.get_partner_catalog_secure(uuid,boolean)"
SIG_WB = "public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date)"; SIG_WC = "public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric)"
SIG_CB = "platform_private.fn_b2b_resolve_base_unit_price__tenant_core(uuid,uuid,uuid,text,numeric,date)"
SIG_CC = "platform_private.fn_catalogo_preco_canonico__tenant_core(uuid,uuid,text,numeric)"
SIG_ACT = "platform_private.catalog_tenant_actor(text)"; SIG_FENCE = "platform_private.tenant_catalog_fence(text,uuid[])"
SIG_RD = "platform_private.b2b_partner_catalog_reader(uuid)"; SIG_PR = "platform_private.b2b_partner_catalog_item_price(uuid,uuid,uuid,text,numeric,date)"

CORE_DELTA = ("public.fn_catalogo_preco_canonico(", "platform_private.fn_catalogo_preco_canonico__tenant_core(", 1)
CAT_DELTA = ("public.fn_b2b_resolve_base_unit_price(p_partner_id, v_pid, v_mid, ", "platform_private.b2b_partner_catalog_item_price(p_partner_id, v_pid, v_mid, ", 3)

A = "a0000000-0000-0000-0000-00000000000a"; F = "f0000000-0000-0000-0000-00000000000f"
P1 = "11111111-0000-0000-0000-000000000001"; P2 = "11111111-0000-0000-0000-000000000002"; P3 = "11111111-0000-0000-0000-000000000003"
PREV = "11111111-0000-0000-0000-000000000004"
U = {k: f"00000000-0000-0000-0000-0000000000{i:02d}" for i, k in enumerate(
    ["buyer", "buyer_other", "fsf_admin", "tecnico", "revoked", "internal", "super", "buyer_fsf"], start=1)}
PR = {k: f"22222222-0000-0000-0000-0000000000{i:02d}" for i, k in enumerate(
    ["a_partner_price", "a_volume_price", "a_hidden", "a_b2b_false", "a_inactive", "f_b2b", "a_sem_preco"], start=1)}
MI = "33333333-0000-0000-0000-000000000001"

SCHEMA = f"""
DO $$BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
DO $$BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor','gestor_comercial','consultor','financeiro','parceiro_b2b','parceiro_b2b_tecnico');
CREATE TABLE public.organizations(id uuid PRIMARY KEY, ativo boolean, status text);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, ativo boolean, deleted_at timestamptz, commercial_owner_organization_id uuid);
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
CREATE TABLE public.stub_roles(uid uuid, role public.app_role);
CREATE TABLE public.stub_actor(uid uuid PRIMARY KEY, org uuid, super boolean DEFAULT false, internal_commercial boolean DEFAULT false,
  profile_ok boolean, org_partner uuid, partner_valid boolean, user_partner_count int, user_partner uuid, has_catalog boolean, feature boolean DEFAULT true);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub','')::uuid $$;
CREATE FUNCTION public.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.stub_roles s WHERE s.uid=u AND s.role=r) $$;
CREATE FUNCTION platform_private.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.has_role(u,r) $$;
CREATE FUNCTION public.is_platform_superadmin(u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce((SELECT super FROM public.stub_actor WHERE uid=u),false) $$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT org FROM public.stub_actor WHERE uid=auth.uid() $$;
CREATE FUNCTION public._saas_user_has_feature(u uuid, f text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce((SELECT feature FROM public.stub_actor WHERE uid=u),false) AND f='catalogo_precos' $$;
CREATE FUNCTION public.can_view_catalog_internal(u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM public.stub_roles s WHERE s.uid=u AND s.role IN ('administrador','gestor','gestor_comercial','consultor','financeiro'))
     AND NOT EXISTS(SELECT 1 FROM public.stub_roles s WHERE s.uid=u AND s.role IN ('parceiro_b2b','parceiro_b2b_tecnico')) $$;
CREATE FUNCTION platform_private.b2b_actor_scope(u uuid, OUT profile_ok boolean, OUT org_partner uuid, OUT partner_valid boolean,
  OUT user_partner_count int, OUT user_partner uuid, OUT has_catalog boolean) LANGUAGE sql STABLE AS $$
  SELECT coalesce(profile_ok,false), org_partner, coalesce(partner_valid,false), coalesce(user_partner_count,0), user_partner, coalesce(has_catalog,false)
    FROM public.stub_actor WHERE uid=u UNION ALL SELECT false,NULL,false,0,NULL,false WHERE NOT EXISTS(SELECT 1 FROM public.stub_actor WHERE uid=u) $$;
CREATE FUNCTION platform_private.b2b_internal_commercial_actor() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce((SELECT internal_commercial FROM public.stub_actor WHERE uid=auth.uid()),false) $$;
CREATE FUNCTION platform_private.c2_internal_order_target_reason(u uuid, p uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN (SELECT org FROM public.stub_actor WHERE uid=u) = (SELECT commercial_owner_organization_id FROM public.partner_accounts WHERE id=p) THEN NULL ELSE 'TARGET_OUT_OF_SCOPE' END $$;
CREATE FUNCTION platform_private.c1b_catalog_visibility_scope(p uuid) RETURNS uuid[] LANGUAGE sql STABLE AS $$ SELECT ARRAY[(SELECT commercial_owner_organization_id FROM public.partner_accounts WHERE id=p)] $$;
"""

FIXTURES = f"""
INSERT INTO public.organizations VALUES ('{A}',true,'ativa'),('{F}',true,'ativa');
INSERT INTO public.partner_accounts VALUES ('{P1}',true,NULL,'{A}'),('{P2}',true,NULL,'{A}'),('{P3}',true,NULL,'{F}'),('{PREV}',false,NULL,'{A}');
INSERT INTO public.produtos(id,nome,codigo,ativo,b2b_enabled,owner_organization_id,familia_catalogo,tipo,dose_ml_ha,valor_litro_brl,ncm,cfop,custo_unitario) VALUES
 ('{PR['a_partner_price']}','Quimico A','QA',true,true,'{A}','quimico','fungicida',500,NULL,'3808.92.99','5102',11.5),
 ('{PR['a_volume_price']}','Adubo A','FA',true,true,'{A}','fertilizante_adubo','solo',2000,NULL,'3105.90.90','5102',7),
 ('{PR['a_hidden']}','Oculto A','HA',true,true,'{A}','quimico','inseticida',500,90,'x','x',1),
 ('{PR['a_b2b_false']}','Interno A','IA',true,false,'{A}','quimico','inseticida',500,90,'x','x',1),
 ('{PR['a_inactive']}','Inativo A','XA',false,true,'{A}','quimico','inseticida',500,90,'x','x',1),
 ('{PR['f_b2b']}','FSF prod','FS',true,true,'{F}','quimico','fungicida',500,80,'x','x',1),
 ('{PR['a_sem_preco']}','Sem preco A','SA',true,true,'{A}','biologico','inoculante',100,NULL,'x','x',1);
INSERT INTO public.microrganismos VALUES ('{MI}','Bacillus A','MA',true,true,'{A}','B. subtilis','solubilizador',200,120,12);
INSERT INTO public.product_technical_profiles(produto_id,status_validacao,resumo_curto) VALUES ('{PR['a_partner_price']}','aprovado','Resumo QA');
INSERT INTO public.catalog_tenant_visibility VALUES ('{A}','produto',true,'{PR['a_hidden']}',NULL);
INSERT INTO public.partner_product_prices VALUES ('{P1}','{PR['a_partner_price']}',NULL,150,true,NULL,NULL,true);
INSERT INTO public.catalogo_volumes VALUES ('{PR['a_volume_price']}',NULL,true,40,800,20000);
INSERT INTO public.stub_roles VALUES ('{U['buyer']}','parceiro_b2b'),('{U['buyer_other']}','parceiro_b2b'),('{U['fsf_admin']}','administrador'),
 ('{U['tecnico']}','parceiro_b2b_tecnico'),('{U['revoked']}','parceiro_b2b'),('{U['internal']}','gestor_comercial'),('{U['buyer_fsf']}','parceiro_b2b');
INSERT INTO public.stub_actor(uid,org,super,internal_commercial,profile_ok,org_partner,partner_valid,user_partner_count,user_partner,has_catalog) VALUES
 ('{U['buyer']}','{A}',false,false,true,'{P1}',true,1,'{P1}',true),
 ('{U['buyer_other']}','{A}',false,false,true,'{P2}',true,1,'{P2}',true),
 ('{U['buyer_fsf']}','{F}',false,false,true,'{P3}',true,1,'{P3}',true),
 ('{U['fsf_admin']}','{F}',false,false,false,NULL,false,0,NULL,true),
 ('{U['tecnico']}','{A}',false,false,true,'{P1}',true,1,'{P1}',true),
 ('{U['revoked']}','{A}',false,false,true,'{P1}',false,1,'{P1}',true),
 ('{U['internal']}','{A}',false,true,false,NULL,false,0,NULL,true),
 ('{U['super']}',NULL,true,false,false,NULL,false,0,NULL,false);
"""

SOCK = [""]
def psql(port, sql, role=None, check=True):
    r = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-h", SOCK[0], "-p", str(port), "-U", "postgres",
                        "-d", "postgres", "-At", "-c", "\\set VERBOSITY verbose", "-c", sql], capture_output=True, text=True)
    if check and r.returncode: raise RuntimeError(r.stderr)
    return r
def runfile(port, path):
    return subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", SOCK[0], "-p", str(port), "-U", "postgres", "-d", "postgres", "-f", str(path)], capture_output=True, text=True)
def md5_of(port, sig):
    return psql(port, f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))").stdout.strip()
def acl_open(port, sig):
    return [r for r in ("anon", "authenticated", "service_role")
            if psql(port, f"SELECT has_function_privilege('{r}','{sig}','EXECUTE')").stdout.strip() == "t"]

def call(port, who, sql):
    """Executa como cliente: claims JWT sintéticas + SET LOCAL ROLE. Retorna (sqlstate|None, mensagem|linhas)."""
    if who == "anon":
        pre = "SELECT set_config('request.jwt.claims','{\"role\":\"anon\"}',true); SET LOCAL ROLE anon;"
    else:
        claims = json.dumps({"role": "authenticated", "sub": U[who], "exp": 4102444800, "iat": 1700000000})
        pre = f"SELECT set_config('request.jwt.claims','{claims}',true); SET LOCAL ROLE authenticated;"
    r = psql(port, f"BEGIN; {pre} SELECT 'JSON:'||replace(coalesce(json_agg(t)::text,'[]'),E'\\n',' ') FROM ({sql}) t; ROLLBACK;", check=False)
    if r.returncode:
        m = re.search(r"ERROR:\s+([0-9A-Z]{5}):\s+(.*)", r.stderr)
        return (m.group(1), m.group(2).strip()) if m else ("?????", r.stderr.strip()[:200])
    return (None, json.loads([l for l in r.stdout.splitlines() if l.startswith("JSON:")][-1][5:]))

CAT_Q = lambda p: f"SELECT * FROM public.get_partner_catalog_secure('{p}', true)"
FISCAL_KEYS = {"ncm", "cfop", "custo_unitario", "price_source", "cst", "csosn", "aliquota", "owner_organization_id"}
EXPECTED_DTO = {"item_id", "item_tipo", "product_id", "produto_nome", "produto_codigo", "descricao_curta", "preco_tabela", "desconto_percentual",
                "preco_parceiro", "produto_ativo", "resumo_curto", "explicacao_b2b", "beneficios_principais", "ficha_status", "ficha_aprovada",
                "valor_dose_brl", "valor_litro_brl", "valor_ha_brl", "unidade_preco_principal", "familia_catalogo", "catalog_contract", "ficha_conteudo"}

def matrix(port):
    m = {}
    m["buyer_P1"] = call(port, "buyer", CAT_Q(P1))
    m["buyer_P1_v1_single_arg"] = call(port, "buyer", f"SELECT * FROM public.get_partner_catalog_secure('{P1}')")
    m["buyer_other_partner_P2_reads_P1"] = call(port, "buyer_other", CAT_Q(P1))
    m["buyer_fsf_P3_reads_P1"] = call(port, "buyer_fsf", CAT_Q(P1))
    m["fsf_admin_no_link_reads_P1"] = call(port, "fsf_admin", CAT_Q(P1))
    m["tecnico_reads_P1"] = call(port, "tecnico", CAT_Q(P1))
    m["revoked_reads_P1"] = call(port, "revoked", CAT_Q(P1))
    m["buyer_reads_inactive_partner"] = call(port, "buyer", CAT_Q(PREV))
    m["anon_reads_P1"] = call(port, "anon", CAT_Q(P1))
    m["superadmin_reads_P1"] = call(port, "super", CAT_Q(P1))
    m["internal_A_reads_P1"] = call(port, "internal", CAT_Q(P1))
    m["internal_A_reads_P3_fsf"] = call(port, "internal", CAT_Q(P3))
    # controles internos inalterados: invólucros públicos seguem com a cerca
    m["buyer_direct_public_b2b_wrapper"] = call(port, "buyer", f"SELECT public.fn_b2b_resolve_base_unit_price('{P1}','{PR['a_partner_price']}',NULL,'litro',NULL,current_date) v")
    m["buyer_direct_public_canonical"] = call(port, "buyer", f"SELECT public.fn_catalogo_preco_canonico('{PR['a_volume_price']}',NULL,'litro',NULL) v")
    m["internal_public_canonical_own"] = call(port, "internal", f"SELECT public.fn_catalogo_preco_canonico('{PR['a_volume_price']}',NULL,'litro',NULL) v")
    m["internal_public_canonical_fsf_item"] = call(port, "internal", f"SELECT public.fn_catalogo_preco_canonico('{PR['f_b2b']}',NULL,'litro',NULL) v")
    m["internal_public_b2b_wrapper_own"] = call(port, "internal", f"SELECT public.fn_b2b_resolve_base_unit_price('{P1}','{PR['a_volume_price']}',NULL,'litro',NULL,current_date)->>'base_price' v")
    # chamada direta de núcleos/helpers privados por cliente (ACL real do PG descartável)
    m["buyer_direct_b2b_core"] = call(port, "buyer", f"SELECT platform_private.fn_b2b_resolve_base_unit_price__tenant_core('{P1}','{PR['f_b2b']}',NULL,'litro',NULL,current_date) v")
    m["buyer_direct_canonical_core"] = call(port, "buyer", f"SELECT platform_private.fn_catalogo_preco_canonico__tenant_core('{PR['f_b2b']}',NULL,'litro',NULL) v")
    m["buyer_direct_item_price_helper"] = call(port, "buyer", f"SELECT platform_private.b2b_partner_catalog_item_price('{P1}','{PR['f_b2b']}',NULL,'litro',NULL,current_date) v")
    return m

def item_ids(res):
    return sorted(r["item_id"] for r in res[1]) if res[0] is None else None

def judge_after(m):
    ok = {}
    b = m["buyer_P1"]
    ok["buyer_legitimo_le_catalogo"] = b[0] is None and item_ids(b) == sorted([PR["a_partner_price"], PR["a_volume_price"], PR["a_sem_preco"], MI])
    if b[0] is None:
        rows = {r["item_id"]: r for r in b[1]}
        ok["preco_parceiro_150"] = rows[PR["a_partner_price"]]["valor_litro_brl"] == 150
        ok["preco_canonico_volume_40_litro"] = rows[PR["a_volume_price"]]["valor_litro_brl"] == 40 and rows[PR["a_volume_price"]]["valor_ha_brl"] == 80
        ok["sem_preco_sob_consulta"] = rows[PR["a_sem_preco"]]["unidade_preco_principal"] == "sob_consulta"
        ok["familias_preservadas"] = rows[PR["a_partner_price"]]["familia_catalogo"] == "quimico" and rows[PR["a_volume_price"]]["familia_catalogo"] == "fertilizante_adubo" and rows[MI]["familia_catalogo"] == "biologico"
        keys = set().union(*[set(r) for r in b[1]])
        ok["dto_exato_sem_fiscal"] = keys == EXPECTED_DTO and not (keys & FISCAL_KEYS)
        ok["oculto_b2bfalse_inativo_fsf_ausentes"] = not ({PR["a_hidden"], PR["a_b2b_false"], PR["a_inactive"], PR["f_b2b"]} & set(rows))
    ok["v1_single_arg_ok"] = m["buyer_P1_v1_single_arg"][0] is None
    for k, msg in [("buyer_other_partner_P2_reads_P1", "forbidden_partner"), ("buyer_fsf_P3_reads_P1", "forbidden_partner"),
                   ("fsf_admin_no_link_reads_P1", "forbidden_partner"), ("tecnico_reads_P1", "forbidden_financial_terms"),
                   ("revoked_reads_P1", "forbidden_partner"), ("buyer_reads_inactive_partner", "partner_not_found"),
                   ("internal_A_reads_P3_fsf", "forbidden_partner")]:
        ok[k] = m[k][0] == "42501" and m[k][1] == msg
    ok["anon_negado"] = m["anon_reads_P1"][0] == "42501"
    ok["superadmin_sem_itens"] = m["superadmin_reads_P1"] == (None, [])
    ok["internal_A_le_P1"] = m["internal_A_reads_P1"][0] is None and len(m["internal_A_reads_P1"][1]) == 4
    ok["buyer_public_wrappers_seguem_negados"] = m["buyer_direct_public_b2b_wrapper"] == ("42501", "tenant_catalog_fence_denied") and m["buyer_direct_public_canonical"] == ("42501", "tenant_catalog_fence_denied")
    ok["internal_public_canonical_own_40"] = m["internal_public_canonical_own"] == (None, [{"v": 40}])
    ok["internal_public_b2b_wrapper_own_40"] = m["internal_public_b2b_wrapper_own"] == (None, [{"v": "40.00"}])
    ok["internal_fsf_item_negado"] = m["internal_public_canonical_fsf_item"] == ("42501", "tenant_catalog_fence_denied")
    for k in ("buyer_direct_b2b_core", "buyer_direct_canonical_core", "buyer_direct_item_price_helper"):
        ok[k + "_negado"] = m[k][0] == "42501" and "permission denied" in m[k][1]
    return ok

def gen_files(port, pre_pins, post_pins):
    def pin_block(pins, tag):
        rows = ", ".join(f"('{s}','{h}')" for s, h in pins)
        return (f"  FOR r IN SELECT * FROM (VALUES {rows}) t(sig, md5) LOOP\n"
                f"    IF to_regprocedure(r.sig) IS NULL OR md5(pg_get_functiondef(to_regprocedure(r.sig))) <> r.md5 THEN RAISE EXCEPTION '{tag}_DRIFT:%', r.sig; END IF;\n  END LOOP;\n")
    acl_closed = (f"  IF EXISTS (SELECT 1 FROM unnest(ARRAY['{SIG_CB}','{SIG_CC}','{SIG_ACT}','{SIG_FENCE}']) s, unnest(ARRAY['anon','authenticated']) g\n"
                  "            WHERE has_function_privilege(g, s, 'EXECUTE')) THEN RAISE EXCEPTION 'PRIVATE_ACL_OPEN'; END IF;\n")
    pre = ("-- PRE (READ ONLY). Gerado por test-local.py. Pins: invólucros = captura real 03/11; demais = derivados da composição v4\n"
           "-- no PG descartável (CONFIRMAR por captura read-only antes de aplicar; divergência aborta).\nBEGIN READ ONLY;\nDO $pre$ DECLARE r record; BEGIN\n"
           + pin_block(pre_pins, "PRE") + acl_closed +
           f"  IF to_regprocedure('{SIG_RD}') IS NOT NULL OR to_regprocedure('{SIG_PR}') IS NOT NULL THEN RAISE EXCEPTION 'PRE_ALREADY_INSTALLED'; END IF;\nEND $pre$;\nROLLBACK;\n")
    delta = lambda sig, a, b, n: (f"DO $d$ DECLARE v text := pg_get_functiondef('{sig}'::regprocedure); BEGIN\n"
        f"  IF (length(v) - length(replace(v, {lit(a)}, ''))) / length({lit(a)}) <> {n} THEN RAISE EXCEPTION 'DELTA_COUNT:{sig}'; END IF;\n"
        f"  EXECUTE replace(v, {lit(a)}, {lit(b)});\nEND $d$;\n")
    post_check = pin_block(post_pins, "POST") + acl_closed + (
        f"  IF EXISTS (SELECT 1 FROM unnest(ARRAY['{SIG_RD}','{SIG_PR}']) s, unnest(ARRAY['anon','authenticated','service_role']) g\n"
        "            WHERE has_function_privilege(g, s, 'EXECUTE')) THEN RAISE EXCEPTION 'POST_HELPER_ACL_OPEN'; END IF;\n")
    install = ("-- INSTALL candidato. Gerado por test-local.py — revisão do auditor; NÃO aplicar pelo agente. Ensaiar primeiro em homolog.\n"
               "BEGIN;\nSET LOCAL lock_timeout = '3s';\nDO $pre$ DECLARE r record; BEGIN\n" + pin_block(pre_pins, "PRE") + acl_closed +
               f"  IF to_regprocedure('{SIG_RD}') IS NOT NULL OR to_regprocedure('{SIG_PR}') IS NOT NULL THEN RAISE EXCEPTION 'PRE_ALREADY_INSTALLED'; END IF;\nEND $pre$;\n"
               + CANDIDATE.rstrip() + "\n" + delta(SIG_CB, *CORE_DELTA) + delta(SIG_CAT1, *CAT_DELTA)
               + "DO $post$ DECLARE r record; BEGIN\n" + post_check + "END $post$;\nCOMMIT;\n")
    post = "-- POST (READ ONLY). Gerado por test-local.py.\nBEGIN READ ONLY;\nDO $post$ DECLARE r record; BEGIN\n" + post_check + "END $post$;\nROLLBACK;\n"
    deny_rd = (f"CREATE OR REPLACE FUNCTION {SIG_RD.split('(')[0]}(p_partner_id uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$\n"
               "BEGIN RAISE EXCEPTION 'b2b_catalog_reader_closed' USING ERRCODE='42501'; END $f$;\n")
    deny_pr = (f"CREATE OR REPLACE FUNCTION {SIG_PR.split('(')[0]}(p_partner_id uuid, p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric, p_ref_date date)\n"
               " RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$\nBEGIN RAISE EXCEPTION 'b2b_catalog_reader_closed' USING ERRCODE='42501'; END $f$;\n")
    rollback = ("-- ROLLBACK deny-safe. Gerado por test-local.py. Devolve o catálogo B2B ao estado PRÉ (comprador volta a receber 42501\n"
                "-- tenant_catalog_fence_denied); helpers ficam fechados (corpo nega, sem EXECUTE de cliente) e NÃO são removidos.\n"
                "-- Não amplia nada: o estado PRÉ já negava B2B e mantinha controles internos.\nBEGIN;\nSET LOCAL lock_timeout = '3s';\n"
                "DO $pre$ DECLARE r record; BEGIN\n" + pin_block(post_pins, "RB_PRE") + "END $pre$;\n"
                + delta(SIG_CAT1, CAT_DELTA[1], CAT_DELTA[0], 3) + delta(SIG_CB, CORE_DELTA[1], CORE_DELTA[0], 1) + deny_rd + deny_pr +
                f"REVOKE ALL ON FUNCTION {SIG_RD} FROM PUBLIC, anon, authenticated, service_role;\nREVOKE ALL ON FUNCTION {SIG_PR} FROM PUBLIC, anon, authenticated, service_role;\n"
                "DO $post$ DECLARE r record; BEGIN\n" + pin_block([p for p in pre_pins], "RB_POST") + acl_closed + "END $post$;\nCOMMIT;\n")
    for n, t in [("01-pre.sql.review", pre), ("02-install.sql.review", install), ("03-post.sql.review", post), ("04-rollback-deny-safe.sql.review", rollback)]:
        (HERE / n).write_text(t)

def lit(s): return "'" + s.replace("'", "''") + "'"

def main():
    if not shutil.which("initdb"): print("initdb ausente"); return 2
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="b2bcat-", dir="/tmp")); tmp.chmod(0o777); port = 55437; SOCK[0] = str(tmp)
    pre = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
    subprocess.run(pre + ["initdb", "-D", str(tmp / "d"), "-U", "postgres", "-A", "trust"], check=True, capture_output=True)
    subprocess.run(pre + ["pg_ctl", "-D", str(tmp / "d"), "-o", f"-p {port} -k {tmp} -c listen_addresses=''", "-l", str(tmp / "log"), "-w", "start"], check=True, capture_output=True)
    rep = {"kind": "disposable_pg", "hosted": False, "synthetic_seams": ["auth.uid", "has_role", "is_platform_superadmin", "b2b_actor_scope",
           "b2b_internal_commercial_actor", "c2_internal_order_target_reason", "c1b_catalog_visibility_scope", "h15_actor_organization",
           "_saas_user_has_feature", "can_view_catalog_internal", "esquema mínimo de tabelas"]}
    ok = True
    try:
        psql(port, SCHEMA)
        for body in (ACTOR, SELLER_FN, CAN, B2B, CAT1, CAT2): psql(port, body)
        for s in (SIG_ACT, "platform_private.catalog_tenant_seller(uuid)"): psql(port, f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon, authenticated, service_role")
        # composição v4: cerca (mesma geração do fence_section) só para os dois invólucros de preço
        out = []
        fence_section.FENCED[:] = [r for r in fence_section.FENCED if r[0] in (SIG_WC, SIG_WB)]
        fence_section.CLOSED_PLATFORM[:] = []
        psql(port, "CREATE TABLE public.ledger(step text, detail jsonb);")
        fence_section.fence_sql(out.append, "public.ledger", lit)
        for s in out: psql(port, s)
        # delta v4 do vendedor em get_partner_catalog_secure(uuid) (ae_section.DELTAS)
        for sig, reps in ae_section.DELTAS:
            if sig != "get_partner_catalog_secure(uuid)": continue
            v = psql(port, f"SELECT pg_get_functiondef('{SIG_CAT1}'::regprocedure)").stdout
            for a, b, n in reps:
                assert v.count(a) == n; v = v.replace(a, b)
            psql(port, v)
        for s in (SIG_CAT1, SIG_CAT2): psql(port, f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION {s} TO authenticated")
        psql(port, FIXTURES)
        rep["wrapper_md5_vs_capture_20261103"] = {
            SIG_WB: {"composed": md5_of(port, SIG_WB), "captured": "87418209039589320959c9891e97916c"},
            SIG_WC: {"composed": md5_of(port, SIG_WC), "captured": "b201e49e0158bde0140e018282c047fc"}}
        ok &= all(v["composed"] == v["captured"] for v in rep["wrapper_md5_vs_capture_20261103"].values())
        pre_pins = [(s, md5_of(port, s)) for s in (SIG_WB, SIG_WC, SIG_CB, SIG_CC, SIG_CAT1, SIG_CAT2, SIG_ACT, SIG_FENCE, "public.can_view_catalog_internal(uuid)")]
        pre_pins = [p for p in pre_pins if p[0] != "public.can_view_catalog_internal(uuid)"]  # stub sintético: não pinável
        rep["pre_pins"] = {s: {"md5": h, "source": "captura_real_20261103" if s in (SIG_WB, SIG_WC) else ("captura_live_20261101" if s in (SIG_CAT2, SIG_ACT) else "derivado_composicao_v4_confirmar_captura")} for s, h in pre_pins}
        ok &= rep["pre_pins"][SIG_CAT2]["md5"] == "1391adc2133b922e2dcea4b1d3e26820" and rep["pre_pins"][SIG_ACT]["md5"] == "5e0ce9cc9122f1c21d76e29a13de8b59"
        # ===== RED (corpos atuais) =====
        red = matrix(port)
        rep["red"] = red
        rep["red_reproduced"] = red["buyer_P1"] == ("42501", "tenant_catalog_fence_denied") and red["internal_A_reads_P1"][0] is None
        ok &= rep["red_reproduced"]
        # md5 pós-install: aplicar candidato numa transação descartada para calcular pins
        tmp_sql = HERE / ".tmp-install.sql"
        cand = CANDIDATE
        def d(sig, a, b, n):
            return (f"DO $d$ DECLARE v text := pg_get_functiondef('{sig}'::regprocedure); BEGIN IF (length(v)-length(replace(v,{lit(a)},'')))/length({lit(a)}) <> {n} THEN RAISE EXCEPTION 'DELTA'; END IF; EXECUTE replace(v,{lit(a)},{lit(b)}); END $d$;")
        sigs_post = [SIG_WB, SIG_WC, SIG_CB, SIG_CC, SIG_CAT1, SIG_CAT2, SIG_ACT, SIG_FENCE, SIG_RD, SIG_PR]
        # ROLLBACK descarta _pins_keep também; recalcular fora: aplicar e ler, depois gerar arquivos e reconstruir estado pré
        tmp_sql.write_text("BEGIN;\n" + cand + d(SIG_CB, *CORE_DELTA) + d(SIG_CAT1, *CAT_DELTA) +
                           "".join(f"SELECT '{s}', md5(pg_get_functiondef('{s}'::regprocedure));\n" for s in sigs_post) + "ROLLBACK;\n")
        r = subprocess.run(["psql", "-X", "-q", "-At", "-F", "|", "-h", SOCK[0], "-p", str(port), "-U", "postgres", "-d", "postgres", "-f", str(tmp_sql)], capture_output=True, text=True)
        tmp_sql.unlink()
        post_pins = [tuple(l.split("|")) for l in r.stdout.strip().splitlines() if "|" in l]
        assert len(post_pins) == len(sigs_post), r.stderr
        gen_files(port, pre_pins, post_pins)
        rep["post_pins"] = dict(post_pins)
        # ===== PRE / INSTALL / POST / rerun =====
        for n in ("01-pre.sql.review",):
            x = runfile(port, HERE / n); rep["pre"] = x.returncode == 0; ok &= rep["pre"]
        x = runfile(port, HERE / "02-install.sql.review"); rep["install"] = x.returncode == 0; ok &= rep["install"]
        if x.returncode: rep["install_err"] = x.stderr[-400:]
        x = runfile(port, HERE / "03-post.sql.review"); rep["post"] = x.returncode == 0; ok &= rep["post"]
        x = runfile(port, HERE / "02-install.sql.review"); rep["rerun_install_aborts"] = x.returncode != 0 and "PRE_DRIFT" in x.stderr; ok &= rep["rerun_install_aborts"]
        rep["public_wrappers_unchanged"] = md5_of(port, SIG_WB) == "87418209039589320959c9891e97916c" and md5_of(port, SIG_WC) == "b201e49e0158bde0140e018282c047fc"
        ok &= rep["public_wrappers_unchanged"]
        rep["acl_after"] = {s: acl_open(port, s) for s in (SIG_CB, SIG_CC, SIG_RD, SIG_PR, SIG_ACT, SIG_FENCE)}
        ok &= all(v == [] for v in rep["acl_after"].values())
        # ===== GREEN =====
        green = matrix(port); rep["green"] = green
        rep["green_checks"] = gc = judge_after(green); ok &= all(gc.values())
        # ===== ROLLBACK deny-safe =====
        x = runfile(port, HERE / "04-rollback-deny-safe.sql.review"); rep["rollback"] = x.returncode == 0; ok &= rep["rollback"]
        if x.returncode: rep["rollback_err"] = x.stderr[-400:]
        after_rb = matrix(port)
        rep["after_rollback"] = {"buyer_P1": after_rb["buyer_P1"], "internal_A_reads_P1_count": len(after_rb["internal_A_reads_P1"][1]) if after_rb["internal_A_reads_P1"][0] is None else after_rb["internal_A_reads_P1"],
                                 "buyer_direct_item_price_helper": after_rb["buyer_direct_item_price_helper"]}
        ok &= after_rb["buyer_P1"] == ("42501", "tenant_catalog_fence_denied") and after_rb["internal_A_reads_P1"][0] is None
        ok &= after_rb["buyer_direct_item_price_helper"][0] == "42501"
    finally:
        subprocess.run(pre + ["pg_ctl", "-D", str(tmp / "d"), "-m", "immediate", "stop"], capture_output=True); shutil.rmtree(tmp, ignore_errors=True)
    rep["result"] = "PASS" if ok else "FAIL"
    (HERE / "evidence-local.json").write_text(json.dumps(rep, indent=2, ensure_ascii=False, default=str) + "\n")
    print(json.dumps({k: rep[k] for k in rep if k not in ("red", "green")}, indent=1, ensure_ascii=False, default=str)[:6000]); return 0 if ok else 1

if __name__ == "__main__": sys.exit(main())
