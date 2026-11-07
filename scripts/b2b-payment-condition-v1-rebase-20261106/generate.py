#!/usr/bin/env python3
"""B2B_PAYMENT_CONDITION_V1 — REBASE da candidata comprovada sobre o create LIVE c34e7404 (B3). NÃO APLICADO.

Decisão técnica do auditor (2026-11-06): rebasear a candidata B2B_PAYMENT_CONDITION_V1
(scripts/financial-price-generator-20261029/integration/schema.sql.review + build.py, byte a byte iguais ao projeto
isolado aec6d152 ref 301bf597 e ao original ref d5aa368, 14103/13768 caracteres) sobre os corpos LIVE de pedido/simulação,
sem dois contratos ativos. O contrato rev.2 B2B_PAYMENT_METHOD_V1 (scripts/b2b-payment-method-order-20261106/) fica
SUPERADO e só como histórico.

O que vem da candidata comprovada (extraído por âncoras exatas, sha256 pinado; deltas declarados abaixo):
  tabelas b2b_condition_versions / b2b_condition_assignments / b2b_order_condition_snapshots / b2b_condition_retirements,
  b2b_choice (verbatim), b2b_resolve_condition, b2b_schedule (Price), hash sha256 por jsonb incluindo escolha/condição/total.
O que NÃO vem: capturas antigas de create (7ec41e17)/simulate/crédito/catálogo/embalagem, gate fiscal
b2b_integration_dependencies (B4, sempre nega), documentos/alocações/permits/títulos (B4), calendário Price (não instalado).
Corpos LIVE: create c34e7404 e simulate 37d4f45e (catálogo/embalagem/fences atuais) — gerados por deltas de âncora única.
Somente gera arquivos; nunca conecta a banco algum.
"""
import hashlib, json, pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PRIOR_DIR = ROOT / "scripts/financial-price-generator-20261029/integration"
PRIOR_PINS = {  # sha256 dos arquivos comprovados pelo auditor (14103 / 13768 caracteres)
    "schema.sql.review": "b1416978e38d792a20e05a05d88f063068b92a138d9a98d382b1df0e59c56a75",
    "build.py": "0210f7ad35e0d1de14335e70faed99730f591cf63987927d4d266e3c93eb67b8",
}
CAP = {"create": HERE / "captured/public.create_partner_order_secure.c34e7404.live-20261106.sql",
       "sim": HERE / "captured/public.simulate_b2b_payment_plan_secure.37d4f45e.live-20261106.sql",
       "quote": HERE.parent / "b2b-solid-packaging-order-20261106/captured/public.respond_b2b_order_quote_secure.e57d3a64.live-20261106.sql"}

LIVE_PINS = {
    "public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)": "c34e740473afb7a365d362db854069cb",
    "public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)": "37d4f45e388ed7b38f6f397b672629ee",
    "public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)": "e57d3a6416910937bd02c9180dff0cf1",
    "platform_private.b2b_partner_catalog_reader(uuid)": "bd985484b69c8fa6e63a920eff518369",
    "platform_private.h15_actor_organization()": "64e10608403238a41a9baf92857ca881",
    "public.get_partner_order_payment_terms_secure(uuid)": "efb3d18c65088d7d69471fc5aa9ac859",
    "public.fn_b2b_credit_exposure(uuid,numeric,uuid)": "213ac31f3a30816ead75365b0d1fed18",
}
LIVE_COLS = {
    "payment_methods": "71f7ed4ddacf2392c9c327e64376c2be",
    "partner_order_payment_terms": "f32804287d84d6467e33757064f715fa",
    "commercial_payment_plans": "fa11d3b5c4d1737c9a5e98cdece94c55",
}
CONTRACT = "B2B_PAYMENT_CONDITION_V1"

PUB = {
    "publish": "public.b2b_payment_condition_publish(uuid,text,uuid,uuid,integer,integer,numeric,integer)",
    "retire": "public.b2b_payment_condition_retire(uuid,text,integer)",
    "assign": "public.b2b_payment_condition_assign(uuid,uuid,text,integer,boolean)",
    "activation": "public.b2b_payment_condition_activation_set(text,uuid[],integer)",
    "list": "public.b2b_payment_condition_config_list()",
    "options": "public.b2b_list_payment_condition_options_secure(uuid,uuid)",
    "sim": "public.simulate_b2b_payment_condition_secure(uuid,uuid,jsonb,jsonb)",
    "create": "public.create_partner_order_condition_secure(uuid,text,jsonb,date,uuid,text,text,jsonb)",
    "read": "public.get_partner_order_payment_condition_secure(uuid)",
}
PRIV = ["platform_private.b2b_choice(jsonb)",
        "platform_private.b2b_resolve_condition(uuid,uuid,jsonb,boolean)",
        "platform_private.b2b_schedule(numeric,numeric,integer,date,integer)",
        "platform_private.b2b_condition_seller(uuid)",
        "platform_private.b2b_condition_hash(text,jsonb,jsonb,numeric)",
        "platform_private.b2b_credit_checked(uuid,numeric,uuid)",
        "platform_private.b2b_condition_mode(uuid)",
        "platform_private.b2b_condition_required_check()",
        "platform_private.b2b_condition_immutable()",
        "platform_private.b2b_condition_cfg_actor(boolean)"]
TABLES = ["b2b_condition_versions", "b2b_condition_assignments", "b2b_order_condition_snapshots", "b2b_condition_retirements",
          "b2b_condition_assignment_revocations", "b2b_condition_activation", "b2b_condition_activation_history",
          "b2b_order_condition_quote_snapshots", "b2b_quote_response_receipts"]
QUOTE_SIG = "public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)"


def delta(src, anchor, repl, label):
    n = src.count(anchor)
    if n != 1:
        raise SystemExit(f"DELTA {label}: âncora encontrada {n} vezes (esperado 1)")
    return src.replace(anchor, repl)


def block(src, start, end, repl, label):
    if src.count(start) != 1:
        raise SystemExit(f"DELTA {label}: início encontrado {src.count(start)} vezes")
    a = src.index(start); b = src.index(end, a)
    return src[:a] + repl + src[b + len(end):]


def prior_schema():
    for n, pin in PRIOR_PINS.items():
        if hashlib.sha256((PRIOR_DIR / n).read_bytes()).hexdigest() != pin:
            raise SystemExit(f"PRIOR_DRIFT {n}")
    return (PRIOR_DIR / "schema.sql.review").read_text()


def extract(src, start, end, label):
    if src.count(start) != 1:
        raise SystemExit(f"EXTRACT {label}: início {src.count(start)} vezes")
    a = src.index(start); b = src.index(end, a) + len(end)
    return src[a:b]


def live(name):
    t = CAP[name].read_text()
    pin = {"create": "c34e740473afb7a365d362db854069cb", "sim": "37d4f45e388ed7b38f6f397b672629ee",
           "quote": "e57d3a6416910937bd02c9180dff0cf1"}[name]
    if hashlib.md5(t.encode()).hexdigest() != pin:
        raise SystemExit(f"LIVE_CAPTURE_DRIFT {name}")
    return t.rstrip("\n")


