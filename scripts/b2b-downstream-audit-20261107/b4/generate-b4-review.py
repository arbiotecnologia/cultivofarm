#!/usr/bin/env python3
"""Revisão 458b6012: manifesto/guards completos do B4, sempre local e inativo.

Não consulta banco. Reutiliza o corpo B4 gerado e as capturas canônicas já existentes.
Ausência de baseline LIVE/capturada é um bloqueio explícito, nunca uma autorização para
presumir que um candidato histórico seja o estado de produção.
"""
import hashlib
import importlib.util
import json
import pathlib
import re

H = pathlib.Path(__file__).resolve().parent
ROOT = H.parents[2]
CAPTURE = ROOT / "scripts/delivery-atomic-hardening-20261030/capture/current.json"
MONEY = ROOT / "scripts/financial-installments-initial-20261024/receivable-semantics-live-20261028.json"
HISTORICAL = H / "review-458b6012/historical-63/b4-candidate.sql.review"
EXPECTED_HISTORICAL_SHA256 = "f51d3ea73838d1b5bd8ed0ad82c30bb174a52f993e389913926182ff6dafc894"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


G = load("b4_base_generator", H / "generate-b4.py")
CAP = json.loads(CAPTURE.read_text())
FIN = json.loads(MONEY.read_text())
if CAPTURE and FIN.get("ref") != "swzpzcwiasxmjutrmvkm":
    raise SystemExit("B4_CAPTURE_REF_DRIFT")
if hashlib.sha256(HISTORICAL.read_bytes()).hexdigest() != EXPECTED_HISTORICAL_SHA256:
    raise SystemExit("B4_HISTORICAL_CANDIDATE_DRIFT")

SIGS = {
    "platform_private.price_immutable": "platform_private.price_immutable()",
    "platform_private.price_calendar_load": "platform_private.price_calendar_load(text,text)",
    "platform_private.price_pinned_calendar": "platform_private.price_pinned_calendar()",
    "platform_private.price_adjusted_due": "platform_private.price_adjusted_due(date,platform_private.holiday_calendars)",
    "platform_private.b2b_integration_dependencies": "platform_private.b2b_integration_dependencies()",
    "platform_private.b2b_integration_actor": "platform_private.b2b_integration_actor(uuid,boolean)",
    "platform_private.b4_schedule_from_nf": "platform_private.b4_schedule_from_nf(numeric,numeric,integer,date,integer,platform_private.holiday_calendars)",
    "platform_private.b2b_credit_config_block": "platform_private.b2b_credit_config_block(uuid)",
    "platform_private.b2b_debtor_partner": "platform_private.b2b_debtor_partner(uuid,uuid)",
    "platform_private.b2b_shared_receivable_credit_guard": "platform_private.b2b_shared_receivable_credit_guard()",
    "platform_private.b4_assert_order_eligible": "platform_private.b4_assert_order_eligible(uuid)",
    "platform_private.b2b_legacy_money_row": "platform_private.b2b_legacy_money_row(uuid)",
    "platform_private.b2b_allocation_money_row": "platform_private.b2b_allocation_money_row(uuid)",
    "platform_private.b2b_proven_money_row": "platform_private.b2b_proven_money_row(uuid)",
    "public.rpc_receivable_money_projection_v1": "public.rpc_receivable_money_projection_v1(uuid,integer,integer)",
    "platform_private.b2b_order_residual": "platform_private.b2b_order_residual(uuid)",
    "platform_private.b2b_credit_balances": "platform_private.b2b_credit_balances(uuid,uuid)",
    "platform_private.b2b_allocate_document": "platform_private.b2b_allocate_document(uuid)",
    "platform_private.b2b_reverse_allocation": "platform_private.b2b_reverse_allocation(uuid,uuid)",
    "public.fn_b2b_credit_exposure": "public.fn_b2b_credit_exposure(uuid,numeric,uuid)",
    "public.rpc_register_receivable_payment": "public.rpc_register_receivable_payment(uuid,jsonb)",
    "public.fn_generate_receivable_installments": "public.fn_generate_receivable_installments()",
    "platform_private.b2b_title_insert_fence": "platform_private.b2b_title_insert_fence()",
    "platform_private.b2b_cancellation_fence": "platform_private.b2b_cancellation_fence()",
    "public.tg_auto_b2b_receivable": "public.tg_auto_b2b_receivable()",
    "public.generate_b2b_receivable_secure_impl": "public.generate_b2b_receivable_secure_impl(uuid)",
}
REPLACED = {
    "public.fn_b2b_credit_exposure",
    "public.rpc_register_receivable_payment",
    "public.fn_generate_receivable_installments",
    "public.rpc_receivable_money_projection_v1",
    "public.generate_b2b_receivable_secure_impl",
    "public.tg_auto_b2b_receivable",
}
NEW_TABLES = [
    "platform_private.holiday_calendars", "platform_private.price_schedule_snapshots",
    "platform_private.b2b_authorized_documents", "platform_private.b2b_document_allocations",
    "platform_private.b2b_allocation_reversals", "platform_private.b2b_title_permits",
    "platform_private.b2b_cancellation_attestations",
]
NEW_VIEW = "platform_private.b4_order_condition_snapshots"
NEW_INDEX = "public.b2b_one_title_per_document"
REPLACED_INDEX = "public.ux_ar_one_active_per_b2b_order"
NEW_TRIGGERS = {
    "price_calendar_immutable": "platform_private.holiday_calendars",
    "price_calendar_no_truncate": "platform_private.holiday_calendars",
    "price_snapshot_immutable": "platform_private.price_schedule_snapshots",
    "price_snapshot_no_truncate": "platform_private.price_schedule_snapshots",
    "immutable_update_delete": "platform_private.b2b_authorized_documents|platform_private.b2b_document_allocations|platform_private.b2b_allocation_reversals|platform_private.b2b_cancellation_attestations",
    "immutable_truncate": "platform_private.b2b_authorized_documents|platform_private.b2b_document_allocations|platform_private.b2b_allocation_reversals|platform_private.b2b_cancellation_attestations",
    "zz_b2b_shared_credit_guard": "public.accounts_receivable",
    "a01_b2b_fiscal_title_fence": "public.accounts_receivable",
    "a01_b2b_fiscal_title_identity": "public.accounts_receivable",
    "cancellation_scope_lock": "platform_private.b2b_cancellation_attestations",
}


