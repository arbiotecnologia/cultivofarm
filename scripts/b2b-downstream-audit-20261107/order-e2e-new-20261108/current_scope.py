#!/usr/bin/env python3
"""Scoped LIVE PRE/POST guards for the disposable POSPLANOS composition.

Only metadata is processed. The full LIVE capture and the auditor's exact diff
replace the obsolete all-function/all-relation guard; candidate deltas are
measured from the current fresh rehearsal. No candidate body is rewritten.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

H = Path(__file__).resolve().parent
RECONCILIATION = H / "reconciliation-posplans-20261108"
CAPTURE_PATH = RECONCILIATION / "live-current-metadata-a7b973949.json"
DIFF_PATH = RECONCILIATION / "live-pre-drift-411cbbc.json"
CAPTURE = json.loads(CAPTURE_PATH.read_text())
DIFF = json.loads(DIFF_PATH.read_text())
REF = "swzpzcwiasxmjutrmvkm"
assert CAPTURE["expected_ref"] == REF
assert len(CAPTURE["functions"]) == 20
assert len(CAPTURE["triggers"]) == 120
assert len(CAPTURE["relations"]) == 17
assert len(DIFF["functions"]["removed"]) == 126
assert len(DIFF["functions"]["added"]) == 232
assert len(DIFF["relations"]["removed"]) == 9
assert len(DIFF["relations"]["added"]) == 9


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _split_args(raw: str) -> list[str]:
    if not raw.strip():
        return []
    result, start, depth, quoted = [], 0, 0, False
    for index, char in enumerate(raw):
        if char == '"':
            quoted = not quoted
        elif not quoted:
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
            elif char == "," and depth == 0:
                result.append(raw[start:index].strip())
                start = index + 1
    result.append(raw[start:].strip())
    return result


def _identity_args(raw: str) -> str:
    types = []
    for arg in _split_args(raw):
        # Identity arguments have no defaults. Strip a parameter name/mode while
        # preserving multiword types such as "timestamp with time zone".
        arg = re.sub(r"\s+=\s+.*$", "", arg).strip()
        first, separator, remainder = arg.partition(" ")
        if not separator:
            types.append(first)
        elif first.upper() in {"IN", "OUT", "INOUT", "VARIADIC"}:
            types.append(remainder.strip())
        else:
            types.append(remainder.strip())
    return ",".join(types)


def _signature(schema: str, name: str, args: str) -> str:
    return f"{schema}.{name}({_identity_args(args)})"


def _from_signature(signature: str) -> str:
    schema_name, args = signature.split("(", 1)
    assert args.endswith(")")
    schema, name = schema_name.rsplit(".", 1)
    return _signature(schema, name, args[:-1])


def _function_rows(state: dict) -> dict[str, list]:
    return {_signature(row[0], row[1], row[2]): row for row in state["functions"]}


def _relation_name(raw: str) -> str:
    return raw if "." in raw else f"public.{raw}"


def _relation_rows(state: dict) -> dict[str, list]:
    return {_relation_name(row[0]): row for row in state["relations"]}


def _live_functions(pre_state: dict) -> dict[str, list]:
    rows = _function_rows(pre_state)
    for row in DIFF["functions"]["removed"]:
        key = _signature(row[0], row[1], row[2])
        assert rows.pop(key, None) == row, f"LIVE_REMOVED_ROW_MISMATCH:{key}"
    for row in DIFF["functions"]["added"]:
        rows[_signature(row[0], row[1], row[2])] = row
    assert len(rows) == len(pre_state["functions"]) - 126 + 232
    return rows


def _live_relations(pre_state: dict) -> dict[str, list]:
    rows = _relation_rows(pre_state)
    for row in DIFF["relations"]["removed"]:
        key = _relation_name(row[0])
        assert rows.pop(key, None) == row, f"LIVE_REMOVED_RELATION_MISMATCH:{key}"
    for row in DIFF["relations"]["added"]:
        rows[_relation_name(row[0])] = row
    return rows


def _function_doc(row: list, signature: str | None = None) -> list:
    return [
        signature or _signature(row[0], row[1], row[2]),
        row[3],
        row[4] or "",
        row[5],
        row[6],
        row[7],
    ]


def _relation_doc(row: list, name: str | None = None) -> list:
    return [name or _relation_name(row[0]), row[1] or "", row[2], row[3], row[4]]


def _trigger_function(definition: str) -> str:
    match = re.search(r"EXECUTE FUNCTION\s+([^\s(]+)\((.*)\)\s*$", definition)
    assert match, definition
    schema_name = match.group(1)
    schema, name = schema_name.rsplit(".", 1)
    return _signature(schema, name, match.group(2))


def _captured_triggers(function_rows: dict[str, list]) -> list[list]:
    result = []
    for row in CAPTURE["triggers"]:
        signature = _from_signature(row["function"])
        assert function_rows[signature][3] == row["function_md5"], signature
        result.append([
            row["table"], row["name"], row["enabled"], signature,
            row["function_md5"], row["definition"],
        ])
    return sorted(result, key=lambda row: (row[0], row[1]))


def _state_triggers(state: dict, function_rows: dict[str, list]) -> list[list]:
    tables = {row["table"] for row in CAPTURE["relations"]}
    result = []
    for row in state["triggers"]:
        table = row[0].split(".")[-1]
        if table not in tables:
            continue
        signature = _trigger_function(row[3])
        result.append([table, row[1], row[2], signature, function_rows[signature][3], row[3]])
    return sorted(result, key=lambda row: (row[0], row[1]))


def _structural(state: dict) -> dict:
    return {
        key: value for key, value in state.items()
        if key not in {"functions", "relations", "triggers", "send_functions"}
    }


def _pair(pre_state: dict, post_state: dict) -> tuple[dict, dict, dict]:
    pre_functions, post_functions = _function_rows(pre_state), _function_rows(post_state)
    live_functions = _live_functions(pre_state)
    capture_functions = {_from_signature(row["signature"]): row for row in CAPTURE["functions"]}
    trigger_functions = {_from_signature(row["function"]) for row in CAPTURE["triggers"]}
    changed = {key for key in pre_functions.keys() & post_functions.keys() if pre_functions[key] != post_functions[key]}
    added = post_functions.keys() - pre_functions.keys()
    required = set(capture_functions) | trigger_functions | changed

    current_scope = {}
    for signature in sorted(required):
        if signature in capture_functions:
            captured = capture_functions[signature]
            live = live_functions.get(signature)
            assert live is not None, f"LIVE_SCOPED_FUNCTION_UNRESOLVED:{signature}"
            assert live[3] == captured["md5"], (signature, live[3], captured["md5"])
            live = list(live)
            live[4], live[5] = captured["acl"], captured["owner"]
            current_scope[signature] = live
        else:
            live = live_functions.get(signature)
            assert live is not None, f"CANDIDATE_DEPENDENCY_NOT_PROVEN_BY_DIFF:{signature}"
            if signature in trigger_functions:
                expected = next(row["function_md5"] for row in CAPTURE["triggers"] if _from_signature(row["function"]) == signature)
                assert live[3] == expected, (signature, live[3], expected)
            else:
                # A changed dependency outside the 20/89 pins is admitted only
                # when the independent diff proves its old row is still LIVE.
                assert live == pre_functions[signature], f"UNPROVEN_CANDIDATE_DEPENDENCY:{signature}"
            current_scope[signature] = live

    pre_doc_functions = sorted((_function_doc(current_scope[key], key) for key in required), key=lambda row: row[0])
    post_doc_functions = sorted((_function_doc(post_functions[key], key) for key in required | added), key=lambda row: row[0])

    pre_relations, post_relations = _relation_rows(pre_state), _relation_rows(post_state)
    live_relations = _live_relations(pre_state)
    capture_relations = {f"public.{row['table']}": row for row in CAPTURE["relations"]}
    private_pre = {key for key in pre_relations if key.startswith("platform_private.")}
    required_relations = set(capture_relations) | private_pre
    changed_relations = {key for key in pre_relations.keys() & post_relations.keys() if pre_relations[key] != post_relations[key]}
    added_relations = post_relations.keys() - pre_relations.keys()
    assert not (changed_relations - required_relations), changed_relations - required_relations
    assert all(key.startswith("platform_private.") for key in added_relations), added_relations

    current_relations = {}
    for name in required_relations:
        live = live_relations.get(name)
        assert live is not None, f"LIVE_SCOPED_RELATION_UNRESOLVED:{name}"
        if name in capture_relations:
            captured = capture_relations[name]
            live = list(live)
            live[1], live[4] = captured["acl"], captured["owner"]
        current_relations[name] = live
    pre_doc_relations = sorted((_relation_doc(current_relations[key], key) for key in required_relations), key=lambda row: row[0])
    for name in capture_relations:
        post = post_relations[name]
        assert post[1] == capture_relations[name]["acl"] and post[4] == capture_relations[name]["owner"], f"CANDIDATE_PUBLIC_ACL_DRIFT:{name}"
    post_doc_relations = sorted(
        (_relation_doc(post_relations[key], key) for key in required_relations | added_relations),
        key=lambda row: row[0],
    )

    pre_doc = {
        "functions": pre_doc_functions,
        "relations": pre_doc_relations,
        "triggers": _captured_triggers(current_scope),
        "structural": _structural(pre_state),
    }
    post_doc = {
        "functions": post_doc_functions,
        "relations": post_doc_relations,
        "triggers": _state_triggers(post_state, post_functions),
        "structural": _structural(post_state),
    }
    metadata = {
        "capture_sha256": sha(CAPTURE_PATH),
        "independent_diff_sha256": sha(DIFF_PATH),
        "live_reconstructed_function_count": len(live_functions),
        "guarded_existing_functions": len(pre_doc_functions),
        "new_candidate_functions": sorted(added),
        "changed_candidate_dependencies": sorted(changed),
        "guarded_relations": len(pre_doc_relations),
        "pre_triggers": len(pre_doc["triggers"]),
        "post_triggers": len(post_doc["triggers"]),
        "outside_scope": "all other LIVE functions/relations remain untouched and are not pinned by this scoped guard",
        "transcription_correction": "owner confirmed COCKPIT_ENTREGA_ENDERECO_ORIGEM_INVALIDA; captured MD5 a4d47ccf5d116141ed46e9de9ea7eeaa is authoritative",
    }
    return pre_doc, post_doc, metadata


def _json_literal(value) -> str:
    return "'" + json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("'", "''") + "'::jsonb"


def _guard(doc: dict, state_expression: str, label: str) -> str:
    signatures = ",".join("('%s')" % row[0].replace("'", "''") for row in doc["functions"])
    relations = ",".join("('%s')" % row[0].replace("'", "''") for row in doc["relations"])
    function_actual = f"""(SELECT coalesce(jsonb_agg(jsonb_build_array(v.signature,md5(pg_get_functiondef(p.oid)),coalesce(p.proacl::text,''),pg_get_userbyid(p.proowner),p.proconfig,p.prosecdef) ORDER BY v.signature),'[]'::jsonb)
 FROM (VALUES {signatures}) v(signature) LEFT JOIN pg_proc p ON p.oid=to_regprocedure(v.signature))"""
    relation_actual = f"""(SELECT coalesce(jsonb_agg(jsonb_build_array(v.relation_name,coalesce(c.relacl::text,''),c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner)) ORDER BY v.relation_name),'[]'::jsonb)
 FROM (VALUES {relations}) v(relation_name) LEFT JOIN pg_class c ON c.oid=to_regclass(v.relation_name))"""
    trigger_actual = """(SELECT coalesce(jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled::text,p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)),pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname),'[]'::jsonb)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
 WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname IN ('entregas','entrega_comprovantes','ordens_servico','clientes','organizations','produto_etiquetas','profiles','programacao_producao','estoque_produto','estoque_movimentacoes','lotes','produtos','microrganismos','catalogo_volumes','product_sale_units','product_packagings','partner_order_items'))"""
    structural_actual = f"(({state_expression})-'functions'-'relations'-'triggers'-'send_functions')"
    return f"""DO $scope$ BEGIN
 IF {function_actual} IS DISTINCT FROM {_json_literal(doc['functions'])} THEN RAISE EXCEPTION '{label}_SCOPED_FUNCTIONS'; END IF;
 IF {relation_actual} IS DISTINCT FROM {_json_literal(doc['relations'])} THEN RAISE EXCEPTION '{label}_SCOPED_RELATIONS'; END IF;
 IF {trigger_actual} IS DISTINCT FROM {_json_literal(doc['triggers'])} THEN RAISE EXCEPTION '{label}_SCOPED_TRIGGERS'; END IF;
 IF {structural_actual} IS DISTINCT FROM {_json_literal(doc['structural'])} THEN RAISE EXCEPTION '{label}_STRUCTURE'; END IF;
