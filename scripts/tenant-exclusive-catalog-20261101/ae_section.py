"""11f. Reclassificação A/E (revisão independente 02/11): consumidores DEFINER mantidos que liam o catálogo sem dono.

Achado concreto: b2b_save_technical_simulation buscava produto/micro do payload só por id/ativo/b2b_enabled
(sem dono do vendedor) e catalog_tenant_selection_core listava produtos/micro/culturas de TODAS as empresas
(tenant só no LEFT JOIN de visibilidade; include_ids alheios voltavam). RLS não protege DEFINER, e
"pai/FK repontado" ou "cita tenant" não são prova. Correção em duas partes, ambas executáveis:

1. DELTAS PINADOS (md5 do corpo LIVE conferido, cada trecho substituído exatamente N vezes, senão aborta):
   toda leitura de catálogo com id vindo do payload/parâmetro ou listagem passa a exigir o dono canônico
   derivado no servidor (ator, vendedor do parceiro, tenant do lote/visita/NF). Item alheio = "não encontrado"
   do próprio corpo (sem oráculo) ou 42501 explícito onde o corpo seguiria com o id.
2. GUARDA PERSISTENTE nas tabelas-pai (OS, lote, entrega, etiqueta, itens B2B...): BEFORE INSERT/UPDATE exige
   que todo id de catálogo pertença ao tenant derivado dos pais reais (mesmas expressões da migração; cadeias
   divergentes abortam). É isso que torna seguras as leituras "via pai" das funções classe A — inclusive contra
   escritores DEFINER/dono que ignoram RLS. Sem bypass de Superadmin.
"""
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
CLS = json.loads((HERE.parent.parent / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/definer-48-classificacao-v2.7.json").read_text())
PIN = {r["signature"].replace("public.", ""): r["live_md5"] for r in CLS}
# gatilho fora dos 48 (achado pelo inventário AE-16b): md5 do corpo LIVE capturado (input 01/11 e helpers 02/11 idênticos)
PIN["platform_private.catalog_visit_reference_guard_current12()"] = "b1db3fdcbd99a7b778a888ef0207170c"
# v2.12: agregadora regulatória (fora dos 48) — sonda com dependências v2.11 reais reproduziu LEAK: lista microrganismos
# de TODAS as empresas para gestor AR Bio e FSF. md5 do corpo LIVE (input 01/11).
PIN["rpc_microorganism_regulatory_overview()"] = "a5763623af22befd1a60df8b04636e5d"

SELLER_P = "platform_private.catalog_tenant_seller(p_partner_id)"
SELLER_T = "platform_private.catalog_tenant_seller(v_partner)"
LOT_V = "(SELECT l.organization_id FROM public.lotes l WHERE l.id = {v})"
VISIT_ORG = "(SELECT cl.organization_id FROM public.registros_consultor rc JOIN public.clientes cl ON cl.id = rc.cliente_id WHERE rc.id = p_registro_id)"
B2B_SELLER = "(SELECT pa.commercial_owner_organization_id FROM public.partner_accounts pa WHERE pa.id = p)"

# (assinatura, [(trecho LIVE exato, substituto, ocorrências)])
DELTAS = [
    ("platform_private.b2b_save_technical_simulation(jsonb)", [
        ("FROM public.produtos WHERE id=iid AND ativo AND b2b_enabled;",
         f"FROM public.produtos WHERE id=iid AND ativo AND b2b_enabled AND owner_organization_id={B2B_SELLER};", 1),
        ("FROM public.microrganismos WHERE id=iid AND ativo AND b2b_enabled;",
         f"FROM public.microrganismos WHERE id=iid AND ativo AND b2b_enabled AND owner_organization_id={B2B_SELLER};", 1)]),
    ("platform_private.catalog_tenant_selection_core(text,text,integer,integer,uuid[])", [
        ("FROM public.produtos p WHERE p_entity_type='produto'", "FROM public.produtos p WHERE p_entity_type='produto' AND p.owner_organization_id=v_org", 1),
        ("FROM public.microrganismos m WHERE p_entity_type='microrganismo'", "FROM public.microrganismos m WHERE p_entity_type='microrganismo' AND m.owner_organization_id=v_org", 1),
        ("FROM public.culturas c WHERE p_entity_type='cultura'", "FROM public.culturas c WHERE p_entity_type='cultura' AND c.owner_organization_id=v_org", 1)]),
    ("platform_private.catalog_tenant_set_visibility_core(text,uuid,boolean,integer,text,uuid)", [
        ("FROM public.produtos WHERE id=p_entity_id;", "FROM public.produtos WHERE id=p_entity_id AND owner_organization_id=v_org;", 1),
        ("FROM public.microrganismos WHERE id=p_entity_id;", "FROM public.microrganismos WHERE id=p_entity_id AND owner_organization_id=v_org;", 1),
        ("FROM public.culturas WHERE id=p_entity_id;", "FROM public.culturas WHERE id=p_entity_id AND owner_organization_id=v_org;", 1)]),
    ("get_partner_catalog_secure(uuid)", [
        ("WHERE p.ativo = true AND p.b2b_enabled = true AND", f"WHERE p.ativo = true AND p.b2b_enabled = true AND p.owner_organization_id = {SELLER_P} AND", 1),
        ("WHERE m.ativo = true AND m.b2b_enabled = true AND", f"WHERE m.ativo = true AND m.b2b_enabled = true AND m.owner_organization_id = {SELLER_P} AND", 1)]),
    ("get_partner_catalog_tecnico_secure()", [
        ("WHERE p.ativo = true AND p.b2b_enabled = true AND", f"WHERE p.ativo = true AND p.b2b_enabled = true AND p.owner_organization_id = {SELLER_T} AND", 1),
        ("WHERE m.ativo = true AND m.b2b_enabled = true AND", f"WHERE m.ativo = true AND m.b2b_enabled = true AND m.owner_organization_id = {SELLER_T} AND", 1)]),
    ("tenant_catalog_visit_selection_page(uuid,text,text,integer,integer,uuid[])", [
        ("to_jsonb(p)->>'owner_organization_id' IS NULL", "p.owner_organization_id=v_org", 1),
        ("to_jsonb(m)->>'owner_organization_id' IS NULL", "m.owner_organization_id=v_org", 1)]),
    ("rpc_converter_visita_em_os(uuid,text)", [
        ("(to_jsonb(p)->>'owner_organization_id') IS NULL", f"p.owner_organization_id={VISIT_ORG}", 1),
        ("(to_jsonb(m)->>'owner_organization_id') IS NULL", f"m.owner_organization_id={VISIT_ORG}", 1)]),
    ("platform_private.catalog_visit_reference_guard_current12()", [
        ("to_jsonb(m)->>'owner_organization_id' IS NULL", "m.owner_organization_id=v_org", 1),
        ("to_jsonb(p)->>'owner_organization_id' IS NULL", "p.owner_organization_id=v_org", 1)]),
    ("rpc_criar_embalagens_pos_envase(jsonb)", [
        ("SELECT 1 FROM public.produtos WHERE id = v_produto)",
         f"SELECT 1 FROM public.produtos WHERE id = v_produto AND owner_organization_id = {LOT_V.format(v='v_lote')})", 1)]),
    ("rpc_gerar_etiqueta_produto(jsonb)", [
        ("FROM public.produtos p WHERE p.id = v_produto_id;",
         f"FROM public.produtos p WHERE p.id = v_produto_id AND p.owner_organization_id = {LOT_V.format(v='v_lote_id')};\n"
         "    IF NOT FOUND THEN RAISE EXCEPTION 'etiqueta_produto_tenant_denied' USING ERRCODE = '42501'; END IF;", 1)]),
    ("rpc_microorganism_regulatory_overview()", [
        ("    WHERE m.ativo\n  ) s;", "    WHERE m.ativo AND m.owner_organization_id = public.h15_actor_organization()\n  ) s;", 1)]),
    ("rpc_fiscal_draft_save(uuid,jsonb,jsonb,integer)", [
        ("WHERE pr.id = v_source_id)", "WHERE pr.id = v_source_id AND pr.owner_organization_id = public.h15_actor_organization())", 1)]),
    ("rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])", [
        ("FROM public.produtos WHERE id=product AND ativo IS TRUE FOR SHARE", "FROM public.produtos WHERE id=product AND ativo IS TRUE AND owner_organization_id=org FOR SHARE", 1)]),
    ("platform_private.storage1_application_allowed(text,text)", [
        ("EXISTS(SELECT 1 FROM public.produtos WHERE id=product AND ativo IS TRUE)",
         "EXISTS(SELECT 1 FROM public.produtos WHERE id=product AND ativo IS TRUE AND owner_organization_id=org)", 1)]),
]

# Classe A restante: leitura só via pai já autorizado pelo próprio corpo; a guarda persistente das tabelas-pai é a prova.
PARENT_GUARDED = {
    "platform_private.manual_cq_v1(uuid,uuid,jsonb)": ["ordens_servico", "programacao_producao", "lotes"],
    "rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb)": ["ordens_servico", "programacao_producao", "lotes"],
    "rpc_programar_os_v1(uuid,text,date)": ["ordens_servico", "programacao_producao"],
    "fn_comprovante_entrega_montar_v1(uuid)": ["entregas", "produto_etiquetas", "lotes"],
    "fn_entrega_build_snapshot_v1(uuid)": ["entregas", "produto_etiquetas"],
    "rpc_get_comprovante_entrega_data(uuid,boolean)": ["entregas", "produto_etiquetas", "lotes"],
    "get_portal_cliente_b2b_order_detail_secure(uuid)": ["partner_order_items"],
    "get_portal_cliente_b2b_simulation_detail_secure(uuid)": ["partner_simulation_items"],
    "get_production_planning_detail(uuid)": ["partner_order_items"],
    "get_partner_catalog_secure(uuid,boolean)": [],         # lê pelo invólucro base corrigido (delta acima)
    "get_partner_catalog_tecnico_secure(boolean)": [],
}
NO_CATALOG_READ = ["_entrega_seed_checklist(uuid)"]          # só insere itens fixos de checklist

# Agregadoras B2B SEM nenhum filtro de tenant no corpo LIVE (somam pedidos/recebíveis/produtos de TODAS as empresas para
# qualquer administrador/gestor/financeiro). Em produção já estão sem EXECUTE de cliente (migration d51_5
# 20261005220903); a sonda v2.11 reproduziu LEAK de produtos AR Bio para o gestor FSF quando o EXECUTE fica aberto.
# Correção: pin md5 do corpo LIVE + REVOKE (só estreita) + verificação imediata; corpo NÃO é reescrito — escopo
# financeiro por empresa não tem decisão/prova e liberar o painel exigiria contrato próprio.
_EV = HERE.parent.parent / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101"
_AGGCAP = {f["signature"]: f["definition_md5"] for f in json.loads(
    (_EV / "captura-agregadoras-20261102/fechamento-agregadoras-20261102.json").read_text())["functions"]}
TENANTLESS_CLOSED = [("public.rpc_b2b_executive_dashboard()", "b008fac79ad80669c8ad2de19f17892a"),
                     ("public.rpc_b2b_carteira_kpis(date,date)", _AGGCAP["rpc_b2b_carteira_kpis(date,date)"]),
                     ("public.rpc_b2b_revenue_forecast(uuid)", _AGGCAP["rpc_b2b_revenue_forecast(uuid)"])]


def _new(expr):
    return re.sub(r"\bx\.", "NEW.", expr).replace("platform_private.tc_agree(", "platform_private.catalog_tenant_agree(")


def ae_sql(w, ledger, lit, tenant_refs):
    w("""CREATE FUNCTION platform_private.catalog_tenant_agree(p uuid[]) RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $f$
DECLARE v uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(p) x WHERE x IS NOT NULL);
BEGIN
  IF cardinality(v) > 1 THEN RAISE EXCEPTION 'tenant_catalog_chain_divergence' USING ERRCODE = '42501', DETAIL = array_to_string(v, ','); END IF;
  RETURN v[1];
END $f$;
REVOKE ALL ON FUNCTION platform_private.catalog_tenant_agree(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
-- vendedor do catálogo B2B: dono comercial do parceiro; sem parceiro = tenant canônico do ator interno; Superadmin = nenhum
CREATE FUNCTION platform_private.catalog_tenant_seller(p_partner uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_platform_superadmin(auth.uid()) THEN RETURN NULL; END IF;
  IF p_partner IS NOT NULL THEN
    RETURN (SELECT pa.commercial_owner_organization_id FROM public.partner_accounts pa WHERE pa.id = p_partner);
  END IF;
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  BEGIN
    RETURN platform_private.catalog_tenant_actor('read_catalog');
  EXCEPTION WHEN raise_exception OR insufficient_privilege OR invalid_parameter_value THEN RETURN NULL;
  END;
END $f$;
REVOKE ALL ON FUNCTION platform_private.catalog_tenant_seller(uuid) FROM PUBLIC, anon, authenticated, service_role;""")
    # 1. guardas persistentes nas tabelas-pai
    guarded = []
    for r in tenant_refs:
        if r["tenant"].strip() == "NULL::uuid":
            continue
        t = r["t"]
        cond = _new(r["where"]) if r.get("where") else "true"
        checks = "\n".join(
            f"    IF NEW.{c} IS NOT NULL AND (v_t IS NULL OR NOT EXISTS (SELECT 1 FROM public.{root} z WHERE z.id = NEW.{c} AND z.owner_organization_id = v_t)) THEN\n"
            f"      RAISE EXCEPTION 'tenant_catalog_cross_tenant_reference' USING ERRCODE = '42501', DETAIL = '{t}.{c}'; END IF;"
            for c, root in r["cols"])
        anyref = " OR ".join(f"NEW.{c} IS NOT NULL" for c, _ in r["cols"])
        w(f"""CREATE FUNCTION platform_private.{t}_catalog_tenant_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_t uuid;
BEGIN
  IF NOT ({anyref}) THEN RETURN NEW; END IF;
  IF {cond} THEN
    v_t := {_new(r['tenant'])};
{checks}
  END IF;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION platform_private.{t}_catalog_tenant_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER a000_{t}_catalog_tenant_guard BEFORE INSERT OR UPDATE ON public.{t} FOR EACH ROW EXECUTE FUNCTION platform_private.{t}_catalog_tenant_guard();
INSERT INTO {ledger}(step, detail) VALUES ('catalog_parent_guard', jsonb_build_object('table', {lit(t)}));""")
        guarded.append(t)
    # 2. deltas pinados
    rows = []
    for sig, reps in DELTAS:
        pin = PIN[sig.replace("public.", "")]
        fq = sig if "." in sig.split("(")[0] else "public." + sig
        arr = ", ".join(f"ROW({lit(a)}, {lit(b)}, {n})::platform_private.tc_delta" for a, b, n in reps)
        rows.append(f"({lit(fq)}, {lit(pin)}, ARRAY[{arr}])")
    w(f"""CREATE TYPE platform_private.tc_delta AS (old text, new text, n integer);
DO $ae$ DECLARE r record; d platform_private.tc_delta; v_def text; v_cnt integer;
BEGIN
  -- corpos LIVE byte-idênticos salvo o trecho; validação do corpo pelo plpgsql adiada (mesma regra da carga dos corpos)
  PERFORM set_config('check_function_bodies', 'off', true);
  FOR r IN SELECT * FROM (VALUES {', '.join(rows)}) t(sig, pin, reps) LOOP
    IF to_regprocedure(r.sig) IS NULL THEN RAISE EXCEPTION 'ae_delta_target_missing:%', r.sig; END IF;
    v_def := pg_get_functiondef(r.sig::regprocedure);
    IF md5(v_def) <> r.pin THEN RAISE EXCEPTION 'ae_delta_pin_drift:%', r.sig USING DETAIL = md5(v_def); END IF;
    FOREACH d IN ARRAY r.reps LOOP
      v_cnt := (length(v_def) - length(replace(v_def, d.old, ''))) / length(d.old);
      IF v_cnt <> d.n THEN RAISE EXCEPTION 'ae_delta_occurrence_mismatch:%:%', r.sig, v_cnt USING DETAIL = d.old; END IF;
      v_def := replace(v_def, d.old, d.new);
    END LOOP;
    BEGIN
      EXECUTE v_def;   -- CREATE OR REPLACE: mesma assinatura, dono e ACL
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'ae_delta_exec_failed:%:%', r.sig, SQLERRM;
    END;
    INSERT INTO {ledger}(step, detail) VALUES ('ae_owner_delta', jsonb_build_object('function', r.sig, 'pin', r.pin,
      'new_md5', md5(pg_get_functiondef(r.sig::regprocedure)), 'replacements', cardinality(r.reps)));
  END LOOP;
  PERFORM set_config('check_function_bodies', 'on', true);
END $ae$;
DROP TYPE platform_private.tc_delta;""")
    vals = ", ".join(f"({lit(a)}, {lit(b)})" for a, b in TENANTLESS_CLOSED)
    w(f"""DO $closed$ DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES {vals}) t(sig, pin) LOOP
    IF to_regprocedure(r.sig) IS NULL THEN RAISE EXCEPTION 'tenantless_target_missing:%', r.sig; END IF;
    IF md5(pg_get_functiondef(r.sig::regprocedure)) <> r.pin THEN RAISE EXCEPTION 'tenantless_pin_drift:%', r.sig; END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig::regprocedure);
    IF has_function_privilege('authenticated', r.sig, 'EXECUTE') OR has_function_privilege('anon', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'tenantless_aggregator_open:%', r.sig; END IF;
    INSERT INTO {ledger}(step, detail) VALUES ('tenantless_aggregator_closed', jsonb_build_object('function', r.sig, 'pin', r.pin));
  END LOOP;
END $closed$;""")
    return guarded