def sha_text(text):
    return hashlib.sha256(text.encode()).hexdigest()


def md5_text(text):
    return hashlib.md5(text.encode()).hexdigest()


def acl_entries(acl, kind):
    if not (isinstance(acl, str) and acl.startswith("{") and acl.endswith("}")):
        raise SystemExit(f"BASELINE_ACL_MISSING {kind} {acl}")
    rights = {"X": ["EXECUTE"]} if kind == "f" else None
    if rights is None:
        rights = {"r": ["SELECT"], "a": ["INSERT"], "w": ["UPDATE"], "d": ["DELETE"],
                  "D": ["TRUNCATE"], "x": ["REFERENCES"], "t": ["TRIGGER"], "m": ["MAINTAIN"]}
    result = []
    for raw in acl[1:-1].split(","):
        grantee, right = raw.split("=", 1)
        privilege, grantor = right.split("/", 1)
        grantable = privilege.endswith("*")
        privilege = privilege.rstrip("*")
        if kind == "f":
            privileges = rights.get(privilege)
        else:
            privileges = [p for char in privilege for p in rights[char]]
        if not privileges:
            raise SystemExit(f"BASELINE_ACL_UNKNOWN {kind} {acl}")
        for item in privileges:
            result.append(f"{grantee or 'PUBLIC'}={item}{'*' if grantable else ''}/{grantor}")
    return sorted(result)


def acl_md5(acl, kind):
    return md5_text("|".join(acl_entries(acl, kind)))


def rows_digest(rows, fields):
    text = "^".join("|".join(str(row.get(field) or "") for field in fields) for row in rows)
    return md5_text(text)


