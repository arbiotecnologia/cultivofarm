#!/usr/bin/env python3
"""Mesma bateria do harness.py, mas sobre o ESQUEMA REAL capturado (59 tabelas: tipos, NOT NULL, defaults, 320 índices,
232 policies, 255 gatilhos e grants) em vez de colunas sintéticas. Zero hosted.

O que continua sintético (declarado em real-schema-info.json): membership/papéis (stubs de auth), corpo do guard de
recebível, tabelas fiscais fora da captura, rótulos de enum nunca citados nos textos capturados, valores de fixture em
colunas NOT NULL sem default (default temporário removido antes dos testes) e gatilhos/policies cuja função não está
entre os corpos capturados (registrados como não instalados — nunca contados como PASS).
"""
import json, re, sys
import harness as H
import real_schema as RS
import real_extra_tests as RX
import definer_probe as DP

CAP = RS.load(H.CONSOL)
CONS_PATH = H.ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/captura-constraints-enums-20261102/schema-constraints-enums-20261102.json"
CONS_SHA = "aa64a31059e42d0ec439365106943f4abe2bab699132d30fbb06f33618dcaed8"
import hashlib as _h
assert _h.sha256(CONS_PATH.read_bytes()).hexdigest() == CONS_SHA, "captura de constraints/enums divergente"
CONS = json.loads(CONS_PATH.read_text())
# rótulos não citados como literal ::enum nos textos capturados; tipo_produto vem da captura schema-input usada no harness v2
def _types_enums():
    """Rótulos dos enums do arquivo de tipos gerado do ref canônico (src/integrations/supabase/cultivofarm.types.ts)."""
    src = (H.ROOT / "src/integrations/supabase/cultivofarm.types.ts").read_text()
    blk = src[src.index("    Enums: {", src.index("  public: {")):]
    blk = blk[:blk.index("\n    }\n")]
    out = {}
    for m in re.finditer(r"^      (\w+):((?:\s*\|?\s*\"[^\"]*\")+)", blk, re.M):
        out[m.group(1)] = re.findall(r'"([^"]*)"', m.group(2))
    return out
TYPES_ENUMS = _types_enums()
EXTRA_LABELS_V1 = {"app_role": ["administrador", "gestor", "cliente", "superadmin", "financeiro"],
                "tipo_produto": ["inoculante", "fungicida", "inseticida", "solo", "solubilizador"]}
EXTRA_LABELS = {k: TYPES_ENUMS.get(k, []) + [x for x in EXTRA_LABELS_V1.get(k, []) if x not in TYPES_ENUMS.get(k, [])]
                for k in set(TYPES_ENUMS) | set(EXTRA_LABELS_V1)}
FN = json.loads(H.FNJSON.read_text())["functions"]
TEXTS = [c["column_default"] or "" for c in CAP["columns"]] + [json.dumps(p["data"]) for p in CAP["policies_and_indexes"]] \
        + [f["definition"] for f in FN] + [w["definition"] for w in H.CONSOL["files"]["wrappers-globais-adicionais.json"]] \
        + [H.DATA, H.AFTER]
INFO = {}


def real_schema():
    fks = [l.split("\t") for l in H.TSV.read_text().splitlines() if l.strip()]
    tabs, idx, fk, info = RS.ddl(CAP, fks, TEXTS, extra_enum_labels=EXTRA_LABELS, cons=CONS)
    INFO.update(info)
    tabs = "\n".join(l for l in tabs.splitlines() if not l.startswith("CREATE TYPE "))
    sql = ["CREATE TABLE auth.users(id uuid PRIMARY KEY);", tabs]
    # índices reais antes das FKs (alvos únicos); falha registrada
    INFO["index_sql"] = idx; INFO["fk_sql"] = fk
    return "\n".join(sql), len(fks), len(set(f[0] for f in fks))


_ENUMS = "\n".join(l for l in RS.ddl(CAP, [], TEXTS, extra_enum_labels=EXTRA_LABELS, cons=CONS)[0].splitlines() if l.startswith("CREATE TYPE "))
BASE = ("CREATE EXTENSION IF NOT EXISTS btree_gist;\n"
        "CREATE SCHEMA cf_user_guards_v1; CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), revision bigint NOT NULL DEFAULT 0); /* colunas pelo uso nos corpos reais (relação extra ainda não capturada) */"
        " INSERT INTO cf_user_guards_v1.state VALUES (true);\n") + _ENUMS + "\n" + H.BASE.replace("CREATE FUNCTION platform_private.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT coalesce((SELECT mutate FROM platform_private.members WHERE user_id=u),false) AND r IN ('administrador','gestor') $$;", "CREATE TABLE platform_private.test_roles(user_id uuid, role text);  -- stub SINTÉTICO: papéis adicionais (financeiro/cliente)\nCREATE FUNCTION platform_private.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT (coalesce((SELECT mutate FROM platform_private.members WHERE user_id=u),false) AND r::text IN ('administrador','gestor')) OR EXISTS (SELECT 1 FROM platform_private.test_roles t WHERE t.user_id=u AND t.role=r::text) $$;").replace("CREATE TYPE public.app_role AS ENUM ('administrador','gestor','cliente');", "")
# stubs SINTÉTICOS dos helpers de policy não capturados que afetam as tabelas do catálogo (semântica declarada):
#   public.has_role(u, r): 'superadmin' => is_platform_superadmin; demais => platform_private.has_role (stub)
#   public.can_manage_catalog_tecnico(u) => papel mutate; public.fn_regulatory_can_read() => true (leitura LIVE sem tenant)
POLICY_HELPER_STUBS = """
CREATE FUNCTION public.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE WHEN r::text = 'superadmin' THEN public.is_platform_superadmin(u) ELSE platform_private.has_role(u, r) END $$;
CREATE FUNCTION public.can_manage_catalog_tecnico(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT platform_private.has_role(u,'gestor') $$;
CREATE FUNCTION public.fn_regulatory_can_read() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT auth.uid() IS NOT NULL $$;
"""
AFTER = POLICY_HELPER_STUBS + re.sub(r"ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;\nCREATE POLICY legado_leitura_global[^\n]*\nCREATE POLICY legado_escrita[^\n]*\n", "", H.AFTER)
FX_SET, FX_DROP = RS.fixture_defaults(CAP)
DATA = (H.DATA.replace("ALTER TABLE public.produtos ALTER COLUMN tipo SET DEFAULT 'inoculante';  -- só para semear fixtures; removido abaixo", "")
        .replace("partner_order_items(order_id,product_id,qty) VALUES ('" + H.ORD + "','" + H.P1 + "',3)",
                 "partner_order_items(order_id,product_id,quantidade) VALUES ('" + H.ORD + "','" + H.P1 + "',3)")
        .replace("microorganism_regulatory_publication_snapshots(dossier_id,microorganism_id,payload) VALUES ('" + H.D1 + "','" + H.M1 + "','{\"v\":1}')",
                 "microorganism_regulatory_publication_snapshots(dossier_id,microorganism_id,version,snapshot,snapshot_sha256) VALUES ('" + H.D1 + "','" + H.M1 + "',1,'{\"v\":1}','x')"))