# ---------------------------------------------------------------- candidata comprovada (deltas declarados)
def prior_objects():
    s = prior_schema()
    ver = extract(s, "CREATE TABLE platform_private.b2b_condition_versions (", "\n);\n", "versions")
    ver = delta(ver, "deadline_days int NOT NULL CHECK(deadline_days>=0)",
                "deadline_days int NOT NULL DEFAULT 30 CHECK(deadline_days BETWEEN 0 AND 3650)", "V1 prazo configurável (default 30)")
    ver = delta(ver, "monthly_rate numeric NOT NULL CHECK(monthly_rate>=0 AND monthly_rate::text NOT IN ('NaN','Infinity','-Infinity')),",
                "monthly_rate numeric NOT NULL CHECK(monthly_rate>=0 AND monthly_rate::text NOT IN ('NaN','Infinity','-Infinity') AND monthly_rate<=100 AND monthly_rate=round(monthly_rate,6)),",
                "V2 taxa finita, ≤100, 6 casas")
    ver = delta(ver, " calendar_version text NOT NULL REFERENCES platform_private.holiday_calendars(version),",
                " calendar_version text CHECK(calendar_version IS NULL),",  # calendário Paracatu-MG pendente (B4); datas B3 estimadas
                "V3 calendário fora do B3")
    ver = delta(ver, " CHECK(method<>'boleto' OR (installment_count<=3 AND deadline_days=30))",
                " CHECK(method<>'boleto' OR installment_count<=3),\n CHECK(installment_count>1 OR monthly_rate=0),\n created_at timestamptz NOT NULL DEFAULT now()",
                "V4 boleto ≤3 com prazo personalizável; parcela única sem juros")
    asg = extract(s, "CREATE TABLE platform_private.b2b_condition_assignments (", "\n);\n", "assignments")
    snap = extract(s, "CREATE TABLE platform_private.b2b_order_condition_snapshots (", "\n);\n", "snapshots")
    snap = delta(snap, " rows jsonb NOT NULL, principal numeric NOT NULL, financed_interest numeric NOT NULL, financed_total numeric NOT NULL,\n CHECK(principal>0 AND financed_interest>=0 AND financed_total=principal+financed_interest)",
                 " rows jsonb NOT NULL, principal numeric, financed_interest numeric, financed_total numeric,\n"
                 " quote boolean NOT NULL, payment_terms_id uuid, cart_hash text NOT NULL, payment_method_name text NOT NULL,\n"
                 " estimated boolean NOT NULL DEFAULT true CHECK(estimated), due_basis text NOT NULL DEFAULT 'nf_issue' CHECK(due_basis='nf_issue'),\n"
                 " estimated_reference_date date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),\n"
                 " FOREIGN KEY(organization_id,plan_id,(choice->>'payment_condition_version'),(choice->>'payment_method')) REFERENCES platform_private.b2b_condition_versions(organization_id,plan_id,version,method),\n"
                 " CHECK((quote AND principal IS NULL AND financed_interest IS NULL AND financed_total IS NULL AND rows='[]'::jsonb)\n"
                 "    OR (NOT quote AND principal>0 AND financed_interest>=0 AND financed_total=principal+financed_interest))",
                 "N1 cotação + termos/hash/nome/estimativa")
    # FK por expressão não existe em PostgreSQL: usa colunas explícitas.
    snap = delta(snap, " FOREIGN KEY(organization_id,plan_id,(choice->>'payment_condition_version'),(choice->>'payment_method')) REFERENCES",
                 " condition_version int NOT NULL, condition_method text NOT NULL,\n FOREIGN KEY(organization_id,plan_id,condition_version,condition_method) REFERENCES",
                 "N2 FK da versão")
    ret = extract(s, "CREATE TABLE platform_private.b2b_condition_retirements (", "\n);\n", "retirements")
    choice = extract(s, "CREATE FUNCTION platform_private.b2b_choice(p jsonb)", "END $$;\n", "b2b_choice")
    res = extract(s, "CREATE FUNCTION platform_private.b2b_resolve_condition(p_partner uuid,p_plan uuid,p_choice jsonb) RETURNS jsonb", "END $$;\n", "resolve")
    res = delta(res, "b2b_resolve_condition(p_partner uuid,p_plan uuid,p_choice jsonb) RETURNS jsonb",
                "b2b_resolve_condition(p_partner uuid,p_plan uuid,p_choice jsonb,p_lock boolean) RETURNS jsonb", "R0 assinatura com trava")
    res = delta(res, "DECLARE org uuid; c platform_private.b2b_condition_versions; choice jsonb;",
                "DECLARE org uuid; c platform_private.b2b_condition_versions; choice jsonb; pm record; pl record; ok boolean;", "R1 declarações")
    res = delta(res, " org:=platform_private.b2b_integration_actor(p_partner); choice:=platform_private.b2b_choice(p_choice);\n",
                " org:=platform_private.b2b_condition_seller(p_partner); choice:=platform_private.b2b_choice(p_choice);\n"
                " IF p_lock THEN\n"
                "  -- Ordem: versão -> atribuição -> plano -> atribuição comercial publicada -> meio -> categoria (FOR SHARE).\n"
                "  -- Escritores (publish/retire/assign) travam a versão FOR UPDATE: revogação concorrente espera ou é vista abaixo.\n"
                "  PERFORM 1 FROM platform_private.b2b_condition_versions v WHERE v.organization_id=org AND v.plan_id=p_plan\n"
                "    AND v.version=(choice->>'payment_condition_version')::int AND v.method=choice->>'payment_method' FOR SHARE;\n"
                "  PERFORM 1 FROM platform_private.b2b_condition_assignments a WHERE a.organization_id=org AND a.partner_id=p_partner AND a.plan_id=p_plan\n"
                "    AND a.version=(choice->>'payment_condition_version')::int AND a.method=choice->>'payment_method' FOR SHARE;\n"
                "  PERFORM 1 FROM public.commercial_payment_plans p WHERE p.id=p_plan FOR SHARE;\n"
                "  PERFORM 1 FROM public.commercial_payment_plan_assignments x WHERE x.plan_id=p_plan AND x.partner_id=p_partner AND x.buyer_scope='partner' AND x.status='published' FOR SHARE;\n"
                "  PERFORM 1 FROM public.payment_methods m JOIN platform_private.b2b_condition_versions v ON v.payment_method_id=m.id WHERE v.organization_id=org AND v.plan_id=p_plan\n"
                "    AND v.version=(choice->>'payment_condition_version')::int AND v.method=choice->>'payment_method' FOR SHARE OF m;\n"
                "  PERFORM 1 FROM public.financial_categories k JOIN platform_private.b2b_condition_versions v ON v.category_id=k.id WHERE v.organization_id=org AND v.plan_id=p_plan\n"
                "    AND v.version=(choice->>'payment_condition_version')::int AND v.method=choice->>'payment_method' FOR SHARE OF k;\n"
                "  -- Reler a autoridade do ator DEPOIS das esperas (papel/perfil/vínculo podem ter mudado).\n"
                "  IF platform_private.b2b_condition_seller(p_partner) IS DISTINCT FROM org THEN RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;\n"
                " END IF;\n", "R2 vendedor canônico + travas + releitura")
    res = delta(res, " AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_condition_retirements r",
                " AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_condition_assignment_revocations x WHERE (x.organization_id,x.partner_id,x.plan_id,x.version,x.method)=(a.organization_id,a.partner_id,a.plan_id,a.version,a.method))\n"
                " AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_condition_retirements r", "R3 revogação por parceiro")
    res = delta(res, " IF NOT FOUND THEN RAISE EXCEPTION 'payment_condition_unavailable' USING ERRCODE='PT409'; END IF;\n",
                " IF NOT FOUND THEN\n"
                "  IF EXISTS(SELECT 1 FROM platform_private.b2b_condition_versions n WHERE n.organization_id=org AND n.plan_id=p_plan AND n.method=choice->>'payment_method'\n"
                "            AND n.version>(choice->>'payment_condition_version')::int) THEN RAISE EXCEPTION 'payment_condition_stale' USING ERRCODE='PT409'; END IF;\n"
                "  RAISE EXCEPTION 'payment_condition_unavailable' USING ERRCODE='PT409';\n END IF;\n"
                " SELECT m.id,m.name,m.active INTO pm FROM public.payment_methods m WHERE m.id=c.payment_method_id;\n"
                " IF pm.id IS NULL OR pm.active IS NOT TRUE THEN RAISE EXCEPTION 'payment_condition_unavailable' USING ERRCODE='PT409'; END IF;\n"
                " IF NOT EXISTS(SELECT 1 FROM public.financial_categories k WHERE k.id=c.category_id AND k.active IS TRUE AND upper(btrim(k.type))='RECEITA') THEN\n"
                "  RAISE EXCEPTION 'payment_condition_unavailable' USING ERRCODE='PT409'; END IF;\n"
                " SELECT p.max_days,p.monthly_interest_percent,p.superseded_by_id INTO pl FROM public.commercial_payment_plans p WHERE p.id=p_plan;\n"
                " IF pl.superseded_by_id IS NOT NULL THEN RAISE EXCEPTION 'payment_condition_unavailable' USING ERRCODE='PT409'; END IF;\n"
                " IF COALESCE(pl.monthly_interest_percent,0)<>0 THEN RAISE EXCEPTION 'payment_condition_plan_interest_conflict' USING ERRCODE='PT409'; END IF;\n"
                " IF c.deadline_days>COALESCE(pl.max_days,0) THEN RAISE EXCEPTION 'payment_condition_deadline_exceeds_plan' USING ERRCODE='PT409'; END IF;\n"
                " ok:=EXISTS(SELECT 1 FROM public.commercial_payment_plan_assignments x WHERE x.plan_id=p_plan AND x.partner_id=p_partner AND x.buyer_scope='partner'\n"
                "   AND x.status='published' AND x.valid_from<=CURRENT_DATE AND (x.valid_until IS NULL OR x.valid_until>=CURRENT_DATE));\n"
                " IF NOT ok THEN RAISE EXCEPTION 'payment_condition_unavailable' USING ERRCODE='PT409'; END IF;\n",
                "R4 obsoleta/meio/categoria RECEITA/plano/atribuição publicada")
    res = delta(res, " IF platform_private.b2b_credit_config_block(p_partner) IS NOT NULL THEN RAISE EXCEPTION 'CREDIT_SETTINGS_INCOMPLETE' USING ERRCODE='PT409'; END IF;\n",
                "", "R5 sem dependência do pacote de crédito não instalado (crédito LIVE fica no create)")
    res = delta(res, " RETURN to_jsonb(c);", " RETURN to_jsonb(c)-'approved_by'-'approved_at'-'created_at'-'configuration_approved'-'calendar_version' || jsonb_build_object('payment_method_name',pm.name);",
                "R6 retorno reduzido")
    sch = extract(s, "CREATE FUNCTION platform_private.b2b_schedule(", "END $$;\n", "schedule")
    sch = delta(sch, "(principal numeric,rate numeric,n int,issue date,deadline int,cal platform_private.holiday_calendars)",
                "(principal numeric,rate numeric,n int,issue date,deadline int)", "P0 sem calendário")
    sch = delta(sch, "'nominal_due_date',nom,'due_date',platform_private.b2b_business_day(nom,cal),'received_amount',0",
                "'nominal_due_date',nom,'due_date',nom,'estimated',true,'business_day_adjusted',false", "P1 datas estimadas")
    sch = delta(sch, "OR issue IS NULL OR NOT isfinite(issue) OR deadline IS NULL OR deadline<0 THEN",
                "OR issue IS NULL OR NOT isfinite(issue) OR deadline IS NULL OR deadline<0 OR (n=1 AND rate<>0) THEN", "P2 parcela única sem juros")
    return ver, asg, snap, ret, choice, res, sch


