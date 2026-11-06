"""Rodada com GATILHOS REAIS (PG descartável). Usado por test-local-pg.py quando B2BPACK_REAL_TRIGGERS=1.

REAL (byte a byte, md5 conferido no nome do arquivo): 32 funções de gatilho de partner_orders/partner_order_items/
partner_order_payment_terms/partner_order_idempotency/catalogo_precos_embalagem/product_packagings, 38 definições de gatilho,
10 auxiliares (captured/triggers/helpers), colunas/tipos/defaults/NOT NULL e CHECK/UNIQUE/PK reais dessas quatro tabelas,
FKs reais entre tabelas presentes, e a exclusão GiST cpe_no_overlap.
COSTURAS (declaradas em DEP_SEAMS/SEAMS_DECLARED): dependências de segundo nível ausentes do esquema mínimo.
"""
import hashlib, json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
TRIG = HERE / "captured" / "triggers"


def _body(p: pathlib.Path) -> str:
    b = p.read_bytes()
    assert hashlib.md5(b).hexdigest()[:8] == p.name.split(".")[-3], p.name
    return b.decode().rstrip("\n") + ";\n"


SKIP_FK = {"partner_orders_cliente_id_fkey", "partner_orders_credit_approved_by_fkey", "partner_orders_origin_simulation_id_fkey"}
FKS = {
    "partner_order_idempotency": ["CONSTRAINT partner_order_idempotency_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.partner_orders(id) ON DELETE RESTRICT",
                                  "CONSTRAINT partner_order_idempotency_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partner_accounts(id) ON DELETE CASCADE"],
    "partner_order_items": ["CONSTRAINT partner_order_items_microrganismo_id_fkey FOREIGN KEY (microrganismo_id) REFERENCES public.microrganismos(id)",
                            "CONSTRAINT partner_order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.partner_orders(id) ON DELETE CASCADE",
                            "CONSTRAINT partner_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.produtos(id)",
                            "CONSTRAINT poi_price_rule_snapshot_fk FOREIGN KEY (price_rule_id_snapshot) REFERENCES public.commercial_price_rules(id) ON DELETE SET NULL"],
    "partner_order_payment_terms": ["CONSTRAINT partner_order_payment_terms_partner_order_id_fkey FOREIGN KEY (partner_order_id) REFERENCES public.partner_orders(id) ON DELETE CASCADE",
                                    "CONSTRAINT partner_order_payment_terms_payment_plan_id_fkey FOREIGN KEY (payment_plan_id) REFERENCES public.commercial_payment_plans(id)"],
    "partner_orders": ["CONSTRAINT partner_orders_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.partner_accounts(id) ON DELETE RESTRICT",
                       "CONSTRAINT partner_orders_payment_plan_id_fkey FOREIGN KEY (payment_plan_id) REFERENCES public.commercial_payment_plans(id)"],
}
CHECKS = {
    "partner_order_idempotency": ["CONSTRAINT ck_poi_request_fingerprint_sha256 CHECK (((request_fingerprint IS NULL) OR (request_fingerprint ~ '^[0-9a-f]{64}$'::text)))",
                                  "CONSTRAINT partner_order_idempotency_pkey PRIMARY KEY (id)"],
    "partner_order_items": ["CONSTRAINT partner_order_items_pkey PRIMARY KEY (id)", "CONSTRAINT partner_order_items_quantidade_check CHECK ((quantidade > (0)::numeric))",
                            "CONSTRAINT partner_order_items_unidade_check CHECK ((unidade_medida = ANY (ARRAY['ml'::text, 'litro'::text, 'hectare'::text, 'dose'::text, 'unidade'::text])))",
                            "CONSTRAINT poi_item_xor CHECK ((((product_id IS NOT NULL) AND (microrganismo_id IS NULL)) OR ((product_id IS NULL) AND (microrganismo_id IS NOT NULL))))"],
    "partner_order_payment_terms": ["CONSTRAINT partner_order_payment_terms_approval_status_check CHECK ((approval_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'approved'::text, 'rejected'::text])))",
                                    "CONSTRAINT partner_order_payment_terms_pkey PRIMARY KEY (id)"],
    "partner_orders": ["CONSTRAINT partner_orders_financial_status_check CHECK ((financial_status = ANY (ARRAY['pendente'::text, 'gerado'::text, 'parcial'::text, 'recebido'::text, 'vencido'::text, 'cancelado'::text])))",
                       "CONSTRAINT partner_orders_numero_key UNIQUE (numero)", "CONSTRAINT partner_orders_pkey PRIMARY KEY (id)"],
}


