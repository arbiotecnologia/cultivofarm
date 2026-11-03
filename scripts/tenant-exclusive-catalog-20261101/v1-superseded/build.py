#!/usr/bin/env python3
"""Catálogo EXCLUSIVO por tenant — gerador do candidato (NO_GO, não aplica nada).

Gera:
  00-pre-global.sql.review   somente leitura, antes de qualquer DDL
  01-migrate.sql.review      transação única: PRE inline, mapa antigo+tenant->novo, cópias, repontamento,
                             ownership obrigatório, unicidade por tenant, RLS/ACL, RPCs, fechamento global, POST
  reference-map.json         inventário das referências a public.produtos e regra de tenant de cada uma

Inventário derivado de src/integrations/supabase/types.ts (FKs declaradas). O PRE compara com pg_constraint
REAL no momento da aplicação e aborta se houver FK não mapeada — o inventário nunca é confiado cegamente.
"""
import hashlib, json, pathlib

HERE = pathlib.Path(__file__).resolve().parent

# kind: descendant = atributo do produto (copiado por tenant, original removido)
#       reference  = registro com tenant próprio (repontado para a cópia do seu tenant)
#       nullify    = tabela global sem tenant (microrganismos.product_id): referência anulada e registrada
# tenant: expressão SQL sobre o alias x que devolve o organization_id do registro.
PA = "(SELECT pa.commercial_owner_organization_id FROM public.partner_accounts pa WHERE pa.id = {c})"
REFS = [
    # referências com tenant direto
    dict(t="entregas", c="produto_id", kind="reference", tenant="x.organization_id"),
    dict(t="lotes", c="produto_id", kind="reference", tenant="x.organization_id"),
    dict(t="ordens_servico", c="produto_id", kind="reference", tenant="x.organization_id"),
    dict(t="programacao_producao", c="produto_id", kind="reference", tenant="x.organization_id"),
    dict(t="catalog_tenant_visibility", c="produto_id", kind="reference", tenant="x.organization_id"),
    # B2B: catálogo do VENDEDOR (dono comercial do parceiro), nunca o tenant do comprador
    dict(t="commercial_condition_item_prices", c="product_id", kind="reference", tenant=PA.format(c="x.partner_id")),
    dict(t="commercial_price_rules", c="product_id", kind="reference", tenant=PA.format(c="x.partner_id")),
    dict(t="partner_product_prices", c="product_id", kind="reference", tenant=PA.format(c="x.partner_id")),
    dict(t="partner_order_items", c="product_id", kind="reference",
         tenant=PA.format(c="(SELECT po.partner_id FROM public.partner_orders po WHERE po.id = x.order_id)")),
    dict(t="partner_simulation_items", c="product_id", kind="reference",
         tenant=PA.format(c="(SELECT ps.partner_id FROM public.partner_simulations ps WHERE ps.id = x.simulation_id)")),
    # tenant por cadeia operacional
    dict(t="estoque_produto", c="produto_id", kind="reference",
         tenant="COALESCE((SELECT l.organization_id FROM public.lotes l WHERE l.id = x.lote_id), "
                + PA.format(c="x.reservado_para_partner_id") + ")"),
    dict(t="estoque_embalagens", c="produto_id", kind="reference",
         tenant="COALESCE((SELECT l.organization_id FROM public.lotes l WHERE l.id = x.lote_id),"
                " (SELECT e.organization_id FROM public.entregas e WHERE e.id = x.entrega_id),"
                " (SELECT cl.organization_id FROM public.clientes cl WHERE cl.id = x.cliente_id))"),
    dict(t="produto_etiquetas", c="produto_id", kind="reference",
         tenant="COALESCE((SELECT l.organization_id FROM public.lotes l WHERE l.id = x.lote_id),"
                " (SELECT e.organization_id FROM public.entregas e WHERE e.id = x.entrega_id),"
                " (SELECT cl.organization_id FROM public.clientes cl WHERE cl.id = x.cliente_id))"),
    dict(t="os_faturamento_base", c="produto_id", kind="reference",
         tenant="COALESCE((SELECT os.organization_id FROM public.ordens_servico os WHERE os.id = x.ordem_servico_id),"
                " (SELECT cl.organization_id FROM public.clientes cl WHERE cl.id = x.cliente_id))"),
    dict(t="ordens_servico_onfarm", c="produto_id", kind="reference",
         tenant="(SELECT cl.organization_id FROM public.clientes cl WHERE cl.id = x.cliente_id)"),
    dict(t="registros_consultor_recomendacoes", c="produto_biologico_sugerido_id", kind="reference",
         tenant="(SELECT cl.organization_id FROM public.registros_consultor rc JOIN public.clientes cl ON cl.id = rc.cliente_id"
                " WHERE rc.id = x.registro_consultor_id)"),
    # campanhas não têm tenant: linhas existentes abortam (sem atribuição inventada)
    dict(t="commercial_campaign_products", c="product_id", kind="reference", tenant="NULL::uuid"),
    # atributos do produto: seguem a cópia
    dict(t="product_fiscal_profiles", c="product_id", kind="descendant"),
    dict(t="product_technical_profiles", c="produto_id", kind="descendant"),
    dict(t="produto_composicao_conjuntos", c="produto_id", kind="descendant"),
    dict(t="produto_conformidade_perfis", c="produto_id", kind="descendant"),
    dict(t="product_crop_recommendations", c="produto_id", kind="descendant"),
    dict(t="product_target_recommendations", c="produto_id", kind="descendant"),
    dict(t="cq_parametros_referencia", c="produto_id", kind="descendant"),
    dict(t="catalogo_volumes", c="produto_id", kind="descendant"),
    dict(t="formulacoes", c="produto_id", kind="descendant"),
    # componente da formulação: tenant = dono da cópia do produto pai (tratado após cópia dos descendentes)
    dict(t="formulacoes", c="component_insumo_id", kind="reference",
         tenant="(SELECT p.owner_organization_id FROM public.produtos p WHERE p.id = x.produto_id)"),
    # tabela global sem tenant: referência anulada com registro (dados de teste autorizados)
    dict(t="microrganismos", c="product_id", kind="nullify"),
]
UNIQUE_KEY = "lower(btrim(nome))"
# Escritores/leitores globais a fechar (nomes vistos em types.ts; o PRE lista overloads reais por nome).
GLOBAL_FUNCS = ["platform_create_global_product", "platform_read_global_product_catalog",
                "platform_read_global_product_catalog_by_family", "platform_read_global_product_composition",
                "platform_read_global_product_metadata", "platform_set_global_product_composition",
                "platform_set_global_product_family", "platform_set_global_product_status",
                "platform_update_global_product_metadata", "platform_wipe_global_product_catalog"]
