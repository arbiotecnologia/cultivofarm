"""Baseline restrita POSPLANOS para ensaios em PostgreSQL descartável.

Não reaplica a migração ampla do catálogo. Os seis guards vêm da captura LIVE
fornecida pelo proprietário em 08/11/2026; as demais dependências são geradas
pelas fontes canônicas versionadas. Nada aqui acessa banco hospedado ou integra
os candidatos de instalação.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parents[2]
CATALOG = SCRIPTS / "tenant-exclusive-catalog-20261101"
CAPTURE = HERE.parents[1] / "order-e2e-new-20261108/reconciliation-posplans-20261108/live-catalog-guards-20261108.sql.capture"

GUARD_PINS = {
    "platform_private.entregas_catalog_tenant_guard()": "86711a2f96fee0a3d0f9c02b55c55bcd",
    "platform_private.estoque_produto_catalog_tenant_guard()": "874c9ca8b5b4e307cf995a0197f98efc",
    "platform_private.lotes_catalog_tenant_guard()": "0fc1d2741a73a92ade8e558e3dd58c20",
    "platform_private.ordens_servico_catalog_tenant_guard()": "8abd58791e7e27336b07e648cdef35e7",
    "platform_private.produto_etiquetas_catalog_tenant_guard()": "d53f9827e3b5504e632fffe9949fa8c4",
    "platform_private.programacao_producao_catalog_tenant_guard()": "2e25fe68cf66a79fbc1d2eecee8b20e9",
}
CANONICAL_DEPENDENCIES = (
    "platform_private.lab_assert_manufacturable(uuid,uuid)",
    "platform_private.lab_item_is_manufacturable(uuid,uuid)",
    "public.proximo_codigo(text,text)",
)
EXPECTED_FUNCTION_ACL = {
    "platform_private.lab_assert_manufacturable(uuid,uuid)": ["postgres=X/postgres", "authenticated=X/postgres"],
    "platform_private.lab_item_is_manufacturable(uuid,uuid)": ["postgres=X/postgres"],
    "public.proximo_codigo(text,text)": ["postgres=X/postgres"],
    **{name: ["postgres=X/postgres"] for name in GUARD_PINS},
}
EXPECTED_TABLE_ACL = {
    "entregas": ["postgres=arwdDxtm/postgres", "service_role=arwdDxt/postgres"],
    "entrega_comprovantes": ["postgres=arwdDxtm/postgres", "service_role=arwdDxt/postgres"],
    "ordens_servico": ["postgres=arwdDxtm/postgres", "service_role=arwdDxt/postgres"],
    "clientes": ["anon=r/postgres", "authenticated=r/postgres", "postgres=arwdDxtm/postgres", "service_role=arwdDxt/postgres"],
    "organizations": ["authenticated=r/postgres", "postgres=arwdDxtm/postgres", "service_role=arwdDxt/postgres"],
    "produto_etiquetas": ["postgres=arwdDxtm/postgres", "service_role=arwdDxt/postgres"],
    "profiles": ["anon=r/postgres", "authenticated=r/postgres", "postgres=arwdDxtm/postgres", "service_role=arwdDxt/postgres"],
    "programacao_producao": ["postgres=arwdDxtm/postgres", "service_role=arwdDxt/postgres"],
}
TRIGGER_TABLES = {
    "entregas": "entregas_catalog_tenant_guard",
    "estoque_produto": "estoque_produto_catalog_tenant_guard",
    "lotes": "lotes_catalog_tenant_guard",
    "ordens_servico": "ordens_servico_catalog_tenant_guard",
    "produto_etiquetas": "produto_etiquetas_catalog_tenant_guard",
    "programacao_producao": "programacao_producao_catalog_tenant_guard",
}
_expected_pins: dict[str, str] = {}


def _module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _json(last, query):
    return json.loads(last(query))


def measure(last):
    signatures = sorted(tuple(GUARD_PINS) + CANONICAL_DEPENDENCIES)
    values = ",".join("('%s')" % signature for signature in signatures)
    functions = _json(last, f"""
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'signature', v.signature,
  'md5', md5(pg_get_functiondef(p.oid)),
  'acl', COALESCE(p.proacl::text,'')
) ORDER BY v.signature),'[]'::jsonb)
FROM (VALUES {values}) v(signature)
LEFT JOIN pg_proc p ON p.oid=to_regprocedure(v.signature);
""")
    tables = sorted(EXPECTED_TABLE_ACL)
    values = ",".join("('%s')" % table for table in tables)
    relations = _json(last, f"""
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'table', v.table_name,
  'acl', COALESCE(c.relacl::text,'')
) ORDER BY v.table_name),'[]'::jsonb)
FROM (VALUES {values}) v(table_name)
LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||v.table_name);
""")
    triggers = _json(last, """
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'table', c.relname,
  'name', t.tgname,
  'enabled', t.tgenabled,
  'function', p.oid::regprocedure::text,
  'function_md5', md5(pg_get_functiondef(p.oid)),
  'definition', pg_get_triggerdef(t.oid)
) ORDER BY c.relname,t.tgname),'[]'::jsonb)
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN pg_proc p ON p.oid=t.tgfoid
WHERE NOT t.tgisinternal AND n.nspname='public'
  AND t.tgname LIKE 'a000_%_catalog_tenant_guard'
  AND c.relname IN ('entregas','estoque_produto','lotes','ordens_servico','produto_etiquetas','programacao_producao');