def real_tables_sql() -> str:
    cols = json.loads((TRIG / "_columns.live-20261106.json").read_text())
    out = ["CREATE EXTENSION IF NOT EXISTS btree_gist;",
           "DO $$ BEGIN CREATE TYPE public.partner_order_priority AS ENUM ('normal','urgente','programado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;",
           "DROP TABLE IF EXISTS public.partner_order_idempotency, public.partner_order_items, public.partner_order_payment_terms, public.partner_orders CASCADE;",
           "CREATE SEQUENCE IF NOT EXISTS public.partner_orders_numero_seq;"]
    for t in ("partner_orders", "partner_order_payment_terms", "partner_order_items", "partner_order_idempotency"):
        defs = []
        for c in cols[t]:
            d = f"  {c['col']} {c['typ']}"
            if c["dflt"] is not None:
                d += " DEFAULT " + c["dflt"].replace("nextval('partner_orders_numero_seq'", "nextval('public.partner_orders_numero_seq'")
            if c["nn"]:
                d += " NOT NULL"
            defs.append(d)
        defs += ["  " + x for x in CHECKS[t]]
        out.append(f"CREATE TABLE public.{t} (\n" + ",\n".join(defs) + "\n);")
    for t, fks in FKS.items():
        for fk in fks:
            out.append(f"ALTER TABLE public.{t} ADD {fk};")
    out.append("ALTER TABLE public.catalogo_precos_embalagem ADD CONSTRAINT cpe_no_overlap EXCLUDE USING gist (produto_id WITH =, packaging_id WITH =, "
               "daterange(valid_from, valid_until, '[]'::text) WITH &&) WHERE (ativo);")
    out.append("GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_order_items TO anon, authenticated;")
    return "\n".join(out) + "\n"


# Dependências de segundo nível que NÃO existem no esquema mínimo (costuras declaradas; nunca autorizam por si).
DEP_SEAMS = r"""
CREATE TABLE IF NOT EXISTS public.company_fiscal_settings(id uuid DEFAULT gen_random_uuid(), organization_id uuid, is_active boolean DEFAULT true,
  configuration_status text, accounting_validated_at timestamptz, legal_name text, cnpj text, configuration_version integer DEFAULT 1);
ALTER TABLE public.partner_accounts ADD COLUMN IF NOT EXISTS client_id uuid;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS partner_account_id uuid;
CREATE TABLE IF NOT EXISTS public.clientes(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE IF NOT EXISTS platform_private.solid_pack_presentation_tx(txid bigint NOT NULL PRIMARY KEY, created_at timestamptz DEFAULT now() NOT NULL);
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'administrativo';
DROP FUNCTION IF EXISTS platform_private.issue_ticket(text, uuid);
-- B1 (capacidade C2 de criação externa) assumida ABERTA para o comprador vinculado e ativo: o estado real em produção não foi verificado.
CREATE OR REPLACE FUNCTION platform_private.c2_owner_order_create_allowed(uuid, uuid) RETURNS boolean LANGUAGE sql STABLE AS
 $$ SELECT EXISTS (SELECT 1 FROM public.partner_users pu JOIN public.profiles p ON p.user_id = pu.user_id AND p.ativo
      JOIN public.user_roles r ON r.user_id = pu.user_id AND r.role = 'parceiro_b2b' WHERE pu.user_id = $1 AND pu.partner_id = $2) $$;
CREATE TABLE IF NOT EXISTS public.partner_engagement_metrics(partner_id uuid);
CREATE OR REPLACE FUNCTION platform_private.platform_actor_access_ready(u uuid) RETURNS boolean LANGUAGE sql STABLE AS
 $$ SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u AND p.ativo) $$;
CREATE TABLE IF NOT EXISTS platform_private.seam_entitlements(user_id uuid, feature_key text);
CREATE OR REPLACE FUNCTION platform_private.entitlements_for_user(u uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE AS
 $$ SELECT e.feature_key FROM platform_private.seam_entitlements e WHERE e.user_id = u $$;
"""
SEAMS_DECLARED = [
    "tabelas de 2º nível com colunas reais, chaves/únicos/CHECKs reais, SEM seus próprios gatilhos e FKs: commercial_audit_log, notificacoes_operacionais, partner_engagement_metrics, partner_financial_settings, partner_order_audit_logs, production_order_link, production_planning, production_timeline_events",
    "company_fiscal_settings/clientes mínimas (colunas usadas pelos guards reais)",
    "platform_private.entitlements_for_user sobre tabela de direitos sintética (o gate real _saas_trg_require_feature/_saas_user_has_feature permanece)",
    "platform_private.platform_actor_access_ready = perfil ativo (sem lease/sessão real)",
    "platform_private.c2_owner_order_create_allowed = comprador ativo vinculado com papel parceiro_b2b (B1/capacidade C2 assumida aberta; não verificada em produção)",
    "company_fiscal_settings vazia => contrato real C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1 (sem emitente inventado)",
    "FKs para clientes/auth.users/partner_simulations omitidas (tabelas inexistentes no PG descartável)",
]


