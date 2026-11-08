"""Baseline restrita POSPLANOS para ensaios em PostgreSQL descartável.

Não reaplica a migração ampla do catálogo. A referência é a captura LIVE integral
a7b973949 (20 funções, 120 triggers e 17 relações), complementada pelos seis
corpos auxiliares fornecidos separadamente. Nada aqui acessa banco hospedado ou
integra os candidatos de instalação.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parents[2]
RECONCILIATION = HERE.parents[1] / "order-e2e-new-20261108/reconciliation-posplans-20261108"
FULL_CAPTURE = RECONCILIATION / "live-current-metadata-a7b973949.json"
GUARD_CAPTURE = RECONCILIATION / "live-catalog-guards-20261108.sql.capture"
ADDITIONAL_CAPTURE = RECONCILIATION / "live-additional-dependencies-20261108.sql.capture"

CAPTURE = json.loads(FULL_CAPTURE.read_text())
assert CAPTURE["expected_ref"] == "swzpzcwiasxmjutrmvkm"
assert len(CAPTURE["functions"]) == 20
assert len(CAPTURE["triggers"]) == 120
assert len(CAPTURE["relations"]) == 17
assert all(row["present"] is True for row in CAPTURE["functions"] + CAPTURE["relations"])

FUNCTION_ROWS = {row["signature"]: row for row in CAPTURE["functions"]}
RELATION_ROWS = {row["table"]: row for row in CAPTURE["relations"]}
TRIGGER_ROWS = {(row["table"], row["name"]): row for row in CAPTURE["triggers"]}
GUARD_PINS = {
    signature: row["md5"]
    for signature, row in FUNCTION_ROWS.items()
    if signature.startswith("platform_private.") and signature.endswith("_catalog_tenant_guard()")
}
assert len(GUARD_PINS) == 6
ADDITIONAL_DEPENDENCIES = (
    "platform_private.catalog_tenant_agree(uuid[])",
    "platform_private.lab_assert_manufacturable__tenant_core(uuid,uuid)",
    "platform_private.lab_item_is_manufacturable__tenant_core(uuid,uuid)",
    "platform_private.tenant_catalog_fence(text,uuid[])",
)
# As duas funções abaixo já fazem parte das 20; ficam fora desta lista para não
# duplicar pins. Os quatro objetos acima não têm MD5/ACL LIVE informados: são
# medidos no ensaio e identificados como derivação da captura SQL, não como pins
# LIVE independentes.
EXPECTED_FUNCTION_ACL = {name: row["acl"] for name, row in FUNCTION_ROWS.items()}
EXPECTED_TABLE_ACL = {name: row["acl"] for name, row in RELATION_ROWS.items()}
_expected_additional_pins: dict[str, str] = {}

# A captura integral traz os MD5 das funções de trigger, mas não todos os corpos.
# Estas origens versionadas já continham capturas/candidatos exatos. O ensaio só
# prossegue se o pg_get_functiondef resultante coincidir com o MD5 LIVE do trigger.
SUPPLEMENTAL_SOURCES = {
    "platform_private.b2b_packaging_item_snapshot_guard()": SCRIPTS / "b2b-solid-packaging-order-20261106/02-install.sql.review",
    "platform_private.catalog_owner_immutable()": SCRIPTS / "tenant-exclusive-catalog-20261101/01-migrate.sql.review",
    "platform_private.catalogo_volumes_owner_consistent()": SCRIPTS / "b2b-solid-packaging-order-20261106/captured/solid-pack/platform_private.catalogo_volumes_owner_consistent.a4cfde90.live-20261106.sql",
    "platform_private.delivery_mutation_guard_20261030()": SCRIPTS / "delivery-atomic-hardening-20261030/candidate.sql.review",
    "platform_private.partner_order_items_catalog_tenant_guard()": SCRIPTS / "b2b-solid-packaging-order-20261106/captured/platform_private.partner_order_items_catalog_tenant_guard.211a5c4d.live-20261106.sql",
    "platform_private.solid_mass_immutable()": SCRIPTS / "b2b-solid-packaging-order-20261106/captured/triggers/platform_private.solid_mass_immutable.b0611f3e.live-20261106.sql",
    "platform_private.solid_mass_packaging_guard()": SCRIPTS / "b2b-solid-packaging-order-20261106/captured/triggers/platform_private.solid_mass_packaging_guard.1494933c.live-20261106.sql",
    "platform_private.solid_pack_presentation_guard()": SCRIPTS / "b2b-solid-packaging-order-20261106/captured/solid-pack/platform_private.solid_pack_presentation_guard.0906ab6b.live-20261106.sql",
    "platform_private.solid_pack_presentation_link()": SCRIPTS / "b2b-solid-packaging-order-20261106/captured/solid-pack/platform_private.solid_pack_presentation_link.a912476c.live-20261106.sql",
    "platform_private.stock_envase_mutation_gate_v1()": SCRIPTS / "stock-envase-recovery-20261027/isolated/candidate.sql.review",
    "platform_private.stock_envase_reservation_root_v1()": SCRIPTS / "stock-envase-recovery-20261027/isolated/candidate.sql.review",
}
SUPPLEMENTAL_MD5 = {
    row["function"]: row["function_md5"]
    for row in CAPTURE["triggers"]
    if row["function"] in SUPPLEMENTAL_SOURCES
}
assert set(SUPPLEMENTAL_MD5) == set(SUPPLEMENTAL_SOURCES)

ACL_PRIVILEGES = {
    "r": "SELECT",
    "a": "INSERT",
    "w": "UPDATE",
    "d": "DELETE",
    "D": "TRUNCATE",
    "x": "REFERENCES",
    "t": "TRIGGER",
    "m": "MAINTAIN",
    "X": "EXECUTE",
}


def _module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _json(last, query):
    return json.loads(last(query))


def _acl_set(raw):
    return set(raw.strip("{}").split(",")) if raw else set()


def _literal(value):
    return "'" + value.replace("'", "''") + "'"


def _acl_grants(kind, signature, raw):
    """Normaliza somente os papéis de cliente/serviço ao ACL capturado."""
    statements = [
        f"REVOKE ALL ON {kind} {signature} FROM PUBLIC,anon,authenticated,service_role;"
    ]
    for entry in sorted(_acl_set(raw)):
        grantee_privileges, _grantor = entry.split("/", 1)
        grantee, privileges = grantee_privileges.split("=", 1)
        role = "PUBLIC" if grantee == "" else grantee
        if role not in {"PUBLIC", "anon", "authenticated", "service_role"}:
            continue
        for code in privileges:
            privilege = ACL_PRIVILEGES.get(code)
            if privilege is None:
                raise AssertionError(f"CAPTURE_ACL_CODE_UNSUPPORTED:{entry}")
            statements.append(f"GRANT {privilege} ON {kind} {signature} TO {role};")
    return statements


def measure(last):
    signatures = sorted(FUNCTION_ROWS)
    values = ",".join("(%s)" % _literal(signature) for signature in signatures)
    functions = _json(last, f"""
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'signature', v.signature,
  'md5', md5(pg_get_functiondef(p.oid)),
  'owner', pg_get_userbyid(p.proowner),
  'acl', COALESCE(p.proacl::text,'')
) ORDER BY v.signature),'[]'::jsonb)
FROM (VALUES {values}) v(signature)
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(v.signature);
""")
    additional_signatures = sorted(set(ADDITIONAL_DEPENDENCIES) | set(SUPPLEMENTAL_SOURCES))
    additional_values = ",".join("(%s)" % _literal(signature) for signature in additional_signatures)
    additional = _json(last, f"""
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'signature', v.signature,
  'md5', md5(pg_get_functiondef(p.oid)),
  'owner', pg_get_userbyid(p.proowner),
  'acl', COALESCE(p.proacl::text,'')
) ORDER BY v.signature),'[]'::jsonb)
FROM (VALUES {additional_values}) v(signature)
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(v.signature);
""")
    tables = sorted(RELATION_ROWS)
    values = ",".join("(%s)" % _literal(table) for table in tables)
    relations = _json(last, f"""
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'table', v.table_name,
  'owner', pg_get_userbyid(c.relowner),
  'acl', COALESCE(c.relacl::text,'')
) ORDER BY v.table_name),'[]'::jsonb)
FROM (VALUES {values}) v(table_name)
LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||v.table_name);
""")
    triggers = _json(last, """
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'schema',n.nspname,
  'table', c.relname,
  'name', t.tgname,
  'enabled', t.tgenabled::text,
  'type', t.tgtype,
  'function', p.oid::regprocedure::text,
  'function_md5', md5(pg_get_functiondef(p.oid)),
  'definition', pg_get_triggerdef(t.oid)
) ORDER BY c.relname,t.tgname),'[]'::jsonb)
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid
WHERE NOT t.tgisinternal AND n.nspname='public'
  AND c.relname IN ('entregas','entrega_comprovantes','ordens_servico','clientes',
    'organizations','produto_etiquetas','profiles','programacao_producao',
    'estoque_produto','estoque_movimentacoes','lotes','produtos',
    'microrganismos','catalogo_volumes','product_sale_units','product_packagings',
    'partner_order_items');
