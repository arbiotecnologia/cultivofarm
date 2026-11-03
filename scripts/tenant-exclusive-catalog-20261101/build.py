#!/usr/bin/env python3
"""Catálogo EXCLUSIVO por tenant — gerador do candidato v2 (NO_GO, não aplica nada).

v2 (01/11/2026): reconciliado com o inventário READ ONLY real (docs/auditorias/evidencias/
catalogo-exclusivo-tenant-20261101/live-readonly-20261101/fks.tsv — 151 FKs). Raízes do catálogo:
produtos, microrganismos e culturas. Regras do proprietário:
  * nenhum UPDATE genérico por organization_id; tenant de cada registro derivado dos PAIS REAIS;
  * empresa nova começa com catálogo vazio; itens copiados apenas por uso/vínculo da empresa + fechamento
    de dependências (formulação, composição, microrganismo->produto, dossiê->apresentação->volume);
  * dados sem tenant derivável: configuração descartável é removida com registro; vínculo operacional
    anulável é anulado com registro; NOT NULL aborta. Nunca tenant default inventado.
"""
import re, hashlib, json, pathlib
from rpc_section import rpc_sql, lit
from fiscal_section import fiscal_sql
from fence_section import fence_sql
from ae_section import ae_sql
from codigo_section import codigo_sql
from crud_section import crud_sql

HERE = pathlib.Path(__file__).resolve().parent
ROOTS = ["produtos", "culturas", "microrganismos"]          # ordem de cópia (microrganismos -> produtos)
ROOT_LINKS = [("microrganismos", "product_id", "produtos")]  # raiz -> raiz (mesmo tenant)

# Expressões de tenant por pai real. {c} = coluna do registro.
PA = "(SELECT pa.commercial_owner_organization_id FROM public.partner_accounts pa WHERE pa.id = {c})"
PO = PA.format(c="(SELECT po.partner_id FROM public.partner_orders po WHERE po.id = {c})")
TAL = "(SELECT t.organization_id FROM public.talhoes t WHERE t.id = {c})"
CLI = "(SELECT cl.organization_id FROM public.clientes cl WHERE cl.id = {c})"
FAZ = "(SELECT fz.organization_id FROM public.fazendas fz WHERE fz.id = {c})"
LOT = "(SELECT l.organization_id FROM public.lotes l WHERE l.id = {c})"
ENT = "(SELECT e.organization_id FROM public.entregas e WHERE e.id = {c})"
OS = "(SELECT o.organization_id FROM public.ordens_servico o WHERE o.id = {c})"
PRG = "(SELECT pp.organization_id FROM public.programacao_producao pp WHERE pp.id = {c})"
RC = ("(SELECT platform_private.tc_agree(ARRAY[(SELECT t.organization_id FROM public.talhoes t WHERE t.id = rc.talhao_id),"
      " (SELECT cl.organization_id FROM public.clientes cl WHERE cl.id = rc.cliente_id),"
      " (SELECT fz.organization_id FROM public.fazendas fz WHERE fz.id = rc.fazenda_id)])"
      " FROM public.registros_consultor rc WHERE rc.id = {c})")
EMB = "(SELECT l.organization_id FROM public.estoque_embalagens eb JOIN public.lotes l ON l.id = eb.lote_id WHERE eb.id = {c})"


def arr(xs): return "ARRAY[" + ",".join("'" + x + "'" for x in xs) + "]::text[]"
CLIENT_ACL_EXTRA = ["microorganism_fiscal_profiles", "partner_order_items", "partner_orders", "product_fiscal_profiles", "produto_conformidade_perfis"]


def co(*parts):
    # cadeias de tenant concorrentes: divergência é ERRO (tc_agree aborta), nunca COALESCE arbitrário
    return "platform_private.tc_agree(ARRAY[" + ", ".join(f"({x})::uuid" for x in parts) + "])" if len(parts) > 1 else parts[0]


P, M, C = "produtos", "microrganismos", "culturas"
# Registros com tenant próprio: raízes repontadas para a cópia do tenant do registro.
# unresolved: discard = configuração removida com snapshot (bloqueada se referenciada);
#             nullify = vínculo anulado com snapshot se a coluna aceitar NULL, senão aborta.
TENANT_REFS = [
    dict(t="catalog_tenant_visibility", cols=[("produto_id", P), ("microrganismo_id", M), ("cultura_id", C)],
         tenant="x.organization_id", unresolved="discard"),
    dict(t="commercial_condition_item_prices", cols=[("product_id", P), ("microrganismo_id", M)],
         tenant=co(PA.format(c="x.partner_id"), CLI.format(c="x.customer_id")), unresolved="discard"),
    dict(t="commercial_price_rules", cols=[("product_id", P), ("microrganismo_id", M)],
         tenant=co(PA.format(c="x.partner_id"), CLI.format(c="x.customer_id")), unresolved="discard",
         referenced_by=[("partner_order_items", "price_rule_id_snapshot"), ("commercial_condition_item_prices", "published_rule_id")]),
    dict(t="partner_product_prices", cols=[("product_id", P), ("microrganismo_id", M)],
         tenant=PA.format(c="x.partner_id"), unresolved="discard"),
    dict(t="partner_simulation_items", cols=[("product_id", P), ("microrganismo_id", M)],
         tenant=PA.format(c="(SELECT ps.partner_id FROM public.partner_simulations ps WHERE ps.id = x.simulation_id)"),
         unresolved="discard"),
    dict(t="commercial_campaign_products", cols=[("product_id", P)], tenant="NULL::uuid", unresolved="discard", noid=True),
    # B2B: catálogo do VENDEDOR (dono comercial do parceiro), nunca do tenant comprador
    dict(t="partner_order_items", cols=[("product_id", P), ("microrganismo_id", M)],
         tenant=PO.format(c="x.order_id"), unresolved="nullify"),
    dict(t="entregas", cols=[("produto_id", P)],
         tenant=co("x.organization_id", OS.format(c="x.ordem_servico_id"), LOT.format(c="x.lote_id"),
                   PO.format(c="x.partner_order_id"), CLI.format(c="x.cliente_id")), unresolved="nullify"),
    dict(t="lotes", cols=[("produto_id", P), ("microrganismo_id", M)],
         tenant=co("x.organization_id", PRG.format(c="x.programacao_id")), unresolved="nullify"),
    dict(t="ordens_servico", cols=[("produto_id", P), ("microrganismo_id", M)],
         tenant=co("x.organization_id", TAL.format(c="x.talhao_id"), PO.format(c="x.partner_order_id"),
                   CLI.format(c="x.cliente_id"), FAZ.format(c="x.fazenda_id")), unresolved="nullify"),
    dict(t="programacao_producao", cols=[("produto_id", P), ("microrganismo_id", M)],
         tenant=co("x.organization_id", OS.format(c="x.ordem_servico_id")), unresolved="nullify"),
    dict(t="estoque_produto", cols=[("produto_id", P), ("microrganismo_id", M)],
         # dono do estoque = dono do lote (lote_id NOT NULL real); nunca cliente/parceiro reservado
         tenant=LOT.format(c="x.lote_id"), unresolved="nullify"),
    dict(t="estoque_embalagens", cols=[("produto_id", P)],
         tenant=LOT.format(c="x.lote_id"), unresolved="nullify"),
    dict(t="produto_etiquetas", cols=[("produto_id", P)],
         tenant=co(LOT.format(c="x.lote_id"), EMB.format(c="x.embalagem_id")), unresolved="nullify"),
    dict(t="os_faturamento_base", cols=[("produto_id", P)],
         tenant=co(OS.format(c="x.ordem_servico_id"), CLI.format(c="x.cliente_id")), unresolved="nullify"),
    dict(t="ordens_servico_onfarm", cols=[("produto_id", P), ("microrganismo_id", M), ("cultura_id", C)],
         tenant=co(TAL.format(c="x.talhao_id"), RC.format(c="x.registro_consultor_id"), CLI.format(c="x.cliente_id"),
                   FAZ.format(c="x.fazenda_id")), unresolved="nullify"),
    dict(t="registros_consultor", cols=[("cultura_id", C)],
         tenant=co(TAL.format(c="x.talhao_id"), CLI.format(c="x.cliente_id"), FAZ.format(c="x.fazenda_id")), unresolved="nullify"),
    dict(t="registros_consultor_recomendacoes", cols=[("produto_biologico_sugerido_id", P), ("microrganismo_id", M)],
         tenant=RC.format(c="x.registro_consultor_id"), unresolved="nullify"),
    dict(t="talhao_safras", cols=[("cultura_id", C)], tenant=TAL.format(c="x.talhao_id"), unresolved="nullify"),
    dict(t="talhoes", cols=[("cultura_id", C)], tenant=co("x.organization_id", FAZ.format(c="x.fazenda_id")), unresolved="nullify"),
    # sem FK: source_item_id é produto só em NF-e (NFS-e = serviço); tenant = emitente fiscal_invoices.organization_id
    dict(t="fiscal_invoice_items", cols=[("source_item_id", P)], nofk=True,
         where="EXISTS (SELECT 1 FROM public.fiscal_invoices fi WHERE fi.id = x.fiscal_invoice_id AND fi.invoice_type = 'NFE')"
               " AND x.source_item_id IN (SELECT id FROM public.produtos)",
         tenant="(SELECT fi.organization_id FROM public.fiscal_invoices fi WHERE fi.id = x.fiscal_invoice_id)", unresolved="nullify"),
    dict(t="visitas_campo", cols=[("cultura_id", C)],
         tenant=co(TAL.format(c="x.talhao_id"), RC.format(c="x.registro_consultor_id"), CLI.format(c="x.cliente_id")),
         unresolved="nullify"),
]
# Atributos do catálogo: copiados junto da raiz (por tenant da cópia). Ordem = dependência.
# anchors: (col, raiz) por prioridade (primeira não nula); others: demais raízes remapeadas no mesmo tenant;
# parents: (col, tabela-descendente, obrigatório) remapeados pelo mapa de linhas do mesmo tenant.
DESC = [
    dict(t="product_fiscal_profiles", anchors=[("product_id", P)]),
    dict(t="product_technical_profiles", anchors=[("produto_id", P)]),
    dict(t="produto_conformidade_perfis", anchors=[("produto_id", P)]),
    dict(t="product_crop_recommendations", anchors=[("produto_id", P)], others=[("cultura_id", C)]),
    dict(t="product_target_recommendations", anchors=[("produto_id", P)]),
    dict(t="produto_composicao_conjuntos", anchors=[("produto_id", P)]),
    # FK real: declaracoes.produto_id -> produto_composicao_conjuntos(produto_id) (não direto a produtos)
    dict(t="produto_composicao_declaracoes", anchors=[("produto_id", P)], others=[("microrganismo_id", M)], anchor_fk_via="produto_composicao_conjuntos"),
    dict(t="cq_parametros_referencia", anchors=[("produto_id", P), ("microrganismo_id", M)]),
    dict(t="catalogo_volumes", anchors=[("produto_id", P), ("microrganismo_id", M)]),
    dict(t="formulacoes", anchors=[("produto_id", P), ("microrganismo_id", M)], others=[("component_insumo_id", P)]),
    dict(t="microorganism_crop_recommendations", anchors=[("microrganismo_id", M)], others=[("cultura_id", C)]),
    dict(t="microorganism_fiscal_profiles", anchors=[("microorganism_id", M)]),
    dict(t="microorganism_targets", anchors=[("microrganismo_id", M)]),
    dict(t="microorganism_technical_profiles", anchors=[("microrganismo_id", M)]),
    dict(t="microorganism_regulatory_dossiers", anchors=[("microorganism_id", M)]),
    dict(t="microorganism_regulatory_publication_snapshots", anchors=[("microorganism_id", M)],
         parents=[("dossier_id", "microorganism_regulatory_dossiers", True)]),
    dict(t="microorganism_regulatory_presentations", anchors=[], anchor_parent=("dossier_id", "microorganism_regulatory_dossiers"),
         parents=[("catalog_volume_id", "catalogo_volumes", False)]),
    # candidatos NCM são DOSSIÊ DA EMPRESA (não taxonomia normativa): seguem o dossiê; policy LIVE fn_regulatory_can_read() não filtra tenant
    dict(t="microorganism_ncm_candidates", anchors=[], anchor_parent=("dossier_id", "microorganism_regulatory_dossiers"), anchor_parent_nofk=True),
    dict(t="objetivos_visita_sugestoes", anchors=[("cultura_id", C)]),
]
for d in DESC:
    d.setdefault("others", []); d.setdefault("parents", [])
    # raízes de âncoras secundárias também são "outras" quando a primária está presente
    d["all_roots"] = d["anchors"] + d["others"]