FAZA = H.U(43)
# fixups exigidos por NOT NULL REAIS (o esquema sintético os aceitava): talhão AR Bio precisa de fazenda AR Bio
DATA = DATA.replace("INSERT INTO public.fazendas(id,organization_id) VALUES ('" + H.FAZF + "','" + H.FSF + "');",
                    "INSERT INTO public.fazendas(id,organization_id) VALUES ('" + H.FAZF + "','" + H.FSF + "'),('" + FAZA + "','" + H.ARB + "');")
DATA = DATA.replace("('" + H.TALA + "','" + H.ARB + "',NULL,'" + H.C1 + "')", "('" + H.TALA + "','" + H.ARB + "','" + FAZA + "','" + H.C1 + "')")
CLIA, CAMP = H.U(44), H.U(45)
DATA = DATA.replace("INSERT INTO public.clientes(id,organization_id) VALUES ('" + H.CLIF + "','" + H.FSF + "');",
                    "INSERT INTO public.clientes(id,organization_id) VALUES ('" + H.CLIF + "','" + H.FSF + "'),('" + CLIA + "','" + H.ARB + "');")
DATA = DATA.replace("visitas_campo(cliente_id,talhao_id,cultura_id,registro_consultor_id) VALUES (NULL,", "visitas_campo(cliente_id,talhao_id,cultura_id,registro_consultor_id) VALUES ('" + CLIA + "',")
DATA = DATA.replace("ordens_servico_onfarm(cliente_id,produto_id) VALUES ('" + H.CLIF + "','" + H.P3 + "')",
                    "ordens_servico_onfarm(cliente_id,fazenda_id,talhao_id,produto_id) VALUES ('" + H.CLIF + "','" + H.FAZF + "','" + H.TALF + "','" + H.P3 + "')")
DATA = DATA.replace("INSERT INTO public.commercial_campaign_products(product_id) VALUES ('" + H.P2 + "');",
                    "INSERT INTO public.commercial_campaigns(id) VALUES ('" + CAMP + "'); INSERT INTO public.commercial_campaign_products(campaign_id,product_id) VALUES ('" + CAMP + "','" + H.P2 + "');")
NCM1 = H.U(61)
DATA = DATA.replace("INSERT INTO public.catalog_tenant_visibility(", "INSERT INTO public.microorganism_ncm_candidates(id,dossier_id,ncm,justification,confidence,status) VALUES ('" + NCM1 + "','" + H.D1 + "','31010000','fixture','LOW','APPROVED');\n"
                    "UPDATE public.microorganism_regulatory_dossiers SET published_ncm_candidate_id='" + NCM1 + "' WHERE id='" + H.D1 + "';\nINSERT INTO public.catalog_tenant_visibility(", 1)