def function_sources(body):
    found = {}
    pattern = re.compile(r"CREATE (?:OR REPLACE )?FUNCTION\s+([\w.]+)\s*\(", re.I)
    for match in pattern.finditer(body):
        name = match.group(1)
        tag = re.search(r"\bAS\s+(\$(?:function)?\$)", body[match.end():], re.I | re.S)
        if not tag:
            raise SystemExit(f"B4_FUNCTION_TAG_MISSING {name}")
        open_at = match.end() + tag.end(1)
        close_at = body.index(tag.group(1), open_at)
        end = close_at + len(tag.group(1))
        if end < len(body) and body[end] == ";":
            end += 1
        text = body[match.start():end]
        found[name] = text  # a última definição é a efetiva; duplicatas ficam explícitas no manifesto.
    if set(found) != set(SIGS):
        raise SystemExit(f"B4_FUNCTION_INVENTORY_DRIFT missing={set(SIGS)-set(found)} extra={set(found)-set(SIGS)}")
    return found


def baseline_function(name):
    sig = SIGS[name]
    short = sig.split("(", 1)[0].split(".")[-1]
    capture_rows = [x for x in CAP["functions"] if x["name"] == short]
    money_rows = [x for x in FIN["functions"] if x["signature"].split("(", 1)[0] == short]
    row = None
    source = None
    if money_rows:
        if len(money_rows) != 1:
            raise SystemExit(f"B4_MONEY_BASELINE_AMBIGUOUS {sig}")
        row = money_rows[0]
        source = str(MONEY.relative_to(ROOT)) + "#" + row["signature"]
    elif capture_rows:
        if len(capture_rows) != 1:
            raise SystemExit(f"B4_CAPTURE_BASELINE_AMBIGUOUS {sig}")
        row = capture_rows[0]
        source = str(CAPTURE.relative_to(ROOT)) + "#" + row["signature"]
    if row is None:
        return {"status": "MISSING_BLOCKS_INSTALL", "source": None, "body_md5": None, "owner": None, "acl": None}
    return {"status": "CAPTURED_REQUIRES_LIVE_RECHECK", "source": source,
            "body_md5": md5_text(row["body"]), "owner": row.get("owner"), "acl": row.get("acl")}


def function_guard(rows, code):
    values = []
    for sig, meta in rows:
        values.append(f"('{sig}','{meta['body_md5']}','{meta['owner']}','{acl_md5(meta['acl'], 'f')}')")
    return f"""DO $guard$ DECLARE d record; BEGIN
 FOR d IN SELECT * FROM (VALUES {','.join(values)}) x(sig,body_md5,owner,acl_md5) LOOP
  IF to_regprocedure(d.sig) IS NULL THEN RAISE EXCEPTION '{code}_MISSING:%',d.sig USING ERRCODE='42501'; END IF;
  IF md5(pg_get_functiondef(d.sig::regprocedure)) IS DISTINCT FROM d.body_md5 THEN RAISE EXCEPTION '{code}_BODY:%',d.sig USING ERRCODE='42501'; END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=d.sig::regprocedure) IS DISTINCT FROM d.owner THEN RAISE EXCEPTION '{code}_OWNER:%',d.sig USING ERRCODE='42501'; END IF;
  IF (SELECT md5(string_agg(v.entry,'|' ORDER BY v.entry)) FROM (
    SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END||'='||a.privilege_type||CASE WHEN a.is_grantable THEN '*' ELSE '' END||'/'||a.grantor::regrole::text entry
    FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=d.sig::regprocedure) v) IS DISTINCT FROM d.acl_md5
  THEN RAISE EXCEPTION '{code}_ACL:%',d.sig USING ERRCODE='42501'; END IF;
 END LOOP;
END $guard$;"""


def owner_only_function_guard(sigs, code):
    values = ",".join(f"('{sig}','{SIGS[[n for n in SIGS if SIGS[n] == sig][0]] if False else ''}')" for sig in [])
    entries = ",".join(f"('{sig}')" for sig in sigs)
    return f"""DO $guard$ DECLARE d record; BEGIN
 FOR d IN SELECT * FROM (VALUES {entries}) x(sig) LOOP
  IF to_regprocedure(d.sig) IS NULL THEN RAISE EXCEPTION '{code}_MISSING:%',d.sig USING ERRCODE='42501'; END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=d.sig::regprocedure)<>'postgres' THEN RAISE EXCEPTION '{code}_OWNER:%',d.sig USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=d.sig::regprocedure AND a.grantee<>p.proowner)
  THEN RAISE EXCEPTION '{code}_ACL:%',d.sig USING ERRCODE='42501'; END IF;
 END LOOP;
END $guard$;"""