# Colunas de pais usadas nas expressões de tenant (não estão no inventário de FKs para raízes): exigidas no PRE.
DEP_COLS = [("microorganism_ncm_candidates", "dossier_id"), ("microorganism_regulatory_dossiers", "published_ncm_candidate_id"),
            ("partner_accounts", "commercial_owner_organization_id"), ("partner_orders", "partner_id"),
            ("partner_simulations", "partner_id"), ("clientes", "organization_id"), ("fazendas", "organization_id"),
            ("talhoes", "organization_id"), ("lotes", "organization_id"), ("entregas", "organization_id"),
            ("ordens_servico", "organization_id"), ("programacao_producao", "organization_id"),
            ("registros_consultor", "talhao_id"), ("registros_consultor", "cliente_id"), ("registros_consultor", "fazenda_id"),
            ("os_faturamento_base", "ordem_servico_id"), ("estoque_embalagens", "lote_id"),
            ("fiscal_invoice_items", "source_item_id"), ("fiscal_invoice_items", "fiscal_invoice_id"),
            ("fiscal_invoices", "invoice_type"), ("fiscal_invoices", "organization_id"),
            ("partner_orders", "internal_origin_snapshot"), ("partner_orders", "c2_external_origin_snapshot"),
            ("partner_orders", "receivable_generated"), ("partner_financial_settings", "auto_generate_receivable"),
            ("company_fiscal_settings", "nfe_enabled"), ("company_fiscal_settings", "nfse_enabled"),
            ("company_fiscal_settings", "production_enabled")]
# Decisão do proprietário 01/11 15:24: descartar a cadeia de teste SEM empresa (IDs fixos). Ordem = filhos primeiro.
PURGE_CHAIN = [("entregas", "20d66f88-b3dd-4a6f-93ac-6ecf03c7468d"), ("estoque_produto", "000cd77c-506c-4cdf-b2bd-7233aff8efeb"),
               ("envase", "bca8a46a-77a8-435c-ae67-b0ece207d91a"), ("lotes", "cd49ce12-9d06-459c-b874-3c8d3a275423"),
               ("programacao_producao", "8896d700-5697-4346-9970-c76373cfb232"), ("ordens_servico", "4a5af44d-ea5a-4810-8b99-ea601fad8547")]
PURGE_NO_ORG = ["entregas", "lotes", "programacao_producao", "ordens_servico"]
UNIQUE_KEY = "lower(btrim(nome))"
OWNED_DESC = ["catalogo_volumes", "formulacoes"]   # raízes 4 e 5 (dono próprio, consistência com produto/micro)


def extra_owned(t):
    if t == "formulacoes":
        return ("\n     OR NEW.component_insumo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = NEW.component_insumo_id"
                " AND p.owner_organization_id = NEW.owner_organization_id)")
    return ""
_GLOBAL_FUNCS_V1 = ["platform_create_global_product", "platform_read_global_product_catalog",
                "platform_read_global_product_catalog_by_family", "platform_read_global_product_composition",
                "platform_read_global_product_metadata", "platform_set_global_product_composition",
                "platform_set_global_product_family", "platform_set_global_product_status",
                "platform_update_global_product_metadata", "platform_wipe_global_product_catalog"]
EVID = HERE.parent.parent / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101"
INV = json.loads((EVID / "consumer-inventory-104.json").read_text())
# fechamento global = todas as funções capturadas classificadas CLOSE_GLOBAL (nomes; overloads reais fechados pelo nome)
GLOBAL_FUNCS = sorted({r["signature"].split("(")[0].split(".")[-1] for r in INV if r["classification"] == "CLOSE_GLOBAL"} | set(_GLOBAL_FUNCS_V1))
EXTRA25 = json.loads((EVID / "live-input-20261101-1516/extra-global-25.json").read_text())
GLOBAL_FUNCS = sorted(set(GLOBAL_FUNCS) | {e["signature"].split("(")[0].split(".")[-1] for e in EXTRA25})
FN_PINS = [(r["signature"], r["md5"]) for r in INV] + [(e["signature"], e["md5"]) for e in EXTRA25]
EDITABLE = {"nome": "text", "codigo": "text", "descricao": "text", "tipo": "text", "classe_catalogo": "text",
            "familia_catalogo": "text", "modo_acao": "text", "modo_aplicacao": "text", "funcao_completa": "text",
            "e_insumo": "boolean", "b2b_enabled": "boolean", "dose_ml_ha": "numeric", "estoque_minimo": "numeric",
            "valor_dose_brl": "numeric", "valor_ha_brl": "numeric", "valor_litro_brl": "numeric"}
MAP = "platform_private.tenant_catalog_map"
ROWMAP = "platform_private.tenant_catalog_row_map"
LEDGER = "platform_private.tenant_catalog_migration_ledger"


def expected_fks():
    """(tabela, coluna, raiz) esperados para FKs que apontam para raízes."""
    s = set()
    for r in TENANT_REFS:
        if r.get("nofk"): continue
        for c, root in r["cols"]: s.add((r["t"], c, root))
    for d in DESC:
        for c, root in d["all_roots"]:
            if d.get("anchor_fk_via") and (c, root) in d["anchors"]: continue
            s.add((d["t"], c, root))
    for t, c, root in ROOT_LINKS: s.add((t, c, root))
    return sorted(s)


def expected_parent_fks():
    s = set()
    for d in DESC:
        if d.get("anchor_parent") and not d.get("anchor_parent_nofk"): s.add((d["t"], d["anchor_parent"][0], d["anchor_parent"][1]))
        for c, pt, _ in d["parents"]: s.add((d["t"], c, pt))
    s.add(("produto_composicao_declaracoes", "produto_id", "produto_composicao_conjuntos"))
    return sorted(s)


def vals(rows): return ",".join("(" + ",".join(lit(x) for x in r) + ")" for r in rows)