# v2.12: fiscal_invoices real exige company_settings_id (FK company_fiscal_settings) e created_by NOT NULL — fixture
# de configuração fiscal por empresa (tudo desligado) e autor = gestor da própria empresa; nada afrouxado
CFS_A, CFS_F = H.U(70), H.U(71)
_cfs0 = "INSERT INTO public.company_fiscal_settings(organization_id,nfe_enabled,nfse_enabled,production_enabled) VALUES ('" + H.ARB + "',false,false,false);"
_fi0 = "INSERT INTO public.fiscal_invoices(id,organization_id,invoice_type) VALUES ('" + H.U(51) + "','" + H.ARB + "','NFE'),('" + H.U(52) + "','" + H.ARB + "','NFSE'),('" + H.U(53) + "','" + H.FSF + "','NFE');"
assert _cfs0 in DATA and _fi0 in DATA, "fixture fiscal do harness mudou"
DATA = DATA.replace(_cfs0, "INSERT INTO public.company_fiscal_settings(id,organization_id,nfe_enabled,nfse_enabled,production_enabled) VALUES ('" + CFS_A + "','" + H.ARB + "',false,false,false),('" + CFS_F + "','" + H.FSF + "',false,false,false);")
DATA = DATA.replace(_fi0, "INSERT INTO public.fiscal_invoices(id,organization_id,invoice_type,company_settings_id,created_by) VALUES ('" + H.U(51) + "','" + H.ARB + "','NFE','" + CFS_A + "','" + H.UA + "'),('" + H.U(52) + "','" + H.ARB + "','NFSE','" + CFS_A + "','" + H.UA + "'),('" + H.U(53) + "','" + H.FSF + "','NFE','" + CFS_F + "','" + H.UF + "');")
DATA = re.sub(r"ALTER TABLE public.produtos ALTER COLUMN tipo DROP DEFAULT;[^\n]*\n", "", DATA)
# profiles é tabela REAL (com gatilhos reais de guarda): semeada uma vez, antes dos gatilhos, a partir dos membros sintéticos
DATA += "\nINSERT INTO public.profiles(user_id, organization_id, ativo, senha_provisoria) SELECT user_id, org, true, false FROM platform_private.members WHERE org IS NOT NULL;\n"
# v2.8: semeadura conforme as 158 CHECK REAIS (nenhuma regra afrouxada; valores escolhidos para satisfazer o predicado real)
SHA64 = "0" * 64
CHECK_FIXUPS = [
    ("catalog_tenant_visibility(organization_id,produto_id) VALUES ('" + H.ARB + "','" + H.P1 + "')",
     "catalog_tenant_visibility(organization_id,produto_id,entity_type,version) VALUES ('" + H.ARB + "','" + H.P1 + "','produto',1)"),
    ("catalogo_volumes(id,produto_id) VALUES ('" + H.V1 + "','" + H.P1 + "')",
     "catalogo_volumes(id,produto_id,item_tipo,volume_ml) VALUES ('" + H.V1 + "','" + H.P1 + "','produto',1000)"),
    ("commercial_price_rules(partner_id,product_id) VALUES ('" + H.PF + "','" + H.P1 + "')",
     "commercial_price_rules(partner_id,product_id,buyer_scope,pricing_mode,unit_type) VALUES ('" + H.PF + "','" + H.P1 + "','partner','quote_only','hectare')"),
    ("microorganism_ncm_candidates(id,dossier_id,ncm,justification,confidence,status) VALUES ('" + NCM1 + "','" + H.D1 + "','31010000','fixture','LOW','APPROVED')",
     "microorganism_ncm_candidates(id,dossier_id,ncm,justification,confidence,status,source_id,official_description,table_version,table_reference_date,decided_at,decided_by,consulted_at) VALUES ('"
     + NCM1 + "','" + H.D1 + "','31010000','fixture sintetica de teste local apenas','LOW','APPROVED','" + H.U(62) + "','descricao oficial ficticia','fixture-v1',CURRENT_DATE,now(),'" + H.UA + "',now())"),
    ("microorganism_regulatory_dossiers(id,microorganism_id) VALUES ('" + H.D1 + "','" + H.M1 + "')",
     "microorganism_regulatory_dossiers(id,microorganism_id,version) VALUES ('" + H.D1 + "','" + H.M1 + "',1)"),
    ("microorganism_regulatory_presentations(dossier_id,catalog_volume_id) VALUES ('" + H.D1 + "','" + H.V1 + "')",
     "microorganism_regulatory_presentations(dossier_id,catalog_volume_id,volume_ml) VALUES ('" + H.D1 + "','" + H.V1 + "',1000)"),
    ("version,snapshot,snapshot_sha256) VALUES ('" + H.D1 + "','" + H.M1 + "',1,'{\"v\":1}','x')",
     "version,snapshot,snapshot_sha256) VALUES ('" + H.D1 + "','" + H.M1 + "',1,'{\"v\":1}','" + SHA64 + "')"),
    ("ordens_servico(organization_id,microrganismo_id) VALUES ('" + H.FSF + "','" + H.M3 + "')",
     "ordens_servico(organization_id,microrganismo_id,origem,cliente_id,fazenda_id,talhao_id) VALUES ('" + H.FSF + "','" + H.M3 + "','agronomica','" + H.CLIF + "','" + H.FAZF + "','" + H.TALF + "')"),
    ("produto_composicao_conjuntos(produto_id) VALUES ('" + H.P1 + "')",
     "produto_composicao_conjuntos(produto_id,status) VALUES ('" + H.P1 + "','rascunho')"),
    ("produto_composicao_declaracoes(produto_id,microrganismo_id) VALUES ('" + H.P1 + "','" + H.M3 + "')",
     "produto_composicao_declaracoes(produto_id,microrganismo_id,tipo_componente,natureza,ordem) VALUES ('" + H.P1 + "','" + H.M3 + "','microrganismo','teor_garantido',1)"),
]
# UNIQUE(partner_id) REAL de partner_financial_settings (captura extras 02/11): as 4 configurações (3 auto=true) são de
# 4 parceiros distintos — três parceiros sintéticos adicionais da AR Bio, sem pedidos (não alteram os 7 pedidos).
CHECK_FIXUPS.append((
    "INSERT INTO public.partner_financial_settings(partner_id,auto_generate_receivable) VALUES ('" + H.PF + "',true),('" + H.PF + "',true),('" + H.PF + "',true),('" + H.PF + "',false);",
    "INSERT INTO public.partner_accounts(id,commercial_owner_organization_id) VALUES ('" + H.U(70) + "','" + H.ARB + "'),('" + H.U(71) + "','" + H.ARB + "'),('" + H.U(72) + "','" + H.ARB + "');\n"
    "INSERT INTO public.partner_financial_settings(partner_id,auto_generate_receivable) VALUES ('" + H.PF + "',true),('" + H.U(70) + "',true),('" + H.U(71) + "',true),('" + H.U(72) + "',false);"))
for _a, _b in CHECK_FIXUPS:
    assert _a in DATA, "fixup sem alvo: " + _a[:80]   # fail-fast: fixture mudou sem revisão
    DATA = DATA.replace(_a, _b)

HELPERS_PATH = H.ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/captura-helpers-20261102/helpers-fechamento-20261102.json"
HELPERS_SHA = "4a9f93d5ce1e304e78166ef85f43c2e4f5fbd267fcca8218bb5bced3bd1583ba"
assert _h.sha256(HELPERS_PATH.read_bytes()).hexdigest() == HELPERS_SHA, "captura de helpers divergente"
HELPERS = json.loads(HELPERS_PATH.read_text())
# 48 funções EXTRAS (captura READ ONLY 02/11 de fechamento das agregadoras; expansão léxica da união 129+300) + a view
# v_microorganism_fiscal_readiness; carregadas verbatim com md5 conferido, na mesma passagem dos 300 helpers.
AGG_PATH = H.ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/captura-agregadoras-20261102/fechamento-agregadoras-20261102.json"
AGG_SHA = "c0ae497b274aa53765fef4b11f6effa685ba8b58b2e00f76b045f7fb9d009fba"
assert _h.sha256(AGG_PATH.read_bytes()).hexdigest() == AGG_SHA, "captura de agregadoras divergente"
AGG = json.loads(AGG_PATH.read_text())
assert len(AGG["functions"]) == 48 and not ({f["signature"] for f in AGG["functions"]} & {f["signature"] for f in HELPERS["functions"]}), "assinaturas extras sobrepostas"
_CAPREL = {c["table_name"] for c in CAP["columns"]}
ABSENT_RELS = {f'{r["schema_name"]}.{r["relname"]}' for r in HELPERS["relations"] if r["relname"] not in _CAPREL}
HELPER_SKIP = set()   # nenhuma função da captura é pulada
# Reinstalados como STUB após a carga real: dependem de user_roles/profiles/assinaturas ausentes do esquema descartável
HELPER_SYNTHETIC = ["platform_private.has_role(uuid,app_role)", "platform_private.h15_actor_organization()",
                    "is_platform_superadmin(uuid)", "_saas_user_has_feature(uuid,text)"]
_STUB_RE = r"CREATE FUNCTION (platform_private\.has_role|platform_private\.h15_actor_organization|public\.is_platform_superadmin|public\._saas_user_has_feature)\([^\n]*\$\$;"
IDENTITY_STUBS = ("DROP FUNCTION platform_private.has_role(uuid, public.app_role); DROP FUNCTION platform_private.h15_actor_organization();"
                  " DROP FUNCTION public.is_platform_superadmin(uuid); DROP FUNCTION public._saas_user_has_feature(uuid,text);\n"
                  + "\n".join(m.group(0) for m in re.finditer(_STUB_RE, BASE)))