EXTRA = r"""
CREATE TABLE platform_private.b2b_condition_assignment_revocations (
 organization_id uuid NOT NULL, partner_id uuid NOT NULL, plan_id uuid NOT NULL, version int NOT NULL, method text NOT NULL,
 revoked_by uuid NOT NULL, revoked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,partner_id,plan_id,version,method),
 FOREIGN KEY(organization_id,partner_id,plan_id,version,method) REFERENCES platform_private.b2b_condition_assignments(organization_id,partner_id,plan_id,version,method)
);
CREATE TABLE platform_private.b2b_condition_activation (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 mode text NOT NULL CHECK (mode IN ('off','pilot','enforced')), pilot_partner_ids uuid[] NOT NULL DEFAULT '{}',
 version integer NOT NULL CHECK (version > 0), updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((mode = 'pilot') = (cardinality(pilot_partner_ids) > 0))
);
CREATE TABLE platform_private.b2b_condition_activation_history (
 organization_id uuid NOT NULL, version integer NOT NULL, snapshot jsonb NOT NULL, actor_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (organization_id, version)
);
-- A escolha inicial da cotação permanece imutável. A resposta cria UM segundo snapshot econômico append-only.
CREATE TABLE platform_private.b2b_order_condition_quote_snapshots (
 order_id uuid PRIMARY KEY REFERENCES public.partner_orders(id), organization_id uuid NOT NULL, partner_id uuid NOT NULL,
 actor_id uuid NOT NULL, plan_id uuid NOT NULL, choice jsonb NOT NULL, condition jsonb NOT NULL, request_hash text NOT NULL,
 rows jsonb NOT NULL, principal numeric NOT NULL, financed_interest numeric NOT NULL, financed_total numeric NOT NULL,
 payment_terms_id uuid NOT NULL, cart_hash text NOT NULL, payment_method_name text NOT NULL,
 estimated boolean NOT NULL DEFAULT true CHECK(estimated), due_basis text NOT NULL DEFAULT 'nf_issue' CHECK(due_basis='nf_issue'),
 estimated_reference_date date NOT NULL, condition_version int NOT NULL, condition_method text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(principal>0 AND financed_interest>=0 AND financed_total=principal+financed_interest),
 FOREIGN KEY(organization_id,plan_id,condition_version,condition_method) REFERENCES platform_private.b2b_condition_versions(organization_id,plan_id,version,method)
);
CREATE TABLE platform_private.b2b_quote_response_receipts (
 order_id uuid PRIMARY KEY REFERENCES public.partner_orders(id), request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 actor_id uuid NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_private.b2b_condition_retirements ADD COLUMN retired_by uuid, ADD COLUMN retired_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE platform_private.b2b_condition_assignments ADD COLUMN assigned_by uuid, ADD COLUMN assigned_at timestamptz NOT NULL DEFAULT now();

CREATE FUNCTION platform_private.b2b_condition_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN RAISE EXCEPTION 'B2B_CONDITION_RECORD_IMMUTABLE' USING ERRCODE='42501'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['b2b_condition_versions','b2b_condition_assignments','b2b_order_condition_snapshots','b2b_condition_retirements',
                          'b2b_condition_assignment_revocations','b2b_condition_activation_history','b2b_order_condition_quote_snapshots','b2b_quote_response_receipts'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_update_delete BEFORE UPDATE OR DELETE ON platform_private.%I FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_condition_immutable()',t);
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON platform_private.%I FOR EACH STATEMENT EXECUTE FUNCTION platform_private.b2b_condition_immutable()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['b2b_condition_versions','b2b_condition_assignments','b2b_order_condition_snapshots','b2b_condition_retirements',
                          'b2b_condition_assignment_revocations','b2b_condition_activation','b2b_condition_activation_history',
                          'b2b_order_condition_quote_snapshots','b2b_quote_response_receipts'] LOOP
  EXECUTE format('ALTER TABLE platform_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON platform_private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;

-- Empresa vendedora: comprador externo -> leitor canônico; ator interno -> h15, que precisa ser a dona comercial. Nunca do payload.
CREATE FUNCTION platform_private.b2b_condition_seller(p_partner_id uuid)
 RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'gestor_comercial'::public.app_role) IS TRUE
     OR public.has_role(v_uid,'financeiro'::public.app_role) IS TRUE THEN
    v_org := platform_private.h15_actor_organization();
    IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.partner_accounts a WHERE a.id = p_partner_id AND a.commercial_owner_organization_id = v_org AND a.ativo IS TRUE) THEN
      RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;
    RETURN v_org;
  END IF;
  RETURN platform_private.b2b_partner_catalog_reader(p_partner_id);
END $function$;

-- Hash único (simulação = criação): hash LIVE do carrinho + escolha + condição reduzida + total pelas parcelas.
CREATE FUNCTION platform_private.b2b_condition_hash(p_base text, p_choice jsonb, p_cond jsonb, p_total numeric)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
  SELECT encode(pg_catalog.sha256(convert_to(jsonb_build_object('contract','B2B_PAYMENT_CONDITION_V1','base',p_base,'choice',p_choice,
    'condition',jsonb_build_object('organization_id',p_cond->'organization_id','plan_id',p_cond->'plan_id','version',p_cond->'version','method',p_cond->'method',
      'deadline_days',p_cond->'deadline_days','installment_count',p_cond->'installment_count','monthly_rate',p_cond->'monthly_rate',
      'payment_method_id',p_cond->'payment_method_id','category_id',p_cond->'category_id'),
    'total',to_char(round(p_total,2),'FM9999999999990.00'))::text,'UTF8')),'hex')
$function$;

-- Limite explícito e cálculo íntegro: ausência/NULL/negativo/NaN/Infinity/configuração incompleta negam.
-- Zero é um limite VÁLIDO (nunca ilimitado); qualquer exposição positiva o excede. Erros transitórios propagam, sem EXCEPTION OTHERS.
CREATE FUNCTION platform_private.b2b_credit_checked(p_partner_id uuid, p_amount numeric, p_exclude_order_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v jsonb; v_limit numeric; v_projected numeric; v_tolerance integer;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 OR p_amount::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'CREDIT_CALCULATION_INVALID' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_financial_settings s WHERE s.partner_id=p_partner_id AND s.active IS TRUE) THEN
    RAISE EXCEPTION 'CREDIT_SETTINGS_INCOMPLETE' USING ERRCODE='PT409';
  END IF;
  v := public.fn_b2b_credit_exposure(p_partner_id,p_amount,p_exclude_order_id);
  IF v IS NULL OR v->>'partner_id' IS DISTINCT FROM p_partner_id::text
     OR jsonb_typeof(v->'credit_limit') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v->'exposicao_projetada') IS DISTINCT FROM 'number'
     OR jsonb_typeof(v->'block_if_overdue') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(v->'overdue_tolerance_days') IS DISTINCT FROM 'number'
     OR v->>'credit_limit_action' NOT IN ('block','approval_required') THEN
    RAISE EXCEPTION 'CREDIT_SETTINGS_INCOMPLETE' USING ERRCODE='PT409';
  END IF;
  v_limit := (v->>'credit_limit')::numeric;
  v_projected := (v->>'exposicao_projetada')::numeric;
  v_tolerance := (v->>'overdue_tolerance_days')::integer;
  IF v_limit < 0 OR v_limit::text IN ('NaN','Infinity','-Infinity') OR v_tolerance < 0 THEN
    RAISE EXCEPTION 'CREDIT_SETTINGS_INCOMPLETE' USING ERRCODE='PT409';
  END IF;
  IF v_projected < 0 OR v_projected::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'CREDIT_CALCULATION_INVALID' USING ERRCODE='22023';
  END IF;
  RETURN v || jsonb_build_object('credit_checked',true);
END $function$;

CREATE FUNCTION platform_private.b2b_condition_mode(p_partner_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT CASE WHEN g.mode = 'enforced' OR (g.mode = 'pilot' AND p_partner_id = ANY (g.pilot_partner_ids)) THEN 'required' ELSE 'legacy' END
    FROM public.partner_accounts a LEFT JOIN platform_private.b2b_condition_activation g ON g.organization_id = a.commercial_owner_organization_id
   WHERE a.id = p_partner_id
$function$;

-- Empresa ativada: pedido sem snapshot de condição não fecha a transação (qualquer ator; sem bypass por papel).
CREATE FUNCTION platform_private.b2b_condition_required_check()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  IF NEW.payment_plan_id IS NULL THEN RETURN NULL; END IF;
  IF platform_private.b2b_condition_mode(NEW.partner_id) IS DISTINCT FROM 'required' THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM platform_private.b2b_order_condition_snapshots s WHERE s.order_id = NEW.id) THEN
    RAISE EXCEPTION 'B2B_PAYMENT_CONDITION_REQUIRED' USING ERRCODE='P0001',
      HINT = 'Selecione uma condição e um meio de pagamento permitidos pela empresa fornecedora (contrato B2B_PAYMENT_CONDITION_V1).';
  END IF;
  RETURN NULL;
END $function$;
CREATE CONSTRAINT TRIGGER b2b_payment_condition_required AFTER INSERT ON public.partner_orders
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_condition_required_check();

-- Autoridade do configurador (vendedor): administrador/financeiro da própria empresa; nunca superadmin/papéis externos.
CREATE FUNCTION platform_private.b2b_condition_cfg_actor(p_admin_only boolean)
 RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  v_org := platform_private.h15_actor_organization();
  IF v_uid IS NULL OR v_org IS NULL OR public.is_platform_superadmin(v_uid) IS NOT FALSE
     OR NOT (public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR (NOT p_admin_only AND public.has_role(v_uid,'financeiro'::public.app_role) IS TRUE))
     OR public.has_role(v_uid,'parceiro_b2b'::public.app_role) IS NOT FALSE OR public.has_role(v_uid,'parceiro_b2b_tecnico'::public.app_role) IS NOT FALSE
     OR public.has_role(v_uid,'cliente_produtor'::public.app_role) IS NOT FALSE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN v_org;
END $function$;
"""