# Variante de instalação LIMPA (homologação): idêntica à de produção, exceto que os 25 wrappers/cores globais adicionais
# podem estar AUSENTES (fechados por ausência; se presentes, o md5 continua obrigatório). Nada mais muda.
HOMOLOG_CLEAN = False
EXTRA25_SIGS = [e["signature"] for e in EXTRA25]


def _absent_ok():
    if not HOMOLOG_CLEAN: return ""
    return "IF r.sig = ANY(ARRAY[" + ",".join(lit(x) for x in EXTRA25_SIGS) + "]::text[]) THEN CONTINUE; END IF; "


# ACL cliente endurecida (04 homolog-alignment aplicado em homolog e produção, 02/11): o PRE exige o estado EXATO pós-04
# nas tabelas do escopo do 04 (lista lida do arquivo 04 com hash pinado); nunca aceita reabertura nem faz regrant.
HARDEN04 = HERE.parent / "homolog-alignment-20261102/04-client-destructive-acl-hardening.sql.review"
HARDEN04_SHA = "eb20007021512e879bb4f1ca9d4f0fbe23521c3a71127c0b31b406b53d461da6"
assert hashlib.sha256(HARDEN04.read_bytes()).hexdigest() == HARDEN04_SHA, "04 divergente do revisado/aplicado"
HARDEN04_TABLES = sorted(set(re.findall(r"'([a-z0-9_]+)'", re.search(r"unnest\((ARRAY\[[^\]]+\])::text\[\]\) t WHERE", HARDEN04.read_text()).group(1))))
assert len(HARDEN04_TABLES) == 59, len(HARDEN04_TABLES)


# Relação SOMENTE homolog (produção: to_regclass NULL, 03/11): produto_anexos.produto_id -> produtos. Estrutura REAL
# capturada READ ONLY em vrlcdwmlytukrjezrrnf; tratada como descendente de produto (cópia por tenant + RLS + ledger com
# snapshot integral), nunca relaxando o inventário de FKs. A variante de produção não a conhece: lá ela aborta fk_unmapped.
HOMOLOG_ONLY_DESC = [dict(t="produto_anexos", anchors=[("produto_id", "produtos")], others=[], parents=[],
                          all_roots=[("produto_id", "produtos")])]
HOMOLOG_ONLY_STRUCT = {"produto_anexos": dict(
    columns=[("id", "uuid", "gen_random_uuid()", True), ("produto_id", "uuid", None, False), ("titulo", "text", None, False),
             ("url", "text", None, False), ("created_at", "timestamp with time zone", "now()", False)],
    constraints=[("produto_anexos_pkey", "PRIMARY KEY (id)"),
                 ("produto_anexos_produto_id_fkey", "FOREIGN KEY (produto_id) REFERENCES produtos(id)")])}


def homolog_only_struct_check():
    if not HOMOLOG_CLEAN: return ""
    out = []
    for t, st in HOMOLOG_ONLY_STRUCT.items():
        cols = ",".join(f"({lit(n)},{lit(ty)},{lit(df) if df else 'NULL'},{'true' if nn else 'false'})" for n, ty, df, nn in st["columns"])
        cons = ",".join(f"({lit(n)},{lit(d)})" for n, d in st["constraints"])
        out.append(f"""
  -- homolog-only {t}: estrutura EXATA capturada (colunas, constraints, zero policies/triggers de usuário); drift aborta
  IF to_regclass('public.{t}') IS NULL THEN v_fail := v_fail || 'homolog_only_missing:{t}'::text;
  ELSE
    IF EXISTS (SELECT format_type(a.atttypid,a.atttypmod), a.attname, pg_get_expr(d.adbin,d.adrelid), a.attnotnull
                 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
                WHERE a.attrelid='public.{t}'::regclass AND a.attnum>0 AND NOT a.attisdropped
               EXCEPT SELECT ty, n, df, nn FROM (VALUES {cols}) v(n,ty,df,nn))
       OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.{t}'::regclass AND attnum>0 AND NOT attisdropped) <> {len(st["columns"])}
    THEN v_fail := v_fail || 'homolog_only_column_drift:{t}'::text; END IF;
    IF EXISTS (SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.{t}'::regclass
               EXCEPT SELECT n, d FROM (VALUES {cons}) v(n,d))
       OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.{t}'::regclass) <> {len(st["constraints"])}
    THEN v_fail := v_fail || 'homolog_only_constraint_drift:{t}'::text; END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='{t}')
       OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.{t}'::regclass AND NOT tgisinternal)
    THEN v_fail := v_fail || 'homolog_only_policy_trigger_drift:{t}'::text; END IF;
  END IF;""")
    return "".join(out)


def hardened_acl_check():
    return f"""
  -- 0. ACL cliente ENDURECIDA EXATA (pós-04): estado pré-04 ou reaberto aborta
  FOR r IN SELECT t, rl, pv FROM unnest({arr(HARDEN04_TABLES)}) t, unnest(ARRAY['public','anon','authenticated']) rl, unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES']) pv
           WHERE to_regclass('public.'||t) IS NOT NULL AND has_table_privilege(rl, 'public.'||t, pv) LOOP
    v_fail := v_fail || ('client_destructive_acl_not_hardened:'||r.t||':'||r.rl||':'||r.pv);
  END LOOP;"""


def pre_body():
    roots = ",".join(lit("public." + r) for r in ROOTS)
    return f"""
DECLARE v_fail text[] := ARRAY[]::text[]; r record; v_n bigint;
BEGIN{hardened_acl_check()}{homolog_only_struct_check()}
  -- 1. FKs reais para as raízes == inventário (nada a mais, nada a menos)
  FOR r IN SELECT c.conrelid::regclass::text AS rel, a.attname AS col, c.confrelid::regclass::text AS tgt
             FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum = ANY(c.conkey)
            WHERE c.contype='f' AND c.confrelid::regclass::text IN ({roots}, {",".join(lit(r) for r in ROOTS)}) LOOP
    IF NOT EXISTS (SELECT 1 FROM (VALUES {vals(expected_fks())}) m(t,c,g)
                   WHERE m.t = replace(r.rel,'public.','') AND m.c = r.col AND m.g = replace(r.tgt,'public.','')) THEN
      v_fail := v_fail || ('fk_unmapped:'||r.rel||'.'||r.col||'->'||r.tgt);
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES {vals(expected_fks())}, {vals(expected_parent_fks())}) m(t,c,g) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum = ANY(k.conkey)
                    WHERE k.contype='f' AND k.conrelid = to_regclass('public.'||r.t) AND a.attname = r.c
                      AND k.confrelid = to_regclass('public.'||r.g)) THEN
      v_fail := v_fail || ('fk_missing:'||r.t||'.'||r.c||'->'||r.g);
    END IF;
  END LOOP;
  -- 2. colunas de pais usadas na derivação do tenant
  FOR r IN SELECT * FROM (VALUES {vals(DEP_COLS)}) m(t,c) LOOP
    IF to_regclass('public.'||r.t) IS NULL OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||r.t)::regclass
         AND attname=r.c AND NOT attisdropped) THEN v_fail := v_fail || ('dep_column_missing:'||r.t||'.'||r.c); END IF;
  END LOOP;
  -- 3. estado anterior: nada instalado parcialmente
  FOR r IN SELECT unnest(ARRAY[{roots}]) AS rel LOOP
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=r.rel::regclass AND attname='owner_organization_id' AND NOT attisdropped)
      THEN v_fail := v_fail || ('partial:'||r.rel||'.owner_organization_id'); END IF;
    -- unicidades não-PK: conjunto EXATO pinado da captura real (inclui expressão/parcial revisadas); drift aborta
    FOR r IN SELECT i.indexrelid::regclass::text AS ix, pg_get_indexdef(i.indexrelid) AS def FROM pg_index i
              WHERE i.indrelid=r.rel::regclass AND i.indisunique AND NOT i.indisprimary LOOP
      IF NOT (r.def = ANY(ARRAY[{UNIQUE_PINS_SQL}]::text[])) THEN v_fail := v_fail || ('unique_index_drift:unexpected:'||r.ix); END IF;
    END LOOP;
  END LOOP;
  FOR r IN SELECT d FROM unnest(ARRAY[{UNIQUE_PINS_SQL}]::text[]) d LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_index i WHERE pg_get_indexdef(i.indexrelid)=r.d) THEN v_fail := v_fail || ('unique_index_drift:missing:'||r.d); END IF;
  END LOOP;
  IF to_regclass('{MAP}') IS NOT NULL OR to_regclass('{ROWMAP}') IS NOT NULL THEN v_fail := v_fail || 'partial:map_present'::text; END IF;
  IF to_regprocedure('public.tenant_product_save(uuid,jsonb,timestamptz,uuid)') IS NOT NULL THEN v_fail := v_fail || 'partial:rpc_present'::text; END IF;
  -- 4. dependências canônicas
  IF to_regprocedure('platform_private.catalog_tenant_actor(text)') IS NULL THEN v_fail := v_fail || 'dep:catalog_tenant_actor'::text; END IF;
  IF to_regclass('public.organizations') IS NULL THEN v_fail := v_fail || 'dep:organizations'::text; END IF;
  -- 6. geração de recebível continua bloqueada e fiscal desligado (provado antes; reprovado no POST)
  IF EXISTS (SELECT 1 FROM public.company_fiscal_settings WHERE nfe_enabled OR nfse_enabled OR production_enabled) THEN
    v_fail := v_fail || 'fiscal_enabled'::text; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE 'generate_b2b_receivable_secure%'
                  AND prosrc LIKE '%internal_origin_snapshot%' AND prosrc LIKE '%C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1%') THEN
    v_fail := v_fail || 'receivable_origin_guard_missing'::text; END IF;
  -- 7. cadeia de teste sem empresa: descartada ANTES pela manutenção 02-chain-purge-maintenance (pré-requisito)
  FOR r IN SELECT * FROM (VALUES {vals(PURGE_CHAIN)}) m(t, id) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id = $1', r.t) INTO v_n USING r.id::uuid;
    IF v_n <> 0 THEN v_fail := v_fail || ('chain_not_purged_run_maintenance_02:'||r.t); END IF;
  END LOOP;
  -- 5. as 104 funções consumidoras capturadas devem estar byte-idênticas (md5 de pg_get_functiondef)
  FOR r IN SELECT * FROM (VALUES {vals(FN_PINS)}) m(sig, h) LOOP
    IF to_regprocedure(r.sig) IS NULL THEN {_absent_ok()}v_fail := v_fail || ('fn_missing:'||r.sig);
    ELSIF md5(pg_get_functiondef(to_regprocedure(r.sig))) <> r.h THEN v_fail := v_fail || ('fn_drift:'||r.sig); END IF;
  END LOOP;
  IF cardinality(v_fail) > 0 THEN
    RAISE EXCEPTION 'tenant_catalog_pre_failed' USING DETAIL = array_to_string(v_fail, ' | ');
  END IF;
END"""