""")
    return {
        "functions": functions,
        "additional_dependencies": additional,
        "relations": relations,
        "triggers": triggers,
    }


def assert_current(last):
    state = measure(last)
    errors = []
    by_signature = {row["signature"]: row for row in state["functions"]}
    for signature, expected in FUNCTION_ROWS.items():
        actual = by_signature.get(signature, {})
        if actual.get("md5") != expected["md5"]:
            errors.append(f"function_md5:{signature}:{actual.get('md5')}!={expected['md5']}")
        if actual.get("owner") != expected["owner"]:
            errors.append(f"function_owner:{signature}:{actual.get('owner')}!={expected['owner']}")
        if _acl_set(actual.get("acl", "")) != _acl_set(expected["acl"]):
            errors.append(f"function_acl:{signature}:{actual.get('acl')}!={expected['acl']}")
    additional = {row["signature"]: row["md5"] for row in state["additional_dependencies"]}
    for signature, expected in SUPPLEMENTAL_MD5.items():
        if additional.get(signature) != expected:
            errors.append(f"supplemental_function_md5:{signature}:{additional.get(signature)}!={expected}")
    if _expected_additional_pins:
        for signature, expected in _expected_additional_pins.items():
            if additional.get(signature) != expected:
                errors.append(f"additional_function_md5:{signature}:{additional.get(signature)}")
    by_table = {row["table"]: row for row in state["relations"]}
    for table, expected in RELATION_ROWS.items():
        actual = by_table.get(table, {})
        if actual.get("owner") != expected["owner"]:
            errors.append(f"table_owner:{table}:{actual.get('owner')}!={expected['owner']}")
        if _acl_set(actual.get("acl", "")) != _acl_set(expected["acl"]):
            errors.append(f"table_acl:{table}:{actual.get('acl')}!={expected['acl']}")
    by_trigger = {(row["table"], row["name"]): row for row in state["triggers"]}
    for key, expected in TRIGGER_ROWS.items():
        actual = by_trigger.get(key)
        if actual is None:
            errors.append(f"trigger_missing:{key[0]}:{key[1]}")
            continue
        for field in ("schema", "enabled", "type", "function", "function_md5", "definition"):
            if actual.get(field) != expected[field]:
                errors.append(f"trigger_{field}:{key[0]}:{key[1]}:{actual.get(field)}!={expected[field]}")
    if errors:
        raise AssertionError("CURRENT_LIVE_BASELINE_DRIFT\n" + "\n".join(errors))
    return state


def _captured_function_sql():
    # A ordem evita apenas dependências de criação; plpgsql continua validando os
    # corpos reais no PostgreSQL. Nenhum corpo é reconstruído ou concatenado por pin.
    definitions = [row["definition"].rstrip() + ";" for row in CAPTURE["functions"]]
    return "\n".join(definitions)


def _extract_function(source, signature):
    text = source.read_text()
    match = re.search(r"CREATE(?: OR REPLACE)? FUNCTION\s+" + re.escape(signature), text)
    if not match:
        raise AssertionError(f"SUPPLEMENTAL_FUNCTION_NOT_FOUND:{signature}:{source}")
    delimiter = re.search(r"\$[A-Za-z_]*\$", text[match.end():])
    if not delimiter:
        raise AssertionError(f"SUPPLEMENTAL_FUNCTION_DELIMITER_MISSING:{signature}")
    start = match.end() + delimiter.start()
    tag = delimiter.group(0)
    end = text.find(tag, start + len(tag))
    if end < 0:
        raise AssertionError(f"SUPPLEMENTAL_FUNCTION_UNTERMINATED:{signature}")
    end = end + len(tag)
    if end < len(text) and text[end] == ";":
        end += 1
    definition = text[match.start():end].rstrip() + ";"
    if definition.startswith("CREATE FUNCTION "):
        definition = "CREATE OR REPLACE FUNCTION " + definition[len("CREATE FUNCTION "):]
    return definition


def _supplemental_function_sql():
    return "\n".join(
        _extract_function(SUPPLEMENTAL_SOURCES[signature], signature)
        for signature in sorted(SUPPLEMENTAL_SOURCES)
    )


def _captured_trigger_sql():
    statements = []
    for (table, name), row in sorted(TRIGGER_ROWS.items()):
        statements.append(f'DROP TRIGGER IF EXISTS "{name}" ON public."{table}";')
    for (_table, _name), row in sorted(TRIGGER_ROWS.items()):
        statements.append(row["definition"].rstrip() + ";")
    return statements


def _restricted_acl_sql():
    statements = []
    for table, row in RELATION_ROWS.items():
        statements.extend(_acl_grants("TABLE", f"public.{table}", row["acl"]))
    for signature, row in FUNCTION_ROWS.items():
        statements.extend(_acl_grants("FUNCTION", signature, row["acl"]))
    return statements


def apply(run_raw, last, ok, organization_id):
    global _expected_additional_pins
    foundation = _module("current_catalog_foundation", HERE / "catalog_foundation.py")
    foundation_result = []

    def foundation_sql(statement):
        result = run_raw(statement)
        foundation_result.append(result)
        return result

    foundation.apply(foundation_sql, organization_id)
    if any(result.returncode != 0 for result in foundation_result):
        raise AssertionError("CURRENT_CATALOG_SCHEMA_SEAM_FAILED\n" + "\n".join(result.stderr[-4000:] for result in foundation_result))
    additional_sql = ADDITIONAL_CAPTURE.read_text()
    assert additional_sql.count("CREATE OR REPLACE FUNCTION platform_private.") == 6
    assert "CREATE TABLE" not in additional_sql and "GRANT " not in additional_sql
    setup = f"""