WRITERS = r"""
-- Publica NOVA versão (append-only) de (plano, meio); a versão anterior é aposentada e suas atribuições ativas são copiadas.
-- Ordem: advisory(org,plano,meio) -> reautorização -> versão atual FOR UPDATE -> CAS -> plano/meio/categoria FOR SHARE.
CREATE FUNCTION public.b2b_payment_condition_publish(p_plan_id uuid, p_method text, p_payment_method_id uuid, p_category_id uuid,
  p_deadline_days integer, p_installment_count integer, p_monthly_rate numeric, p_expected_version integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid; cur platform_private.b2b_condition_versions; v_new platform_private.b2b_condition_versions; pl record;
BEGIN
  v_org := platform_private.b2b_condition_cfg_actor(false);
  IF p_plan_id IS NULL OR p_method IS NULL OR p_expected_version IS NULL OR p_expected_version < 0 OR p_deadline_days IS NULL
     OR p_installment_count IS NULL OR p_monthly_rate IS NULL THEN RAISE EXCEPTION 'payment_condition_config_invalid' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('b2bcond:' || v_org::text || ':' || p_plan_id::text || ':' || p_method, 0));
  IF platform_private.b2b_condition_cfg_actor(false) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO cur FROM platform_private.b2b_condition_versions v WHERE v.organization_id=v_org AND v.plan_id=p_plan_id AND v.method=p_method
   ORDER BY v.version DESC LIMIT 1 FOR UPDATE;
  IF COALESCE(cur.version,0) <> p_expected_version THEN RAISE EXCEPTION 'payment_condition_config_stale' USING ERRCODE='PT409'; END IF;
  SELECT p.active, p.superseded_by_id, p.max_days, p.monthly_interest_percent INTO pl FROM public.commercial_payment_plans p WHERE p.id=p_plan_id FOR SHARE;
  IF pl.active IS NOT TRUE OR pl.superseded_by_id IS NOT NULL THEN RAISE EXCEPTION 'plan_inactive' USING ERRCODE='P0001'; END IF;
  IF COALESCE(pl.monthly_interest_percent,0) <> 0 THEN RAISE EXCEPTION 'payment_condition_plan_interest_conflict' USING ERRCODE='P0001'; END IF;
  IF p_deadline_days > COALESCE(pl.max_days,0) THEN RAISE EXCEPTION 'payment_condition_deadline_exceeds_plan' USING ERRCODE='P0001'; END IF;
  PERFORM 1 FROM public.payment_methods m WHERE m.id=p_payment_method_id AND m.active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_method_catalog_unavailable' USING ERRCODE='P0001'; END IF;
  PERFORM 1 FROM public.financial_categories k WHERE k.id=p_category_id AND k.active IS TRUE AND upper(btrim(k.type))='RECEITA' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'revenue_category_unavailable' USING ERRCODE='P0001'; END IF;
  INSERT INTO platform_private.b2b_condition_versions(organization_id,plan_id,version,method,deadline_days,installment_count,monthly_rate,
    approved_by,approved_at,configuration_approved,calendar_version,category_id,payment_method_id)
  VALUES (v_org,p_plan_id,COALESCE(cur.version,0)+1,p_method,p_deadline_days,p_installment_count,p_monthly_rate,v_uid,now(),true,NULL,p_category_id,p_payment_method_id)
  RETURNING * INTO v_new;
  IF cur.version IS NOT NULL THEN
    INSERT INTO platform_private.b2b_condition_retirements(organization_id,plan_id,version,method,retired_by)
    SELECT v_org,p_plan_id,cur.version,p_method,v_uid
     WHERE NOT EXISTS (SELECT 1 FROM platform_private.b2b_condition_retirements r WHERE (r.organization_id,r.plan_id,r.version,r.method)=(v_org,p_plan_id,cur.version,p_method));
    INSERT INTO platform_private.b2b_condition_assignments(organization_id,partner_id,plan_id,version,method,assigned_by)
    SELECT a.organization_id,a.partner_id,a.plan_id,v_new.version,a.method,v_uid FROM platform_private.b2b_condition_assignments a
     JOIN public.partner_accounts pa ON pa.id=a.partner_id AND pa.commercial_owner_organization_id=v_org AND pa.ativo IS TRUE
     WHERE a.organization_id=v_org AND a.plan_id=p_plan_id AND a.version=cur.version AND a.method=p_method
       AND NOT EXISTS (SELECT 1 FROM platform_private.b2b_condition_assignment_revocations x
                        WHERE (x.organization_id,x.partner_id,x.plan_id,x.version,x.method)=(a.organization_id,a.partner_id,a.plan_id,a.version,a.method));
  END IF;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_CONDITION_V1','condition', to_jsonb(v_new) - 'approved_by');
END $function$;

CREATE FUNCTION public.b2b_payment_condition_retire(p_plan_id uuid, p_method text, p_expected_version integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid; cur platform_private.b2b_condition_versions;
BEGIN
  v_org := platform_private.b2b_condition_cfg_actor(false);
  PERFORM pg_advisory_xact_lock(hashtextextended('b2bcond:' || v_org::text || ':' || p_plan_id::text || ':' || p_method, 0));
  IF platform_private.b2b_condition_cfg_actor(false) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO cur FROM platform_private.b2b_condition_versions v WHERE v.organization_id=v_org AND v.plan_id=p_plan_id AND v.method=p_method
   ORDER BY v.version DESC LIMIT 1 FOR UPDATE;
  IF cur.version IS NULL OR cur.version <> p_expected_version THEN RAISE EXCEPTION 'payment_condition_config_stale' USING ERRCODE='PT409'; END IF;
  IF EXISTS (SELECT 1 FROM platform_private.b2b_condition_retirements r WHERE (r.organization_id,r.plan_id,r.version,r.method)=(v_org,p_plan_id,cur.version,p_method)) THEN
    RAISE EXCEPTION 'payment_condition_already_retired' USING ERRCODE='PT409'; END IF;
  INSERT INTO platform_private.b2b_condition_retirements(organization_id,plan_id,version,method,retired_by) VALUES (v_org,p_plan_id,cur.version,p_method,v_uid);
  RETURN jsonb_build_object('contract','B2B_PAYMENT_CONDITION_V1','retired',jsonb_build_object('plan_id',p_plan_id,'method',p_method,'version',cur.version));
END $function$;

-- Atribui/revoga (append-only) a versão VIGENTE a um parceiro da própria empresa. Reativar após revogar exige nova versão.
CREATE FUNCTION public.b2b_payment_condition_assign(p_partner_id uuid, p_plan_id uuid, p_method text, p_version integer, p_enabled boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid; cur platform_private.b2b_condition_versions;
BEGIN
  v_org := platform_private.b2b_condition_cfg_actor(false);
  IF p_enabled IS NULL OR p_version IS NULL THEN RAISE EXCEPTION 'payment_condition_config_invalid' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('b2bcond:' || v_org::text || ':' || p_plan_id::text || ':' || p_method, 0));
  IF platform_private.b2b_condition_cfg_actor(false) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_accounts a WHERE a.id=p_partner_id AND a.commercial_owner_organization_id=v_org AND a.ativo IS TRUE) THEN
    RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;
  SELECT * INTO cur FROM platform_private.b2b_condition_versions v WHERE v.organization_id=v_org AND v.plan_id=p_plan_id AND v.method=p_method
   ORDER BY v.version DESC LIMIT 1 FOR UPDATE;
  IF cur.version IS NULL OR cur.version <> p_version
     OR EXISTS (SELECT 1 FROM platform_private.b2b_condition_retirements r WHERE (r.organization_id,r.plan_id,r.version,r.method)=(v_org,p_plan_id,cur.version,p_method)) THEN
    RAISE EXCEPTION 'payment_condition_config_stale' USING ERRCODE='PT409'; END IF;
  IF p_enabled THEN
    IF EXISTS (SELECT 1 FROM platform_private.b2b_condition_assignment_revocations x WHERE (x.organization_id,x.partner_id,x.plan_id,x.version,x.method)=(v_org,p_partner_id,p_plan_id,cur.version,p_method)) THEN
      RAISE EXCEPTION 'payment_condition_reassign_requires_new_version' USING ERRCODE='PT409'; END IF;
    INSERT INTO platform_private.b2b_condition_assignments(organization_id,partner_id,plan_id,version,method,assigned_by)
    VALUES (v_org,p_partner_id,p_plan_id,cur.version,p_method,v_uid) ON CONFLICT DO NOTHING;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM platform_private.b2b_condition_assignments a WHERE (a.organization_id,a.partner_id,a.plan_id,a.version,a.method)=(v_org,p_partner_id,p_plan_id,cur.version,p_method)) THEN
      RAISE EXCEPTION 'payment_condition_not_assigned' USING ERRCODE='PT409'; END IF;
    INSERT INTO platform_private.b2b_condition_assignment_revocations(organization_id,partner_id,plan_id,version,method,revoked_by)
    VALUES (v_org,p_partner_id,p_plan_id,cur.version,p_method,v_uid) ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_CONDITION_V1','partner_id',p_partner_id,'plan_id',p_plan_id,'method',p_method,'version',cur.version,'enabled',p_enabled);
END $function$;

-- Ativação por empresa: off -> pilot (parceiros da própria empresa) -> enforced. Só administrador; exige condição atribuída vigente.
CREATE FUNCTION public.b2b_payment_condition_activation_set(p_mode text, p_pilot_partner_ids uuid[], p_expected_version integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid; g record; v_row platform_private.b2b_condition_activation; v_ids uuid[];
BEGIN
  v_org := platform_private.b2b_condition_cfg_actor(true);
  IF p_mode NOT IN ('off','pilot','enforced') OR p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'payment_condition_activation_invalid' USING ERRCODE='22023'; END IF;
  v_ids := CASE WHEN p_mode = 'pilot' THEN (SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}') FROM unnest(COALESCE(p_pilot_partner_ids,'{}')) x) ELSE '{}' END;
  PERFORM pg_advisory_xact_lock(hashtextextended('b2bcond_act:' || v_org::text, 0));
  IF platform_private.b2b_condition_cfg_actor(true) IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO g FROM platform_private.b2b_condition_activation WHERE organization_id = v_org FOR UPDATE;
  IF COALESCE(g.version, 0) <> p_expected_version THEN RAISE EXCEPTION 'payment_condition_activation_stale' USING ERRCODE='PT409'; END IF;
  IF p_mode = 'pilot' AND (cardinality(v_ids) = 0 OR EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE NOT EXISTS (
       SELECT 1 FROM public.partner_accounts a WHERE a.id = x AND a.commercial_owner_organization_id = v_org AND a.ativo IS TRUE))) THEN
    RAISE EXCEPTION 'payment_condition_pilot_partner_invalid' USING ERRCODE='42501'; END IF;
  IF p_mode <> 'off' AND NOT EXISTS (SELECT 1 FROM platform_private.b2b_condition_assignments a WHERE a.organization_id = v_org
       AND NOT EXISTS (SELECT 1 FROM platform_private.b2b_condition_retirements r WHERE (r.organization_id,r.plan_id,r.version,r.method)=(a.organization_id,a.plan_id,a.version,a.method))
       AND NOT EXISTS (SELECT 1 FROM platform_private.b2b_condition_assignment_revocations x WHERE (x.organization_id,x.partner_id,x.plan_id,x.version,x.method)=(a.organization_id,a.partner_id,a.plan_id,a.version,a.method))
       AND (p_mode = 'enforced' OR a.partner_id = ANY (v_ids))) THEN
    RAISE EXCEPTION 'payment_condition_activation_requires_config' USING ERRCODE='P0001'; END IF;
  INSERT INTO platform_private.b2b_condition_activation(organization_id, mode, pilot_partner_ids, version, updated_by)
  VALUES (v_org, p_mode, v_ids, COALESCE(g.version, 0) + 1, v_uid)
  ON CONFLICT (organization_id) DO UPDATE SET mode = EXCLUDED.mode, pilot_partner_ids = EXCLUDED.pilot_partner_ids, version = EXCLUDED.version,
    updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO v_row;
  INSERT INTO platform_private.b2b_condition_activation_history(organization_id, version, snapshot, actor_id) VALUES (v_org, v_row.version, to_jsonb(v_row), v_uid);
  RETURN jsonb_build_object('contract','B2B_PAYMENT_CONDITION_V1','activation', to_jsonb(v_row) - 'updated_by');
END $function$;

CREATE FUNCTION public.b2b_payment_condition_config_list()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  v_org := platform_private.h15_actor_organization();
  IF v_org IS NULL OR public.is_platform_superadmin(v_uid) IS NOT FALSE
     OR NOT (public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'financeiro'::public.app_role) IS TRUE
             OR public.has_role(v_uid,'gestor_comercial'::public.app_role) IS TRUE)
     OR public.has_role(v_uid,'parceiro_b2b'::public.app_role) IS NOT FALSE OR public.has_role(v_uid,'parceiro_b2b_tecnico'::public.app_role) IS NOT FALSE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_CONDITION_V1','organization_id', v_org,
    'can_edit', public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'financeiro'::public.app_role) IS TRUE,
    'can_activate', public.has_role(v_uid,'administrador'::public.app_role) IS TRUE,
    'default_deadline_days', 30,
    'activation', COALESCE((SELECT to_jsonb(g) - 'updated_by' FROM platform_private.b2b_condition_activation g WHERE g.organization_id = v_org),
                           jsonb_build_object('mode','off','pilot_partner_ids','[]'::jsonb,'version',0)),
    'conditions', COALESCE((SELECT jsonb_agg(jsonb_build_object('plan_id',v.plan_id,'method',v.method,'version',v.version,'deadline_days',v.deadline_days,
        'installment_count',v.installment_count,'monthly_rate',v.monthly_rate,'payment_method_id',v.payment_method_id,'category_id',v.category_id,
        'approved_at',v.approved_at,
        'retired',EXISTS (SELECT 1 FROM platform_private.b2b_condition_retirements r WHERE (r.organization_id,r.plan_id,r.version,r.method)=(v.organization_id,v.plan_id,v.version,v.method)),
        'partner_ids',COALESCE((SELECT jsonb_agg(a.partner_id ORDER BY a.partner_id) FROM platform_private.b2b_condition_assignments a
            WHERE (a.organization_id,a.plan_id,a.version,a.method)=(v.organization_id,v.plan_id,v.version,v.method)
              AND NOT EXISTS (SELECT 1 FROM platform_private.b2b_condition_assignment_revocations x WHERE (x.organization_id,x.partner_id,x.plan_id,x.version,x.method)=(a.organization_id,a.partner_id,a.plan_id,a.version,a.method))),'[]'::jsonb))
        ORDER BY v.plan_id, v.method)
      FROM platform_private.b2b_condition_versions v
     WHERE v.organization_id = v_org AND v.version = (SELECT max(w.version) FROM platform_private.b2b_condition_versions w WHERE w.organization_id=v.organization_id AND w.plan_id=v.plan_id AND w.method=v.method)), '[]'::jsonb),
    'catalog', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'name', pm.name) ORDER BY pm.name) FROM public.payment_methods pm WHERE pm.active IS TRUE), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name) ORDER BY k.name) FROM public.financial_categories k WHERE k.active IS TRUE AND upper(btrim(k.type))='RECEITA'), '[]'::jsonb),
    'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code, 'max_days', p.max_days, 'monthly_interest_percent', p.monthly_interest_percent) ORDER BY p.name)
               FROM public.commercial_payment_plans p WHERE p.active IS TRUE AND p.superseded_by_id IS NULL), '[]'::jsonb),
    'partners', COALESCE((SELECT jsonb_agg(a.id ORDER BY a.id) FROM public.partner_accounts a WHERE a.commercial_owner_organization_id = v_org AND a.ativo IS TRUE), '[]'::jsonb));
END $function$;

-- Opções no pedido (comprador do parceiro ou ator interno do vendedor). mode=legacy: empresa não ativada (contrato atual).
CREATE FUNCTION public.b2b_list_payment_condition_options_secure(p_partner_id uuid, p_payment_plan_id uuid)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_seller uuid; v_opts jsonb := '[]'::jsonb; c record; r jsonb; v_reason text;
BEGIN
  IF auth.uid() IS NULL OR p_payment_plan_id IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  IF public.has_role(auth.uid(),'parceiro_b2b_tecnico'::public.app_role) IS TRUE AND NOT (public.has_role(auth.uid(),'parceiro_b2b'::public.app_role) IS TRUE
     OR public.has_role(auth.uid(),'administrador'::public.app_role) IS TRUE OR public.has_role(auth.uid(),'gestor_comercial'::public.app_role) IS TRUE
     OR public.has_role(auth.uid(),'financeiro'::public.app_role) IS TRUE) THEN RAISE EXCEPTION 'forbidden_financial_terms' USING ERRCODE='42501'; END IF;
  v_seller := platform_private.b2b_condition_seller(p_partner_id);
  FOR c IN SELECT a.version, a.method, v.deadline_days FROM platform_private.b2b_condition_assignments a
             JOIN platform_private.b2b_condition_versions v USING (organization_id, plan_id, version, method)
            WHERE a.organization_id = v_seller AND a.partner_id = p_partner_id AND a.plan_id = p_payment_plan_id
            ORDER BY a.method, a.version LOOP
    BEGIN
      r := platform_private.b2b_resolve_condition(p_partner_id, p_payment_plan_id,
             jsonb_build_object('payment_method', c.method, 'payment_condition_version', c.version, 'payment_deadline_days', c.deadline_days), false);
      v_opts := v_opts || jsonb_build_array(jsonb_build_object('payment_method', r->>'method', 'payment_condition_version', (r->>'version')::int,
        'payment_deadline_days', (r->>'deadline_days')::int, 'installment_count', (r->>'installment_count')::int, 'monthly_rate', (r->>'monthly_rate')::numeric,
        'payment_method_name', r->>'payment_method_name', 'available', true));
    EXCEPTION WHEN SQLSTATE 'PT409' THEN
      GET STACKED DIAGNOSTICS v_reason = MESSAGE_TEXT;
      IF v_reason IN ('payment_condition_plan_interest_conflict','payment_condition_deadline_exceeds_plan') THEN
        v_opts := v_opts || jsonb_build_array(jsonb_build_object('payment_method', c.method, 'payment_condition_version', c.version, 'available', false, 'reason', v_reason));
      ELSIF v_reason IN ('payment_condition_unavailable','payment_condition_stale') THEN NULL;
      ELSE RAISE; END IF;
    END;
  END LOOP;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_CONDITION_V1','partner_id', p_partner_id,'payment_plan_id', p_payment_plan_id,
    'mode', platform_private.b2b_condition_mode(p_partner_id), 'due_basis','nf_issue','options', v_opts);
END $function$;

CREATE FUNCTION public.get_partner_order_payment_condition_secure(p_order_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE s platform_private.b2b_order_condition_snapshots;
BEGIN
  PERFORM public.get_partner_order_payment_terms_secure(p_order_id);  -- mesmas portas do leitor de condição instalado
  SELECT * INTO s FROM platform_private.b2b_order_condition_snapshots x WHERE x.order_id = p_order_id;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_CONDITION_V1','order_id', p_order_id,'present', FOUND,
    'payment_condition', CASE WHEN FOUND THEN jsonb_build_object('choice', s.choice, 'payment_method_name', s.payment_method_name,
      'installment_count', s.condition->'installment_count', 'monthly_rate', s.condition->'monthly_rate', 'deadline_days', s.condition->'deadline_days',
      'due_basis', s.due_basis, 'estimated', s.estimated, 'estimated_reference_date', s.estimated_reference_date, 'quote', s.quote,
      'schedule', s.rows, 'principal', s.principal, 'financed_interest', s.financed_interest, 'financed_total', s.financed_total) END);
END $function$;
"""

