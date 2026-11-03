"""Relações EXTRAS reais (captura READ ONLY 02/11, SHA-256 68d98b22…42c4): 68 relações referenciadas pelos 300 helpers.

Substitui as tabelas sintéticas dos tipos gerados e os stubs mínimos do harness por colunas reais (tipo, default,
identity, generated, NOT NULL), 302 constraints, 160 policies, flags de RLS e a matview. Sem linhas de dados.
Regras: nenhuma coluna inventada (colunas de stub que não existem na captura são REMOVIDAS); nenhum enum vira text —
enum sem rótulos em nenhuma fonte capturada/gerada deixa a tabela FORA e é declarado como lacuna; FK cujo alvo não
existe no banco descartável é declarada, nunca trocada. ACL/grants e gatilhos das extras não foram capturados.
"""
import hashlib, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PATH = ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/captura-extras-20261102/schema-helpers-extras-20261102.json"
SHA = "68d98b22d10816c089b0655a53dfa54e6d8e0daeaa467bdaefb4102c868942c4"
assert hashlib.sha256(PATH.read_bytes()).hexdigest() == SHA, "captura de relações extras divergente"
X = json.loads(PATH.read_text())
BUILTIN = {"bigint", "boolean", "date", "double precision", "integer", "jsonb", "numeric", "smallint", "text", "text[]",
           "timestamp with time zone", "uuid", "uuid[]"}


def q(n): return '"' + n.replace('"', '""') + '"'
def fq(s, t): return f"{q(s)}.{q(t)}"


def enum_plan(types_src, known, cons_enums=()):
    """Enums das extras ainda não criados: 1º rótulos da CAPTURA READ ONLY de enums (enumsortorder real); 2º tipos gerados
    do banco real (mesma ordem); senão lacuna declarada. Nunca text."""
    cap = {}
    for e in sorted(cons_enums, key=lambda e: (e["typname"], e["enumsortorder"])):
        if e["schema_name"] == "public": cap.setdefault(e["typname"], []).append(e["enumlabel"])
    need = sorted({c["type_sql"] for c in X["columns"]} - BUILTIN - set(known))
    need = [t for t in need if not t.startswith(("numeric(", "character varying"))]
    sql, unresolved, from_types = [], [], []
    for t in need:
        if t in cap:
            from_types.append(t + ":captured")
            sql.append(f"CREATE TYPE public.{q(t)} AS ENUM (" + ", ".join("'" + l.replace("'", "''") + "'" for l in cap[t]) + ");")
            continue
        m = re.search(r"\b%s:\s*\[([^\]]*)\]" % re.escape(t), types_src)
        labels = re.findall(r'"([^"]*)"', m.group(1)) if m else []
        if not labels: unresolved.append(t); continue
        from_types.append(t)
        sql.append(f"CREATE TYPE public.{q(t)} AS ENUM (" + ", ".join("'" + l.replace("'", "''") + "'" for l in labels) + ");")
    return "\n".join(sql), unresolved, from_types


def plan(types_src, known_enums, cons_enums=()):
    enums_sql, unresolved, from_types = enum_plan(types_src, known_enums, cons_enums)
    cols = {}
    for c in sorted(X["columns"], key=lambda c: (c["schema_name"], c["table_name"], c["position"])):
        cols.setdefault((c["schema_name"], c["table_name"]), []).append(c)
    rels = {(r["nspname"], r["relname"]): r for r in X["relations"]}
    skipped = {k: sorted({c["type_sql"] for c in v if c["type_sql"] in unresolved})
               for k, v in cols.items() if any(c["type_sql"] in unresolved for c in v)}
    return dict(enums_sql=enums_sql, unresolved_enums=unresolved, enums_from_types=from_types,
                cols=cols, rels=rels, skipped=skipped)