def _unique_pins():
    cap = json.loads((EVID / "consolidado-20261101-1534/consolidado-catalogo-20261101.json").read_text())["files"]["catalogo-schema-input.json"]
    return sorted(p["data"]["indexdef"] for p in cap["policies_and_indexes"] if p["kind"] == "index" and p["data"]["tablename"] in ROOTS
                  and p["data"]["indexdef"].startswith("CREATE UNIQUE") and not p["data"]["indexname"].endswith("_pkey"))


UNIQUE_PINS_SQL = ",".join("'" + d.replace("'", "''") + "'" for d in _unique_pins())


def pre_sql():
    return ("-- 00 PRE GLOBAL v2 — catálogo exclusivo por tenant. NO_GO. Somente leitura (READ ONLY).\n"
            "BEGIN TRANSACTION READ ONLY;\nDO $pre$" + pre_body() + " $pre$;\nCOMMIT;\n")


def orig(root, expr):
    return f"{expr} IN (SELECT id FROM public.{root} WHERE owner_organization_id IS NULL)"


def anchor_cond(d, i):
    """linha ancorada na i-ésima âncora: ela não nula e as anteriores nulas."""
    parts = [f"s.{d['anchors'][j][0]} IS NULL" for j in range(i)] + [f"s.{d['anchors'][i][0]} IS NOT NULL"]
    return " AND ".join(parts)


def remap(col, root, org="src.org"):
    return (f"CASE WHEN s.{col} IS NULL THEN NULL ELSE (SELECT mm.new_id FROM {MAP} mm WHERE mm.root='{root}'"
            f" AND mm.old_id=s.{col} AND mm.organization_id={org}) END")


GUARD_SNAPSHOT = """CREATE TEMP TABLE tc_guard_x ON COMMIT DROP AS SELECT
  (SELECT count(*) FROM public.accounts_receivable) AS receivables,
  (SELECT count(*) FROM public.partner_orders WHERE receivable_generated IS TRUE) AS orders_receivable_generated,
  (SELECT count(*) FROM public.fiscal_invoices) AS fiscal_invoices,
  (SELECT count(*) FROM public.company_fiscal_settings WHERE nfe_enabled OR nfse_enabled OR production_enabled) AS fiscal_on,
  (SELECT count(*) FROM public.partner_financial_settings WHERE auto_generate_receivable IS TRUE) AS auto_receivable_settings,
  (SELECT md5(coalesce(string_agg(id::text||':'||coalesce(internal_origin_snapshot::text,'~')||':'||coalesce(c2_external_origin_snapshot::text,'~'), '|' ORDER BY id),''))
     FROM public.partner_orders) AS origin_snapshots_md5,
  (SELECT count(*) FROM pg_proc WHERE proname LIKE 'generate_b2b_receivable_secure%'
     AND prosrc LIKE '%internal_origin_snapshot%' AND prosrc LIKE '%C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1%') AS guard_bodies;"""