assert IDENTITY_STUBS.count("CREATE FUNCTION") == 4
# v2.11: default REAL de recurring_financial_templates.organization_id usa h15_actor_organization() -> o stub troca o
# corpo com CREATE OR REPLACE (mesma assinatura/retorno), sem DROP que quebraria a dependência real
IDENTITY_STUBS = IDENTITY_STUBS.replace(" DROP FUNCTION platform_private.h15_actor_organization();", "").replace(
    "CREATE FUNCTION platform_private.h15_actor_organization(", "CREATE OR REPLACE FUNCTION platform_private.h15_actor_organization(")
# Espelho SINTÉTICO de identidade: profiles/user_roles (tabelas dos tipos gerados) refletem members/test_roles, para que
# helpers REAIS que leem profiles/user_roles (can_view_catalog_internal, fn_regulatory_can_read...) vejam os mesmos atores.
IDENTITY_MIRROR = """
CREATE OR REPLACE FUNCTION platform_private.test_identity_mirror() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $m$ BEGIN
  -- identidades SINTÉTICAS explícitas: todo ator de fixture existe em auth.users (FK real user_roles_user_id_fkey)
  INSERT INTO auth.users(id) SELECT user_id FROM platform_private.members UNION SELECT user_id FROM platform_private.test_roles ON CONFLICT DO NOTHING;
  DELETE FROM public.user_roles;
  INSERT INTO public.user_roles(user_id, role) SELECT user_id, r::public.app_role FROM platform_private.members, unnest(ARRAY['administrador','gestor']) r WHERE mutate
    UNION SELECT user_id, 'superadmin'::public.app_role FROM platform_private.members WHERE sa
    UNION SELECT user_id, role::public.app_role FROM platform_private.test_roles WHERE role IN (SELECT unnest(enum_range(NULL::public.app_role))::text);
  RETURN NULL; END $m$;
CREATE TRIGGER test_identity_mirror AFTER INSERT OR UPDATE OR DELETE ON platform_private.members FOR EACH STATEMENT EXECUTE FUNCTION platform_private.test_identity_mirror();
CREATE TRIGGER test_identity_mirror AFTER INSERT OR UPDATE OR DELETE ON platform_private.test_roles FOR EACH STATEMENT EXECUTE FUNCTION platform_private.test_identity_mirror();
UPDATE platform_private.members SET mutate = mutate;
"""
# Entitlements: folha SINTÉTICA (assinatura/plano/módulos são as relações extras ainda não capturadas); todas as
# funcionalidades citadas nos corpos reais ficam habilitadas para membros de organização ATIVA — mesma semântica do stub
# `_saas_user_has_feature` anterior. Revogação de feature continua testada pelos cenários que trocam o stub.
_ALLTXT = "\n".join(f["definition"] for f in HELPERS["functions"]) + "\n".join(f["definition"] for f in FN)
FEATURE_KEYS = sorted(set(re.findall(r"feature_key\s*=\s*'(\w+)'", _ALLTXT)) | set(re.findall(r"_saas_user_has_feature\([^,()]+,\s*'(\w+)'", _ALLTXT)))
ENTITLEMENTS_STUB = ("DROP FUNCTION platform_private.entitlements_for_user(uuid);\n"
    "CREATE FUNCTION platform_private.entitlements_for_user(_uid uuid) RETURNS TABLE(module_key text, feature_key text, limit_value numeric, config jsonb) "
    "LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $e$ SELECT 'stub'::text, k, NULL::numeric, '{}'::jsonb FROM unnest(ARRAY["
    + ",".join("'" + k + "'" for k in FEATURE_KEYS) + "]::text[]) k WHERE EXISTS (SELECT 1 FROM platform_private.members m JOIN public.organizations o ON o.id=m.org AND o.ativo IS TRUE WHERE m.user_id=_uid) $e$;")
HELPER_SYNTHETIC.append("platform_private.entitlements_for_user(uuid)")
TYPES_SRC = (H.ROOT / "src/integrations/supabase/cultivofarm.types.ts").read_text()
ENUM_NAMES = set(re.findall(r"CREATE TYPE public\.(\w+) AS ENUM", _ENUMS))
import extras_schema as XS
import v211_deps as V211   # 15 relações/10 funções/view/2 sequências reais (captura v2.11), sem stub
V211_MERGE = V211.merge()
import v212_security as V212   # 6 relações + segurança real das 21 (captura v2.12), sem stub
import v212_guard_tests as V212T
V212_MERGE = V212.merge()
XP = XS.plan(TYPES_SRC, ENUM_NAMES, CONS["enums"])      # 68 relações extras REAIS (captura 02/11); tipos gerados só para o que restar
EXTRA_PUBLIC = {t for (sch, t) in XP["rels"] if sch == "public"}
TYPES_SQL, TYPES_TABLES = RS.types_tables(TYPES_SRC, EXTRA_PUBLIC, ENUM_NAMES | {t.split(":")[0] for t in XP["enums_from_types"]})



LEGACY_USED = []
_TRG_BY_TABLE = {}
for _t in CAP["triggers"]: _TRG_BY_TABLE.setdefault(_t["table_name"], []).append(_t["tgname"])
for _m in re.finditer(r"CREATE TRIGGER (\w+)[^;]*? ON public\.(\w+)", H.AFTER): _TRG_BY_TABLE.setdefault(_m.group(2), []).append(_m.group(1))
def legacy(table, stmt):
    """Suspensão NOMINAL (nunca ALL/USER) dos gatilhos capturados de `table` em volta de `stmt`; mesma TX do chamador."""
    names = sorted(set(_TRG_BY_TABLE.get(table, [])))
    off = "".join(f'ALTER TABLE public.{table} DISABLE TRIGGER "{n}";' for n in names)
    on = "".join(f'ALTER TABLE public.{table} ENABLE TRIGGER "{n}";' for n in names)
    return off + stmt + on if stmt else ""