EDITABLE = {"nome": "text", "codigo": "text", "descricao": "text", "tipo": "text", "classe_catalogo": "text",
            "familia_catalogo": "text", "modo_acao": "text", "modo_aplicacao": "text", "funcao_completa": "text",
            "e_insumo": "boolean", "b2b_enabled": "boolean", "dose_ml_ha": "numeric", "estoque_minimo": "numeric",
            "valor_dose_brl": "numeric", "valor_ha_brl": "numeric", "valor_litro_brl": "numeric"}


def lit(s): return "'" + s.replace("'", "''") + "'"


def refs_values():
    rows = []
    for r in REFS:
        rows.append(f"({lit(r['t'])},{lit(r['c'])},{lit(r['kind'])})")
    return ",".join(rows)


PRE_BODY = f"""
DECLARE v_fail text[] := ARRAY[]::text[]; r record; v_n bigint;
BEGIN
  -- 1. FKs reais para produtos devem estar todas mapeadas (e vice-versa)
  FOR r IN
    SELECT c.conrelid::regclass::text AS rel, a.attname AS col
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum = ANY(c.conkey)
     WHERE c.contype='f' AND c.confrelid='public.produtos'::regclass
  LOOP
    IF NOT EXISTS (SELECT 1 FROM (VALUES {refs_values()}) m(t,c,k)
                   WHERE ('public.'||m.t = r.rel OR m.t = r.rel) AND m.c = r.col) THEN
      v_fail := v_fail || ('fk_unmapped:'||r.rel||'.'||r.col);
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES {refs_values()}) m(t,c,k) LOOP
    IF to_regclass('public.'||r.t) IS NULL THEN v_fail := v_fail || ('table_missing:'||r.t); CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||r.t)::regclass AND attname=r.c AND NOT attisdropped)
      THEN v_fail := v_fail || ('column_missing:'||r.t||'.'||r.c); END IF;
  END LOOP;
  -- 2. estado anterior: catálogo exclusivo ainda não instalado e fundação opcional antiga ausente
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.produtos'::regclass AND attname='owner_organization_id' AND NOT attisdropped)
    THEN v_fail := v_fail || 'partial:produtos.owner_organization_id'::text; END IF;
  IF to_regclass('platform_private.tenant_catalog_product_map') IS NOT NULL THEN v_fail := v_fail || 'partial:map_present'::text; END IF;
  IF to_regprocedure('public.tenant_product_save(uuid,jsonb,timestamptz,uuid)') IS NOT NULL THEN v_fail := v_fail || 'partial:rpc_present'::text; END IF;
  -- 3. dependências canônicas
  IF to_regprocedure('platform_private.catalog_tenant_actor(text)') IS NULL THEN v_fail := v_fail || 'dep:catalog_tenant_actor'::text; END IF;
  IF to_regclass('public.organizations') IS NULL OR to_regclass('public.partner_accounts') IS NULL THEN v_fail := v_fail || 'dep:organizations/partner_accounts'::text; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.partner_accounts'::regclass AND attname='commercial_owner_organization_id')
    THEN v_fail := v_fail || 'dep:partner_accounts.commercial_owner_organization_id'::text; END IF;
  -- 4. índices únicos de produtos por expressão/parciais não são reescritos automaticamente
  FOR r IN SELECT i.indexrelid::regclass::text AS ix FROM pg_index i
            WHERE i.indrelid='public.produtos'::regclass AND i.indisunique AND NOT i.indisprimary
              AND (i.indexprs IS NOT NULL OR i.indpred IS NOT NULL) LOOP
    v_fail := v_fail || ('unique_expr_or_partial:'||r.ix);
  END LOOP;
  -- 5. microrganismos.product_id precisa aceitar NULL para anulação registrada
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.microrganismos'::regclass AND attname='product_id' AND attnotnull)
    THEN v_fail := v_fail || 'nullify_not_nullable:microrganismos.product_id'::text; END IF;
  IF cardinality(v_fail) > 0 THEN
    RAISE EXCEPTION 'tenant_catalog_pre_failed' USING DETAIL = array_to_string(v_fail, ' | ');
  END IF;
END"""