def migrate_sql():
    s = []
    w = s.append
    w("-- 01 MIGRAÇÃO TRANSACIONAL v2 — catálogo EXCLUSIVO por tenant. NO_GO: NÃO APLICAR sem revisão e ordem explícita.")
    w("-- Dados de teste autorizados (01/11/2026). Raízes: produtos, microrganismos, culturas. Tenant pelos pais reais.")
    w("-- Irreversível como dado: rollback = restaurar backup anterior; mapa/ledger ficam em platform_private.")
    w("BEGIN;")
    w("SET LOCAL lock_timeout = '10s';")
    w("SET LOCAL statement_timeout = '15min';")
    w("DO $pre$" + pre_body() + " $pre$;")
    touched = sorted(set(ROOTS) | {r["t"] for r in TENANT_REFS} | {d["t"] for d in DESC})
    w("LOCK TABLE " + ", ".join("public." + t for t in touched) + " IN ACCESS EXCLUSIVE MODE;")
    w(GUARD_SNAPSHOT.replace("tc_guard_x", "tc_guard_pre"))
    # ACL cliente destrutiva fechada em TODAS as tabelas tocadas + pais de pedido/perfis fiscais (RLS não protege TRUNCATE)
    acl_scope = sorted(set(touched) | set(CLIENT_ACL_EXTRA))
    w(f"""DO $cacl$ DECLARE r record; BEGIN
  FOR r IN SELECT t FROM unnest({arr(acl_scope)}) t WHERE to_regclass('public.'||t) IS NOT NULL LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM PUBLIC, anon, authenticated', r.t);
  END LOOP;
  RAISE NOTICE 'client_destructive_acl_closed %', {len(acl_scope)};  -- prova no POST (ledger ainda não existe aqui)
END $cacl$;""")
    w(f"""CREATE TABLE {MAP}(
  root text NOT NULL, old_id uuid NOT NULL, organization_id uuid NOT NULL REFERENCES public.organizations(id),
  new_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), reason text NOT NULL, PRIMARY KEY (root, old_id, organization_id));
CREATE TABLE {ROWMAP}(
  tbl text NOT NULL, old_id uuid NOT NULL, organization_id uuid NOT NULL, new_id uuid NOT NULL UNIQUE,
  PRIMARY KEY (tbl, old_id, organization_id));
CREATE TABLE {LEDGER}(id bigserial PRIMARY KEY, step text NOT NULL, detail jsonb NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp());
REVOKE ALL ON {MAP}, {ROWMAP}, {LEDGER} FROM PUBLIC, anon, authenticated;
CREATE FUNCTION platform_private.tc_agree(p uuid[]) RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $f$
DECLARE v uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(p) x WHERE x IS NOT NULL);
BEGIN
  IF cardinality(v) > 1 THEN RAISE EXCEPTION 'tenant_catalog_chain_divergence' USING DETAIL = array_to_string(v, ','); END IF;
  RETURN v[1];
END $f$;
REVOKE ALL ON FUNCTION platform_private.tc_agree(uuid[]) FROM PUBLIC;""")
    if HOMOLOG_CLEAN:
        for d in HOMOLOG_ONLY_DESC:
            w(f"""INSERT INTO {LEDGER}(step, detail) SELECT 'homolog_only_snapshot', jsonb_build_object('table','{d["t"]}','count',count(*),
  'rows', coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]')) FROM public.{d["t"]} x;""")
    # descarte da cadeia: script de manutenção separado 02 (gatilhos reais bloqueiam DELETE comum)
    # triggers de usuário: desligar só os ligados e restaurar o estado exato
    rels = ", ".join(lit("public." + t) for t in touched) + ", " + ", ".join(lit(t) for t in touched)
    w(f"""CREATE TEMP TABLE tc_triggers ON COMMIT DROP AS
  SELECT tgrelid::regclass::text AS rel, tgname, tgenabled FROM pg_trigger
   WHERE NOT tgisinternal AND tgenabled <> 'D' AND tgrelid::regclass::text IN ({rels});
DO $t$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM tc_triggers LOOP EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I', r.rel, r.tgname); END LOOP;
  INSERT INTO {LEDGER}(step, detail) SELECT 'triggers_disabled',
    coalesce(jsonb_agg(jsonb_build_object('rel',rel,'trigger',tgname,'state',tgenabled)),'[]') FROM tc_triggers;
END $t$;""")
    # 1. uso direto por tenant (só registros com tenant derivável)
    w(f"CREATE TEMP TABLE tc_rows ON COMMIT DROP AS SELECT NULL::text tbl, NULL::text col, NULL::text root, NULL::uuid old_id, NULL::uuid org, NULL::uuid rid LIMIT 0;")
    for r in TENANT_REFS:
        for c, root in r["cols"]:
            rid = "NULL::uuid" if r.get("noid") else "x.id"
            extra = f" AND {r['where']}" if r.get("where") else ""
            w(f"INSERT INTO tc_rows SELECT '{r['t']}', '{c}', '{root}', x.{c}, {r['tenant']}, {rid} FROM public.{r['t']} x WHERE x.{c} IS NOT NULL{extra};")
    w(f"INSERT INTO {MAP}(root, old_id, organization_id, reason) SELECT DISTINCT root, old_id, org, 'usage' FROM tc_rows WHERE org IS NOT NULL;")
    # 2. fechamento de dependências até ponto fixo
    clos = []
    for t, c, tr in ROOT_LINKS:
        clos.append(f"INSERT INTO {MAP}(root, old_id, organization_id, reason) SELECT '{tr}', s.{c}, u.organization_id, 'closure:{t}.{c}'"
                    f" FROM public.{t} s JOIN {MAP} u ON u.root='{t}' AND u.old_id=s.id WHERE s.{c} IS NOT NULL ON CONFLICT DO NOTHING;")
    for d in DESC:
        for i, (ac, ar) in enumerate(d["anchors"]):
            for oc, orr in d["all_roots"]:
                if oc == ac: continue
                clos.append(f"INSERT INTO {MAP}(root, old_id, organization_id, reason) SELECT '{orr}', s.{oc}, u.organization_id,"
                            f" 'closure:{d['t']}.{oc}' FROM public.{d['t']} s JOIN {MAP} u ON u.root='{ar}' AND u.old_id=s.{ac}"
                            f" WHERE {anchor_cond(d, i)} AND s.{oc} IS NOT NULL ON CONFLICT DO NOTHING;")
    body = "\n    ".join(c.replace(";", "; GET DIAGNOSTICS v_k = ROW_COUNT; v_n := v_n + v_k;") for c in clos)
    w(f"""DO $c$ DECLARE v_n bigint; v_k bigint; v_iter int := 0; BEGIN
  LOOP
    v_n := 0; v_iter := v_iter + 1;
    {body}
    EXIT WHEN v_n = 0;
    IF v_iter > 50 THEN RAISE EXCEPTION 'tenant_catalog_closure_no_fixpoint'; END IF;
  END LOOP;
  INSERT INTO {LEDGER}(step, detail) VALUES ('closure', jsonb_build_object('iterations', v_iter,
    'by_root', (SELECT jsonb_object_agg(root, n) FROM (SELECT root, count(*) n FROM {MAP} GROUP BY root) z)));
END $c$;""")
    # 3. ownership + unicidade por tenant em cada raiz
    for root in ROOTS:
        w(f"""ALTER TABLE public.{root} ADD COLUMN owner_organization_id uuid REFERENCES public.organizations(id);
DO $ix$ DECLARE r record; v_def text; BEGIN
  FOR r IN SELECT i.indexrelid, i.indexrelid::regclass::text AS ix, c.conname, pg_get_indexdef(i.indexrelid) AS def
             FROM pg_index i LEFT JOIN pg_constraint c ON c.conindid = i.indexrelid AND c.conrelid = i.indrelid
            WHERE i.indrelid='public.{root}'::regclass AND i.indisunique AND NOT i.indisprimary LOOP
    -- preserva colunas/expressões/predicado; só antepõe o dono (único por empresa)
    v_def := regexp_replace(r.def, '^CREATE UNIQUE INDEX (\\S+) ON (\\S+) USING (\\w+) \\(', 'CREATE UNIQUE INDEX \\1_tenant ON \\2 USING \\3 (owner_organization_id, ');
    IF v_def = r.def THEN RAISE EXCEPTION 'tenant_catalog_unique_rescope_unparsed:%', r.ix; END IF;
    INSERT INTO {LEDGER}(step, detail) VALUES ('unique_rescoped', jsonb_build_object('table','{root}','index', r.ix, 'def', r.def, 'new', v_def));
    IF r.conname IS NOT NULL THEN EXECUTE format('ALTER TABLE public.{root} DROP CONSTRAINT %I', r.conname);
    ELSE EXECUTE format('DROP INDEX %s', r.ix); END IF;
    EXECUTE v_def;
  END LOOP;
END $ix$;""")
    # 4. cópias das raízes (raiz->raiz remapeada no mesmo tenant)
    for root in ROOTS:
        extra = "".join(f" || jsonb_build_object('{c}', (SELECT mm.new_id FROM {MAP} mm WHERE mm.root='{tr}' AND mm.old_id=p.{c}"
                        f" AND mm.organization_id=m.organization_id))" for t, c, tr in ROOT_LINKS if t == root)
        w(f"""INSERT INTO public.{root}
  SELECT (jsonb_populate_record(NULL::public.{root}, to_jsonb(p)
          || jsonb_build_object('id', m.new_id, 'owner_organization_id', m.organization_id){extra})).*
    FROM public.{root} p JOIN {MAP} m ON m.root='{root}' AND m.old_id = p.id;""")
    # 4b. formulações e volumes são RAÍZES próprias (decisão consolidada: 5 raízes): ganham dono explícito
    for t in OWNED_DESC:
        w(f"ALTER TABLE public.{t} ADD COLUMN owner_organization_id uuid REFERENCES public.organizations(id);")
    # 5. descendentes por cópia (com mapa de linhas)
    for d in DESC:
        t = d["t"]
        variants = []
        if d.get("anchor_parent"):
            pc, pt = d["anchor_parent"]
            variants.append((f"JOIN {ROWMAP} am ON am.tbl='{pt}' AND am.old_id=s.{pc}", "am.organization_id",
                             {pc: "am.new_id"}, "TRUE"))
        for i, (ac, ar) in enumerate(d["anchors"]):
            variants.append((f"JOIN {MAP} am ON am.root='{ar}' AND am.old_id=s.{ac}", "am.organization_id",
                             {ac: "am.new_id"}, anchor_cond(d, i)))
        for join, orgx, fixed, cond in variants:
            sets = [f"'{k}', {v}" for k, v in fixed.items()]
            if t in OWNED_DESC: sets.append("'owner_organization_id', src.org")
            for oc, orr in d["all_roots"]:
                if oc not in fixed: sets.append(f"'{oc}', {remap(oc, orr)}")
            for pc, pt, req in d["parents"]:
                sets.append(f"'{pc}', CASE WHEN s.{pc} IS NULL THEN NULL ELSE (SELECT rm.new_id FROM {ROWMAP} rm WHERE rm.tbl='{pt}'"
                            f" AND rm.old_id=s.{pc} AND rm.organization_id=src.org) END")
            jb = " || ".join(f"jsonb_build_object({x.replace('am.new_id', 'src.fx_new')})" for x in sets)
            req = "".join(f"\n  IF EXISTS (SELECT 1 FROM tc_src src WHERE src.{pc} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM {ROWMAP} rm WHERE rm.tbl='{pt}' AND rm.old_id=src.{pc} AND rm.organization_id=src.org)) THEN\n    RAISE EXCEPTION 'tenant_catalog_parent_copy_missing' USING DETAIL = '{t}.{pc}'; END IF;" for pc, pt, rq in d['parents'] if rq)
            w(f"""DO $d$ DECLARE v_has_id boolean := EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.{t}'::regclass AND attname='id' AND NOT attisdropped);
  v_n bigint; BEGIN
  CREATE TEMP TABLE tc_src ON COMMIT DROP AS
    SELECT to_jsonb(s) AS j, s.*, {orgx} AS org, am.new_id AS fx_new, gen_random_uuid() AS nid
      FROM public.{t} s {join} WHERE {cond};{req}
  INSERT INTO public.{t}
    SELECT (jsonb_populate_record(NULL::public.{t}, src.j || {jb.replace('s.', 'src.')}
            || CASE WHEN v_has_id THEN jsonb_build_object('id', src.nid) ELSE '{{}}'::jsonb END)).*
      FROM tc_src src;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_has_id THEN INSERT INTO {ROWMAP} SELECT '{t}', (src.j->>'id')::uuid, src.org, src.nid FROM tc_src src; END IF;
  DROP TABLE tc_src;
  INSERT INTO {LEDGER}(step, detail) VALUES ('descendant_copied', jsonb_build_object('table','{t}','variant',{lit(cond)},'rows',v_n));
END $d$;""")
    # 5b. ciclo dossiê -> candidato NCM publicado: cópia aponta para o candidato copiado do MESMO tenant; original liberado
    w(f"""DO $ncm$ BEGIN
  UPDATE public.microorganism_regulatory_dossiers d SET published_ncm_candidate_id = rm.new_id
    FROM {ROWMAP} dm, {ROWMAP} rm
   WHERE dm.tbl='microorganism_regulatory_dossiers' AND dm.new_id=d.id AND rm.tbl='microorganism_ncm_candidates'
     AND rm.old_id=d.published_ncm_candidate_id AND rm.organization_id=dm.organization_id;
  IF EXISTS (SELECT 1 FROM public.microorganism_regulatory_dossiers d JOIN {ROWMAP} dm ON dm.tbl='microorganism_regulatory_dossiers' AND dm.new_id=d.id
              WHERE d.published_ncm_candidate_id IS NOT NULL
                AND d.published_ncm_candidate_id NOT IN (SELECT new_id FROM {ROWMAP} WHERE tbl='microorganism_ncm_candidates' AND organization_id=dm.organization_id)) THEN
    RAISE EXCEPTION 'tenant_catalog_ncm_publication_unmapped'; END IF;
  UPDATE public.microorganism_regulatory_dossiers d SET published_ncm_candidate_id = NULL
   WHERE d.published_ncm_candidate_id IS NOT NULL AND d.id NOT IN (SELECT new_id FROM {ROWMAP} WHERE tbl='microorganism_regulatory_dossiers');
END $ncm$;""")
    # 6. registros com tenant: sem tenant -> descarte/anulação registrados; demais repontados
    for r in TENANT_REFS:
        t = r["t"]
        if r.get("noid"):
            c0, root0 = r["cols"][0]
            w(f"""INSERT INTO {LEDGER}(step, detail) SELECT 'unresolved_discarded', jsonb_build_object('table','{t}','rows', coalesce(jsonb_agg(to_jsonb(x)),'[]'))
  FROM public.{t} x WHERE {r['tenant']} IS NULL;
DELETE FROM public.{t} x WHERE {r['tenant']} IS NULL;""")
        elif r["unresolved"] == "discard":
            guards = "".join(
                f"\n  IF EXISTS (SELECT 1 FROM public.{rt} z WHERE z.{rc} IN (SELECT rid FROM tc_rows WHERE tbl='{t}' AND org IS NULL)) THEN"
                f"\n    RAISE EXCEPTION 'tenant_catalog_discard_blocked' USING DETAIL = '{t} referenciado por {rt}.{rc}'; END IF;"
                for rt, rc in r.get("referenced_by", []))
            w(f"""DO $u$ BEGIN{guards}
  INSERT INTO {LEDGER}(step, detail) SELECT 'unresolved_discarded', jsonb_build_object('table','{t}','rows', coalesce(jsonb_agg(to_jsonb(x)),'[]'))
    FROM public.{t} x WHERE x.id IN (SELECT rid FROM tc_rows WHERE tbl='{t}' AND org IS NULL);
  DELETE FROM public.{t} x WHERE x.id IN (SELECT rid FROM tc_rows WHERE tbl='{t}' AND org IS NULL);
END $u$;""")
        else:
            for c, root in r["cols"]:
                w(f"""DO $u$ DECLARE v_n bigint; BEGIN
  SELECT count(*) INTO v_n FROM tc_rows WHERE tbl='{t}' AND col='{c}' AND org IS NULL;
  IF v_n > 0 THEN
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.{t}'::regclass AND attname='{c}' AND attnotnull) THEN
      RAISE EXCEPTION 'tenant_catalog_unresolved_tenant' USING DETAIL = '{t}.{c}='||v_n; END IF;
    INSERT INTO {LEDGER}(step, detail) SELECT 'unresolved_nullified', jsonb_build_object('table','{t}','column','{c}',
      'rows', jsonb_agg(jsonb_build_object('id', rid, 'old', old_id))) FROM tc_rows WHERE tbl='{t}' AND col='{c}' AND org IS NULL;
    UPDATE public.{t} x SET {c} = NULL WHERE x.id IN (SELECT rid FROM tc_rows WHERE tbl='{t}' AND col='{c}' AND org IS NULL);
  END IF;
END $u$;""")
        if r.get("noid"):
            continue
        for c, root in r["cols"]:
            w(f"""DO $r$ DECLARE v_n bigint; v_left bigint; BEGIN
  UPDATE public.{t} x SET {c} = m.new_id FROM tc_rows tr JOIN {MAP} m ON m.root='{root}' AND m.old_id=tr.old_id AND m.organization_id=tr.org
   WHERE tr.tbl='{t}' AND tr.col='{c}' AND tr.rid = x.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  SELECT count(*) INTO v_left FROM public.{t} x WHERE {orig(root, 'x.' + c)};
  IF v_left > 0 THEN RAISE EXCEPTION 'tenant_catalog_reference_unresolved' USING DETAIL = '{t}.{c}='||v_left; END IF;
  INSERT INTO {LEDGER}(step, detail) VALUES ('reference_repointed', jsonb_build_object('table','{t}','column','{c}','rows',v_n));
END $r$;""")
    # 7. originais (globais) e descendentes originais removidos, ordem inversa; sem dono não existe catálogo
    for d in reversed(DESC):
        t = d["t"]
        if d.get("anchor_parent"):
            pc, pt = d["anchor_parent"]
            cond = f"s.{pc} NOT IN (SELECT new_id FROM {ROWMAP} WHERE tbl='{pt}')"
        else:
            cond = " OR ".join(f"({anchor_cond(d, i)} AND {orig(ar, 's.' + ac)})" for i, (ac, ar) in enumerate(d["anchors"]))
        w(f"""WITH del AS (DELETE FROM public.{t} s WHERE {cond} RETURNING 1)
INSERT INTO {LEDGER}(step, detail) SELECT 'descendant_original_removed', jsonb_build_object('table','{t}','rows',count(*)) FROM del;""")
    for t in OWNED_DESC:
        w(f"""DO $od$ BEGIN
  IF EXISTS (SELECT 1 FROM public.{t} WHERE owner_organization_id IS NULL) THEN RAISE EXCEPTION 'tenant_catalog_owned_child_without_owner' USING DETAIL='{t}'; END IF;
END $od$;
ALTER TABLE public.{t} ALTER COLUMN owner_organization_id SET NOT NULL;
CREATE INDEX {t}_owner_idx ON public.{t} (owner_organization_id);
CREATE FUNCTION platform_private.{t}_owner_consistent() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $f$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.owner_organization_id IS DISTINCT FROM OLD.owner_organization_id THEN
    RAISE EXCEPTION 'tenant_catalog_owner_immutable' USING ERRCODE = '42501'; END IF;
  IF NEW.produto_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = NEW.produto_id AND p.owner_organization_id = NEW.owner_organization_id)
     OR NEW.microrganismo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.microrganismos m WHERE m.id = NEW.microrganismo_id AND m.owner_organization_id = NEW.owner_organization_id){extra_owned(t)}
  THEN RAISE EXCEPTION 'tenant_catalog_cross_tenant_reference' USING ERRCODE = '42501', DETAIL = '{t}'; END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER a00_{t}_owner_consistent BEFORE INSERT OR UPDATE ON public.{t} FOR EACH ROW EXECUTE FUNCTION platform_private.{t}_owner_consistent();""")
    for root in reversed(ROOTS):
        w(f"""INSERT INTO {LEDGER}(step, detail)
  SELECT 'global_removed', jsonb_build_object('table','{root}','count', count(*), 'unused', count(*) FILTER (WHERE NOT EXISTS
     (SELECT 1 FROM {MAP} m WHERE m.root='{root}' AND m.old_id = p.id)), 'snapshot', coalesce(jsonb_agg(to_jsonb(p)), '[]'))
    FROM public.{root} p WHERE p.owner_organization_id IS NULL;
DELETE FROM public.{root} WHERE owner_organization_id IS NULL;
ALTER TABLE public.{root} ALTER COLUMN owner_organization_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS {root}_owner_idx ON public.{root} (owner_organization_id);""")
    w(f"""DO $dup$ DECLARE v text; BEGIN
  SELECT string_agg(owner_organization_id::text||':'||k, ', ') INTO v FROM (
    SELECT owner_organization_id, {UNIQUE_KEY} k FROM public.produtos GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF v IS NOT NULL THEN RAISE EXCEPTION 'tenant_catalog_duplicate_name' USING DETAIL = v; END IF;
END $dup$;
CREATE UNIQUE INDEX produtos_owner_nome_uniq ON public.produtos (owner_organization_id, {UNIQUE_KEY});
CREATE FUNCTION platform_private.catalog_owner_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $f$
BEGIN
  IF NEW.owner_organization_id IS DISTINCT FROM OLD.owner_organization_id OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'tenant_catalog_owner_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION platform_private.catalog_owner_immutable() FROM PUBLIC, anon, authenticated, service_role;""")
    for root in ROOTS:
        w(f"CREATE TRIGGER a00_{root}_owner_immutable BEFORE UPDATE ON public.{root} FOR EACH ROW EXECUTE FUNCTION platform_private.catalog_owner_immutable();")
    # 8. religar triggers exatamente
    w("""DO $t$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM tc_triggers LOOP
    EXECUTE format('ALTER TABLE %s %s TRIGGER %I', r.rel,
      CASE r.tgenabled WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END, r.tgname);
  END LOOP;
END $t$;""")
    # 9. RLS/ACL
    w(f"""CREATE FUNCTION platform_private.tenant_catalog_read_org() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$
BEGIN
  RETURN platform_private.catalog_tenant_actor('read_catalog');
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION platform_private.tenant_catalog_read_org() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_catalog_read_org() TO authenticated;
-- escrita: ator canônico em modo 'mutate' (perfis atuais administrador/gestor + feature); leitura NUNCA autoriza escrita
CREATE FUNCTION platform_private.tenant_catalog_mutate_org() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$
BEGIN
  RETURN platform_private.catalog_tenant_actor('mutate');
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION platform_private.tenant_catalog_mutate_org() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_catalog_mutate_org() TO authenticated;
GRANT USAGE ON SCHEMA platform_private TO authenticated;
INSERT INTO {LEDGER}(step, detail)
  SELECT 'policies_replaced', coalesce(jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd, 'qual', qual, 'check', with_check)), '[]')
    FROM pg_policies WHERE schemaname='public' AND tablename='produtos';
DO $p$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='produtos' LOOP
    EXECUTE format('DROP POLICY %I ON public.produtos', r.policyname);
  END LOOP;
END $p$;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.produtos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
CREATE POLICY tenant_produtos_select ON public.produtos FOR SELECT TO authenticated
  USING (owner_organization_id = platform_private.tenant_catalog_read_org());""")
    # 9a. policies com ramo Superadmin/global (permissivas = bypass; restritivas = exigem Superadmin) são removidas e
    #     registradas em TODAS as raízes e descendentes; achado do esquema REAL: d51_5_*_global_mutation_* (RESTRICTIVE
    #     Superadmin) bloqueariam todo CRUD por tenant e catalog_volumes_sa_* manteriam escrita global.
    for t in ["microrganismos", "culturas"] + [d["t"] for d in DESC]:
        w(f"""DO $sa$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname, cmd, permissive, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename='{t}'
             AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ~* '(superadmin|global_product_fiscal_(read|write)_ready)' LOOP
    INSERT INTO {LEDGER}(step, detail) VALUES ('superadmin_policy_dropped', jsonb_build_object('table','{t}','name',r.policyname,'cmd',r.cmd,
      'permissive',r.permissive,'qual',r.qual,'check',r.with_check));
    EXECUTE format('DROP POLICY %I ON public.{t}', r.policyname);
  END LOOP;
END $sa$;""")
    # microrganismos/culturas: CRUD por tenant (ator 'mutate'); dono derivado no servidor
    for root in ("microrganismos", "culturas"):
        w(f"""DO $rl$ DECLARE v_had boolean; BEGIN
  SELECT relrowsecurity INTO v_had FROM pg_class WHERE oid='public.{root}'::regclass;
  INSERT INTO {LEDGER}(step, detail) VALUES ('root_rls_before', jsonb_build_object('table','{root}','rls', v_had,
    'policies', (SELECT coalesce(jsonb_agg(policyname),'[]') FROM pg_policies WHERE schemaname='public' AND tablename='{root}')));
  ALTER TABLE public.{root} ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.{root} ALTER COLUMN owner_organization_id SET DEFAULT platform_private.tenant_catalog_mutate_org();
  REVOKE ALL ON public.{root} FROM anon;
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.{root} FROM authenticated;
  CREATE POLICY tenant_catalog_owner_restrictive ON public.{root} AS RESTRICTIVE FOR SELECT TO authenticated
    USING (owner_organization_id = platform_private.tenant_catalog_read_org());
  CREATE POLICY tenant_catalog_owner_restrictive_ins ON public.{root} AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (owner_organization_id = platform_private.tenant_catalog_mutate_org());
  CREATE POLICY tenant_catalog_owner_restrictive_upd ON public.{root} AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (owner_organization_id = platform_private.tenant_catalog_mutate_org())
    WITH CHECK (owner_organization_id = platform_private.tenant_catalog_mutate_org());
  CREATE POLICY tenant_catalog_owner_restrictive_del ON public.{root} AS RESTRICTIVE FOR DELETE TO authenticated
    USING (owner_organization_id = platform_private.tenant_catalog_mutate_org());
  CREATE POLICY tenant_catalog_owner_read ON public.{root} FOR SELECT TO authenticated
    USING (owner_organization_id = platform_private.tenant_catalog_read_org());
  -- escrita permissiva SEMPRE criada (antes só quando RLS estava desligado): sem ela o CRUD por tenant ficava fechado
  IF true THEN
    CREATE POLICY tenant_catalog_owner_write_prev_open_ins ON public.{root} FOR INSERT TO authenticated
      WITH CHECK (owner_organization_id = platform_private.tenant_catalog_mutate_org());
    CREATE POLICY tenant_catalog_owner_write_prev_open_upd ON public.{root} FOR UPDATE TO authenticated
      USING (owner_organization_id = platform_private.tenant_catalog_mutate_org())
      WITH CHECK (owner_organization_id = platform_private.tenant_catalog_mutate_org());
    CREATE POLICY tenant_catalog_owner_write_prev_open_del ON public.{root} FOR DELETE TO authenticated
      USING (owner_organization_id = platform_private.tenant_catalog_mutate_org());
  END IF;
END $rl$;""")
    for d in DESC:
        t = d["t"]
        if d.get("anchor_parent"):
            pc, pt = d["anchor_parent"]
            pred = f"EXISTS (SELECT 1 FROM public.{pt} z WHERE z.id = {t}.{pc})"
        else:
            pred = " OR ".join(f"({anchor_cond(d, i).replace('s.', t + '.')} AND EXISTS (SELECT 1 FROM public.{ar} z WHERE z.id = {t}.{ac}))"
                               for i, (ac, ar) in enumerate(d["anchors"]))
        # escrita em descendente: pai visível (mesmo tenant) E ator canônico de escrita desse MESMO tenant
        wpred = f"({pred}) AND platform_private.tenant_catalog_mutate_org() IS NOT NULL AND platform_private.tenant_catalog_mutate_org() = platform_private.tenant_catalog_read_org()"
        w(f"""ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.{t} FROM anon, authenticated;
REVOKE ALL ON public.{t} FROM anon;
CREATE POLICY tenant_catalog_owner_restrictive ON public.{t} AS RESTRICTIVE FOR SELECT TO authenticated USING ({pred});
CREATE POLICY tenant_catalog_owner_restrictive_ins ON public.{t} AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ({wpred});
CREATE POLICY tenant_catalog_owner_restrictive_upd ON public.{t} AS RESTRICTIVE FOR UPDATE TO authenticated USING ({wpred}) WITH CHECK ({wpred});
CREATE POLICY tenant_catalog_owner_restrictive_del ON public.{t} AS RESTRICTIVE FOR DELETE TO authenticated USING ({wpred});
CREATE POLICY tenant_catalog_owner_read ON public.{t} FOR SELECT TO authenticated USING ({pred});""")
    # 10–11. RPCs do produto e fechamento do catálogo global (v1)
    rpc_sql(w, EDITABLE, GLOBAL_FUNCS)
    # 11b. fiscal por tenant: gatilho reescrito, policies sem Superadmin, writer CAS idempotente (gate fiscal/emissão intocados)
    fiscal_sql(w, LEDGER)
    # 11c. cerca de tenant nos DEFINER com entrada direta de ids (classe B) + writer global fechado
    fence_sql(w, LEDGER, lit)
    # 11c2. A/E: deltas pinados com dono canônico + guarda persistente de tenant nas tabelas-pai
    ae_sql(w, LEDGER, lit, TENANT_REFS)
    # 11d. códigos automáticos por empresa (contador privado com lock; gerador global fechado)
    codigo_sql(w, LEDGER, lit)
    # 11e. CRUD por RPC (CAS/idempotência) das raízes auxiliares, perfis técnicos e formulações; escrita direta fechada
    crud_sql(w, LEDGER, lit, CONSOL["catalogo-schema-input.json"]["columns"])
    # 12. POST: integridade por tenant (cada vínculo aponta para a cópia do tenant do registro)
    names = ", ".join(lit(n) for n in GLOBAL_FUNCS)
    checks = []
    for r in TENANT_REFS:
        for c, root in r["cols"]:
            checks.append(f"SELECT '{r['t']}.{c}' k, count(*) n FROM public.{r['t']} x JOIN public.{root} z ON z.id = x.{c}"
                          f" WHERE z.owner_organization_id IS DISTINCT FROM {r['tenant']}")
    for d in DESC:
        if not d["anchors"]: continue
        for i, (ac, ar) in enumerate(d["anchors"]):
            for oc, orr in d["all_roots"]:
                if oc == ac: continue
                checks.append(f"SELECT '{d['t']}.{oc}' k, count(*) n FROM public.{d['t']} s JOIN public.{ar} a ON a.id = s.{ac}"
                              f" JOIN public.{orr} b ON b.id = s.{oc} WHERE {anchor_cond(d, i)} AND a.owner_organization_id <> b.owner_organization_id")
    for t, c, tr in ROOT_LINKS:
        checks.append(f"SELECT '{t}.{c}' k, count(*) n FROM public.{t} a JOIN public.{tr} b ON b.id = a.{c} WHERE a.owner_organization_id <> b.owner_organization_id")
    union = "\n      UNION ALL ".join(checks)
    w(GUARD_SNAPSHOT.replace("tc_guard_x", "tc_guard_post"))
    w(f"""DO $post$ DECLARE v text; r record; BEGIN
  FOR r IN SELECT * FROM (VALUES {vals(PURGE_CHAIN)}) m(t, id) LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id = $1', r.t) INTO v USING r.id::uuid;
    IF v <> '0' THEN RAISE EXCEPTION 'post:chain_still_present:%', r.t; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM (SELECT * FROM tc_guard_pre EXCEPT SELECT * FROM tc_guard_post) d) OR (SELECT fiscal_on FROM tc_guard_post) > 0
     OR (SELECT guard_bodies FROM tc_guard_post) = 0 THEN
    RAISE EXCEPTION 'post:receivable_or_fiscal_guard_changed' USING DETAIL =
      (SELECT row_to_json(a)::text FROM tc_guard_pre a)||' -> '||(SELECT row_to_json(b)::text FROM tc_guard_post b);
  END IF;
  SELECT string_agg(k||'='||n, ', ') INTO v FROM (
      {union}) q WHERE n > 0;
  IF v IS NOT NULL THEN RAISE EXCEPTION 'post:cross_tenant_reference' USING DETAIL = v; END IF;
  IF has_table_privilege('anon','public.produtos','SELECT') OR has_table_privilege('authenticated','public.produtos','INSERT')
     OR has_table_privilege('authenticated','public.produtos','UPDATE') OR has_table_privilege('authenticated','public.produtos','DELETE')
     OR has_table_privilege('authenticated','public.produtos','TRUNCATE') THEN RAISE EXCEPTION 'post:produtos_acl_open'; END IF;
  FOR r IN SELECT t, rl, pv FROM unnest({arr(sorted(set(ROOTS) | {x["t"] for x in TENANT_REFS} | {d["t"] for d in DESC} | set(CLIENT_ACL_EXTRA)))}) t,
             unnest(ARRAY['public','anon','authenticated']) rl, unnest(ARRAY['TRUNCATE','TRIGGER','REFERENCES']) pv
           WHERE to_regclass('public.'||t) IS NOT NULL AND has_table_privilege(rl, 'public.'||t, pv) LOOP
    RAISE EXCEPTION 'post:client_destructive_acl' USING DETAIL = r.t||':'||r.rl||':'||r.pv;
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname IN ('public','platform_private') AND p.proname IN ({names}) LOOP
    IF has_function_privilege('authenticated', r.sig, 'EXECUTE') OR has_function_privilege('anon', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'post:global_function_open:%', r.sig; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM tc_triggers t JOIN pg_trigger g ON g.tgname=t.tgname AND g.tgrelid=t.rel::regclass WHERE g.tgenabled <> t.tgenabled)
    THEN RAISE EXCEPTION 'post:trigger_state_not_restored'; END IF;
  INSERT INTO {LEDGER}(step, detail) VALUES ('post_ok', jsonb_build_object(
    'produtos', (SELECT count(*) FROM public.produtos), 'microrganismos', (SELECT count(*) FROM public.microrganismos),
    'culturas', (SELECT count(*) FROM public.culturas), 'guard', (SELECT row_to_json(g) FROM tc_guard_post g)));
END $post$;""")
    w("DROP FUNCTION platform_private.tc_agree(uuid[]);  -- auxiliar transitório, sem artefato persistente")
    w("COMMIT;")
    return "\n".join(s) + "\n"