def dep_tables_sql() -> str:
    """Tabelas de 2º nível com COLUNAS/TIPOS/DEFAULTS/NOT NULL reais (sem os gatilhos/constraints/FKs delas)."""
    cols = json.loads((TRIG / "_columns-deps.live-20261106.json").read_text())
    out = ["DO $$ BEGIN CREATE TYPE public.production_planning_status AS ENUM ('aguardando_planejamento','planejado','em_producao','produzido','entregue','cancelado','replanejar'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;"]
    for t, cs in cols.items():
        out.append(f"DROP TABLE IF EXISTS public.{t} CASCADE;")
        out.append(f"CREATE TABLE public.{t} (\n" + ",\n".join(
            f"  {c['col']} {c['typ']}" + (f" DEFAULT {c['dflt']}" if c['dflt'] is not None else "") + (" NOT NULL" if c['nn'] else "") for c in cs) + "\n);")
    out += DEP_KEYS
    return "\n".join(out) + "\n"


# Chaves/índices únicos e CHECKs reais das tabelas de 2º nível (ON CONFLICT dos corpos reais depende deles).
DEP_KEYS = [
    "ALTER TABLE platform_private.authz_tickets ADD CONSTRAINT authz_tickets_pkey PRIMARY KEY (txid, scope, target);",
    "ALTER TABLE public.commercial_audit_log ADD PRIMARY KEY (id);", "ALTER TABLE public.notificacoes_operacionais ADD PRIMARY KEY (id);",
    "CREATE UNIQUE INDEX ux_notif_op_idempotency ON public.notificacoes_operacionais USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);",
    "ALTER TABLE public.partner_engagement_metrics ADD PRIMARY KEY (partner_id);",
    "ALTER TABLE public.partner_financial_settings ADD PRIMARY KEY (id), ADD UNIQUE (partner_id), "
    "ADD CHECK ((billing_trigger = ANY (ARRAY['na_aprovacao'::text, 'na_producao_finalizada'::text, 'na_entrega'::text, 'manual'::text]))), "
    "ADD CHECK ((payment_terms_days >= 0)), ADD CHECK ((credit_limit_action = ANY (ARRAY['block'::text, 'approval_required'::text]))), ADD CHECK ((overdue_tolerance_days >= 0));",
    "ALTER TABLE public.partner_order_audit_logs ADD PRIMARY KEY (id);",
    "ALTER TABLE public.production_order_link ADD PRIMARY KEY (id), ADD UNIQUE (partner_order_item_id);",
    "ALTER TABLE public.production_planning ADD PRIMARY KEY (id), ADD UNIQUE (partner_order_id);",
    "ALTER TABLE public.production_timeline_events ADD PRIMARY KEY (id);",
]


def real_triggers_sql() -> str:
    parts = [dep_tables_sql(), DEP_SEAMS]
    # platform_private primeiro (funções SQL validam dependências na criação); ordem fixa b2b_internal_origin_valid antes dos que o usam.
    order = ["platform_private.issue_ticket", "platform_private.b2b_internal_origin_valid", "platform_private.c2_external_origin_contract_valid", "platform_private.has_ticket",
             "platform_private.h15_actor_organization", "platform_private.c2_accounting_promotion_ok", "platform_private.c2_external_origin_assert"]
    late = ["platform_private.c2p1_internal_actor", "platform_private.c2p1_settings_allowed"]   # dependem de public.h15_actor_organization
    key = lambda p: p.name.split(".live")[0].rsplit(".", 1)[0]
    rank = lambda p: order.index(key(p)) if key(p) in order else (200 + late.index(key(p)) if key(p) in late else 99)
    helpers = sorted((TRIG / "helpers").glob("*.sql"), key=lambda p: (rank(p), p.name))
    for p in helpers:
        parts.append(_body(p))
    for p in sorted(TRIG.glob("*.live-20261106.sql")):
        if not p.name.startswith(("_triggerdefs", "_columns")):
            parts.append(_body(p))
    names = re.findall(r"CREATE (?:CONSTRAINT )?TRIGGER (\w+) .*? ON (public\.\w+)", (TRIG / "_triggerdefs.live-20261106.sql").read_text())
    for tg, tbl in names:
        parts.append(f"DROP TRIGGER IF EXISTS {tg} ON {tbl};")
    parts.append((TRIG / "_triggerdefs.live-20261106.sql").read_text())
    return "\n".join(parts)


def fixtures_sql(users) -> str:
    """Direitos contratados sintéticos: pedidos_b2b e catalogo_precos para todos os usuários do cenário (a autorização por
    papel/vínculo continua nos guards reais). O caso negativo remove o direito do comprador em check próprio."""
    return "INSERT INTO platform_private.seam_entitlements VALUES " + ",".join(
        f"('{u}','{k}')" for u in users for k in ("pedidos_b2b", "catalogo_precos")) + ";\n"