def relation_acl_guard(owner, acl, code):
    digest = acl_md5(acl, "r")
    return f"""DO $guard$ BEGIN
 IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.accounts_receivable'::regclass)<>'{owner}' THEN RAISE EXCEPTION '{code}_TABLE_OWNER' USING ERRCODE='42501'; END IF;
 IF (SELECT md5(string_agg(v.entry,'|' ORDER BY v.entry)) FROM (
   SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END||'='||a.privilege_type||CASE WHEN a.is_grantable THEN '*' ELSE '' END||'/'||a.grantor::regrole::text entry
   FROM pg_class c,aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.accounts_receivable'::regclass) v)<>'{digest}'
 THEN RAISE EXCEPTION '{code}_TABLE_ACL' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.accounts_receivable'::regclass AND relrowsecurity AND NOT relforcerowsecurity) THEN RAISE EXCEPTION '{code}_TABLE_RLS' USING ERRCODE='42501'; END IF;
END $guard$;"""


def digest_guard(query, expected, code):
    return f"DO $guard$ BEGIN IF ({query}) IS DISTINCT FROM '{expected}' THEN RAISE EXCEPTION '{code}' USING ERRCODE='42501'; END IF; END $guard$;"


def absence_guard(names, kind, code):
    checks = []
    for name in names:
        if kind == "function":
            test = f"to_regprocedure('{name}') IS NOT NULL"
        else:
            test = f"to_regclass('{name}') IS NOT NULL"
        checks.append(f" IF {test} THEN RAISE EXCEPTION '{code}:{name}' USING ERRCODE='42501'; END IF;")
    for name, tables in NEW_TRIGGERS.items() if kind == "trigger" else []:
        for table in tables.split("|"):
            checks.append(f" IF to_regclass('{table}') IS NOT NULL AND EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='{name}' AND tgrelid=to_regclass('{table}') AND NOT tgisinternal) THEN RAISE EXCEPTION '{code}:{table}.{name}' USING ERRCODE='42501'; END IF;")
    return "DO $guard$ BEGIN\n" + "\n".join(checks) + "\nEND $guard$;"


def new_relation_post_guard():
    lines = []
    for relation in NEW_TABLES + [NEW_VIEW]:
        lines.append(f" IF to_regclass('{relation}') IS NULL THEN RAISE EXCEPTION 'B4_POST_RELATION_MISSING:{relation}' USING ERRCODE='42501'; END IF;")
        lines.append(f" IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='{relation}'::regclass)<>'postgres' THEN RAISE EXCEPTION 'B4_POST_RELATION_OWNER:{relation}' USING ERRCODE='42501'; END IF;")
        lines.append(f" IF EXISTS(SELECT 1 FROM pg_class c,aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='{relation}'::regclass AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'B4_POST_RELATION_ACL:{relation}' USING ERRCODE='42501'; END IF;")
    for table in NEW_TABLES:
        lines.append(f" IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='{table}'::regclass AND relrowsecurity) THEN RAISE EXCEPTION 'B4_POST_RLS:{table}' USING ERRCODE='42501'; END IF;")
    for index in [NEW_INDEX, REPLACED_INDEX]:
        lines.append(f" IF to_regclass('{index}') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid='{index}'::regclass AND indisvalid AND indisready) THEN RAISE EXCEPTION 'B4_POST_INDEX:{index}' USING ERRCODE='42501'; END IF;")
    for name, tables in NEW_TRIGGERS.items():
        for table in tables.split("|"):
            lines.append(f" IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='{name}' AND tgrelid='{table}'::regclass AND NOT tgisinternal AND tgenabled='O') THEN RAISE EXCEPTION 'B4_POST_TRIGGER:{table}.{name}' USING ERRCODE='42501'; END IF;")
    return "DO $guard$ BEGIN\n" + "\n".join(lines) + "\nEND $guard$;"