""")
    return {"functions": functions, "relations": relations, "triggers": triggers}


def _acl_set(raw):
    return set(raw.strip("{}").split(",")) if raw else set()


def assert_current(last):
    if set(_expected_pins) != set(GUARD_PINS) | set(CANONICAL_DEPENDENCIES):
        raise AssertionError("CURRENT_CATALOG_NOT_MEASURED")
    state = measure(last)
    errors = []
    by_signature = {row["signature"]: row for row in state["functions"]}
    for signature, expected in _expected_pins.items():
        actual = by_signature.get(signature, {}).get("md5")
        if actual != expected:
            errors.append(f"function_md5:{signature}:{actual}!={expected}")
        actual_acl = _acl_set(by_signature.get(signature, {}).get("acl", ""))
        if actual_acl != set(EXPECTED_FUNCTION_ACL[signature]):
            errors.append(f"function_acl:{signature}:{sorted(actual_acl)}")
    by_table = {row["table"]: row for row in state["relations"]}
    for table, expected in EXPECTED_TABLE_ACL.items():
        actual = _acl_set(by_table.get(table, {}).get("acl", ""))
        if actual != set(expected):
            errors.append(f"table_acl:{table}:{sorted(actual)}!={sorted(expected)}")
    by_trigger = {(row["table"], row["name"]): row for row in state["triggers"]}
    for table, name in TRIGGER_TABLES.items():
        row = by_trigger.get((table, "a000_" + name))
        if not row:
            errors.append(f"trigger_missing:{table}:{name}")
            continue
        if row["enabled"] != "O":
            errors.append(f"trigger_disabled:{table}:{name}:{row['enabled']}")
        signature = "platform_private." + name + "()"
        if row["function_md5"] != GUARD_PINS[signature]:
            errors.append(f"trigger_function_drift:{table}:{name}")
        definition = row["definition"]
        if "BEFORE INSERT OR UPDATE" not in definition or "FOR EACH ROW" not in definition:
            errors.append(f"trigger_shape:{table}:{name}:{definition}")
    if errors:
        raise AssertionError("CURRENT_CATALOG_BASELINE_DRIFT\n" + "\n".join(errors))
    return state


def _canonical_dependency_sql():
    rpc = _module("current_catalog_rpc", CATALOG / "rpc_section.py")
    fence = _module("current_catalog_fence", CATALOG / "fence_section.py")
    fence.FENCED = [row for row in fence.FENCED if row[0] in CANONICAL_DEPENDENCIES]
    assert len(fence.FENCED) == 2
    statements = []
    fence.fence_sql(statements.append, "platform_private.local_current_catalog_ledger", rpc.lit)
    migration = (CATALOG / "01-migrate.sql.review").read_text()
    start = migration.index("CREATE OR REPLACE FUNCTION public.proximo_codigo(_prefixo text, _tabela text)")
    end = migration.index("REVOKE ALL ON FUNCTION public.proximo_codigo(text,text) FROM PUBLIC, anon, authenticated;", start)
    end = migration.index(";", end) + 1
    # Somente o gerador global fechado é dependência dos cinco instaladores.
    # A migração de sequências/triggers não é necessária e exigiria schema fora do recorte.
    statements.append(migration[start:end])
    return "\n".join(statements)


def _restricted_acl_sql():
    statements = []
    for table, entries in EXPECTED_TABLE_ACL.items():
        statements.append(f"REVOKE ALL ON TABLE public.{table} FROM PUBLIC,anon,authenticated,service_role;")
        statements.append(f"GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.{table} TO service_role;")
        if "anon=r/postgres" in entries:
            statements.append(f"GRANT SELECT ON TABLE public.{table} TO anon;")
        if "authenticated=r/postgres" in entries:
            statements.append(f"GRANT SELECT ON TABLE public.{table} TO authenticated;")
    for signature, entries in EXPECTED_FUNCTION_ACL.items():
        statements.append(f"REVOKE ALL ON FUNCTION {signature} FROM PUBLIC,anon,authenticated,service_role;")
        if "authenticated=X/postgres" in entries:
            statements.append(f"GRANT EXECUTE ON FUNCTION {signature} TO authenticated;")
    return "\n".join(statements)


def apply(run_raw, last, ok, organization_id):
    global _expected_pins
    foundation = _module("current_catalog_foundation", HERE / "catalog_foundation.py")
    foundation_result = []
    def foundation_sql(statement):
        result = run_raw(statement)
        foundation_result.append(result)
        return result
    foundation.apply(foundation_sql, organization_id)
    if any(result.returncode != 0 for result in foundation_result):
        raise AssertionError("CURRENT_CATALOG_SCHEMA_SEAM_FAILED\n" + "\n".join(result.stderr[-4000:] for result in foundation_result))
    capture_sql = CAPTURE.read_text()
    assert capture_sql.count("CREATE OR REPLACE FUNCTION platform_private.") == 6
    assert "CREATE TABLE" not in capture_sql and "GRANT " not in capture_sql
    trigger_sql = []
    for table, name in TRIGGER_TABLES.items():
        trigger = "a000_" + name
        # O checkpoint histórico contém uma costura sintética de estoque. Somente
        # os seis triggers nomeados são substituídos no banco descartável.
        trigger_sql.append(f"DROP TRIGGER IF EXISTS {trigger} ON public.{table};")
        trigger_sql.append(
            f"CREATE TRIGGER {trigger} BEFORE INSERT OR UPDATE ON public.{table} "
            f"FOR EACH ROW EXECUTE FUNCTION platform_private.{name}();"
        )
    setup = f"""
