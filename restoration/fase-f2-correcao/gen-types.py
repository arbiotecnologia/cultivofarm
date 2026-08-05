#!/usr/bin/env python3
"""Gera os blocos canonicos de tipos das relacoes/RPCs regulatorios (Fase F2)
lendo o catalogo do banco de STAGING e faz o splice em
src/integrations/supabase/types.ts mantendo a ordem alfabetica.

Uso:  STAGING_DSN=... python3 restoration/fase-f2-correcao/gen-types.py

Nao contem credenciais: a DSN vem exclusivamente do ambiente.
"""
import json
import os
import re
import subprocess
import sys

DSN = os.environ.get("STAGING_DSN")
if not DSN:
    sys.exit("STAGING_DSN ausente no ambiente")

TYPES = "src/integrations/supabase/types.ts"

TABLES = [
    "fiscal_official_sources",
    "microorganism_ncm_candidates",
    "microorganism_regulatory_checklist",
    "microorganism_regulatory_documents",
    "microorganism_regulatory_dossiers",
    "microorganism_regulatory_presentations",
    "microorganism_regulatory_publication_snapshots",
    "regulatory_storage_cleanup_queue",
]
FUNCS_LIKE = ("rpc_regulatory_%", "rpc_microorganism_regulatory_%", "fn_gtin_is_valid")

SCALAR = {
    "text": "string", "character varying": "string", "uuid": "string", "citext": "string",
    "date": "string", "timestamp with time zone": "string", "timestamp without time zone": "string",
    "time without time zone": "string", "bytea": "string", "name": "string",
    "integer": "number", "bigint": "number", "smallint": "number", "numeric": "number",
    "double precision": "number", "real": "number",
    "boolean": "boolean", "json": "Json", "jsonb": "Json",
}


def q(sql: str):
    out = subprocess.run(
        ["psql", DSN, "-Atc", sql], capture_output=True, text=True, check=True
    ).stdout
    return json.loads(out) if out.strip() else []


def ts_type(udt: str, is_array: bool) -> str:
    base = SCALAR.get(udt)
    if base is None:
        base = "string"  # enums e dominios sao serializados como string pelo PostgREST
    return f"{base}[]" if is_array else base


def table_block(name: str, cols) -> str:
    rows, ins, upd = [], [], []
    for c in cols:
        t = ts_type(c["udt"], c["is_array"])
        nullable = c["nullable"]
        rows.append(f"          {c['name']}: {t}{' | null' if nullable else ''}")
        opt = "?" if (c["has_default"] or nullable or c["is_identity"]) else ""
        ins.append(f"          {c['name']}{opt}: {t}{' | null' if nullable else ''}")
        upd.append(f"          {c['name']}?: {t}{' | null' if nullable else ''}")
    return (
        f"      {name}: {{\n"
        "        Row: {\n" + "\n".join(rows) + "\n        }\n"
        "        Insert: {\n" + "\n".join(ins) + "\n        }\n"
        "        Update: {\n" + "\n".join(upd) + "\n        }\n"
        "        Relationships: []\n"
        "      }\n"
    )


def func_block(name: str, args, ret: str) -> str:
    if args:
        arg_lines = "\n".join(
            f"          {a['name']}{'?' if a['has_default'] else ''}: {ts_type(a['udt'], a['is_array'])}"
            for a in args
        )
        args_ts = "        Args: {\n" + arg_lines + "\n        }\n"
    else:
        args_ts = "        Args: Record<PropertyKey, never>\n"
    return f"      {name}: {{\n{args_ts}        Returns: {ret}\n      }}\n"


def splice(src: str, section_header: str, blocks: dict) -> str:
    start = src.index(section_header) + len(section_header)
    depth = 1
    i = start
    while depth:
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
        i += 1
    body = src[start:i - 1]

    # separa entradas de topo (indentacao 6)
    entries = {}
    order = []
    for m in re.finditer(r"\n      ([A-Za-z_][A-Za-z0-9_]*): \{", body):
        order.append((m.group(1), m.start() + 1))
    for idx, (nm, pos) in enumerate(order):
        end = order[idx + 1][1] if idx + 1 < len(order) else len(body)
        entries[nm] = body[pos:end]

    entries.update(blocks)  # substitui/insere
    new_body = "\n" + "".join(entries[k] for k in sorted(entries))
    return src[:start] + new_body + src[i - 1:]


def main():
    col_sql = """
    select coalesce(json_agg(json_build_object(
      'table', c.table_name, 'name', c.column_name,
      'udt', case when c.data_type='ARRAY'
                  then (select ct.data_type from information_schema.element_types ct
                         where ct.object_name=c.table_name and ct.object_schema=c.table_schema
                           and ct.collection_type_identifier=c.dtd_identifier)
                  else c.data_type end,
      'is_array', c.data_type='ARRAY',
      'nullable', c.is_nullable='YES',
      'has_default', c.column_default is not null,
      'is_identity', c.is_identity='YES'
    ) order by c.table_name, c.ordinal_position), '[]'::json)
    from information_schema.columns c
    where c.table_schema='public' and c.table_name in (%s)
    """ % ", ".join("'%s'" % t for t in TABLES)
    cols = q(col_sql)
    by_table = {}
    for c in cols:
        by_table.setdefault(c["table"], []).append(c)
    table_blocks = {t: table_block(t, by_table[t]) for t in by_table}

    fn_sql = """
    select coalesce(json_agg(x order by x->>'name'), '[]'::json) from (
      select json_build_object(
        'name', p.proname,
        'ret', case
                 when pg_get_function_result(p.oid) in ('void') then 'undefined'
                 when pg_get_function_result(p.oid) in ('boolean') then 'boolean'
                 when pg_get_function_result(p.oid) in ('integer','bigint','numeric') then 'number'
                 when pg_get_function_result(p.oid) in ('jsonb','json') then 'Json'
                 else 'string' end,
        'args', coalesce((
          select json_agg(json_build_object(
            'name', a.argname, 'udt', a.typname, 'is_array', a.isarr,
            'has_default', a.ord > p.pronargs - p.pronargdefaults) order by a.ord)
          from (
            select unnest(coalesce(p.proargnames, '{}'::text[])) as argname,
                   format_type(unnest(p.proargtypes), null) as typname,
                   false as isarr,
                   generate_series(1, p.pronargs) as ord
          ) a
        ), '[]'::json)
      ) as x
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and (p.proname like 'rpc_regulatory%%' or p.proname like 'rpc_microorganism_regulatory%%' or p.proname = 'fn_gtin_is_valid')
        and p.prokind = 'f'
    ) s
    """
    fns = q(fn_sql)
    fn_blocks = {}
    for f in fns:
        fn_blocks[f["name"]] = func_block(f["name"], f["args"], f["ret"])

    src = open(TYPES).read()
    src = splice(src, "    Tables: {", table_blocks)
    src = splice(src, "    Functions: {", fn_blocks)
    open(TYPES, "w").write(src)
    print(f"tabelas: {len(table_blocks)} | funcoes: {len(fn_blocks)}")


if __name__ == "__main__":
    main()