CREATE TABLE IF NOT EXISTS platform_private.local_current_catalog_ledger(step text,detail jsonb);
{additional_sql}
{_supplemental_function_sql()}
{_captured_function_sql()}
{chr(10).join(_captured_trigger_sql())}
{chr(10).join(_restricted_acl_sql())}
"""
    result = run_raw(setup)
    if result.returncode != 0:
        raise AssertionError("CURRENT_LIVE_RESTRICTED_BASELINE_FAILED\n" + result.stdout[-3000:] + result.stderr[-12000:])
    measured = measure(last)
    _expected_additional_pins = {
        row["signature"]: row["md5"]
        for row in measured["additional_dependencies"]
    }
    assert all(_expected_additional_pins.values())
    state = assert_current(last)
    evidence = {
        "status": "PASS",
        "scope": "PostgreSQL descartável; baseline restrita POSPLANOS; não é prova JWT/RLS/Storage",
        "source": "captura LIVE integral a7b973949 + dependências adicionais fornecidas pelo proprietário; migração ampla NÃO reaplicada",
        "capture": FULL_CAPTURE.name,
        "capture_sha256": hashlib.sha256(FULL_CAPTURE.read_bytes()).hexdigest(),
        "guard_capture": GUARD_CAPTURE.name,
        "guard_capture_sha256": hashlib.sha256(GUARD_CAPTURE.read_bytes()).hexdigest(),
        "additional_capture": ADDITIONAL_CAPTURE.name,
        "additional_capture_sha256": hashlib.sha256(ADDITIONAL_CAPTURE.read_bytes()).hexdigest(),
        "additional_pin_provenance": "MD5 medido localmente dos corpos SQL fornecidos; ACL adicional não foi presumida como LIVE",
        "counts": {"functions": 20, "triggers": 120, "relations": 17, "additional_dependencies": 4, "supplemental_trigger_functions": len(SUPPLEMENTAL_SOURCES)},
        "supplemental_sources": {signature: str(path.relative_to(SCRIPTS)) for signature, path in SUPPLEMENTAL_SOURCES.items()},
        "synthetic_seam": "schema canônico mínimo de apresentação e ledger local; corpos suplementares versionados validados pelos MD5 dos triggers LIVE; nenhuma costura entra nos candidatos",
        **state,
    }
    (HERE / "evidence").mkdir(exist_ok=True)
    (HERE / "evidence/current-catalog-baseline.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    ok("baseline LIVE integral: 20 corpos, 120 triggers, 17 ACLs e 4 dependências medidas", evidence["capture_sha256"])
    return state