class RealPG(H.PG):
    """Intercepta a semeadura: defaults temporários → DATA → remoção → índices/FKs reais → policies/gatilhos/grants reais."""
    def sql(self, s, ok=True):
        if s is DATA_SENTINEL:
            res = dict(index_fail=[], fk_fail=[], policy_fail=[], trigger_fail=[], grant_fail=[], seed=None)
            # relações EXTRAS reais antes da semeadura (colunas/defaults/identity/generated); NOT NULL/constraints depois
            res.update(extras_tables_fail=[], extras_stub_cols_removed={}, extras_notnull_fail=[], extras_constraint_fail=[],
                       extras_policy_fail=[], extras_view_fail=[], extras_skipped={f"{a}.{b}": v for (a, b), v in XP["skipped"].items()},
                       extras_unresolved_enums=XP["unresolved_enums"], extras_enums_from_generated_types=XP["enums_from_types"])
            if XP["enums_sql"]: super().sql(XP["enums_sql"])
            res["v211_merge"] = V211_MERGE; res["v211_sequence_fail"] = []
            for st in V211.sequences_sql():
                rr = super().sql(st, ok=False)
                if rr.startswith("ERR"): res["v211_sequence_fail"].append((st[:120], rr[:200]))
            for (sch, t), rel in sorted(XP["rels"].items()):
                if rel["relkind"] != "r" or (sch, t) in XP["skipped"]: continue
                ex = super().sql(f"SELECT coalesce(string_agg(attname, ','), '') FROM pg_attribute WHERE attrelid = to_regclass('{sch}.{t}') AND attnum > 0 AND NOT attisdropped", ok=False)
                stmts, removed = XS.table_sql(XP, sch, t, [c for c in ex.split(",") if c])
                if removed: res["extras_stub_cols_removed"][f"{sch}.{t}"] = removed
                for st in stmts:
                    rr = super().sql(st, ok=False)
                    if rr.startswith("ERR"): res["extras_tables_fail"].append((st[:160], rr[:200]))
            if res["extras_tables_fail"]:
                INFO["install"] = res; raise RuntimeError("FAIL-FAST EXTRAS: " + json.dumps(res["extras_tables_fail"][:20]))
            r = super().sql(FX_SET + "\n" + DATA + "\n" + FX_DROP, ok=False); res["seed"] = r[:600] if r.startswith("ERR") else "OK"
            if r.startswith("ERR"): raise RuntimeError("semeadura falhou no esquema real: " + r[:2000])
            for i in INFO["index_sql"]:
                if "_pkey ON" in i or True:
                    r = super().sql(i, ok=False)
                    if r.startswith("ERR"): res["index_fail"].append((i[:140], r[:160]))
            for f in INFO["fk_sql"]:
                r = super().sql(f, ok=False)
                if r.startswith("ERR"): res["fk_fail"].append((f[:140], r[:160]))
            for (sch, t), rel in sorted(XP["rels"].items()):
                if rel["relkind"] != "r" or (sch, t) in XP["skipped"]: continue
                for st in XS.notnull_sql(XP, sch, t):
                    rr = super().sql(st, ok=False)
                    if rr.startswith("ERR"): res["extras_notnull_fail"].append((st[:160], rr[:200]))
            res["extras_pk_stub_renamed"] = []
            for c, st in XS.constraints("pu"):
                if (c["schema_name"], c["table_name"]) in XP["skipped"]: continue
                rr = super().sql(st, ok=False)
                if rr.startswith("ERR") and "multiple primary keys" in rr:
                    # PK do stub do harness: aceita só se a definição for IDÊNTICA à real, e assume o nome real
                    rel = f"{XS.q(c['schema_name'])}.{XS.q(c['table_name'])}"
                    cur = super().sql(f"SELECT conname || '|' || pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = '{rel}'::regclass AND contype = 'p'", ok=False)
                    if cur == c["name"] + "|" + c["definition"]:
                        rr = "OK"; res["extras_pk_stub_renamed"].append(c["name"] + ":same_name")
                    elif cur.split("|", 1)[-1] == c["definition"]:
                        rr = super().sql(f"ALTER TABLE {rel} RENAME CONSTRAINT {XS.q(cur.split('|')[0])} TO {XS.q(c['name'])};", ok=False)
                        res["extras_pk_stub_renamed"].append(c["name"])
                if rr.startswith("ERR"): res["extras_constraint_fail"].append((c["name"], rr[:200]))
            if res["extras_notnull_fail"] or res["extras_constraint_fail"]:
                INFO["install"] = res; raise RuntimeError("FAIL-FAST EXTRAS NOT NULL/PK/UNIQUE: " + json.dumps((res["extras_notnull_fail"] + res["extras_constraint_fail"])[:20]))
            # 300 funções REAIS da captura de fechamento (02/11): carregadas verbatim; md5 de pg_get_functiondef conferido
            super().sql("CREATE SCHEMA IF NOT EXISTS private; GRANT USAGE ON SCHEMA private TO authenticated, anon;")
            before = set(super().sql("SELECT string_agg(relname, ',') FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'").split(","))
            super().sql("SET client_min_messages=warning;\n" + TYPES_SQL + ("" if "codigo_sequencias" in EXTRA_PUBLIC else "\nALTER TABLE public.codigo_sequencias ADD PRIMARY KEY (prefixo);  -- sintético: chave do ON CONFLICT LIVE"))
            res["synthetic_types_tables"] = sorted(set(TYPES_TABLES) - before)
            super().sql("DROP FUNCTION IF EXISTS public.fn_regulatory_can_read();")   # stub v2.7 substituído pelo corpo real (uuid DEFAULT)
            res["helpers_loaded"], res["helpers_fail"], res["helpers_md5_mismatch"], res["stubs_replaced"] = 0, [], [], []
            for f in HELPERS["functions"] + AGG["functions"]:
                if f["signature"] in HELPER_SKIP: continue
                r = super().sql("SET check_function_bodies=off;\n" + f["definition"] + "\n;", ok=False)
                if r.startswith("ERR") and "cannot change" in r:   # stub sintético anterior com outra assinatura de parâmetros/retorno
                    sig0 = f["signature"]; fq0 = sig0 if "." in sig0.split("(")[0] else "public." + sig0
                    super().sql(f"DROP FUNCTION {fq0.replace('(', '(', 1)};".replace(",", ", "), ok=False)
                    res["stubs_replaced"].append(sig0)
                    r = super().sql("SET check_function_bodies=off;\n" + f["definition"] + "\n;", ok=False)
                if r.startswith("ERR"): res["helpers_fail"].append((f["signature"], r[:200])); continue
                res["helpers_loaded"] += 1
                sig = f["signature"]; fq = sig if "." in sig.split("(")[0] else "public." + sig
                got = super().sql(f"SELECT md5(pg_get_functiondef('{fq}'::regprocedure));", ok=False)
                if got != f["definition_md5"]: res["helpers_md5_mismatch"].append((sig, got))
            # v2.11: 10 funções reais (overloads) verbatim; md5 conferido por assinatura de identidade
            res["v211_functions_loaded"], res["v211_functions_fail"], res["v211_md5_mismatch"] = 0, [], []
            for f in V211.functions():
                r = super().sql("SET check_function_bodies=off;\n" + f["definition"] + "\n;", ok=False)
                if r.startswith("ERR") and "cannot change" in r:
                    super().sql(f"DROP FUNCTION {f['schema']}.{f['name']}({f['args']});", ok=False); res["stubs_replaced"].append(f["schema"] + "." + f["name"])
                    r = super().sql("SET check_function_bodies=off;\n" + f["definition"] + "\n;", ok=False)
                if r.startswith("ERR"): res["v211_functions_fail"].append((f["schema"] + "." + f["name"], r[:200])); continue
                res["v211_functions_loaded"] += 1
                got = super().sql(V211.md5_sql(f), ok=False)
                if got != f["md5"]: res["v211_md5_mismatch"].append((f["schema"] + "." + f["name"], got))
            f2 = V212.function(); r = super().sql("SET check_function_bodies=off;\n" + f2["definition"] + "\n;", ok=False)
            res["v212_function"] = "OK" if not r.startswith("ERR") else r[:200]
            got = super().sql(V211.md5_sql(f2), ok=False); res["v212_function_md5_ok"] = got == f2["md5"]
            # identidade/papel continuam STUBS SINTÉTICOS declarados até prova JWT real (dependem de user_roles/profiles ausentes)
            super().sql(IDENTITY_STUBS); super().sql(ENTITLEMENTS_STUB); super().sql(IDENTITY_MIRROR)
            res["identity_stubs_reinstalled"] = list(HELPER_SYNTHETIC)
            res["check_fail"] = []
            for t, n, d in RS.checks(CONS):
                r = super().sql(d, ok=False)
                if r.startswith("ERR"):
                    expr = d.split(" CHECK ", 1)[1].rstrip(";").replace(" NOT VALID", "")
                    bad = super().sql(f"SELECT to_jsonb(x)::text FROM public.{t} x WHERE NOT coalesce(({expr[5:] if expr.startswith('CHECK') else expr}), true) LIMIT 1", ok=False)
                    res["check_fail"].append((t, n, r[:160], bad[:400]))
            res["checks_active"] = int(super().sql("SELECT count(*) FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace AND conname NOT LIKE '%_not_null'"))
            res["checks_total"] = len(RS.checks(CONS))
            if res["check_fail"] or res["checks_active"] != res["checks_total"]:
                INFO["install"] = res
                raise RuntimeError(f"FAIL-FAST CHECK: {res['checks_active']}/{res['checks_total']} ativas; falhas={res['check_fail'][:30]}")
            # extras: CHECK/FK (FK com alvo ausente é declarada), RLS, 160 policies, matview — depois dos helpers reais
            super().sql("UPDATE platform_private.members SET mutate = mutate;")   # reespelha identidades sintéticas em auth.users
            res["extras_constraint_same_stub"] = []
            for c, st in XS.constraints("cf"):
                if (c["schema_name"], c["table_name"]) in XP["skipped"]: res["extras_constraint_fail"].append((c["name"], "SKIPPED_TABLE_UNRESOLVED_ENUM")); continue
                rr = super().sql(st, ok=False)
                if rr.startswith("ERR") and "already exists" in rr:
                    rel = f"{XS.q(c['schema_name'])}.{XS.q(c['table_name'])}"
                    cur = super().sql(f"SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = '{rel}'::regclass AND conname = '{c['name']}'", ok=False)
                    if cur == c["definition"]: rr = "OK"; res["extras_constraint_same_stub"].append(c["name"])
                if rr.startswith("ERR"): res["extras_constraint_fail"].append((c["name"], rr[:200]))
            for st in XS.rls_sql(XP): super().sql(st)
            for pol in XS.X["policies"]:
                if (pol["schema_name"], pol["table_name"]) in XP["skipped"]: res["extras_policy_fail"].append((pol["name"], "SKIPPED_TABLE_UNRESOLVED_ENUM")); continue
                rr = super().sql(XS.policy_sql(pol), ok=False)
                if rr.startswith("ERR"): res["extras_policy_fail"].append((pol["schema_name"] + "." + pol["table_name"] + ":" + pol["name"], rr[:200]))
            res["v212_merge"] = V212_MERGE
            vn2, vs2 = V212.view_sql(); rr = super().sql(vs2, ok=False)
            res["v212_view"] = "OK" if not rr.startswith("ERR") else rr[:300]
            vn0, vs0 = V211.view_sql(); rr = super().sql(vs0, ok=False)
            res["v211_view"] = "OK" if not rr.startswith("ERR") else rr[:300]
            for v in AGG["views"]:
                vq = f'{XS.q(v["schema_name"])}.{XS.q(v["relname"])}'
                rr = super().sql(f"DROP VIEW IF EXISTS {vq}; DROP TABLE IF EXISTS {vq}; CREATE VIEW {vq} AS {v['definition']}", ok=False)
                if rr.startswith("ERR"): res["extras_view_fail"].append((v["relname"], rr[:200]))
                else: res.setdefault("agg_views_installed", []).append(v["relname"])
            for vn, st in XS.views_sql():
                rr = super().sql(st, ok=False)
                if rr.startswith("ERR"): res["extras_view_fail"].append((vn, rr[:200]))
            res["extras_constraints_active"] = len(XS.X["constraints"]) - len(res["extras_constraint_fail"])
            res["extras_policies_active"] = len(XS.X["policies"]) - len(res["extras_policy_fail"])
            pols, ptabs = RS.policies(CAP)
            for t in ptabs: super().sql(f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;")
            for t, n, p in pols:
                r = super().sql(p, ok=False)
                if r.startswith("ERR"): res["policy_fail"].append((t, n, r[:200]))
            for t, n, fn, d in RS.triggers(CAP):
                r = super().sql(d, ok=False)
                if r.startswith("ERR"): res["trigger_fail"].append((t, n, fn, r[:160]))
            # gatilhos NÃO são mais removidos: dependências ausentes são apenas declaradas (função ausente = falha do gap)
            res["trigger_missing_deps"] = []
            for t, n, fn, d in RS.triggers(CAP):
                body = super().sql(f"SELECT coalesce((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('{fn if '.' in fn else 'public.' + fn}')),'')", ok=False)
                if not body or body.startswith("ERR"): continue
                missing = []
                for m in set(re.findall(r"\b(public|platform_private|private)\.(\w+)\s*\(", body)):
                    if super().sql(f"SELECT to_regclass('{m[0]}.{m[1]}') IS NOT NULL", ok=False) == "t": continue   # INSERT INTO rel(...)
                    ok_ = super().sql(f"SELECT count(*) FROM pg_proc WHERE proname='{m[1]}' AND pronamespace=to_regnamespace('{m[0]}')", ok=False)
                    if ok_ == "0": missing.append(".".join(m))
                if missing: res["trigger_missing_deps"].append((t, n, fn, sorted(missing)))
            for g in RS.grants(CAP):
                r = super().sql(g, ok=False)
                if r.startswith("ERR"): res["grant_fail"].append((g, r[:120]))
            # v2.12: funções de gatilho verbatim (MD5 conferido), 76 gatilhos reais e ACL real das 21 relações
            res["v212_trigger_fn_fail"], res["v212_trigger_fn_md5_mismatch"], res["v212_trigger_fail"] = [], [], []
            # esquemas das funções capturadas (ex.: finance_private) criados VAZIOS só como namespace; nenhum objeto simulado
            res["v212_schemas_created"] = []
            for sch in sorted({fn.split(".")[0] for fn in V212.trigger_functions()}):
                if super().sql(f"SELECT to_regnamespace('{sch}') IS NULL", ok=False) == "t":
                    super().sql(f"CREATE SCHEMA {XS.q(sch)}; REVOKE ALL ON SCHEMA {XS.q(sch)} FROM PUBLIC;"); res["v212_schemas_created"].append(sch)
            for fn, (dfn, md5) in sorted(V212.trigger_functions().items()):
                cur = super().sql(f"SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE p.oid = to_regprocedure('{fn}()')", ok=False)
                if cur != md5:
                    r = super().sql("SET check_function_bodies=off;\n" + dfn + "\n;", ok=False)
                    if r.startswith("ERR"): res["v212_trigger_fn_fail"].append((fn, r[:200])); continue
                    cur = super().sql(f"SELECT md5(pg_get_functiondef(to_regprocedure('{fn}()')))", ok=False)
                if cur != md5: res["v212_trigger_fn_md5_mismatch"].append((fn, cur))
            for sch, t, n, d in V212.triggers():
                r = super().sql(f'DROP TRIGGER IF EXISTS {XS.q(n)} ON {XS.fq(sch, t)}; ' + d + ";", ok=False)
                if r.startswith("ERR"): res["v212_trigger_fail"].append((t, n, r[:200]))
                else: _TRG_BY_TABLE.setdefault(t, []).append(n)
            res["v213_index_fail"] = [(i, r[:160]) for i in V212.INDEXES13 for r in [super().sql(i + ";", ok=False)] if r.startswith("ERR")]
            res["v212_triggers_active"] = int(super().sql("SELECT count(*) FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid WHERE NOT g.tgisinternal AND g.tgenabled='O' AND (c.relnamespace::regnamespace::text, c.relname) IN (" + ",".join(f"('{a}','{b}')" for a, b in V212.RELS) + ")"))
            major = int(super().sql("SHOW server_version_num")) // 10000
            acl, res["v212_acl_maintain_not_supported"] = V212.acl_sql(major)
            res["v212_acl_fail"] = [(g, r[:120]) for g in acl for r in [super().sql(g, ok=False)] if r.startswith("ERR")]
            res["v212_acl_mismatch"] = []
            for (rel, who), letters in sorted(V212.acl_expected().items()):
                for ch, priv in V212.PRIV.items():
                    if ch == "m": continue
                    has = super().sql(f"SELECT has_table_privilege('{who}', '{rel}', '{priv}')", ok=False) == "t"
                    if has != (ch in letters): res["v212_acl_mismatch"].append(f"{rel}:{who}:{priv}:{has}")
            res["v212_rls_mismatch"] = [f"{a}.{b}" for (a, b), r in V212.RELS.items()
                if super().sql(f"SELECT relrowsecurity::text||relforcerowsecurity::text FROM pg_class WHERE oid=to_regclass('{a}.{b}')", ok=False)
                != str(r["relrowsecurity"]).lower() + str(r["relforcerowsecurity"]).lower()]
            INFO["install"] = res
            return ""
        # microrganismos.tipo é NOT NULL real (enum tipo_microrganismo): cenários de INSERT sem tipo recebem 'bacteria'
        s = re.sub(r"INSERT INTO public\.microrganismos\(nome\) VALUES \('([^']*)'\)", r"INSERT INTO public.microrganismos(nome,tipo) VALUES ('\1','bacteria')", s)
        # v2.8: gatilho REAL de código roda antes da RLS; cenários de negação também precisam do tipo NOT NULL real
        s = re.sub(r"INSERT INTO public\.microrganismos\(nome,owner_organization_id\) VALUES \('([^']*)',", r"INSERT INTO public.microrganismos(nome,tipo,owner_organization_id) VALUES ('\1','bacteria',", s)
        s = s.replace("catalogo_volumes(produto_id, owner_organization_id) SELECT id, ", "catalogo_volumes(item_tipo, volume_ml, produto_id, owner_organization_id) SELECT 'produto', 1000, id, ")
        s = s.replace("catalogo_volumes(id, produto_id, owner_organization_id) VALUES (gen_random_uuid(), ", "catalogo_volumes(item_tipo, volume_ml, id, produto_id, owner_organization_id) VALUES ('produto', 1000, gen_random_uuid(), ")
        s = s.replace("UPDATE public.partner_order_items SET qty=4;", "UPDATE public.partner_order_items SET quantidade=4;")
        # v2.8 — injeção de ESTADO LEGADO pelos cenários negativos: as linhas representam dados pré-existentes que os gatilhos
        # reais (que valem para escritas novas) recusariam. Suspensão NOMINAL só dos gatilhos capturados da tabela-alvo, na
        # mesma TX, reabilitados ANTES do PRE/migração; CHECK/FK/NOT NULL reais continuam valendo (nada afrouxado).
        if s.startswith("BEGIN; INSERT INTO public.entregas(organization_id,lote_id,produto_id)"):
            head, rest = s.split(";\n", 1)
            ins = head[len("BEGIN; "):] + ";"
            s = "BEGIN; " + FX_SET + "\n" + legacy("entregas", ins) + "\n" + FX_DROP + "\n" + rest
            LEGACY_USED.append("DIV-1:entregas")
            return super().sql(s, ok)
        if s.startswith("BEGIN; INSERT INTO public.ordens_servico(id) VALUES"):
            head, rest = s.split(";\n", 1)
            oid = re.search(r"VALUES \('([^']+)'\)", head).group(1)
            ins = (f"INSERT INTO public.ordens_servico(id,origem,cliente_id,fazenda_id,talhao_id) VALUES ('{oid}','agronomica','{H.CLIF}','{H.FAZF}','{H.TALF}');")
            LEGACY_USED.append("CHN-1:ordens_servico")
            return super().sql("BEGIN; " + FX_SET + "\n" + legacy("ordens_servico", ins) + "\n" + FX_DROP + "\n" + rest, ok)
        if "UPDATE public.partner_orders SET receivable_generated=true WHERE c2_external_origin_snapshot IS NOT NULL;" in s:
            s = s.replace("UPDATE public.partner_orders SET receivable_generated=true WHERE c2_external_origin_snapshot IS NOT NULL;",
                          legacy("partner_orders", "UPDATE public.partner_orders SET receivable_generated=true WHERE c2_external_origin_snapshot IS NOT NULL;"), 1)
            LEGACY_USED.append("POST-1:partner_orders")
        if s.startswith("INSERT INTO public.commercial_price_rules(id,product_id) VALUES ('" + H.RULE_ORPHAN + "'"):
            # regra órfã REAL: CHECK exige parceiro/cliente; órfã = parceiro sem dono comercial (único estado sem tenant possível)
            orphan_partner = H.U(63)
            fxp = f"INSERT INTO public.partner_accounts(id,commercial_owner_organization_id) VALUES ('{orphan_partner}',NULL);"
            fx = (f"INSERT INTO public.commercial_price_rules(id,product_id,partner_id,buyer_scope,pricing_mode,unit_type) VALUES "
                  f"('{H.RULE_ORPHAN}','{H.P1}','{orphan_partner}','partner','quote_only','hectare');")
            LEGACY_USED.append("MIG-0:commercial_price_rules+partner_order_items")
            return super().sql("BEGIN;" + FX_SET + "\n" + legacy("partner_accounts", fxp) + legacy("commercial_price_rules", fx) +
                               legacy("partner_order_items", f"UPDATE public.partner_order_items SET price_rule_id_snapshot='{H.RULE_ORPHAN}';") +
                               "\n" + FX_DROP + "\nCOMMIT;", ok)
        if s.startswith("ALTER TABLE public.partner_order_items DISABLE TRIGGER a10_poi_sealed; UPDATE public.partner_order_items SET price_rule_id_snapshot=NULL;"):
            return super().sql("BEGIN;" + legacy("partner_order_items", "UPDATE public.partner_order_items SET price_rule_id_snapshot=NULL;") + "COMMIT;", ok)
        if s.startswith("BEGIN; INSERT INTO public.ordens_servico(id) VALUES"):
            # CHN-1: linha da cadeia com NOT NULL reais preenchidos pelos defaults TEMPORÁRIOS (dentro da mesma TX com ROLLBACK)
            s = s.replace("BEGIN; ", "BEGIN; " + FX_SET + "\n", 1)
        if s.startswith("INSERT INTO public.commercial_price_rules(id,product_id)"):
            # fixture adicional do RPC-orphan: mesmos defaults TEMPORÁRIOS de semeadura (constraints reais voltam em seguida)
            return super().sql("BEGIN;" + FX_SET + "\n" + s + "\n" + FX_DROP + "\nCOMMIT;", ok)
        return super().sql(s, ok)


DATA_SENTINEL = DATA


def _baseline():
    """RED: BASELINE_REF=<sha> roda a mesma bateria contra 00/01 do commit indicado (git show), sem alterar arquivos."""
    import os, subprocess
    ref = os.environ.get("BASELINE_REF")
    if not ref: return
    orig = H.PKG.__class__.read_text
    def rt(self, *a, **k):
        if self.parent == H.PKG and self.name in ("00-pre-global.sql.review", "01-migrate.sql.review"):
            return subprocess.run(["git", "show", f"{ref}:scripts/tenant-exclusive-catalog-20261101/{self.name}"], cwd=H.ROOT,
                                  capture_output=True, text=True, check=True).stdout
        return orig(self, *a, **k)
    H.PKG.__class__.read_text = rt


def run():
    _baseline()
    import os
    if os.environ.get("HOMOLOG_CLEAN_VARIANT") == "1":
        import homolog_only_anexos as HAX; HAX.enable()
    H.EXTRA_TESTS = lambda *a: (RX.run(*a), DP.run(*a), V212T.run(*a))
    H.REQ_COLS.update({"culturas": {"nome": "'C-'||gen_random_uuid()"},
                       "microrganismos": {"nome": "'M-'||gen_random_uuid()", "tipo": "'bacteria'"}})
    H.RECV_CODES = ("C2_ACCOUNTING_PENDING",)   # corpo LIVE: bloqueio da origem externa pendente de contabilidade
    H.ACL8_RPC = True
    H.EXTRA_FK_NAMES = tuple(c["name"] for c in XS.X["constraints"] if c["type"] == "f")
    H.RECV_AS = lambda: H.as_user(H.UA)          # ator AR Bio (vendedor) — sem auth o corpo real nega antes (auth_required)
    H.FX_SET, H.FX_DROP, H.CLIA_R, H.FAZA_R = FX_SET, FX_DROP, CLIA, FAZA          # fixtures sintéticas por transação (AE-11)
    H.schema = real_schema; H.BASE = BASE; H.AFTER = AFTER; H.DATA = DATA_SENTINEL; H.PG = RealPG
    try:
        H.main()
    finally:
        inst = INFO.get("install", {})
        summ = dict(enum_without_labels=INFO.get("enum_without_labels"), defaults_skipped=INFO.get("defaults_skipped"),
                    sequences=INFO.get("sequences"), **{k: (len(v) if isinstance(v, list) else v) for k, v in inst.items()},
                    policies_total=len(RS.policies(CAP)[0]), triggers_total=len(RS.triggers(CAP)), indexes_total=len(INFO.get("index_sql", [])),
                    fks_total=len(INFO.get("fk_sql", [])), legacy_state_injections=list(LEGACY_USED))
        (H.OUT / "real-schema-info.json").write_text(json.dumps(dict(summary=summ, detail={k: v for k, v in inst.items()},
                                                                     defaults_skipped=INFO.get("defaults_skipped")), indent=1, ensure_ascii=False))
        (H.OUT / "ae-positive-detail.json").write_text(json.dumps(RX.POS_DETAIL, indent=1, ensure_ascii=False))
        print("REAL_SCHEMA", json.dumps(summ, ensure_ascii=False))


if __name__ == "__main__":
    run()