CONSOL = json.loads((EVID / "consolidado-20261101-1534/consolidado-catalogo-20261101.json").read_text())["files"]


MAINT_CAPTURE = EVID / "captura-manutencao-20261102/captura-manutencao-20261102.json"
MAINT_CAPTURE_SHA = "b5d257c50f9a3055879e9f25876ac4f7cb5e73def68ae565c69a9e5256702a39"
MAINT_ROLES = ["postgres", "supabase_admin"]   # allowlist do executor da manutenção (dono das tabelas)
EVT_CAPTURE = EVID / "captura-event-triggers-20261102/event-triggers-20261102.json"
EVT_CAPTURE_SHA = "1ece8214f79e3e739234c9ecdd9bbfdcfdca31ee29243379b6351683520f6c1e"
# Revisão de composição (02/11): 4 limitados a CREATE/DROP EXTENSION (não disparam no descarte);
# 2 pgrst_*_watch fazem apenas NOTIFY pgrst 'reload schema' (sem e-mail/cobrança/fiscal). Nenhum escreve em tabela.
EVT_REVIEWED = {"issue_graphql_placeholder", "issue_pg_cron_access", "issue_pg_graphql_access",
                "issue_pg_net_access", "pgrst_ddl_watch", "pgrst_drop_watch"}