END $scope$;
"""


def _readonly(doc: dict, state_expression: str, label: str) -> str:
    return "BEGIN READ ONLY;\n" + _guard(doc, state_expression, label) + "ROLLBACK;\n"


def rewrite_confirmation(out: Path, state_expression: str) -> None:
    out = Path(out)
    pre_state = json.loads((out / "pre-state.json").read_text())
    post_state = json.loads((out / "post-state.json").read_text())
    pre, post, metadata = _pair(pre_state, post_state)
    candidate = (out / "candidate.sql.review").read_text()
    (out / "scope-pre.json").write_text(json.dumps(pre, indent=2) + "\n")
    (out / "scope-post.json").write_text(json.dumps(post, indent=2) + "\n")
    (out / "scope-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    (out / "preflight.sql.review").write_text(_readonly(pre, state_expression, "CONFIRM_PRE"))
    (out / "postflight.sql.review").write_text(_readonly(post, state_expression, "CONFIRM_POST"))
    (out / "install.sql.review").write_text(
        "BEGIN; SET LOCAL lock_timeout='3s';\n" + _guard(pre, state_expression, "CONFIRM_PRE")
        + candidate + "\n" + _guard(post, state_expression, "CONFIRM_POST") + "COMMIT;\n"
    )


def rewrite_send(out: Path, state_expression: str) -> None:
    out = Path(out)
    pre_state = json.loads((out / "pre-state.json").read_text())
    post_state = json.loads((out / "post-state.json").read_text())
    pre, post, metadata = _pair(pre_state, post_state)
    candidate = (out / "candidate.sql.review").read_text()
    (out / "scope-pre.json").write_text(json.dumps(pre, indent=2) + "\n")
    (out / "scope-post.json").write_text(json.dumps(post, indent=2) + "\n")
    (out / "scope-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    (out / "preflight.sql.review").write_text(_readonly(pre, state_expression, "SEND_PRE"))
    (out / "postflight.sql.review").write_text(_readonly(post, state_expression, "SEND_POST"))
    (out / "install.sql.review").write_text(
        "BEGIN;\n" + _guard(pre, state_expression, "SEND_PRE") + candidate + "\n"
        + _guard(post, state_expression, "SEND_POST") + "COMMIT;\n"
    )
    (out / "rollback.sql.review").write_text(
        "BEGIN;\n" + _guard(post, state_expression, "SEND_ROLLBACK")
        + "REVOKE EXECUTE ON FUNCTION public.rpc_entrega_enviar_manual_v1(uuid,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;\nCOMMIT;\n"
    )


def write_final_confirmation_rollback(confirmation_out: Path, send_out: Path, final_state: dict, state_expression: str) -> None:
    confirmation_out, send_out = Path(confirmation_out), Path(send_out)
    confirm_scope = json.loads((confirmation_out / "scope-post.json").read_text())
    send_scope = json.loads((send_out / "scope-post.json").read_text())
    functions = _function_rows(final_state)
    function_names = {row[0] for row in confirm_scope["functions"]} | {row[0] for row in send_scope["functions"]}
    relations = _relation_rows(final_state)
    relation_names = {row[0] for row in confirm_scope["relations"] if row[0] in relations}
    doc = {
        "functions": sorted((_function_doc(functions[key], key) for key in function_names), key=lambda row: row[0]),
        "relations": sorted((_relation_doc(relations[key], key) for key in relation_names), key=lambda row: row[0]),
        "triggers": _state_triggers(final_state, functions),
        "structural": _structural(final_state),
    }
    (confirmation_out / "rollback-scope.json").write_text(json.dumps(doc, indent=2) + "\n")
    (confirmation_out / "rollback-composed.sql.review").write_text(
        "BEGIN;\n" + _guard(doc, state_expression, "CONFIRM_COMPOSED_ROLLBACK")
        + "REVOKE EXECUTE ON FUNCTION public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;\nCOMMIT;\n"
    )


def initial_production_pre(evidence: Path, state_expression: str, plan_post: str) -> str:
    evidence = Path(evidence)
    scope = json.loads((evidence / "delivery-confirmation/scope-pre.json").read_text())
    absence = CAPTURE["candidate_absence"]
    assert absence == {
        "resale_gate_present": False,
        "finished_gate_present": False,
        "resale_os_public_overloads": 0,
        "manual_confirmation_overloads": 0,
    }
    return f"""-- PRE POSPLANOS escopado: captura LIVE integral + diff independente 411cbbc.
-- Funções/relações fora do recorte não são redefinidas nem exigidas em versão antiga.
BEGIN READ ONLY;
SET LOCAL commercial_plans.review_project_ref='{REF}';
{plan_post}
{_guard(scope, state_expression, 'PRODUCTION_PRE')}
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE (n.nspname='public' AND p.proname IN ('rpc_entrega_confirmar_manual_v1','rpc_b2b_resale_os_create_v1','rpc_b2b_resale_os_availability_v1'))
      OR (n.nspname='platform_private' AND p.proname='b2b_resale_os_create_v1'))
 OR to_regclass('platform_private.b2b_resale_logistics_gate_v1') IS NOT NULL
 OR to_regclass('platform_private.b2b_resale_os_requests_v1') IS NOT NULL
 OR to_regclass('platform_private.finished_product_gate_v1') IS NOT NULL
 THEN RAISE EXCEPTION 'PRODUCTION_REPORTED_ABSENCE_DRIFT_RECAPTURE_REQUIRED'; END IF;
END$$;
ROLLBACK;
"""