SCHED = ("  IF NOT v_quote THEN\n"
         "    v_rows := platform_private.b2b_schedule(v_net, (v_cond->>'monthly_rate')::numeric, v_installments, current_date,\n"
         "                (v_cond->>'deadline_days')::integer); -- b2bcond: UMA verdade monetária (Price da candidata)\n"
         "    SELECT round(sum((r->>'amount')::numeric), 2) INTO v_final FROM jsonb_array_elements(v_rows) r;\n"
         "  END IF;\n")


def build_create():
    s = live("create")
    first = s.split("\n", 1)[0]
    s = delta(s, first, "CREATE OR REPLACE FUNCTION public.create_partner_order_condition_secure(p_partner_id uuid, p_observacoes text, p_items jsonb, "
              "p_requested_delivery_date date, p_payment_plan_id uuid, p_expected_cart_hash text, p_idempotency_key text, p_payment_choice jsonb)", "C0 assinatura")
    s = delta(s, "  v_items_canon text; v_req_fp text;\n",
              "  v_items_canon text; v_req_fp text;\n"
              "  p_first_due_date date := NULL; p_installment_count integer := NULL; -- b2bcond: cliente não define vencimento nem parcelas\n"
              "  v_choice jsonb; v_cond jsonb; v_cond2 jsonb; v_rows jsonb;\n", "C1 declarações")
    s = delta(s, "  -- request fingerprint canônico: reqfp_v2\n",
              "  v_choice := platform_private.b2b_choice(p_payment_choice); -- b2bcond: escolha incompleta falha explícita, sem fallback\n"
              "  -- request fingerprint canônico: reqfp_v2\n", "C2 escolha normalizada antes do fingerprint")
    s = delta(s, "      'reqfp_v2'\n", "      'b2bcond_reqfp_v1'\n", "C3 algoritmo do fingerprint")
    s = delta(s, "      || '|items='     || v_items_canon\n",
              "      || '|items='     || v_items_canon\n      || '|choice='    || v_choice::text\n", "C4 fingerprint inclui meio/versão/prazo")
    s = delta(s, "  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;\n",
              "  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;\n"
              "  -- b2bcond: relido APÓS lock de idempotência e reautorização LIVE; trava versão/atribuição/plano/meio/categoria (FOR SHARE).\n"
              "  v_cond := platform_private.b2b_resolve_condition(p_partner_id, v_plan.id, v_choice, true);\n", "C5 resolve com trava")
    s = delta(s, "  v_credit := public.fn_b2b_credit_exposure(p_partner_id, 0, NULL);\n",
              "  v_credit := platform_private.b2b_credit_checked(p_partner_id, 0, NULL); -- b2bcond: limite explícito, erro propaga\n", "C5a crédito inicial íntegro")
    s = delta(s, "    v_credit := public.fn_b2b_credit_exposure(p_partner_id, v_final, NULL);\n",
              "    v_credit := platform_private.b2b_credit_checked(p_partner_id, v_final, NULL); -- b2bcond: nunca COALESCE limite para liberar\n", "C5b crédito Price íntegro")
    s = delta(s, "    v_installments := GREATEST(COALESCE(p_installment_count, v_plan.installment_count, 1), 1);\n  END IF;\n",
              "    v_installments := GREATEST(COALESCE(p_installment_count, v_plan.installment_count, 1), 1);\n  END IF;\n"
              "  v_installments := (v_cond->>'installment_count')::integer; -- b2bcond: parcelas da versão aprovada\n", "C6 parcelas")
    s = delta(s, "                         v_plan.monthly_interest_percent, v_plan.months_count) END;\n\n  v_hash := public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final);\n",
              "                         v_plan.monthly_interest_percent, v_plan.months_count) END;\n" + SCHED + "\n"
              "  v_hash := platform_private.b2b_condition_hash(public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final), v_choice, v_cond, v_final);\n",
              "C7 total pelas parcelas + hash")
    s = delta(s, "  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);\n",
              "  v_first_due := COALESCE((v_rows->0->>'due_date')::date, current_date + (v_cond->>'deadline_days')::integer); -- b2bcond: ESTIMADA\n", "C8 vencimento estimado")
    s = delta(s, "  -- Issue only after canonical role/partner/plan/cart/hash/credit checks and idempotent replay.\n",
              "  -- b2bcond: reler autoridade/configuração depois das esperas de embalagem/crédito; a versão é imutável.\n"
              "  v_cond2 := platform_private.b2b_resolve_condition(p_partner_id, v_plan.id, v_choice, false);\n"
              "  IF v_cond2 IS DISTINCT FROM v_cond THEN RAISE EXCEPTION 'payment_condition_stale' USING ERRCODE='PT409'; END IF;\n"
              "  -- Issue only after canonical role/partner/plan/cart/hash/credit checks and idempotent replay.\n", "C9 revalidação final")
    s = delta(s, "      v_plan.discount_percent, v_plan.monthly_interest_percent, v_plan.months_count,\n",
              "      v_plan.discount_percent, (v_cond->>'monthly_rate')::numeric, v_installments, -- b2bcond: termos da versão aceita\n", "C10 termos")
    s = block(s, "    IF v_installments = 1 THEN\n      INSERT INTO public.partner_order_payment_schedule(", "      END LOOP;\n    END IF;\n",
              "    INSERT INTO public.partner_order_payment_schedule(\n"
              "      partner_order_id, payment_terms_id, installment_number, due_date,\n"
              "      amount, principal_amount, interest_amount)\n"
              "    SELECT v_order_id, v_terms_id, (r->>'installment_number')::integer, (r->>'due_date')::date,\n"
              "           (r->>'amount')::numeric, (r->>'principal_amount')::numeric, (r->>'interest_amount')::numeric\n"
              "      FROM jsonb_array_elements(v_rows) r ORDER BY (r->>'installment_number')::integer; -- b2bcond: mesmas parcelas\n", "C11 cronograma = parcelas")
    s = delta(s, "'fingerprint_algo', 'reqfp_v2',", "'fingerprint_algo', 'b2bcond_reqfp_v1',", "C12 auditoria")
    s = delta(s, "  INSERT INTO public.partner_order_idempotency(\n",
              "  INSERT INTO platform_private.b2b_order_condition_snapshots(order_id, organization_id, partner_id, actor_id, plan_id, choice, condition,\n"
              "    request_hash, rows, principal, financed_interest, financed_total, quote, payment_terms_id, cart_hash, payment_method_name,\n"
              "    estimated_reference_date, condition_version, condition_method)\n"
              "  VALUES (v_order_id, (v_cond->>'organization_id')::uuid, p_partner_id, v_uid, v_plan.id, v_choice, v_cond, v_req_fp, COALESCE(v_rows,'[]'::jsonb),\n"
              "    CASE WHEN v_quote THEN NULL ELSE v_net END, CASE WHEN v_quote THEN NULL ELSE v_interest END, CASE WHEN v_quote THEN NULL ELSE v_final END,\n"
              "    v_quote, v_terms_id, v_hash, v_cond->>'payment_method_name', current_date, (v_cond->>'version')::int, v_cond->>'method');\n"
              "  v_result := v_result || jsonb_build_object('payment_condition_contract', 'B2B_PAYMENT_CONDITION_V1', 'payment_choice', v_choice,\n"
              "    'payment_condition', jsonb_build_object('payment_method_name', v_cond->>'payment_method_name', 'installment_count', v_installments,\n"
              "       'monthly_rate', (v_cond->>'monthly_rate')::numeric, 'deadline_days', (v_cond->>'deadline_days')::int, 'due_basis','nf_issue','estimated',true),\n"
              "    'schedule', COALESCE(v_rows, '[]'::jsonb), 'installment_count', v_installments, 'first_due_date', v_first_due);\n"
              "  INSERT INTO public.partner_order_idempotency(\n", "C13 snapshot + ACK")
    return s + ";\n"