def table_sql(P, s, t, existing_cols):
    """Cria ou reconcilia a tabela real; devolve (sql, removed_stub_cols)."""
    out = [f"CREATE SCHEMA IF NOT EXISTS {q(s)};", f"CREATE TABLE IF NOT EXISTS {fq(s, t)} ();"]
    real = {c["column_name"] for c in P["cols"][(s, t)]}
    removed = sorted(set(existing_cols) - real)
    for c in removed: out.append(f"ALTER TABLE {fq(s, t)} DROP COLUMN {q(c)};")
    for c in P["cols"][(s, t)]:
        n, ty = q(c["column_name"]), c["type_sql"]
        if c["generated"] == "s":
            out.append(f"ALTER TABLE {fq(s, t)} DROP COLUMN IF EXISTS {n};")
            out.append(f"ALTER TABLE {fq(s, t)} ADD COLUMN {n} {ty} GENERATED ALWAYS AS ({c['default_expression']}) STORED;")
            continue
        if c["column_name"] in existing_cols:
            out.append(f"ALTER TABLE {fq(s, t)} ALTER COLUMN {n} DROP DEFAULT;")
            out.append(f"ALTER TABLE {fq(s, t)} ALTER COLUMN {n} TYPE {ty} USING {n}::text::{ty};")
        else:
            out.append(f"ALTER TABLE {fq(s, t)} ADD COLUMN {n} {ty};")
        if c["identity"] in ("a", "d"):
            out.append(f"ALTER TABLE {fq(s, t)} ALTER COLUMN {n} SET NOT NULL;")   # exigido pelo IDENTITY (real é NOT NULL)
            out.append(f"ALTER TABLE {fq(s, t)} ALTER COLUMN {n} ADD GENERATED {'ALWAYS' if c['identity'] == 'a' else 'BY DEFAULT'} AS IDENTITY;")
        elif c["default_expression"]:
            out.append(f"ALTER TABLE {fq(s, t)} ALTER COLUMN {n} SET DEFAULT {c['default_expression']};")
    return out, removed


def notnull_sql(P, s, t):
    return [f"ALTER TABLE {fq(s, t)} ALTER COLUMN {q(c['column_name'])} SET NOT NULL;"
            for c in P["cols"][(s, t)] if c["not_null"] and c["generated"] != "s"]


def constraints(kinds):
    for c in X["constraints"]:
        if c["type"] in kinds:
            nv = "" if c["validated"] else " NOT VALID"
            yield c, f"ALTER TABLE {fq(c['schema_name'], c['table_name'])} ADD CONSTRAINT {q(c['name'])} {c['definition']}{nv};"


def policy_sql(p):
    cmd = {"*": "ALL", "r": "SELECT", "a": "INSERT", "w": "UPDATE", "d": "DELETE"}.get(p["command"], p["command"])
    roles = ", ".join("public" if r == "public" else q(r) for r in p["roles"]) or "public"
    s = f"CREATE POLICY {q(p['name'])} ON {fq(p['schema_name'], p['table_name'])} AS {'PERMISSIVE' if p['permissive'] else 'RESTRICTIVE'} FOR {cmd} TO {roles}"
    if p["using"] is not None: s += f" USING ({p['using']})"
    if p["check"] is not None: s += f" WITH CHECK ({p['check']})"
    return s + ";"


def rls_sql(P):
    out = []
    for (s, t), r in P["rels"].items():
        if r["relkind"] != "r" or (s, t) in P["skipped"]: continue
        if r["relrowsecurity"]: out.append(f"ALTER TABLE {fq(s, t)} ENABLE ROW LEVEL SECURITY;")
        if r["relforcerowsecurity"]: out.append(f"ALTER TABLE {fq(s, t)} FORCE ROW LEVEL SECURITY;")
    return out


def views_sql():
    return [(v["relname"], f"CREATE MATERIALIZED VIEW {fq(v['schema_name'], v['relname'])} AS {v['view_definition'].rstrip().rstrip(';')} WITH NO DATA;"
             if v["relkind"] == "m" else f"CREATE VIEW {fq(v['schema_name'], v['relname'])} AS {v['view_definition']}")
            for v in X["views"]]