def pre_sql():
    return ("-- 00 PRE GLOBAL — catálogo exclusivo por tenant. NO_GO. Somente leitura (READ ONLY).\n"
            "BEGIN TRANSACTION READ ONLY;\nDO $pre$" + PRE_BODY + " $pre$;\nCOMMIT;\n")


def migrate_sql():
    s = []
    w = s.append
    w("-- 01 MIGRAÇÃO TRANSACIONAL — catálogo EXCLUSIVO por tenant. NO_GO: NÃO APLICAR sem revisão e ordem explícita.")
    w("-- Dados de teste autorizados (01/11/2026): referências repontadas para a cópia do tenant do registro.")
    w("-- Irreversível como dado: rollback = restaurar backup anterior; o mapa fica em platform_private para auditoria.")
    w("BEGIN;")
    w("SET LOCAL lock_timeout = '10s';")
    w("SET LOCAL statement_timeout = '15min';")
    w("DO $pre$" + PRE_BODY + " $pre$;")
    tables = sorted({r["t"] for r in REFS} | {"produtos"})
    w("LOCK TABLE " + ", ".join("public." + t for t in tables) + " IN ACCESS EXCLUSIVE MODE;")
    w("""
CREATE TABLE platform_private.tenant_catalog_usage(
  old_product_id uuid NOT NULL, organization_id uuid, source_table text NOT NULL, source_column text NOT NULL, rows_count bigint NOT NULL);
CREATE TABLE platform_private.tenant_catalog_product_map(
  old_product_id uuid NOT NULL, organization_id uuid NOT NULL REFERENCES public.organizations(id),
  new_product_id uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (old_product_id, organization_id));
CREATE TABLE platform_private.tenant_catalog_migration_ledger(
  id bigserial PRIMARY KEY, step text NOT NULL, detail jsonb NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp());
REVOKE ALL ON platform_private.tenant_catalog_usage, platform_private.tenant_catalog_product_map,
  platform_private.tenant_catalog_migration_ledger FROM PUBLIC, anon, authenticated;""")
    # 1. uso por tenant
    for r in REFS:
        if r["kind"] != "reference" or r["t"] == "formulacoes":
            continue
        w(f"INSERT INTO platform_private.tenant_catalog_usage SELECT x.{r['c']}, {r['tenant']}, '{r['t']}', '{r['c']}', count(*)"
          f" FROM public.{r['t']} x WHERE x.{r['c']} IS NOT NULL GROUP BY 1, 2;")
    w("""DO $u$ DECLARE v text; BEGIN
  SELECT string_agg(source_table||'.'||source_column||'='||rows_count, ', ') INTO v FROM platform_private.tenant_catalog_usage WHERE organization_id IS NULL;
  IF v IS NOT NULL THEN RAISE EXCEPTION 'tenant_catalog_unresolved_tenant' USING DETAIL = v; END IF;
END $u$;""")
    w("INSERT INTO platform_private.tenant_catalog_product_map(old_product_id, organization_id, new_product_id)"
      " SELECT s.old_product_id, s.organization_id, gen_random_uuid() FROM (SELECT DISTINCT old_product_id, organization_id"
      " FROM platform_private.tenant_catalog_usage) s;")
    # componentes de formulação seguem os tenants do produto pai
    w("INSERT INTO platform_private.tenant_catalog_product_map(old_product_id, organization_id, new_product_id)"
      " SELECT s.c, s.o, gen_random_uuid() FROM (SELECT DISTINCT f.component_insumo_id c, m.organization_id o FROM public.formulacoes f"
      " JOIN platform_private.tenant_catalog_product_map m ON m.old_product_id = f.produto_id"
      " WHERE f.component_insumo_id IS NOT NULL) s ON CONFLICT (old_product_id, organization_id) DO NOTHING;")
    # 2. triggers de usuário: desligar por nome somente os ligados e religar depois (estado exato)
    rel_list = ", ".join(lit("public." + t) for t in tables)
    w(f"""CREATE TEMP TABLE tc_triggers ON COMMIT DROP AS
  SELECT tgrelid::regclass::text AS rel, tgname, tgenabled FROM pg_trigger
   WHERE NOT tgisinternal AND tgenabled <> 'D' AND tgrelid::regclass::text IN ({rel_list.replace("'public.", "'")}, {rel_list});
DO $t$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM tc_triggers LOOP EXECUTE format('ALTER TABLE %s DISABLE TRIGGER %I', r.rel, r.tgname); END LOOP;
  INSERT INTO platform_private.tenant_catalog_migration_ledger(step, detail)
    SELECT 'triggers_disabled', coalesce(jsonb_agg(jsonb_build_object('rel',rel,'trigger',tgname,'state',tgenabled)),'[]') FROM tc_triggers;
END $t$;""")
    # 3. índices únicos simples de produtos -> por tenant
    w("""ALTER TABLE public.produtos ADD COLUMN owner_organization_id uuid REFERENCES public.organizations(id);
DO $ix$ DECLARE r record; v_cols text; BEGIN
  FOR r IN SELECT i.indexrelid, i.indexrelid::regclass::text AS ix, c.conname
             FROM pg_index i LEFT JOIN pg_constraint c ON c.conindid = i.indexrelid
            WHERE i.indrelid='public.produtos'::regclass AND i.indisunique AND NOT i.indisprimary LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY k.ord) INTO v_cols
      FROM pg_index i2, unnest(i2.indkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid='public.produtos'::regclass AND a.attnum=k.attnum
     WHERE i2.indexrelid = r.indexrelid;
    INSERT INTO platform_private.tenant_catalog_migration_ledger(step, detail)
      VALUES ('unique_rescoped', jsonb_build_object('index', r.ix, 'def', pg_get_indexdef(r.indexrelid), 'cols', v_cols));
    IF r.conname IS NOT NULL THEN EXECUTE format('ALTER TABLE public.produtos DROP CONSTRAINT %I', r.conname);
    ELSE EXECUTE format('DROP INDEX %s', r.ix); END IF;
    EXECUTE format('CREATE UNIQUE INDEX %I ON public.produtos (owner_organization_id, %s)', r.ix::text || '_tenant', v_cols);
  END LOOP;
END $ix$;""")
    # 4. cópias independentes
    w("""INSERT INTO public.produtos
  SELECT (jsonb_populate_record(NULL::public.produtos,
           to_jsonb(p) || jsonb_build_object('id', m.new_product_id, 'owner_organization_id', m.organization_id))).*
    FROM public.produtos p JOIN platform_private.tenant_catalog_product_map m ON m.old_product_id = p.id;""")
    # 5. descendentes copiados por cópia
    for r in REFS:
        if r["kind"] != "descendant":
            continue
        t, c = r["t"], r["c"]
        w(f"""DO $d$ DECLARE v_has_id boolean := EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.{t}'::regclass AND attname='id' AND NOT attisdropped);
  v_n bigint; BEGIN
  INSERT INTO public.{t}
    SELECT (jsonb_populate_record(NULL::public.{t}, to_jsonb(s) || jsonb_build_object('{c}', m.new_product_id)
            || CASE WHEN v_has_id THEN jsonb_build_object('id', gen_random_uuid()) ELSE '{{}}'::jsonb END)).*
      FROM public.{t} s JOIN platform_private.tenant_catalog_product_map m ON m.old_product_id = s.{c};
  GET DIAGNOSTICS v_n = ROW_COUNT;
  DELETE FROM public.{t} s WHERE s.{c} IN (SELECT id FROM public.produtos WHERE owner_organization_id IS NULL);
  INSERT INTO platform_private.tenant_catalog_migration_ledger(step, detail) VALUES ('descendant_copied', jsonb_build_object('table','{t}','rows',v_n));
END $d$;""")
    # 6. referências repontadas pelo tenant do próprio registro
    for r in REFS:
        if r["kind"] != "reference":
            continue
        t, c = r["t"], r["c"]
        w(f"""DO $r$ DECLARE v_n bigint; v_left bigint; BEGIN
  UPDATE public.{t} x SET {c} = (SELECT m.new_product_id FROM platform_private.tenant_catalog_product_map m
                                  WHERE m.old_product_id = x.{c} AND m.organization_id = {r['tenant']})
   WHERE x.{c} IN (SELECT id FROM public.produtos WHERE owner_organization_id IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  SELECT count(*) INTO v_left FROM public.{t} x WHERE x.{c} IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = x.{c} AND p.owner_organization_id IS NOT NULL);
  IF v_left > 0 THEN RAISE EXCEPTION 'tenant_catalog_reference_unresolved' USING DETAIL = '{t}.{c}='||v_left; END IF;
  INSERT INTO platform_private.tenant_catalog_migration_ledger(step, detail) VALUES ('reference_repointed', jsonb_build_object('table','{t}','column','{c}','rows',v_n));
END $r$;""")
    for r in REFS:
        if r["kind"] == "nullify":
            w(f"""INSERT INTO platform_private.tenant_catalog_migration_ledger(step, detail)
  SELECT 'reference_nullified', jsonb_build_object('table','{r['t']}','column','{r['c']}','ids', coalesce(jsonb_agg(jsonb_build_object('id', id, 'old', {r['c']})),'[]'))
    FROM public.{r['t']} WHERE {r['c']} IS NOT NULL;
UPDATE public.{r['t']} SET {r['c']} = NULL WHERE {r['c']} IS NOT NULL;""")
    # 7. originais (globais) removidos; sem dono => não existe produto
    w("""INSERT INTO platform_private.tenant_catalog_migration_ledger(step, detail)
  SELECT 'global_removed', jsonb_build_object('count', count(*), 'unused', count(*) FILTER (WHERE NOT EXISTS
     (SELECT 1 FROM platform_private.tenant_catalog_product_map m WHERE m.old_product_id = p.id)),
     'snapshot', coalesce(jsonb_agg(to_jsonb(p)), '[]'))
    FROM public.produtos p WHERE p.owner_organization_id IS NULL;
DELETE FROM public.produtos WHERE owner_organization_id IS NULL;
ALTER TABLE public.produtos ALTER COLUMN owner_organization_id SET NOT NULL;""")
    w(f"""DO $dup$ DECLARE v text; BEGIN
  SELECT string_agg(owner_organization_id::text||':'||k, ', ') INTO v FROM (
    SELECT owner_organization_id, {UNIQUE_KEY} k FROM public.produtos GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF v IS NOT NULL THEN RAISE EXCEPTION 'tenant_catalog_duplicate_name' USING DETAIL = v; END IF;
END $dup$;
CREATE UNIQUE INDEX produtos_owner_nome_uniq ON public.produtos (owner_organization_id, {UNIQUE_KEY});
CREATE INDEX IF NOT EXISTS produtos_owner_idx ON public.produtos (owner_organization_id);
CREATE FUNCTION platform_private.produtos_owner_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $f$
BEGIN
  IF NEW.owner_organization_id IS DISTINCT FROM OLD.owner_organization_id OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'tenant_product_owner_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER a00_produtos_owner_immutable BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION platform_private.produtos_owner_immutable();""")
    # 8. religar triggers exatamente
    w("""DO $t$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM tc_triggers LOOP
    EXECUTE format('ALTER TABLE %s %s TRIGGER %I', r.rel,
      CASE r.tgenabled WHEN 'A' THEN 'ENABLE ALWAYS' WHEN 'R' THEN 'ENABLE REPLICA' ELSE 'ENABLE' END, r.tgname);
  END LOOP;
END $t$;""")
    # 9. RLS / ACL de produtos e descendentes
    desc = sorted({r["t"] for r in REFS if r["kind"] == "descendant"})
    w("""CREATE FUNCTION platform_private.tenant_catalog_read_org() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$
BEGIN
  RETURN platform_private.catalog_tenant_actor('read');
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $f$;
REVOKE ALL ON FUNCTION platform_private.tenant_catalog_read_org() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_catalog_read_org() TO authenticated;
GRANT USAGE ON SCHEMA platform_private TO authenticated;
INSERT INTO platform_private.tenant_catalog_migration_ledger(step, detail)
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
    for t in desc:
        c = next(r["c"] for r in REFS if r["t"] == t and r["kind"] == "descendant")
        w(f"""ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.{t} FROM anon, authenticated;
REVOKE ALL ON public.{t} FROM anon;
CREATE POLICY tenant_catalog_owner_restrictive ON public.{t} AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = {t}.{c}))
  WITH CHECK (EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = {t}.{c}));