def build_sim():
    s = live("sim")
    first = s.split("\n", 1)[0]
    s = delta(s, first, "CREATE OR REPLACE FUNCTION public.simulate_b2b_payment_condition_secure(p_partner_id uuid, p_payment_plan_id uuid, "
              "p_items jsonb, p_payment_choice jsonb)", "S0 assinatura")
    s = delta(s, "  v_due_i date; v_quote boolean; i integer;\n",
              "  v_due_i date; v_quote boolean; i integer;\n  p_first_due_date date := NULL; v_choice jsonb; v_cond jsonb; v_rows jsonb;\n", "S1 declarações")
    s = delta(s, "  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;\n",
              "  IF v_plan.discount_percent > 40 AND NOT v_is_admin THEN RAISE EXCEPTION 'discount_exceeds_limit'; END IF;\n"
              "  v_choice := platform_private.b2b_choice(p_payment_choice);\n"
              "  v_cond := platform_private.b2b_resolve_condition(p_partner_id, v_plan.id, v_choice, false);\n", "S2 resolve")
    s = delta(s, "  BEGIN\n    v_credit := public.fn_b2b_credit_exposure(p_partner_id, v_final, NULL);\n",
              "  BEGIN\n    v_credit := platform_private.b2b_credit_checked(p_partner_id, v_final, NULL); -- b2bcond: crédito nunca vira NULL silencioso\n", "S3a crédito íntegro")
    s = delta(s, "  EXCEPTION WHEN OTHERS THEN v_credit := NULL; END;\n",
              "  END; -- b2bcond: erro transitório ou cálculo inválido ABORTA; UI informa indisponibilidade\n", "S3b sem EXCEPTION OTHERS")
    s = delta(s, "  v_interest := ROUND(v_final - v_net, 2);\n",
              "  v_installments := (v_cond->>'installment_count')::integer;\n" + SCHED + "  v_interest := ROUND(v_final - v_net, 2);\n", "S3 total pelas parcelas")
    s = delta(s, "  v_first_due := COALESCE(p_first_due_date, current_date + v_plan.max_days);\n",
              "  v_first_due := COALESCE((v_rows->0->>'due_date')::date, current_date + (v_cond->>'deadline_days')::integer);\n", "S4 vencimento estimado")
    s = delta(s, "  v_installments := GREATEST(COALESCE(v_plan.installment_count,1), 1);\n", "", "S5 parcelas do plano removidas")
    s = block(s, "  ELSIF v_installments = 1 THEN\n", "    END LOOP;\n  END IF;\n",
              "  ELSE\n    v_schedule := COALESCE(v_rows, '[]'::jsonb);\n  END IF;\n", "S6 cronograma = parcelas")
    s = delta(s, "    'cart_hash', public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final),\n",
              "    'cart_hash', platform_private.b2b_condition_hash(public.fn_b2b_cart_hash(p_partner_id, p_payment_plan_id, v_cart, v_final), v_choice, v_cond, v_final),\n", "S7 hash")
    s = delta(s, "      'monthly_interest_percent', v_plan.monthly_interest_percent,\n", "      'monthly_interest_percent', (v_cond->>'monthly_rate')::numeric,\n", "S8 taxa da versão")
    s = delta(s, "      'months_count', v_plan.months_count,\n", "      'months_count', v_installments,\n", "S9 meses = parcelas")
    s = delta(s, "    'warnings', v_warnings);\n",
              "    'warnings', v_warnings,\n    'payment_condition_contract', 'B2B_PAYMENT_CONDITION_V1', 'payment_choice', v_choice,\n"
              "    'payment_condition', jsonb_build_object('payment_method_name', v_cond->>'payment_method_name', 'installment_count', v_installments,\n"
              "       'monthly_rate', (v_cond->>'monthly_rate')::numeric, 'deadline_days', (v_cond->>'deadline_days')::int, 'due_basis','nf_issue','estimated',true),\n"
              "    'installment_count', v_installments, 'schedule_estimated', true, 'due_basis', 'nf_issue', 'estimated_reference_date', current_date);\n", "S10 resposta")
    return s + ";\n"


