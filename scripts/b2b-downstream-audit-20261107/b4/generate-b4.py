#!/usr/bin/env python3
"""Gera recorte B4 INATIVO sobre B3 atual. Somente fontes locais pinadas; nunca rede/hosted."""
import hashlib
import json
import pathlib
import re

H = pathlib.Path(__file__).resolve().parent
ROOT = H.parents[2]
B3 = ROOT / "scripts/b2b-payment-condition-v1-rebase-20261106"
OLD = ROOT / "scripts/financial-price-generator-20261029/integration"
PRICE = ROOT / "scripts/financial-price-generator-20261029"
CAPTURE = ROOT / "scripts/delivery-atomic-hardening-20261030/capture/current.json"
POLICY = ROOT / "scripts/financial-installments-initial-20261024/arbio-fsf-policy.draft.json"

PINS = {
    B3 / "02-install.sql.review": "7d6d8d5e8ed6b66015fcc4f6878d872855d501e28d03b1299851389855c36eab",
    B3 / "fn-md5.json": "d56be6785132a3ab43139b657c8ac4ef7b59fbef1c8253c467830be336a8cd3c",
    OLD / "schema.sql.review": "b1416978e38d792a20e05a05d88f063068b92a138d9a98d382b1df0e59c56a75",
    OLD / "origin.sql.review": "b299cdc11abbc8b1cec2e658aa5463b29485152f0d77bae05748b7e75ded947e",
    OLD / "partial.sql.review": "d44257dc9d06bbc807b4192e778e913e30c7d56a178a3d735c50cde56d8c5d05",
    OLD / "fences.sql.review": "f7d79ef0fc728273cd4708c2311a34e0ebd787c9f4475a4238ff6fe57d1544b4",
    OLD / "captured-deltas.sql.review": "153e858bba9c6594720f40a07f75572c6add7983f1041ef6f46c4276a1941f59",
    PRICE / "price-generator.sql.review": "033a01df72c4be8cd119fc8476880abb67a6340faf9610f8c5550197b2b0a03d",
    PRICE / "shared-credit-guard.sql.review": "540d47070562b86c619b87bd0950908296e38c092a546437bccd835dbf0da9d5",
    CAPTURE: "e1ac1e925f0f10f072910e66ffa183fd1fb3f2f1863061270188df64ad2dab88",
}