CREATE TABLE IF NOT EXISTS platform_private.local_current_catalog_ledger(step text,detail jsonb);
CREATE OR REPLACE FUNCTION platform_private.catalog_tenant_agree(p uuid[]) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $f$
DECLARE v uuid[] := ARRAY(SELECT DISTINCT x FROM unnest(p) x WHERE x IS NOT NULL);
BEGIN
  IF cardinality(v) > 1 THEN RAISE EXCEPTION 'tenant_catalog_chain_divergence' USING ERRCODE = '42501', DETAIL = array_to_string(v, ','); END IF;
  RETURN v[1];
END $f$;
REVOKE ALL ON FUNCTION platform_private.catalog_tenant_agree(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
{_canonical_dependency_sql()}
{capture_sql}
{chr(10).join(trigger_sql)}
{_restricted_acl_sql()}
"""
    result = run_raw(setup)
    if result.returncode != 0:
        raise AssertionError("CURRENT_CATALOG_RESTRICTED_BASELINE_FAILED\n" + result.stdout[-3000:] + result.stderr[-12000:])
    measured = measure(last)
    _expected_pins = {row["signature"]: row["md5"] for row in measured["functions"]}
    for signature, expected in GUARD_PINS.items():
        assert _expected_pins.get(signature) == expected, (signature, _expected_pins.get(signature), expected)
    assert all(_expected_pins.get(signature) for signature in CANONICAL_DEPENDENCIES)
    state = assert_current(last)
    evidence = {
        "status": "PASS",
        "scope": "PostgreSQL descartável; baseline restrita POSPLANOS; não é prova JWT/RLS/Storage",
        "source": "seis corpos LIVE fornecidos pelo proprietário + geradores canônicos versionados; migração ampla NÃO reaplicada",
        "guard_capture": CAPTURE.name,
        "guard_capture_sha256": hashlib.sha256(CAPTURE.read_bytes()).hexdigest(),
        "canonical_generator_sha256": {
            "fence_section.py": hashlib.sha256((CATALOG / "fence_section.py").read_bytes()).hexdigest(),
            "01-migrate.sql.review#proximo_codigo": hashlib.sha256((CATALOG / "01-migrate.sql.review").read_bytes()).hexdigest(),
        },
        "synthetic_seam": "ledger local e substituição dos seis triggers nomeados; nenhuma costura entra nos candidatos",
        **state,
    }
    (HERE / "evidence").mkdir(exist_ok=True)
    (HERE / "evidence/current-catalog-baseline.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    ok("baseline restrita POSPLANOS: 9 corpos medidos, 6 guards LIVE e 8 ACLs conferidos", evidence["guard_capture_sha256"])
    return state