def event_trigger_pins():
    raw = EVT_CAPTURE.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == EVT_CAPTURE_SHA, "captura de event triggers divergente"
    cap = json.loads(raw)
    assert {e["evtname"] for e in cap} == EVT_REVIEWED and len(cap) == 6
    out = []
    for e in cap:
        assert hashlib.md5(e["definition"].encode()).hexdigest() == e["function_md5"], e["evtname"]
        assert e["evtenabled"] in ("O", "A", "R", "D")
        if e["evttags"] is None:   # sem filtro de tag: o corpo precisa ser só NOTIFY (revisado)
            assert "NOTIFY pgrst, 'reload schema'" in e["definition"] and not re.search(r"\b(INSERT|UPDATE|DELETE|net\.|http)", e["definition"], re.I), e["evtname"]
        else:
            assert set(e["evttags"]) <= {"CREATE EXTENSION", "DROP EXTENSION"}, e["evtname"]
        out.append(dict(evtname=e["evtname"], evtevent=e["evtevent"], evtenabled=e["evtenabled"],
                        evttags=sorted(e["evttags"]) if e["evttags"] is not None else None,
                        function_signature=e["function_signature"], function_md5=e["function_md5"]))
    return out


def maint_sql():
    raw = MAINT_CAPTURE.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == MAINT_CAPTURE_SHA, "captura de manutenção divergente"
    cap = json.loads(raw); pins = cap["triggers"]; man = CONSOL["descarte-manifesto-live.json"]
    assert len(pins) == 83 and sum(1 for p in pins if p["fires_delete"]) == 23 and all(p["tgenabled"] == "O" for p in pins)
    assert all(p["trigger_definition"] and p["function_definition"] for p in pins)
    assert cap["fingerprints"]["formula"] == "md5(to_jsonb(t)::text)" and not cap["fingerprints"]["mismatch"]
    live_fp = {(r["table_name"], r["id"]): r["fingerprint"] for r in cap["fingerprints"]["rows"]}
    assert len(man) == 19 and all(live_fp[(m["table_name"], m["id"])] == m["fingerprint"] for m in man), "fingerprints divergentes"
    t = (HERE / "maint_template.sql").read_text()
    return (t.replace("{{TRIGGER_PINS}}", ",\n    ".join(f"({lit(p['table_name'])},{lit(p['tgname'])},{int(p['tgtype'])},{lit(p['trigger_md5'])},{lit(p['function_md5'])})" for p in pins))
             .replace("{{N_TRIGGERS}}", str(len(pins)))
             .replace("{{MAINT_ROLES_SQL}}", ",".join(lit(r) for r in MAINT_ROLES))
             .replace("{{MAINT_ROLES}}", "/".join(MAINT_ROLES))
             .replace("{{EVENT_TRIGGER_PINS}}", json.dumps(event_trigger_pins()).replace("'", "''"))
             .replace("{{ROW_PINS}}", ",".join(f"({lit(m['table_name'])},{lit(m['id'])},{lit(m['fingerprint'])})" for m in man))
             .replace("{{CHECKLIST_IDS}}", ",".join(lit(m["id"]) for m in man if m["table_name"] == "entrega_checklist")))