LIVE_MD5 = {
    "public.generate_b2b_receivable_secure(uuid)": "c49cc7ccedbcb28cba9b816b7e47c521",
    "public.generate_b2b_receivable_secure_impl(uuid)": "1bdac7fae6d702fb42d3a30539e9c9c3",
    "public.tg_auto_b2b_receivable()": "0f679538fe394924b140e54938a3bb9e",
    "public.fn_generate_receivable_from_entrega(uuid,jsonb)": "670ea34d37c4c4fd6612031ad763a3a7",
    "public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamp with time zone,text,text,uuid)": "9c94985d80502c8aea8bfb5da3abdecd",
    "public.fn_b2b_order_billing_eligibility(uuid)": "db977875e15ea49ce10fb3e5388d7dfb",
    "public.fn_b2b_credit_exposure(uuid,numeric,uuid)": "213ac31f3a30816ead75365b0d1fed18",
}
B3_PUBLIC = {
    "publish": "public.b2b_payment_condition_publish(uuid,text,uuid,uuid,integer,integer,numeric,integer)",
    "retire": "public.b2b_payment_condition_retire(uuid,text,integer)",
    "assign": "public.b2b_payment_condition_assign(uuid,uuid,text,integer,boolean)",
    "activation": "public.b2b_payment_condition_activation_set(text,uuid[],integer)",
    "list": "public.b2b_payment_condition_config_list()",
    "options": "public.b2b_list_payment_condition_options_secure(uuid,uuid)",
    "sim": "public.simulate_b2b_payment_condition_secure(uuid,uuid,jsonb,jsonb)",
    "create": "public.create_partner_order_condition_secure(uuid,text,jsonb,date,uuid,text,text,jsonb)",
    "read": "public.get_partner_order_payment_condition_secure(uuid)",
    "quote": "public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)",
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def extract(src, start, end, label):
    if src.count(start) != 1:
        raise SystemExit(f"EXTRACT {label}: início={src.count(start)}")
    a = src.index(start)
    b = src.index(end, a) + len(end)
    return src[a:b]


def delta(src, old, new, label):
    if src.count(old) != 1:
        raise SystemExit(f"DELTA {label}: ocorrências={src.count(old)}")
    return src.replace(old, new, 1)


def normalize_function(src):
    return re.sub(r"^CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", src, count=1)


def fn(src, name, label=None):
    pattern = rf"CREATE OR REPLACE FUNCTION {re.escape(name)}\(.*?\sEND;?[ \t]*\$(?:function)?\$[ \t]*(?:\n)?;"
    found = re.findall(pattern, src, re.S)
    if len(found) != 1:
        raise SystemExit(f"FUNCTION {label or name}: ocorrências={len(found)}")
    return found[0]


def canonical_function(src):
    """Serializa o cabeçalho no formato de pg_get_functiondef, sem tocar no corpo PL/pgSQL."""
    text = normalize_function(src.rstrip().removesuffix(";").rstrip())
    match = re.match(r"(CREATE OR REPLACE FUNCTION .*?)\s+RETURNS\s+(.*?)\s+LANGUAGE\s+(\w+)(.*?)\s+AS\s+(\$(?:function)?\$)(.*)\5\s*$", text, re.S)
    if not match:
        raise SystemExit("CANONICAL_FUNCTION_HEADER")
    signature, returns, language, attributes, _tag, body = match.groups()
    signature = re.sub(r",\s*", ", ", signature)
    signature = re.sub(r"\bint\b", "integer", signature)
    signature = re.sub(r"\b(uuid|text|integer|numeric|boolean|date|jsonb)(\s+DEFAULT\s+)NULL(?!::)",
                       r"\1\2NULL::\1", signature)
    header = f"{signature}\n RETURNS {returns}\n LANGUAGE {language}\n"
    function_attributes = []
    if re.search(r"\bIMMUTABLE\b", attributes):
        function_attributes.append("IMMUTABLE")
    elif re.search(r"\bSTABLE\b", attributes):
        function_attributes.append("STABLE")
    if re.search(r"\bSECURITY DEFINER\b", attributes):
        function_attributes.append("SECURITY DEFINER")
    if function_attributes:
        header += " " + " ".join(function_attributes) + "\n"
    path = re.search(r"SET search_path\s*(?:=|TO)\s*'([^']*)'", attributes)
    if path:
        header += f" SET search_path TO '{path.group(1)}'\n"
    return header + "AS $function$" + body + "$function$"


def md5_def(src):
    # md5(pg_get_functiondef(...)) inclui uma quebra de linha final.
    return hashlib.md5((src.rstrip().removesuffix(";").rstrip() + "\n").encode()).hexdigest()


def sql_literal(text):
    return "'" + text.replace("'", "''") + "'"


def assertions(pins, code):
    lines = ["DO $guard$ BEGIN"]
    for sig, md5 in pins.items():
        lines.append(f" IF md5(pg_get_functiondef('{sig}'::regprocedure))<>'{md5}' THEN RAISE EXCEPTION '{code}:{sig}'; END IF;")
    lines.append("END $guard$;")
    return "\n".join(lines) + "\n"


def build():
    for path, pin in PINS.items():
        if sha(path) != pin:
            raise SystemExit(f"SOURCE_DRIFT {path}: {sha(path)} != {pin}")
    capture = json.loads(CAPTURE.read_text())
    for sig, pin in LIVE_MD5.items():
        name = sig.split("(", 1)[0].split(".")[-1]
        matches = [f for f in capture["functions"] if f["name"] == name]
        if len(matches) != 1 or hashlib.md5(matches[0]["body"].encode()).hexdigest() != pin:
            raise SystemExit(f"CAPTURE_MD5_DRIFT {sig}")

    schema = (OLD / "schema.sql.review").read_text()
    partial = (OLD / "partial.sql.review").read_text()
    origin = (OLD / "origin.sql.review").read_text()
    old_fences = (OLD / "fences.sql.review").read_text()
    deltas = (OLD / "captured-deltas.sql.review").read_text()
    price = (PRICE / "price-generator.sql.review").read_text()
    shared = (PRICE / "shared-credit-guard.sql.review").read_text()

    # Price: somente calendário/snapshots e funções puras; nenhum writer RPC Price é restaurado.
    price_objects = []
    for table in ["holiday_calendars", "price_schedule_snapshots"]:
        price_objects.append(extract(price, f"CREATE TABLE platform_private.{table} (", "\n);\n", table))
    price_objects.append("""REVOKE ALL ON platform_private.holiday_calendars,platform_private.price_schedule_snapshots FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.holiday_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.price_schedule_snapshots ENABLE ROW LEVEL SECURITY;
""")
    price_objects.append(extract(price, "CREATE FUNCTION platform_private.price_immutable()", "END $$;\n", "price_immutable"))
    price_objects.append("""CREATE TRIGGER price_calendar_immutable BEFORE UPDATE OR DELETE ON platform_private.holiday_calendars FOR EACH ROW EXECUTE FUNCTION platform_private.price_immutable();
CREATE TRIGGER price_calendar_no_truncate BEFORE TRUNCATE ON platform_private.holiday_calendars FOR EACH STATEMENT EXECUTE FUNCTION platform_private.price_immutable();
CREATE TRIGGER price_snapshot_immutable BEFORE UPDATE OR DELETE ON platform_private.price_schedule_snapshots FOR EACH ROW EXECUTE FUNCTION platform_private.price_immutable();
CREATE TRIGGER price_snapshot_no_truncate BEFORE TRUNCATE ON platform_private.price_schedule_snapshots FOR EACH STATEMENT EXECUTE FUNCTION platform_private.price_immutable();
""")
    for name in ["price_calendar_load", "price_pinned_calendar", "price_adjusted_due"]:
        price_objects.append(extract(price, f"CREATE FUNCTION platform_private.{name}(", "END $$;\n", name))
    price_objects.append("""REVOKE ALL ON FUNCTION platform_private.price_immutable(),platform_private.price_calendar_load(text,text),platform_private.price_pinned_calendar(),platform_private.price_adjusted_due(date,platform_private.holiday_calendars) FROM PUBLIC,anon,authenticated,service_role;
""")

    policy = json.loads(POLICY.read_text())
    active = policy["active_candidate"]
    calendar_path = POLICY.parent / active["holiday_calendar_dataset"]
    calendar = json.loads(calendar_path.read_text())
    fields = calendar["integrity"]["fields"]
    canonical = json.dumps({k: calendar[k] for k in fields}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    if hashlib.sha256(canonical.encode()).hexdigest() != calendar["integrity"]["sha256"]:
        raise SystemExit("CALENDAR_SOURCE_INTEGRITY")
    calendar_sql = "SELECT platform_private.price_calendar_load(" + sql_literal(canonical) + "," + sql_literal(calendar["integrity"]["sha256"]) + ");\n"

    # Tabelas B4, sem recriar condições/snapshots B3 e sem endpoint público de ingestão fiscal.
    tables = []
    for table in ["b2b_authorized_documents", "b2b_document_allocations", "b2b_allocation_reversals", "b2b_title_permits", "b2b_cancellation_attestations"]:
        tables.append(extract(schema, f"CREATE TABLE platform_private.{table} (", "\n);\n", table))
    tables.append(extract(schema, "ALTER TABLE public.accounts_receivable ADD COLUMN b2b_document_id", "b2b_document_id IS NULL;\n", "AR document identity"))
    tables.append("""
CREATE VIEW platform_private.b4_order_condition_snapshots AS
SELECT order_id,organization_id,partner_id,actor_id,plan_id,choice,condition,request_hash,rows,principal,financed_interest,financed_total,
       quote,payment_terms_id,cart_hash,payment_method_name,estimated,due_basis,estimated_reference_date,condition_version,condition_method,created_at
FROM platform_private.b2b_order_condition_snapshots WHERE quote IS FALSE
UNION ALL
SELECT order_id,organization_id,partner_id,actor_id,plan_id,choice,condition,request_hash,rows,principal,financed_interest,financed_total,
       FALSE AS quote,payment_terms_id,cart_hash,payment_method_name,estimated,due_basis,estimated_reference_date,condition_version,condition_method,created_at
FROM platform_private.b2b_order_condition_quote_snapshots;
REVOKE ALL ON platform_private.b4_order_condition_snapshots FROM PUBLIC,anon,authenticated,service_role;
""")
    tables.append("""
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['b2b_authorized_documents','b2b_document_allocations','b2b_allocation_reversals','b2b_cancellation_attestations'] LOOP
  EXECUTE format('ALTER TABLE platform_private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON platform_private.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('CREATE TRIGGER immutable_update_delete BEFORE UPDATE OR DELETE ON platform_private.%I FOR EACH ROW EXECUTE FUNCTION platform_private.price_immutable()',t);
  EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON platform_private.%I FOR EACH STATEMENT EXECUTE FUNCTION platform_private.price_immutable()',t);
 END LOOP;
END $$;
ALTER TABLE platform_private.b2b_title_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.b2b_title_permits FROM PUBLIC,anon,authenticated,service_role;
""")
    for name in ["b2b_integration_dependencies", "b2b_integration_actor"]:
        tables.append(extract(schema, f"CREATE FUNCTION platform_private.{name}(", "END $$;\n", name))

    # Scheduler B4 exclusivo para datas finais da NF; B3 continua estimado e intacto.
    schedule = extract(schema, "CREATE FUNCTION platform_private.b2b_schedule(", "END $$;\n", "old B4 schedule")
    schedule = delta(schedule, "platform_private.b2b_schedule(principal numeric,rate numeric,n int,issue date,deadline int,cal platform_private.holiday_calendars)",
                     "platform_private.b4_schedule_from_nf(principal numeric,rate numeric,n int,issue date,deadline int,cal platform_private.holiday_calendars)", "B4 scheduler name")
    schedule = delta(schedule, "platform_private.b2b_business_day(nom,cal)", "platform_private.price_adjusted_due(nom,cal)", "B4 sealed calendar")
    schedule = normalize_function(schedule)

    # Crédito/pagamento/gerador/shared guard extraídos SEM os overloads create/simulate históricos.
    credit = fn(deltas, "public.fn_b2b_credit_exposure")
    origin = delta(origin, "row:=platform_private.b2b_proven_money_row(i.id);",
                   "row:=platform_private.b2b_proven_money_row_internal(i.id,org);",
                   "seller-scoped internal money proof")
    payment = fn(deltas, "public.rpc_register_receivable_payment")
    # Revisão 4097d4e2: a baixa MANUAL não B2B sem parceiro conserva exatamente
    # a matemática legada. Somente origem B2B ou título que afeta parceiro exige
    # prova monetária; nenhuma proveniência é inventada para o ramo legado.
    payment = delta(payment, " v_proven jsonb;\n",
                    " v_proven jsonb; v_origin public.accounts_receivable%ROWTYPE; v_interest numeric; v_financed numeric;\n",
                    "payment origin declarations")
    payment = delta(payment,
        "  SELECT r INTO v_proven FROM jsonb_array_elements(public.rpc_receivable_money_projection_v1(v_inst.receivable_id,0,1000)) r WHERE r->>'id'=v_inst.id::text;\n  IF v_proven IS NULL THEN RAISE EXCEPTION 'MONEY_ORIGIN_UNPROVEN' USING ERRCODE='23514'; END IF;",
        """  SELECT * INTO v_origin FROM public.accounts_receivable WHERE id=v_inst.receivable_id AND organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  IF v_origin.origin_type='B2B_ORDER' OR v_origin.partner_id IS NOT NULL THEN
   SELECT r INTO v_proven FROM jsonb_array_elements(public.rpc_receivable_money_projection_v1(v_inst.receivable_id,0,1000)) r WHERE r->>'id'=v_inst.id::text;
   IF v_proven IS NULL THEN RAISE EXCEPTION 'MONEY_ORIGIN_UNPROVEN' USING ERRCODE='23514'; END IF;
   v_interest:=(v_proven->>'interest_amount')::numeric;
   v_financed:=(v_proven->>'financed_interest_amount')::numeric;
  ELSE
   -- Caminho capturado para MANUAL não B2B sem parceiro; não é prova de origem B4.
   v_interest:=v_inst.interest_amount; v_financed:=0;
  END IF;""", "partner-scoped money proof, non-B2B legacy preservation")
    payment = delta(payment,
        "v_inst.original_amount + ((v_proven->>'interest_amount')::numeric-(v_proven->>'financed_interest_amount')::numeric) + COALESCE(v_inst.penalty_amount,0)",
        "v_inst.original_amount + (v_interest-v_financed) + COALESCE(v_inst.penalty_amount,0)",
        "payment legacy/proven balance separation")
    generator = fn(deltas, "public.fn_generate_receivable_installments")
    shared_guard = fn(deltas, "platform_private.b2b_shared_receivable_credit_guard")
    config = extract(shared, "CREATE FUNCTION platform_private.b2b_credit_config_block", "END $$;\n", "credit config")
    debtor = extract(shared, "CREATE FUNCTION platform_private.b2b_debtor_partner", "END $$;\n", "debtor partner")
    shared_trigger = "CREATE TRIGGER zz_b2b_shared_credit_guard BEFORE INSERT ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_shared_receivable_credit_guard();\n"

    # Revisão 4097d4e2: crédito do comprador resolve dinheiro no tenant vendedor.
    # A projeção pública mantém ator+papel+tenant; somente o núcleo privado recebe
    # a organização já autorizada pelo integration_actor, sem grant de cliente.
    proven_block = extract(origin, "CREATE FUNCTION platform_private.b2b_proven_money_row",
                           "REVOKE ALL ON FUNCTION platform_private.b2b_proven_money_row(uuid) FROM PUBLIC,anon,authenticated,service_role;\n",
                           "actor-bound money resolver")
    proven_function = proven_block.split("REVOKE ALL ON FUNCTION", 1)[0]
    internal_money = delta(proven_function,
        "CREATE FUNCTION platform_private.b2b_proven_money_row(p_id uuid) RETURNS jsonb",
        "CREATE FUNCTION platform_private.b2b_proven_money_row_internal(p_id uuid,p_org uuid) RETURNS jsonb",
        "internal money resolver signature")
    internal_money = delta(internal_money,
        "DECLARE org uuid:=public.h15_actor_organization(); i public.accounts_receivable_installments; row jsonb; r jsonb;",
        "DECLARE org uuid:=p_org; i public.accounts_receivable_installments; row jsonb; r jsonb;",
        "internal money resolver organization")
    internal_money = delta(internal_money,
        " IF auth.uid() IS NULL OR org IS NULL OR public.is_financial_staff(auth.uid()) IS NOT TRUE THEN RAISE EXCEPTION 'MONEY_ORIGIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;",
        " IF org IS NULL THEN RAISE EXCEPTION 'MONEY_ORIGIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;",
        "internal money resolver boundary")
    actor_money = """CREATE FUNCTION platform_private.b2b_proven_money_row(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE org uuid:=public.h15_actor_organization();
BEGIN
 IF auth.uid() IS NULL OR org IS NULL OR public.is_financial_staff(auth.uid()) IS NOT TRUE THEN RAISE EXCEPTION 'MONEY_ORIGIN_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 RETURN platform_private.b2b_proven_money_row_internal(p_id,org);
END $$;
REVOKE ALL ON FUNCTION platform_private.b2b_proven_money_row(uuid),platform_private.b2b_proven_money_row_internal(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
"""
    origin = origin.replace(proven_block, internal_money + actor_money)
    origin = delta(origin,
        " org uuid:=public.h15_actor_organization(); sealed jsonb; sch jsonb; terms jsonb; audit jsonb;",
        " org uuid; sealed jsonb; sch jsonb; terms jsonb; audit jsonb;",
        "legacy money organization declaration")
    origin = delta(origin,
        " SELECT * INTO i FROM public.accounts_receivable_installments WHERE id=p_id AND organization_id=org;\n SELECT * INTO a FROM public.accounts_receivable WHERE id=i.receivable_id AND organization_id=org;",
        " SELECT * INTO i FROM public.accounts_receivable_installments WHERE id=p_id;\n org:=i.organization_id;\n SELECT * INTO a FROM public.accounts_receivable WHERE id=i.receivable_id AND organization_id=org;",
        "legacy money organization resolution")
    origin = delta(origin,
        " SELECT * INTO i FROM public.accounts_receivable_installments WHERE id=p_id AND organization_id=public.h15_actor_organization();",
        " SELECT * INTO i FROM public.accounts_receivable_installments WHERE id=p_id;",
        "allocation money organization resolution")

    # Elegibilidade canônica e gates de origem/contabilidade, revalidados depois das esperas.
    eligible = """CREATE OR REPLACE FUNCTION platform_private.b4_assert_order_eligible(p_order uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE e jsonb;
BEGIN
 IF EXISTS(SELECT 1 FROM public.partner_orders o WHERE o.id=p_order AND o.internal_origin_snapshot IS NOT NULL) THEN
  RAISE EXCEPTION 'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.partner_orders o WHERE o.id=p_order AND o.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1') THEN
  RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE='42501'; END IF;
 e:=public.fn_b2b_order_billing_eligibility(p_order);
 IF coalesce(e->>'eligible','false')<>'true' THEN
  RAISE EXCEPTION 'B2B_ORDER_NOT_BILLABLE:%',coalesce(e->>'reason_code','UNKNOWN') USING ERRCODE='PT409'; END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.b4_assert_order_eligible(uuid) FROM PUBLIC,anon,authenticated,service_role;
"""

    partial = partial.replace("s platform_private.b2b_order_condition_snapshots", "s platform_private.b4_order_condition_snapshots")
    partial = delta(partial, "SELECT * INTO s FROM platform_private.b2b_order_condition_snapshots WHERE order_id=p_order;",
                    "SELECT * INTO s FROM platform_private.b4_order_condition_snapshots WHERE order_id=p_order;", "residual effective B3 snapshot")
    partial = delta(partial, "SELECT * INTO s FROM platform_private.b2b_order_condition_snapshots WHERE order_id=d.order_id AND organization_id=org AND partner_id=d.partner_id;",
                    "SELECT * INTO s FROM platform_private.b4_order_condition_snapshots WHERE order_id=d.order_id AND organization_id=org AND partner_id=d.partner_id;", "allocation effective B3 snapshot")
    partial = delta(partial,
        "DECLARE po public.partner_orders; s platform_private.b4_order_condition_snapshots; allocated numeric; total numeric;",
        "DECLARE po public.partner_orders; s platform_private.b4_order_condition_snapshots; allocated numeric; total numeric; org uuid;",
        "residual seller organization declaration")
    partial = delta(partial,
        " SELECT * INTO po FROM public.partner_orders WHERE id=p_order;\n SELECT * INTO s FROM platform_private.b4_order_condition_snapshots WHERE order_id=p_order;",
        " SELECT * INTO po FROM public.partner_orders WHERE id=p_order;\n org:=platform_private.b2b_integration_actor(po.partner_id);\n SELECT * INTO s FROM platform_private.b4_order_condition_snapshots WHERE order_id=p_order;",
        "residual seller organization resolution")
    partial = delta(partial,
        "  PERFORM public.rpc_receivable_money_projection_v1(l.receivable_id,0,1000) FROM public.partner_order_financial_links l WHERE l.partner_order_id=p_order;",
        "  PERFORM platform_private.b2b_proven_money_row_internal(i.id,org) FROM public.partner_order_financial_links l JOIN public.accounts_receivable a ON a.id=l.receivable_id JOIN public.accounts_receivable_installments i ON i.receivable_id=a.id WHERE l.partner_order_id=p_order;",
        "residual legacy internal money proof")
    partial = delta(partial, "PERFORM 1 FROM public.partner_orders WHERE id=d.order_id FOR UPDATE;\n PERFORM platform_private.b2b_integration_actor(d.partner_id,true);",
                    "PERFORM 1 FROM public.partner_orders WHERE id=d.order_id FOR UPDATE;\n PERFORM platform_private.b2b_integration_actor(d.partner_id,true);\n PERFORM platform_private.b4_assert_order_eligible(d.order_id);", "eligibility after order lock")
    partial = delta(partial, "SELECT * INTO d FROM platform_private.b2b_authorized_documents WHERE id=p_document FOR SHARE;\n PERFORM platform_private.b2b_integration_actor(d.partner_id,true);",
                    "SELECT * INTO d FROM platform_private.b2b_authorized_documents WHERE id=p_document FOR SHARE;\n PERFORM platform_private.b2b_integration_actor(d.partner_id,true);\n PERFORM platform_private.b4_assert_order_eligible(d.order_id);", "eligibility after document wait")
    partial = delta(partial, "IF NOT FOUND OR EXISTS(SELECT 1 FROM public.partner_order_financial_links l WHERE l.partner_order_id=d.order_id) THEN RAISE EXCEPTION 'B2B_ORDER_SNAPSHOT_UNPROVEN' USING ERRCODE='23514'; END IF;",
                    "IF NOT FOUND OR s.quote IS NOT FALSE OR s.payment_terms_id IS NULL OR s.estimated IS NOT TRUE OR s.due_basis IS DISTINCT FROM 'nf_issue'\n OR EXISTS(SELECT 1 FROM public.partner_order_financial_links l WHERE l.partner_order_id=d.order_id) THEN RAISE EXCEPTION 'B2B_ORDER_SNAPSHOT_UNPROVEN' USING ERRCODE='23514'; END IF;", "B3 final snapshot validity")
    partial = delta(partial, "SELECT * INTO cal FROM platform_private.holiday_calendars WHERE version=s.condition->>'calendar_version';\n rows:=platform_private.b2b_schedule(principal,(s.condition->>'monthly_rate')::numeric,(s.condition->>'installment_count')::int,d.issue_date,(s.choice->>'payment_deadline_days')::int,cal);",
                    "cal:=platform_private.price_pinned_calendar();\n rows:=platform_private.b4_schedule_from_nf(principal,(s.condition->>'monthly_rate')::numeric,(s.condition->>'installment_count')::int,d.issue_date,(s.choice->>'payment_deadline_days')::int,cal);", "NF schedule with sealed calendar")

    # Revisão 458b6012: o documento traz quantidade/unidade comercial e tributável.
    # A alocação monetária continua em unidades do pedido; kg/g/L/ml só reconciliam
    # o conteúdo do snapshot. Peso nunca vira volume nem preço por peso.
    partial = delta(partial,
        " tid uuid:=gen_random_uuid(); rows jsonb; final numeric; cfg jsonb; cal platform_private.holiday_calendars; customer uuid; category uuid; method_id uuid; item_net numeric; item_financing numeric;",
        " tid uuid:=gen_random_uuid(); rows jsonb; final numeric; cfg jsonb; cal platform_private.holiday_calendars; customer uuid; category uuid; method_id uuid; item_net numeric; item_financing numeric;\n commercial_unit text; taxable_unit text; content_unit text; content_per_unit numeric; commercial_qty numeric; taxable_qty numeric;\n normalized_commercial numeric; normalized_taxable numeric; wholepack boolean;", "fiscal unit declarations")
    partial = delta(partial,
        """  IF jsonb_typeof(it->'quantity') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'FISCAL_ITEMS_INVALID' USING ERRCODE='23514'; END IF;
  qty:=(it->>'quantity')::numeric;
  SELECT to_jsonb(i) INTO base FROM public.partner_order_items i WHERE i.id=(it->>'item_id')::uuid AND i.order_id=d.order_id;
  IF base IS NULL OR qty<=0 OR qty::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'FISCAL_ITEMS_INVALID' USING ERRCODE='23514'; END IF;""",
        """  IF NOT (it ?& ARRAY['item_id','quantity','commercial_unit','taxable_quantity','taxable_unit']) THEN RAISE EXCEPTION 'FISCAL_UNIT_CONTRACT_REQUIRED' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(it) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(it) k WHERE k NOT IN ('item_id','quantity','commercial_unit','taxable_quantity','taxable_unit'))
   OR jsonb_typeof(it->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(it->'taxable_quantity') IS DISTINCT FROM 'number'
   OR jsonb_typeof(it->'commercial_unit') IS DISTINCT FROM 'string' OR jsonb_typeof(it->'taxable_unit') IS DISTINCT FROM 'string'
  THEN RAISE EXCEPTION 'FISCAL_ITEMS_INVALID' USING ERRCODE='23514'; END IF;
  commercial_qty:=(it->>'quantity')::numeric; taxable_qty:=(it->>'taxable_quantity')::numeric;
  commercial_unit:=upper(btrim(it->>'commercial_unit')); taxable_unit:=upper(btrim(it->>'taxable_unit'));
  SELECT to_jsonb(i) INTO base FROM public.partner_order_items i WHERE i.id=(it->>'item_id')::uuid AND i.order_id=d.order_id;
  IF base IS NULL OR commercial_qty<=0 OR taxable_qty<=0
   OR commercial_qty::text IN ('NaN','Infinity','-Infinity') OR taxable_qty::text IN ('NaN','Infinity','-Infinity')
  THEN RAISE EXCEPTION 'FISCAL_ITEMS_INVALID' USING ERRCODE='23514'; END IF;
  wholepack:=NULLIF(base->>'packaging_id_snapshot','') IS NOT NULL;
  IF wholepack THEN
   content_unit:=lower(base->>'packaging_unidade_conteudo_snapshot'); content_per_unit:=(base->>'packaging_peso_liquido_kg_snapshot')::numeric;
  ELSE
   content_unit:='ml';
   IF NULLIF(base->>'volume_ml','') IS NOT NULL AND NULLIF(base->>'volume_ml_snapshot','') IS NOT NULL
    AND (base->>'volume_ml')::numeric IS DISTINCT FROM (base->>'volume_ml_snapshot')::numeric
   THEN RAISE EXCEPTION 'FISCAL_ITEM_UNIT_SNAPSHOT_UNPROVEN' USING ERRCODE='23514'; END IF;
   content_per_unit:=coalesce(NULLIF(base->>'volume_ml','')::numeric,NULLIF(base->>'volume_ml_snapshot','')::numeric);
  END IF;
  IF content_per_unit IS NULL OR content_per_unit<=0 OR content_per_unit::text IN ('NaN','Infinity','-Infinity')
   OR content_unit NOT IN ('kg','g','ml','l') THEN RAISE EXCEPTION 'FISCAL_ITEM_UNIT_SNAPSHOT_UNPROVEN' USING ERRCODE='23514'; END IF;
  IF commercial_unit='UN' THEN
   qty:=commercial_qty; normalized_commercial:=commercial_qty*content_per_unit;
  ELSE
   normalized_commercial:=CASE commercial_unit||'>'||upper(content_unit)
    WHEN 'KG>KG' THEN commercial_qty WHEN 'KG>G' THEN commercial_qty*1000 WHEN 'G>KG' THEN commercial_qty/1000 WHEN 'G>G' THEN commercial_qty
    WHEN 'L>L' THEN commercial_qty WHEN 'L>ML' THEN commercial_qty*1000 WHEN 'ML>L' THEN commercial_qty/1000 WHEN 'ML>ML' THEN commercial_qty ELSE NULL END;
   IF normalized_commercial IS NULL THEN RAISE EXCEPTION 'FISCAL_UNIT_MISMATCH' USING ERRCODE='23514'; END IF;
   qty:=normalized_commercial/content_per_unit;
  END IF;
  IF taxable_unit='UN' THEN normalized_taxable:=taxable_qty*content_per_unit;
  ELSE normalized_taxable:=CASE taxable_unit||'>'||upper(content_unit)
   WHEN 'KG>KG' THEN taxable_qty WHEN 'KG>G' THEN taxable_qty*1000 WHEN 'G>KG' THEN taxable_qty/1000 WHEN 'G>G' THEN taxable_qty
   WHEN 'L>L' THEN taxable_qty WHEN 'L>ML' THEN taxable_qty*1000 WHEN 'ML>L' THEN taxable_qty/1000 WHEN 'ML>ML' THEN taxable_qty ELSE NULL END;
  END IF;
  IF normalized_taxable IS NULL THEN RAISE EXCEPTION 'FISCAL_UNIT_MISMATCH' USING ERRCODE='23514'; END IF;
  IF normalized_commercial IS DISTINCT FROM normalized_taxable THEN RAISE EXCEPTION 'FISCAL_QUANTITY_UNIT_DIVERGENCE' USING ERRCODE='23514'; END IF;
  IF wholepack AND qty<>trunc(qty) THEN RAISE EXCEPTION 'FISCAL_WHOLE_PACKAGE_FRACTION' USING ERRCODE='23514'; END IF;
  IF qty<=0 OR qty::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'FISCAL_ITEMS_INVALID' USING ERRCODE='23514'; END IF;""", "fiscal quantity and unit normalization")
    partial = delta(partial,
        "SELECT coalesce(sum((j->>'quantity')::numeric),0) INTO previous FROM platform_private.b2b_document_allocations a CROSS JOIN LATERAL jsonb_array_elements(a.items) j WHERE a.order_id=d.order_id AND j->>'item_id'=it->>'item_id' AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_allocation_reversals r WHERE r.document_id=a.document_id);",
        "SELECT coalesce(sum((j->>'quantity')::numeric),0) INTO previous FROM platform_private.b2b_document_allocations a CROSS JOIN LATERAL jsonb_array_elements(a.item_money) j WHERE a.order_id=d.order_id AND j->>'item_id'=it->>'item_id' AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_allocation_reversals r WHERE r.document_id=a.document_id);",
        "previous normalized order quantity, never raw fiscal content")
    partial = delta(partial,
        "accepted:=accepted||jsonb_build_array(jsonb_build_object('item_id',it->>'item_id','quantity',qty,'principal',pr,'financed_interest',intr));",
        "accepted:=accepted||jsonb_build_array(jsonb_build_object('item_id',it->>'item_id','quantity',qty,'order_quantity',qty,'normalized_quantity',normalized_commercial,'normalized_unit',content_unit,'commercial_quantity',commercial_qty,'commercial_unit',commercial_unit,'taxable_quantity',taxable_qty,'taxable_unit',taxable_unit,'whole_package',wholepack,'principal',pr,'financed_interest',intr));",
        "append-only normalized fiscal item receipt")

    # Fences B4, mas NENHUMA revogação dos create/simulate LIVE preservados pelo B3.
    fence_title = extract(old_fences, "CREATE FUNCTION platform_private.b2b_title_insert_fence()", "REVOKE ALL ON FUNCTION platform_private.b2b_cancellation_fence() FROM PUBLIC,anon,authenticated,service_role;\n", "title/cancellation fences")
    fence_legacy = extract(old_fences, "-- Approval/delivery/production", "REVOKE ALL ON FUNCTION platform_private.b2b_title_insert_fence(),public.generate_b2b_receivable_secure_impl(uuid),public.tg_auto_b2b_receivable() FROM PUBLIC,anon,authenticated,service_role;\n", "legacy writer deny")
    fence_reader = extract(old_fences, "-- Captured broad internal-own-finance reader", "REVOKE ALL ON FUNCTION platform_private.b2b_own_obligations(uuid,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;\n", "own reader closed")

    parts = price_objects + [calendar_sql] + tables + [schedule, config, debtor, eligible, origin, partial, credit, payment, generator, shared_guard, shared_trigger, fence_title, fence_legacy, fence_reader]
    body = "\n".join(parts)
    forbidden = ["create_partner_order_secure(", "simulate_b2b_payment_plan_secure(", "partner_payment_condition_capability_v1", "rpc_create_price_receivable_candidate"]
    if any(x in body for x in forbidden):
        raise SystemExit("FORBIDDEN_LEGACY_OVERLOAD_OR_WRITER")

    # Normaliza funções extraídas para o mesmo texto de pg_get_functiondef e mede os pinos candidatos.
    candidate_pins = {}
    for sig in ["public.fn_b2b_credit_exposure(uuid,numeric,uuid)", "public.rpc_register_receivable_payment(uuid,jsonb)",
                "public.generate_b2b_receivable_secure_impl(uuid)", "public.tg_auto_b2b_receivable()"]:
        name = sig.split("(", 1)[0]
        source = canonical_function(fn(body, name))
        body = body.replace(fn(body, name), source + ";", 1)
        candidate_pins[sig] = md5_def(source)
    for name in ["platform_private.b2b_allocate_document", "platform_private.b2b_order_residual", "platform_private.b4_schedule_from_nf"]:
        match = re.findall(rf"CREATE (?:OR REPLACE )?FUNCTION {re.escape(name)}\(.*?\nEND \$\$;", body, re.S)
        if len(match) != 1:
            raise SystemExit(f"CANDIDATE_PIN_FUNCTION {name}: {len(match)}")
        normalized = canonical_function(match[0])
        body = body.replace(match[0], normalized + ";", 1)
        sig = name + {"platform_private.b2b_allocate_document": "(uuid)", "platform_private.b2b_order_residual": "(uuid)",
                      "platform_private.b4_schedule_from_nf": "(numeric,numeric,integer,date,integer,platform_private.holiday_calendars)"}[name]
        candidate_pins[sig] = md5_def(normalized)

    b3_installed = json.loads((B3 / "fn-md5.json").read_text())["install"]
    b3_md5 = {B3_PUBLIC[name]: md5 for name, md5 in b3_installed.items()}
    pre_pins = {**LIVE_MD5, **b3_md5}
    pre = "-- READONLY; pinos LIVE relatados pelo auditor + B3 instalado localmente pinado.\n" + assertions(pre_pins, "B4_PRE_DRIFT") + "SELECT 'PRE_OK' AS status;\n"
    install = "-- CANDIDATO B4 INATIVO; exige revisão/PRE LIVE; nunca aplicar automaticamente.\nBEGIN;\nSET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='60s';\n" + assertions(pre_pins, "B4_INSTALL_PRE_DRIFT") + body + "\n" + assertions(candidate_pins, "B4_INSTALL_POST_DRIFT") + "COMMIT;\n"
    post = "-- READONLY.\n" + assertions(candidate_pins, "B4_POST_DRIFT") + "SELECT 'POST_OK' AS status;\n"
    rollback = "-- DENY-ONLY: preserva histórico, snapshots e fences; não restaura writers antigos.\nBEGIN;\n" + assertions(candidate_pins, "B4_ROLLBACK_DRIFT") + """
REVOKE EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_receivable_money_projection_v1(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
COMMIT;
"""
    files = {
        "b4-candidate.sql.review": body,
        "01-pre.sql.readonly": pre,
        "02-install.sql.review": install,
        "03-post.sql.readonly": post,
        "04-rollback-deny.sql.review": rollback,
    }
    metadata = {
        "kind": "INACTIVE_B4_ON_CURRENT_B3_NOT_HOSTED",
        "historical_candidate": "301bf597 relatado; não liberado e não presumido byte-equivalente",
        "sources": {str(p.relative_to(ROOT)): pin for p, pin in PINS.items()},
        "live_baseline": LIVE_MD5,
        "b3_installed_baseline": b3_md5,
        "candidate_md5": candidate_pins,
        "calendar": {"version": calendar["version"], "locality": calendar["locality"], "sha256": calendar["integrity"]["sha256"]},
        "excluded": forbidden,
        "fiscal_authorization_integration": "NOT_INSTALLED; rpc_fiscal_invoice_apply_authorization_v1 permanece service-only/PENDING e não chama gerador",
        "client_grants_added": False,
    }
    files["b4-pins.json"] = json.dumps(metadata, indent=2, ensure_ascii=False) + "\n"
    files["SHA256SUMS"] = ""
    files["SHA256SUMS"] = "".join(f"{hashlib.sha256(text.encode()).hexdigest()}  {name}\n" for name, text in sorted(files.items()) if name != "SHA256SUMS")
    return files


def main():
    for name, text in build().items():
        (H / name).write_text(text)
    print(json.dumps({"generated": len(build()), "pins": "b4-pins.json"}))


if __name__ == "__main__":
    main()
