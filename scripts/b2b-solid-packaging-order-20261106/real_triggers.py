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
CREATE TABLE IF NOT EXISTS public.commercial_audit_log(id uuid DEFAULT gen_random_uuid(), entity_type text, entity_id uuid, action text, actor_id uuid,
  before_data jsonb, after_data jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.production_order_link(partner_order_id uuid);
CREATE TABLE IF NOT EXISTS public.production_planning(id uuid DEFAULT gen_random_uuid(), partner_order_id uuid, status text);
CREATE TABLE IF NOT EXISTS public.production_timeline_events(id uuid DEFAULT gen_random_uuid(), partner_order_id uuid, evento text, descricao text, created_by uuid, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.partner_financial_settings(partner_id uuid, auto_generate_receivable boolean DEFAULT false);
CREATE TABLE IF NOT EXISTS public.company_fiscal_settings(organization_id uuid);
CREATE TABLE IF NOT EXISTS public.partner_engagement_metrics(partner_id uuid);
"""
SEAMS_DECLARED = [
    "tabelas de 2º nível mínimas: commercial_audit_log, production_order_link, production_planning, production_timeline_events, partner_financial_settings, company_fiscal_settings, partner_engagement_metrics",
    "FKs para clientes/auth.users/partner_simulations omitidas (tabelas inexistentes no PG descartável)",
]


def real_triggers_sql() -> str:
    parts = [DEP_SEAMS]
    for p in sorted((TRIG / "helpers").glob("*.sql")):
        parts.append(_body(p))
    for p in sorted(TRIG.glob("*.live-20261106.sql")):
        if not p.name.startswith("_"):
            parts.append(_body(p))
    names = re.findall(r"CREATE (?:CONSTRAINT )?TRIGGER (\w+) .*? ON (public\.\w+)", (TRIG / "_triggerdefs.live-20261106.sql").read_text())
    for tg, tbl in names:
        parts.append(f"DROP TRIGGER IF EXISTS {tg} ON {tbl};")
    parts.append((TRIG / "_triggerdefs.live-20261106.sql").read_text())
    return "\n".join(parts)