DENY_SIGS = {
    "publish": "public.b2b_payment_condition_publish(p_plan_id uuid, p_method text, p_payment_method_id uuid, p_category_id uuid, p_deadline_days integer, p_installment_count integer, p_monthly_rate numeric, p_expected_version integer)",
    "retire": "public.b2b_payment_condition_retire(p_plan_id uuid, p_method text, p_expected_version integer)",
    "assign": "public.b2b_payment_condition_assign(p_partner_id uuid, p_plan_id uuid, p_method text, p_version integer, p_enabled boolean)",
    "activation": "public.b2b_payment_condition_activation_set(p_mode text, p_pilot_partner_ids uuid[], p_expected_version integer)",
    "list": "public.b2b_payment_condition_config_list()",
    "options": "public.b2b_list_payment_condition_options_secure(p_partner_id uuid, p_payment_plan_id uuid)",
    "sim": "public.simulate_b2b_payment_condition_secure(p_partner_id uuid, p_payment_plan_id uuid, p_items jsonb, p_payment_choice jsonb)",
    "create": "public.create_partner_order_condition_secure(p_partner_id uuid, p_observacoes text, p_items jsonb, p_requested_delivery_date date, p_payment_plan_id uuid, p_expected_cart_hash text, p_idempotency_key text, p_payment_choice jsonb)",
    "read": "public.get_partner_order_payment_condition_secure(p_order_id uuid)",
}
DENY_TMPL = """CREATE OR REPLACE FUNCTION {sig}
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
BEGIN
  RAISE EXCEPTION 'b2b_payment_condition_rolled_back' USING ERRCODE='42501';
END $function$;
"""