def main():
    (HERE / "02-chain-purge-maintenance.sql.review").write_text(maint_sql())
    (HERE / "00-pre-global.sql.review").write_text(pre_sql())
    (HERE / "01-migrate.sql.review").write_text(migrate_sql())
    (HERE / "reference-map.json").write_text(json.dumps(dict(
        version=2, source="live-readonly-20261101/fks.tsv (151 FKs, READ ONLY) — confirmado pelo PRE contra pg_constraint real",
        roots=ROOTS, root_links=ROOT_LINKS, tenant_refs=TENANT_REFS, descendants=DESC, dep_columns=DEP_COLS,
        expected_root_fks=expected_fks(), expected_parent_fks=expected_parent_fks(),
        global_functions_closed=GLOBAL_FUNCS, editable_fields=EDITABLE), indent=1, ensure_ascii=False))
    global HOMOLOG_CLEAN
    HOMOLOG_CLEAN = True
    DESC.extend(HOMOLOG_ONLY_DESC)
    (HERE / "homolog-clean").mkdir(exist_ok=True)
    (HERE / "homolog-clean/00-pre-global.homolog-clean.sql.review").write_text(pre_sql().replace("-- 00 PRE GLOBAL v2", "-- 00 PRE GLOBAL v2 [VARIANTE HOMOLOG LIMPA: 25 globais podem estar ausentes]", 1))
    (HERE / "homolog-clean/01-migrate.homolog-clean.sql.review").write_text(migrate_sql().replace("-- 01 MIGRAÇÃO TRANSACIONAL v2", "-- 01 MIGRAÇÃO TRANSACIONAL v2 [VARIANTE HOMOLOG LIMPA]", 1))
    HOMOLOG_CLEAN = False
    for d in HOMOLOG_ONLY_DESC: DESC.remove(d)
    sums = {str(p.relative_to(HERE)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(list(HERE.glob("*.review")) + list(HERE.glob("homolog-clean/*.review")))}
    (HERE / "SHA256SUMS.json").write_text(json.dumps(sums, indent=1))
    print(json.dumps(sums, indent=1))


if __name__ == "__main__":
    main()
