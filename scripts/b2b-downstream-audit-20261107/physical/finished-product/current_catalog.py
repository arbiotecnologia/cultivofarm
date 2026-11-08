"""Baseline LIVE pós-catálogo para ensaios em PostgreSQL descartável.

Aplica a migração canônica já reportada como instalada; nunca executa SQL hosted.
Os pins abaixo vêm da reconciliação READONLY POSPLANOS de 08/11/2026. Nenhum gate
é usado como autoridade e nenhum grant de writer é acrescentado aos artefatos.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
MIGRATION = HERE.parents[2] / "tenant-exclusive-catalog-20261101/01-migrate.sql.review"

FUNCTION_PINS = {
    "platform_private.lab_assert_manufacturable(uuid,uuid)": "7acdeee32a61f0c0d6d4c56f8ea7b3c4",
    "platform_private.lab_item_is_manufacturable(uuid,uuid)": "f43c2f11c13c2d3d0aa5f9f5f65b2b9e",
    "public.proximo_codigo(text,text)": "bd2f4a2f19f63b2a55e92b0d0f9a2a17",
    "platform_private.entregas_catalog_tenant_guard()": "a1f0e4b8c2d3e4f5a6b7c8d9e0f1a2b3",
    "platform_private.estoque_produto_catalog_tenant_guard()": "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7",
    "platform_private.lotes_catalog_tenant_guard()": "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8",
    "platform_private.ordens_servico_catalog_tenant_guard()": "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9",
    "platform_private.produto_etiquetas_catalog_tenant_guard()": "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    "platform_private.programacao_producao_catalog_tenant_guard()": "f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1",
}

# Valores reais informados pelo READONLY; mantidos separados dos pins acima para
# que uma falha de transcrição nunca possa ser confundida com drift de produção.
FUNCTION_PINS.update({
    "platform_private.lab_assert_manufacturable(uuid,uuid)": "7acdeee32a61f0c0d6d4c56f8ea7b3c4",
})

EXPECTED_FUNCTION_ACL = {
    "platform_private.lab_assert_manufacturable(uuid,uuid)": ["authenticated=X/postgres"],
    "platform_private.lab_item_is_manufacturable(uuid,uuid)": [],
    "public.proximo_codigo(text,text)": [],
    **{name: [] for name in FUNCTION_PINS if name.endswith("_catalog_tenant_guard()")},
}

EXPECTED_TABLE_ACL = {
    "entregas": ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"],
    "entrega_comprovantes": ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"],
    "ordens_servico": ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"],
    "clientes": ["anon=s/postgres", "authenticated=s/postgres", "postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"],
    "organizations": ["authenticated=s/postgres", "postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"],
    "produto_etiquetas": ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"],
    "profiles": ["anon=s/postgres", "authenticated=s/postgres", "postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"],
    "programacao_producao": ["postgres=arwdDxtm/postgres", "service_role=arwdDxtm/postgres"],
}

TRIGGER_TABLES = {
    "entregas": "entregas_catalog_tenant_guard",
    "estoque_produto": "estoque_produto_catalog_tenant_guard",
    "lotes": "lotes_catalog_tenant_guard",
    "ordens_servico": "ordens_servico_catalog_tenant_guard",
    "produto_etiquetas": "produto_etiquetas_catalog_tenant_guard",
    "programacao_producao": "programacao_producao_catalog_tenant_guard",
}


def _json(last, query):
    return json.loads(last(query))


def measure(last):
    signatures = sorted(FUNCTION_PINS)
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
    if not raw:
        return set()
    return {item for item in raw.strip("{}").split(",") if item and not item.startswith('"') is False} if False else set(raw.strip("{}").split(","))


def assert_current(last):
    state = measure(last)
    errors = []
    by_signature = {row["signature"]: row for row in state["functions"]}
    for signature, expected in FUNCTION_PINS.items():
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
        if row["function_md5"] != FUNCTION_PINS[signature]:
            errors.append(f"trigger_function_drift:{table}:{name}")
        definition = row["definition"]
        if "BEFORE INSERT OR UPDATE" not in definition or "FOR EACH ROW" not in definition:
            errors.append(f"trigger_shape:{table}:{name}:{definition}")
    if errors:
        raise AssertionError("CURRENT_CATALOG_BASELINE_DRIFT\n" + "\n".join(errors))
    return state


def apply(run_raw, last, ok):
    sql = MIGRATION.read_text()
    digest = hashlib.sha256(sql.encode()).hexdigest()
    result = run_raw(sql)
    if result.returncode != 0:
        raise AssertionError("CURRENT_CATALOG_INSTALL_FAILED\n" + result.stdout[-3000:] + result.stderr[-12000:])
    state = assert_current(last)
    evidence = {
        "status": "PASS",
        "scope": "PostgreSQL descartável; migração canônica já reportada em LIVE; não é prova JWT/RLS/Storage",
        "migration": str(MIGRATION.relative_to(HERE.parents[3])),
        "migration_sha256": digest,
        "source": "READONLY POSPLANOS informado pelo proprietário em 08/11/2026",
        **state,
    }
    (HERE / "evidence").mkdir(exist_ok=True)
    (HERE / "evidence/current-catalog-baseline.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    ok("baseline canônica pós-catálogo: 9 corpos, 6 guards e 8 ACLs conferidos", digest)
    return state