-- leitura permissiva explícita: sem ela, tabela antes sem RLS ficaria invisível ao próprio tenant
CREATE POLICY tenant_catalog_owner_read ON public.{t} FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = {t}.{c}));""")
    # 10. RPCs
    fields = ", ".join(lit(k) for k in EDITABLE)
    assigns = ",\n      ".join(
        f"{k} = CASE WHEN p_payload ? '{k}' THEN (p_payload->>'{k}')::{v} ELSE {k} END" for k, v in EDITABLE.items())
    cols = ", ".join(EDITABLE)
    vals = ", ".join(f"(p_payload->>'{k}')::{v}" for k, v in EDITABLE.items())
    w(f"""CREATE TABLE public.tenant_product_receipts(
  actor_id uuid NOT NULL, organization_id uuid NOT NULL, idempotency_key uuid NOT NULL, payload_hash text NOT NULL,
  product_id uuid NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, organization_id, idempotency_key));
CREATE TABLE public.tenant_product_audit(
  id bigserial PRIMARY KEY, organization_id uuid NOT NULL, product_id uuid NOT NULL, actor_id uuid NOT NULL,
  action text NOT NULL, before_state jsonb, after_state jsonb NOT NULL, at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON public.tenant_product_receipts, public.tenant_product_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tenant_product_receipts, public.tenant_product_audit TO service_role;
GRANT SELECT ON public.tenant_product_audit TO authenticated;
ALTER TABLE public.tenant_product_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_product_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_product_audit_select ON public.tenant_product_audit FOR SELECT TO authenticated
  USING (organization_id = platform_private.tenant_catalog_read_org());
CREATE FUNCTION platform_private.tenant_product_audit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $f$
BEGIN RAISE EXCEPTION 'tenant_product_audit_immutable' USING ERRCODE = '42501'; END $f$;
CREATE TRIGGER a00_tenant_product_audit_immutable BEFORE UPDATE OR DELETE ON public.tenant_product_audit
  FOR EACH ROW EXECUTE FUNCTION platform_private.tenant_product_audit_immutable();

CREATE FUNCTION platform_private.tenant_product_validate(p_payload jsonb, p_create boolean) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $f$
DECLARE k text; v_num numeric;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'tenant_product_payload_invalid' USING ERRCODE='22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_payload) LOOP
    IF NOT k = ANY (ARRAY[{fields}]) THEN RAISE EXCEPTION 'tenant_product_field_forbidden:%', k USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_create AND NOT p_payload ? 'nome' THEN RAISE EXCEPTION 'tenant_product_nome_required' USING ERRCODE='22023'; END IF;
  IF p_payload ? 'nome' AND (jsonb_typeof(p_payload->'nome') <> 'string' OR char_length(btrim(p_payload->>'nome')) NOT BETWEEN 2 AND 200) THEN
    RAISE EXCEPTION 'tenant_product_nome_invalid' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['dose_ml_ha','estoque_minimo','valor_dose_brl','valor_ha_brl','valor_litro_brl'] LOOP
    IF p_payload ? k AND jsonb_typeof(p_payload->k) <> 'null' THEN
      IF jsonb_typeof(p_payload->k) <> 'number' THEN RAISE EXCEPTION 'tenant_product_number_invalid:%', k USING ERRCODE='22023'; END IF;
      v_num := (p_payload->>k)::numeric;
      IF v_num < 0 OR v_num > 1e12 THEN RAISE EXCEPTION 'tenant_product_number_out_of_range:%', k USING ERRCODE='22023'; END IF;
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['e_insumo','b2b_enabled'] LOOP
    IF p_payload ? k AND jsonb_typeof(p_payload->k) NOT IN ('boolean','null') THEN RAISE EXCEPTION 'tenant_product_boolean_invalid:%', k USING ERRCODE='22023'; END IF;
  END LOOP;
END $f$;

CREATE FUNCTION public.tenant_product_save(p_product_id uuid, p_payload jsonb, p_expected_updated_at timestamptz, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_org2 uuid; v_hash text; v_rc public.tenant_product_receipts%ROWTYPE;
  v_prev public.produtos%ROWTYPE; v_new public.produtos%ROWTYPE; v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
  v_org := platform_private.catalog_tenant_actor('mutate');          -- tenant derivado do servidor
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'tenant_product_key_required' USING ERRCODE='22023'; END IF;
  PERFORM platform_private.tenant_product_validate(p_payload, p_product_id IS NULL);
  v_hash := md5(concat_ws('|', coalesce(p_product_id::text,'new'), p_payload::text, coalesce(p_expected_updated_at::text,'')));
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','tpk',v_uid,v_org,p_idempotency_key),0));
  SELECT * INTO v_rc FROM public.tenant_product_receipts WHERE actor_id=v_uid AND organization_id=v_org AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_rc.payload_hash <> v_hash THEN RAISE EXCEPTION 'tenant_product_idempotency_conflict' USING ERRCODE='22023'; END IF;
    RETURN v_rc.result || jsonb_build_object('replayed', true);
  END IF;
  IF p_product_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','tpn',v_org,lower(btrim(p_payload->>'nome'))),0));
    v_org2 := platform_private.catalog_tenant_actor('mutate');         -- reautoriza após espera
    IF v_org2 IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_product_scope_changed' USING ERRCODE='42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.produtos WHERE owner_organization_id=v_org AND lower(btrim(nome))=lower(btrim(p_payload->>'nome'))) THEN
      RAISE EXCEPTION 'tenant_product_duplicate_name' USING ERRCODE='PT409'; END IF;
    INSERT INTO public.produtos(id, owner_organization_id, ativo, {cols})
      VALUES (gen_random_uuid(), v_org, true, {vals}) RETURNING * INTO v_new;
    INSERT INTO public.tenant_product_audit(organization_id, product_id, actor_id, action, before_state, after_state)
      VALUES (v_org, v_new.id, v_uid, 'create', NULL, to_jsonb(v_new));
  ELSE
    IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'tenant_product_cas_required' USING ERRCODE='PT409'; END IF;
    SELECT * INTO v_prev FROM public.produtos WHERE id=p_product_id AND owner_organization_id=v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'tenant_product_not_found' USING ERRCODE='P0002'; END IF;
    v_org2 := platform_private.catalog_tenant_actor('mutate');           -- reautoriza após lock
    IF v_org2 IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_product_scope_changed' USING ERRCODE='42501'; END IF;
    IF v_prev.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'tenant_product_version_conflict' USING ERRCODE='PT409'; END IF;
    IF p_payload ? 'nome' AND EXISTS (SELECT 1 FROM public.produtos WHERE owner_organization_id=v_org AND id<>p_product_id
         AND lower(btrim(nome))=lower(btrim(p_payload->>'nome'))) THEN
      RAISE EXCEPTION 'tenant_product_duplicate_name' USING ERRCODE='PT409'; END IF;
    UPDATE public.produtos SET
      {assigns},
      updated_at = clock_timestamp()
     WHERE id=p_product_id AND owner_organization_id=v_org AND updated_at = p_expected_updated_at
     RETURNING * INTO v_new;
    IF NOT FOUND THEN RAISE EXCEPTION 'tenant_product_version_conflict' USING ERRCODE='PT409'; END IF;
    INSERT INTO public.tenant_product_audit(organization_id, product_id, actor_id, action, before_state, after_state)
      VALUES (v_org, v_new.id, v_uid, 'update', to_jsonb(v_prev), to_jsonb(v_new));
  END IF;
  v_res := jsonb_build_object('product_id', v_new.id, 'organization_id', v_org, 'updated_at', v_new.updated_at, 'replayed', false);
  INSERT INTO public.tenant_product_receipts VALUES (v_uid, v_org, p_idempotency_key, v_hash, v_new.id, v_res, now());
  RETURN v_res;
END $f$;

CREATE FUNCTION public.tenant_product_set_archived(p_product_id uuid, p_archived boolean, p_expected_updated_at timestamptz, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_uid uuid := auth.uid(); v_org uuid; v_org2 uuid; v_hash text; v_rc public.tenant_product_receipts%ROWTYPE;
  v_prev public.produtos%ROWTYPE; v_new public.produtos%ROWTYPE; v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
  v_org := platform_private.catalog_tenant_actor('mutate');
  IF p_product_id IS NULL OR p_archived IS NULL OR p_idempotency_key IS NULL OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'tenant_product_payload_invalid' USING ERRCODE='22023'; END IF;
  v_hash := md5(concat_ws('|','archive',p_product_id,p_archived,p_expected_updated_at));
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','tpk',v_uid,v_org,p_idempotency_key),0));
  SELECT * INTO v_rc FROM public.tenant_product_receipts WHERE actor_id=v_uid AND organization_id=v_org AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_rc.payload_hash <> v_hash THEN RAISE EXCEPTION 'tenant_product_idempotency_conflict' USING ERRCODE='22023'; END IF;
    RETURN v_rc.result || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO v_prev FROM public.produtos WHERE id=p_product_id AND owner_organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant_product_not_found' USING ERRCODE='P0002'; END IF;
  v_org2 := platform_private.catalog_tenant_actor('mutate');
  IF v_org2 IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'tenant_product_scope_changed' USING ERRCODE='42501'; END IF;
  IF v_prev.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'tenant_product_version_conflict' USING ERRCODE='PT409'; END IF;
  IF (v_prev.ativo IS NOT TRUE) = p_archived THEN RAISE EXCEPTION 'tenant_product_no_change' USING ERRCODE='22023'; END IF;
  UPDATE public.produtos SET ativo = NOT p_archived, updated_at = clock_timestamp()
   WHERE id=p_product_id AND owner_organization_id=v_org AND updated_at=p_expected_updated_at RETURNING * INTO v_new;
  IF NOT FOUND THEN RAISE EXCEPTION 'tenant_product_version_conflict' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.tenant_product_audit(organization_id, product_id, actor_id, action, before_state, after_state)
    VALUES (v_org, v_new.id, v_uid, CASE WHEN p_archived THEN 'archive' ELSE 'unarchive' END, to_jsonb(v_prev), to_jsonb(v_new));
  v_res := jsonb_build_object('product_id', v_new.id, 'ativo', v_new.ativo, 'updated_at', v_new.updated_at, 'replayed', false);
  INSERT INTO public.tenant_product_receipts VALUES (v_uid, v_org, p_idempotency_key, v_hash, v_new.id, v_res, now());
  RETURN v_res;
END $f$;

CREATE FUNCTION public.tenant_product_list(p_include_archived boolean DEFAULT false)
RETURNS SETOF public.produtos LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $f$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
  v_org := platform_private.catalog_tenant_actor('read');
  RETURN QUERY SELECT * FROM public.produtos WHERE owner_organization_id = v_org AND (p_include_archived OR ativo IS TRUE) ORDER BY nome;
END $f$;
DO $acl$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['public.tenant_product_save(uuid,jsonb,timestamptz,uuid)','public.tenant_product_set_archived(uuid,boolean,timestamptz,uuid)',
                           'public.tenant_product_list(boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['platform_private.tenant_product_validate(jsonb,boolean)','platform_private.produtos_owner_immutable()',
                           'platform_private.tenant_product_audit_immutable()'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
  END LOOP;
END $acl$;""")
    # 11. catálogo global fechado no servidor
    names = ", ".join(lit(n) for n in GLOBAL_FUNCS)
    w(f"""DO $g$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname IN ('public','platform_private') AND p.proname IN ({names}) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', r.sig);
    INSERT INTO platform_private.tenant_catalog_migration_ledger(step, detail) VALUES ('global_function_closed', jsonb_build_object('sig', r.sig::text));
  END LOOP;
END $g$;""")
    # 12. POST
    w(f"""DO $post$ DECLARE v_n bigint; r record; BEGIN
  IF EXISTS (SELECT 1 FROM public.produtos WHERE owner_organization_id IS NULL) THEN RAISE EXCEPTION 'post:owner_null'; END IF;
  IF has_table_privilege('anon','public.produtos','SELECT') OR has_table_privilege('authenticated','public.produtos','INSERT')
     OR has_table_privilege('authenticated','public.produtos','UPDATE') OR has_table_privilege('authenticated','public.produtos','DELETE')
     OR has_table_privilege('authenticated','public.produtos','TRUNCATE') THEN RAISE EXCEPTION 'post:produtos_acl_open'; END IF;
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname IN ('public','platform_private') AND p.proname IN ({names}) LOOP
    IF has_function_privilege('authenticated', r.sig, 'EXECUTE') OR has_function_privilege('anon', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'post:global_function_open:%', r.sig; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.tenant_product_save(uuid,jsonb,timestamptz,uuid)','EXECUTE') THEN RAISE EXCEPTION 'post:rpc_anon'; END IF;
  SELECT count(*) INTO v_n FROM tc_triggers t JOIN pg_trigger g ON g.tgname=t.tgname AND g.tgrelid=t.rel::regclass WHERE g.tgenabled <> t.tgenabled;
  IF v_n > 0 THEN RAISE EXCEPTION 'post:trigger_state_not_restored'; END IF;
  INSERT INTO platform_private.tenant_catalog_migration_ledger(step, detail) VALUES ('post_ok', jsonb_build_object('products', (SELECT count(*) FROM public.produtos)));
END $post$;""")
    w("COMMIT;")
    return "\n".join(s) + "\n"


def main():
    (HERE / "00-pre-global.sql.review").write_text(pre_sql())
    (HERE / "01-migrate.sql.review").write_text(migrate_sql())
    (HERE / "reference-map.json").write_text(json.dumps(dict(
        source="src/integrations/supabase/types.ts (FKs declaradas) — confirmado pelo PRE contra pg_constraint real",
        refs=REFS, global_functions_closed=GLOBAL_FUNCS, editable_fields=EDITABLE), indent=1, ensure_ascii=False))
    sums = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(HERE.glob("*.review"))}
    (HERE / "SHA256SUMS.json").write_text(json.dumps(sums, indent=1))
    print(json.dumps(sums, indent=1))


if __name__ == "__main__":
    main()