def build():
    base_files = G.build()
    body = base_files["b4-candidate.sql.review"]
    funcs = function_sources(body)
    duplicates = re.findall(r"CREATE (?:OR REPLACE )?FUNCTION\s+([\w.]+)\s*\(", body)
    duplicate_names = sorted({name for name in duplicates if duplicates.count(name) > 1})

    # Toda função nova fica owner-only. O alocador/operação não ganha EXECUTE de instalação.
    new_names = sorted(set(SIGS) - REPLACED)
    body += "\n-- Revisão 458b6012: nenhuma função nova herda EXECUTE implícito de PUBLIC.\n"
    body += "REVOKE ALL ON FUNCTION " + ",".join(SIGS[name] for name in new_names) + " FROM PUBLIC,anon,authenticated,service_role;\n"

    candidate_funcs = {}
    for name, text in funcs.items():
        canonical = G.canonical_function(text)
        candidate_funcs[name] = {"signature": SIGS[name], "body_md5": G.md5_def(canonical),
                                 "definition_sha256": sha_text(canonical),
                                 "owner": "postgres",
                                 "acl": "BASELINE_PRESERVED" if name in REPLACED else "OWNER_ONLY"}

    baselines = {name: baseline_function(name) for name in sorted(REPLACED)}
    missing = [SIGS[name] for name, meta in baselines.items() if meta["status"] == "MISSING_BLOCKS_INSTALL"]
    if missing != ["public.rpc_receivable_money_projection_v1(uuid,integer,integer)"]:
        raise SystemExit(f"B4_UNEXPECTED_BASELINE_COMPLETENESS {missing}")

    ar = next(t for t in FIN["tables"] if t["name"] == "accounts_receivable")
    ar_indexes = [x for x in FIN["indexes"] if x["table"] == "accounts_receivable"]
    ar_triggers = ar["triggers"]
    baseline_schema = {
        "source": str(MONEY.relative_to(ROOT)) + "#accounts_receivable",
        "owner": next((x.get("owner") for x in CAP.get("relations", []) if x.get("schema") == "public" and x.get("name") == "accounts_receivable"), "postgres"),
        "acl": ar["acl"], "rls": ar["rls"], "force_rls": ar["force"],
        "columns": ar["columns"], "constraints": ar["constraints"], "indexes": ar_indexes, "triggers": ar_triggers,
        "columns_md5": rows_digest(ar["columns"], ["name", "type", "default", "notnull"]),
        "constraints_md5": rows_digest(ar["constraints"], ["name", "definition"]),
        "indexes_md5": rows_digest(ar_indexes, ["name", "definition", "valid"]),
        "triggers_md5": rows_digest(ar_triggers, ["name", "definition", "enabled"]),
    }
    # Os campos Python bool precisam virar os mesmos textos t/f do SQL.
    column_query = "SELECT md5(string_agg(column_name||'|'||data_type||'|'||coalesce(column_default,'')||'|'||is_nullable,'^' ORDER BY ordinal_position)) FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts_receivable'"
    # rows_digest usa True/False; a consulta SQL produz YES/NO para is_nullable.
    baseline_schema["columns_md5"] = md5_text("^".join("|".join([c["name"], c["type"], c.get("default") or "", "NO" if c["notnull"] else "YES"]) for c in ar["columns"]))
    baseline_schema["constraints_md5"] = md5_text("^".join(f"{c['name']}|{c['definition']}" for c in ar["constraints"]))
    ar_indexes = sorted(ar_indexes, key=lambda x: x["name"])
    ar_triggers = sorted(ar_triggers, key=lambda x: x["name"])
    baseline_schema["indexes"] = ar_indexes
    baseline_schema["triggers"] = ar_triggers
    baseline_schema["indexes_md5"] = md5_text("^".join(f"{x['name']}|{x['definition']}|{'t' if x['valid'] else 'f'}" for x in ar_indexes))
    baseline_schema["triggers_md5"] = md5_text("^".join(f"{x['name']}|{x['definition']}|{x['enabled']}" for x in ar_triggers))
    constraint_query = "SELECT md5(string_agg(c.conname||'|'||pg_get_constraintdef(c.oid),'^' ORDER BY c.conname)) FROM pg_constraint c WHERE c.conrelid='public.accounts_receivable'::regclass"
    index_query = "SELECT md5(string_agg(c.relname||'|'||pg_get_indexdef(c.oid)||'|'||i.indisvalid::text,'^' ORDER BY c.relname)) FROM pg_class c JOIN pg_index i ON i.indexrelid=c.oid WHERE i.indrelid='public.accounts_receivable'::regclass"
    trigger_query = "SELECT md5(string_agg(t.tgname||'|'||pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text,'^' ORDER BY t.tgname)) FROM pg_trigger t WHERE t.tgrelid='public.accounts_receivable'::regclass AND NOT t.tgisinternal"
    post_columns = ar["columns"] + [{"name": "b2b_document_id", "type": "uuid", "default": None, "notnull": False}]
    post_columns_md5 = md5_text("^".join("|".join([c["name"], c["type"], c.get("default") or "", "NO" if c["notnull"] else "YES"]) for c in post_columns))
    post_constraints = sorted(ar["constraints"] + [{"name": "accounts_receivable_b2b_document_id_fkey", "definition": "FOREIGN KEY (b2b_document_id) REFERENCES platform_private.b2b_authorized_documents(id)"}], key=lambda x: x["name"])
    post_constraints_md5 = md5_text("^".join(f"{c['name']}|{c['definition']}" for c in post_constraints))
    updated_ux = "CREATE UNIQUE INDEX ux_ar_one_active_per_b2b_order ON public.accounts_receivable USING btree (origin_id) WHERE ((origin_type = 'B2B_ORDER'::text) AND (status <> 'CANCELED'::text) AND (b2b_document_id IS NULL))"
    post_indexes = sorted([x for x in ar_indexes if x["name"] != "ux_ar_one_active_per_b2b_order"] + [
        {"name": "ux_ar_one_active_per_b2b_order", "definition": updated_ux, "valid": True},
        {"name": "b2b_one_title_per_document", "definition": "CREATE UNIQUE INDEX b2b_one_title_per_document ON public.accounts_receivable USING btree (b2b_document_id) WHERE (b2b_document_id IS NOT NULL)", "valid": True},
    ], key=lambda x: x["name"])
    post_indexes_md5 = md5_text("^".join(f"{x['name']}|{x['definition']}|{'t' if x['valid'] else 'f'}" for x in post_indexes))
    post_ar_triggers = sorted(ar_triggers + [
        {"name": name, "definition": definition, "enabled": "O"}
        for name, definition in [
            ("a01_b2b_fiscal_title_fence", "CREATE TRIGGER a01_b2b_fiscal_title_fence BEFORE INSERT ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_title_insert_fence()"),
            ("a01_b2b_fiscal_title_identity", "CREATE TRIGGER a01_b2b_fiscal_title_identity BEFORE UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_title_insert_fence()"),
            ("zz_b2b_shared_credit_guard", "CREATE TRIGGER zz_b2b_shared_credit_guard BEFORE INSERT ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_shared_receivable_credit_guard()"),
        ]
    ], key=lambda x: x["name"])
    post_triggers_md5 = md5_text("^".join(f"{x['name']}|{x['definition']}|{x['enabled']}" for x in post_ar_triggers))
    auto_triggers = sorted([x for x in CAP["triggers"] if "tg_auto_b2b_receivable" in x.get("definition", "")], key=lambda x: (x["schema"], x["table"], x["name"]))

    pre = "-- READONLY. Revisão 458b6012; capturas locais canônicas exigem conferência LIVE.\n"
    pre += base_files["01-pre.sql.readonly"].replace("SELECT 'PRE_OK' AS status;", "")
    captured_baselines = [(SIGS[name], meta) for name, meta in baselines.items() if meta["status"] == "CAPTURED_REQUIRES_LIVE_RECHECK"]
    pre += function_guard(captured_baselines, "B4_PRE_SHARED")
    pre += relation_acl_guard(baseline_schema["owner"], ar["acl"], "B4_PRE")
    for query, expected, code in [(column_query, baseline_schema["columns_md5"], "B4_PRE_COLUMNS"),
                                  (constraint_query, baseline_schema["constraints_md5"], "B4_PRE_CONSTRAINTS"),
                                  (index_query, baseline_schema["indexes_md5"], "B4_PRE_INDEXES"),
                                  (trigger_query, baseline_schema["triggers_md5"], "B4_PRE_TRIGGERS")]:
        pre += digest_guard(query, expected, code)
    pre += absence_guard([SIGS[name] for name in new_names], "function", "B4_PRE_UNEXPECTED_EXISTING_FUNCTION")
    pre += absence_guard(NEW_TABLES + [NEW_VIEW, NEW_INDEX], "relation", "B4_PRE_UNEXPECTED_EXISTING_RELATION")
    pre += absence_guard([], "trigger", "B4_PRE_UNEXPECTED_EXISTING_TRIGGER")
    pre += "DO $guard$ BEGIN\n IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts_receivable' AND column_name='b2b_document_id') THEN RAISE EXCEPTION 'B4_PRE_UNEXPECTED_COLUMN' USING ERRCODE='42501'; END IF;\nEND $guard$;"
    for trigger in auto_triggers:
        expected = md5_text(trigger["definition"] + "|" + trigger["enabled"])
        query = f"SELECT md5(pg_get_triggerdef(t.oid)||'|'||t.tgenabled::text) FROM pg_trigger t WHERE t.tgname='{trigger['name']}' AND t.tgrelid='{trigger['schema']}.{trigger['table']}'::regclass AND NOT t.tgisinternal"
        pre += digest_guard(query, expected, "B4_PRE_AUTO_TRIGGER:" + trigger["name"])
    pre += "DO $guard$ BEGIN\n RAISE EXCEPTION 'B4_BASELINE_CAPTURE_REQUIRED:public.rpc_receivable_money_projection_v1(uuid,integer,integer)' USING ERRCODE='42501';\nEND $guard$;\nSELECT 'PRE_OK' AS status;\n"

    post = "-- READONLY. Só pode passar depois que a baseline ausente for capturada e o PRE revisto.\n"
    post += function_guard([(SIGS[name], {**baselines[name], "body_md5": candidate_funcs[name]["body_md5"]})
                            for name in sorted(REPLACED) if baselines[name]["status"] == "CAPTURED_REQUIRES_LIVE_RECHECK" and name not in {"public.generate_b2b_receivable_secure_impl", "public.tg_auto_b2b_receivable"}], "B4_POST_SHARED")
    owner_only = [SIGS[name] for name in new_names] + [SIGS["public.rpc_receivable_money_projection_v1"], SIGS["public.generate_b2b_receivable_secure_impl"], SIGS["public.tg_auto_b2b_receivable"]]
    post += owner_only_function_guard(owner_only, "B4_POST")
    # Corpos das funções owner-only também são pinados, sem exigir uma ACL inexistente.
    for name in new_names:
        post += digest_guard(f"SELECT md5(pg_get_functiondef('{SIGS[name]}'::regprocedure))", candidate_funcs[name]["body_md5"], "B4_POST_BODY:" + SIGS[name])
    post += relation_acl_guard(baseline_schema["owner"], ar["acl"], "B4_POST")
    post += new_relation_post_guard()
    post += "SELECT 'POST_OK' AS status;\n"

    install = "-- CANDIDATO B4 INATIVO/BLOQUEADO; não aplicar. Instalação não habilita operação fiscal/contábil.\nBEGIN;\nSET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='60s';\n"
    install += pre.replace("SELECT 'PRE_OK' AS status;", "") + "\n" + body + "\n" + post.replace("SELECT 'POST_OK' AS status;", "") + "\nCOMMIT;\n"
    rollback = "-- DENY-ONLY; preserva todo histórico e mantém a operação fechada. Exige POST íntegro.\nBEGIN;\nSET LOCAL lock_timeout='3s';\n"
    rollback += post.replace("SELECT 'POST_OK' AS status;", "")
    rollback += "REVOKE EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) FROM PUBLIC,anon,authenticated;\nREVOKE EXECUTE ON FUNCTION public.rpc_receivable_money_projection_v1(uuid,integer,integer) FROM PUBLIC,anon,authenticated;\nCOMMIT;\n"

    entries = []
    for name in sorted(SIGS):
        entries.append({"kind": "function", "object": SIGS[name], "operation": "REPLACE" if name in REPLACED else "CREATE",
                        "baseline": baselines.get(name, {"status": "ABSENCE_REQUIRED"}), "candidate": candidate_funcs[name]})
    for table in NEW_TABLES:
        entries.append({"kind": "table", "object": table, "operation": "CREATE_WITH_RLS_OWNER_ONLY", "baseline": {"status": "ABSENCE_REQUIRED"}, "candidate": {"owner": "postgres", "acl": "OWNER_ONLY", "rls": True}})
    entries.extend([
        {"kind": "view", "object": NEW_VIEW, "operation": "CREATE_OWNER_ONLY", "baseline": {"status": "ABSENCE_REQUIRED"}, "candidate": {"owner": "postgres", "acl": "OWNER_ONLY"}},
        {"kind": "column+foreign_key", "object": "public.accounts_receivable.b2b_document_id", "operation": "ADD", "baseline": {"status": "ABSENCE_REQUIRED", "table_schema": baseline_schema}, "candidate": {"type": "uuid", "nullable": True, "references": "platform_private.b2b_authorized_documents(id)"}},
        {"kind": "index", "object": NEW_INDEX, "operation": "CREATE", "baseline": {"status": "ABSENCE_REQUIRED"}, "candidate": {"unique": True, "valid": True}},
        {"kind": "index", "object": REPLACED_INDEX, "operation": "DROP_AND_RECREATE", "baseline": {"status": "CAPTURED_REQUIRES_LIVE_RECHECK", "source": str(MONEY.relative_to(ROOT)), "definition": next(x for x in ar_indexes if x["name"] == "ux_ar_one_active_per_b2b_order")}, "candidate": {"unique": True, "valid": True, "predicate_adds": "b2b_document_id IS NULL"}},
    ])
    for name, tables in NEW_TRIGGERS.items():
        for table in tables.split("|"):
            entries.append({"kind": "trigger", "object": f"{table}.{name}", "operation": "CREATE", "baseline": {"status": "ABSENCE_REQUIRED"}, "candidate": {"enabled": "O"}})
    entries.append({"kind": "trigger+shared_table", "object": "public.accounts_receivable.*", "operation": "PRESERVE_BASELINE_AND_ADD_LISTED", "baseline": baseline_schema, "candidate": {"table_acl": "UNCHANGED", "old_constraints": "UNCHANGED_PLUS_B2B_DOCUMENT_FK"}})

    manifest = {
        "review": "458b6012", "status": "INACTIVE_BLOCKED_MISSING_CAPTURED_BASELINE_NOT_APPROVED",
        "canonical_ref": "swzpzcwiasxmjutrmvkm", "hosted": "NOT_RUN",
        "historical_candidate_sha256": EXPECTED_HISTORICAL_SHA256,
        "candidate_sha256": sha_text(body), "object_count": len(entries), "objects": entries,
        "duplicate_definitions_in_historical_body": duplicate_names,
        "missing_baseline": missing,
        "operation_separation": {"installation_grants_operation": False, "b2b_integration_dependencies": "REAL_ALWAYS_DENY_RETAINED_IN_INSTALL", "test_stub_allowed_in_install": False},
        "shared_impact": "testado separadamente em PG descartável; resultado não autoriza regressão nem instalação",
        "limitations": ["capturas não são nova leitura LIVE", "POST não é prova JWT/RLS/PostgREST/Storage", "63/63 históricos preservados separadamente e não somados"],
    }
    files = dict(base_files)
    files.update({"b4-candidate.sql.review": body, "01-pre.sql.readonly": pre, "02-install.sql.review": install,
                  "03-post.sql.readonly": post, "04-rollback-deny.sql.review": rollback,
                  "b4-object-manifest.json": json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"})
    files["SHA256SUMS"] = "".join(f"{sha_text(text)}  {name}\n" for name, text in sorted(files.items()) if name != "SHA256SUMS")
    return files


def main():
    files = build()
    for name, text in files.items():
        (H / name).write_text(text)
    print(json.dumps({"generated": len(files), "status": json.loads(files["b4-object-manifest.json"])["status"],
                      "objects": json.loads(files["b4-object-manifest.json"])["object_count"]}))


if __name__ == "__main__":
    main()