def pins_block(label, pins, cols):
    s = ""
    for k, v in pins.items():
        s += f"  IF to_regprocedure('{k}') IS NULL OR md5(pg_get_functiondef('{k}'::regprocedure)) <> '{v}' THEN RAISE EXCEPTION '{label}: {k} divergente'; END IF;\n"
    s += "".join(f"  IF (SELECT md5(string_agg(column_name||':'||data_type, ',' ORDER BY ordinal_position)) FROM information_schema.columns "
                 f"WHERE table_schema='public' AND table_name='{t}') IS DISTINCT FROM '{v}' THEN RAISE EXCEPTION '{label}: colunas de {t} divergentes'; END IF;\n"
                 for t, v in cols.items())
    s += (f"  IF to_regclass('public.financial_categories') IS NULL OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' "
          f"AND table_name='financial_categories' AND column_name IN ('id','type','active','name')) <> 4 THEN RAISE EXCEPTION '{label}: financial_categories divergente'; END IF;\n")
    return s


def acl_block(label, deny=False):
    s = ""
    for sig in PUB.values():
        s += (f"  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid='{sig}'::regprocedure "
              f"AND a.privilege_type='EXECUTE' AND a.grantee IN (0, 'anon'::regrole::oid{', ' + chr(39) + 'authenticated' + chr(39) + '::regrole::oid' if deny else ''})) "
              f"THEN RAISE EXCEPTION '{label}: EXECUTE indevido em {sig}'; END IF;\n")
        if not deny:
            s += f"  IF NOT has_function_privilege('authenticated', '{sig}', 'EXECUTE') THEN RAISE EXCEPTION '{label}: authenticated sem EXECUTE em {sig}'; END IF;\n"
    for sig in PRIV:
        s += (f"  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE p.oid='{sig}'::regprocedure "
              f"AND a.privilege_type='EXECUTE' AND a.grantee IN (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid, 'service_role'::regrole::oid)) THEN RAISE EXCEPTION '{label}: helper privado exposto {sig}'; END IF;\n")
    for t in TABLES:
        s += (f"  IF has_table_privilege('authenticated', 'platform_private.{t}', 'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('anon', 'platform_private.{t}', 'SELECT') "
              f"OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='platform_private.{t}'::regclass) THEN RAISE EXCEPTION '{label}: tabela {t} exposta'; END IF;\n")
    s += (f"  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_orders'::regclass AND tgname='b2b_payment_condition_required' AND tgdeferrable AND tginitdeferred AND tgenabled='O') "
          f"THEN RAISE EXCEPTION '{label}: trigger de exigência ausente'; END IF;\n")
    return s


def fn_pins(label, md):
    return "".join(f"  IF to_regprocedure('{sig}') IS NULL OR md5(pg_get_functiondef('{sig}'::regprocedure)) <> '{md[k]}' THEN RAISE EXCEPTION '{label}: {sig} divergente'; END IF;\n"
                   for k, sig in PUB.items())


ABSENT = ("  IF to_regclass('platform_private.b2b_condition_versions') IS NOT NULL OR to_regclass('platform_private.b2b_condition_activation') IS NOT NULL"
          " OR to_regprocedure('public.create_partner_order_condition_secure(uuid,text,jsonb,date,uuid,text,text,jsonb)') IS NOT NULL"
          " OR to_regclass('public.b2b_payment_method_configs') IS NOT NULL"  # rev.2 superada nunca pode coexistir
          " OR to_regprocedure('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text,jsonb)') IS NOT NULL"  # create antigo da candidata
          " THEN RAISE EXCEPTION 'já instalado ou contrato concorrente presente'; END IF;\n")


def build(pins=LIVE_PINS, cols=LIVE_COLS, fn_md5=None, deny_md5=None):
    ver, asg, snap, ret, choice, res, sch = prior_objects()
    grants = "".join(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon, service_role;\nGRANT EXECUTE ON FUNCTION {s} TO authenticated;\n" for s in PUB.values())
    grants += "".join(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon, authenticated, service_role;\n" for s in PRIV)
    md = fn_md5 or {}
    pre = ("-- 01 PRE (somente leitura). Ref canônico swzpzcwiasxmjutrmvkm conferido FORA do SQL antes de rodar.\nDO $$ BEGIN\n"
           + pins_block("PRE", pins, cols) + ABSENT + "  RAISE NOTICE 'PRE_OK';\nEND $$;\n")
    inst = ("-- 02 INSTALL (REVISÁVEL; NÃO APLICAR sem autorização). B2B_PAYMENT_CONDITION_V1 rebaseado sobre create LIVE c34e7404.\n"
            "-- Não altera corpos LIVE, planos, meios, categorias, PB-001036 ou configurações; nenhuma empresa fica ativada.\n"
            "BEGIN;\nSET LOCAL lock_timeout = '3s';\nDO $$ BEGIN\n" + pins_block("INSTALL", pins, cols) + ABSENT + "END $$;\n"
            + "-- [candidata comprovada schema.sql.review sha256 b1416978…; deltas V/N/R/P declarados em generate.py]\n"
            + ver + asg + snap + ret + EXTRA + choice + "\n" + sch + "\n" + res + WRITERS + build_sim() + build_create() + grants
            + "DO $$ BEGIN\n" + pins_block("INSTALL_POST", pins, cols) + (fn_pins("INSTALL_POST", md) if md else "") + acl_block("INSTALL_POST")
            + "  IF EXISTS (SELECT 1 FROM platform_private.b2b_condition_activation) OR EXISTS (SELECT 1 FROM platform_private.b2b_condition_versions) THEN RAISE EXCEPTION 'INSTALL_POST: dados inesperados'; END IF;\n"
            + "END $$;\nCOMMIT;\n")
    post = ("-- 03 POST (somente leitura).\nDO $$ BEGIN\n" + pins_block("POST", pins, cols) + (fn_pins("POST", md) if md else "") + acl_block("POST")
            + "  RAISE NOTICE 'POST_OK';\nEND $$;\n")
    deny = "".join(DENY_TMPL.format(sig=s) for s in DENY_SIGS.values())
    revoke = "".join(f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC, anon, authenticated, service_role;\n" for s in PUB.values())
    rb = ("-- 04 ROLLBACK deny-only: RPCs novos passam a negar; gatilho, ativações, versões, snapshots e histórico PERMANECEM.\n"
          "-- Empresas não ativadas seguem o contrato atual; empresas já ativadas ficam bloqueadas (nega, nunca reabre fallback).\n"
          "BEGIN;\nDO $$ BEGIN\n" + (fn_pins("ROLLBACK", md) if md else "") + "END $$;\n" + deny + revoke
          + "DO $$ BEGIN\n" + (fn_pins("ROLLBACK_POST", deny_md5) if deny_md5 else "") + acl_block("ROLLBACK_POST", deny=True) + "END $$;\nCOMMIT;\n")
    return {"01-pre.sql.readonly": pre, "02-install.sql.review": inst, "03-post.sql.readonly": post, "04-rollback-deny.sql.review": rb}


if __name__ == "__main__":
    p = HERE / "fn-md5.json"
    fm = json.loads(p.read_text()) if p.exists() else {}
    files = build(fn_md5=fm.get("install"), deny_md5=fm.get("deny"))
    for n, t in files.items(): (HERE / n).write_text(t)
    meta = {n: hashlib.md5(t.encode()).hexdigest() for n, t in files.items()}
    meta["prior_schema_sha256"] = PRIOR_PINS["schema.sql.review"]
    (HERE / "generated-md5.json").write_text(json.dumps(meta, indent=2) + "\n"); print(json.dumps(meta, indent=2))
