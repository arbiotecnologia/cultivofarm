"""Esquema REAL capturado (catalogo-schema-input.json, READ ONLY 01/11) para o PostgreSQL descartável.

Substitui as colunas sintéticas do harness por tipos/nulabilidade/defaults/índices/policies/gatilhos reais das
59 tabelas. Enums: rótulos NÃO foram capturados como tipo; são reconstruídos de literais 'x'::enum presentes nos
textos capturados (defaults, policies, corpos LIVE) — rótulo nunca citado não existe aqui (limite declarado).
Fixtures: colunas NOT NULL sem default recebem default TEMPORÁRIO só durante a semeadura (`fixture_defaults`),
removido em `drop_fixture_defaults` — as constraints reais valem para todos os testes.
"""
import collections, json, re

BUILTIN_DEFAULT = re.compile(r"^(gen_random_uuid\(\)|now\(\)|CURRENT_DATE|CURRENT_TIMESTAMP|true|false|-?\d+(\.\d+)?|'[^']*'(::[\w\[\] .]+)?|\(?'[^']*'::text \|\| lpad\(\(nextval\('(\w+)'::regclass\)\)::text, \d+, '0'::text\)\)?|nextval\('(\w+)'::regclass\)|ARRAY\[\]::text\[\]|timezone\('utc'::text, now\(\)\))$")


def load(consol):
    return consol["files"]["catalogo-schema-input.json"]


def enum_labels(cap, texts):
    enums = sorted({c["udt_name"] for c in cap["columns"] if c["data_type"] == "USER-DEFINED"})
    blob = "\n".join(texts)
    out = {}
    for e in enums:
        labs = []
        for m in re.finditer(r"'([^']*)'::(?:public\.)?" + re.escape(e) + r"\b", blob):
            if m.group(1) not in labs: labs.append(m.group(1))
        out[e] = labs
    return out


def coltype(c):
    if c["data_type"] == "USER-DEFINED": return "public." + c["udt_name"]
    if c["data_type"] == "ARRAY":
        return {"_text": "text[]", "_uuid": "uuid[]", "_int4": "integer[]", "_numeric": "numeric[]", "_varchar": "varchar[]"}.get(c["udt_name"], "text[]")
    return c["data_type"]


def ddl(cap, fks, texts, extra_enum_labels=None, cons=None):
    """Devolve (sql_tabelas, sql_fks, sql_indices, info). Com `cons` (captura 02/11), enums e constraints são REAIS."""
    labels = enum_labels(cap, texts)
    if cons:   # rótulos REAIS em enumsortorder; substitui reconstrução por literais
        real = collections.defaultdict(list)
        for e in sorted(cons["enums"], key=lambda e: (e["typname"], e["enumsortorder"])): real[e["typname"]].append(e["enumlabel"])
        labels = {k: real[k] for k in labels if k in real} | {k: v for k, v in labels.items() if k not in real}
        extra_enum_labels = None
    for k, v in (extra_enum_labels or {}).items():
        labels[k] = labels.get(k, []) + [x for x in v if x not in labels.get(k, [])]
    out = []; info = dict(enum_without_labels=[], defaults_skipped=[], sequences=[])
    for e, labs in labels.items():
        if not labs: info["enum_without_labels"].append(e); labs = ["__sem_rotulo_capturado__"]
        out.append(f"CREATE TYPE public.{e} AS ENUM (" + ",".join("'" + l.replace("'", "''") + "'" for l in labs) + ");")
    by = collections.defaultdict(list)
    for c in cap["columns"]: by[c["table_name"]].append(c)
    seqs = set()
    for c in cap["columns"]:
        for m in re.finditer(r"nextval\('(\w+)'::regclass\)", c["column_default"] or ""): seqs.add(m.group(1))
    for s in sorted(seqs): out.append(f"CREATE SEQUENCE public.{s};"); info["sequences"].append(s)
    for t, cols in sorted(by.items()):
        parts = []
        for c in cols:
            p = f'"{c["column_name"]}" {coltype(c)}'
            d = c["column_default"]
            if d:
                if BUILTIN_DEFAULT.match(d): p += f" DEFAULT {d}"
                else: info["defaults_skipped"].append(f"{t}.{c['column_name']}={d}")
            if c["is_nullable"] == "NO": p += " NOT NULL"
            parts.append(p)
        out.append(f"CREATE TABLE IF NOT EXISTS public.{t}({', '.join(parts)});")
    idx = []
    conn = {c["conname"]: c for c in (cons or {}).get("constraints", []) if c["contype"] in ("p", "u", "x")}
    for p in cap["policies_and_indexes"]:
        if p["kind"] == "index":
            d = p["data"]
            if d["indexname"] in conn:   # PK/UNIQUE/EXCLUSION reais como CONSTRAINT (definição capturada)
                c = conn[d["indexname"]]
                idx.append(f'ALTER TABLE public.{c["table_name"]} ADD CONSTRAINT {c["conname"]} {c["definition"]}'
                           + ("" if c["convalidated"] else " NOT VALID") + ";")
                continue
            idx.append(d["indexdef"] + ";")
            if d["indexname"].endswith("_pkey") and not cons:   # índice *_pkey capturado = PRIMARY KEY real
                idx.append(f'ALTER TABLE public.{d["tablename"]} ADD CONSTRAINT {d["indexname"]} PRIMARY KEY USING INDEX {d["indexname"]};')
    fk = [f"ALTER TABLE public.{src} ADD CONSTRAINT {con} {dfn};" for src, tgt, con, dfn in fks]
    return "\n".join(out), idx, fk, info


def policies(cap):
    out = []; tabs = set()
    for p in cap["policies_and_indexes"]:
        if p["kind"] != "policy": continue
        d = p["data"]; tabs.add(d["tablename"])
        s = (f'CREATE POLICY "{d["policyname"]}" ON public.{d["tablename"]} AS {d["permissive"]} FOR {d["cmd"]} TO '
             + ", ".join(d["roles"]) + (f" USING ({d['qual']})" if d.get("qual") else "")
             + (f" WITH CHECK ({d['with_check']})" if d.get("with_check") else "") + ";")
        out.append((d["tablename"], d["policyname"], s))
    return out, sorted(tabs)


def triggers(cap):
    return [(t["table_name"], t["tgname"], t["function_name"], t["definition"] + ";") for t in cap["triggers"]]


def grants(cap):
    out = []
    for g in cap["grants"]:
        privs = g["privileges"].strip("{}")
        out.append(f'GRANT {privs} ON public.{g["table_name"]} TO {g["grantee"]};')
    return out


def fixture_defaults(cap):
    """Defaults TEMPORÁRIOS para colunas NOT NULL sem default real (só semeadura)."""
    sample = {"uuid": "gen_random_uuid()", "text": "('fx-'||gen_random_uuid())", "character varying": "('fx-'||gen_random_uuid())", "integer": "0", "bigint": "0",
              "smallint": "0", "numeric": "0", "boolean": "false", "jsonb": "'{}'::jsonb", "json": "'{}'::json",
              "date": "CURRENT_DATE", "timestamp with time zone": "now()", "timestamp without time zone": "now()",
              "double precision": "0", "real": "0", "ARRAY": "'{}'"}
    set_, drop = [], []
    for c in cap["columns"]:
        if c["is_nullable"] != "NO" or (c["column_default"] and BUILTIN_DEFAULT.match(c["column_default"])): continue
        if c["data_type"] == "USER-DEFINED":
            v = f"(enum_range(NULL::public.{c['udt_name']}))[1]"
        else:
            v = sample.get(c["data_type"])
        if not v: continue
        set_.append(f'ALTER TABLE public.{c["table_name"]} ALTER COLUMN "{c["column_name"]}" SET DEFAULT {v};')
        drop.append(f'ALTER TABLE public.{c["table_name"]} ALTER COLUMN "{c["column_name"]}" DROP DEFAULT;')
    return "\n".join(set_), "\n".join(drop)


def checks(cons):
    return [(c["table_name"], c["conname"], f'ALTER TABLE public.{c["table_name"]} ADD CONSTRAINT {c["conname"]} {c["definition"]}'
             + ("" if c["convalidated"] else " NOT VALID") + ";") for c in (cons or {}).get("constraints", []) if c["contype"] == "c"]


def types_tables(types_src, skip, enums=()):
    """Tabelas SINTÉTICAS derivadas do arquivo de tipos gerado do ref canônico (só colunas/tipos aproximados;
    sem NOT NULL/constraints/policies/gatilhos). Usadas apenas para relações referenciadas por helpers/policies
    reais e ausentes da captura de 59 tabelas. Declaradas como sintéticas até a captura das relações extras."""
    pub = types_src[types_src.index("  public: {"):]
    pub = pub[pub.index("    Tables: {"):pub.index("    Views: {")]
    out, names = [], []
    for m in re.finditer(r"^      (\w+): \{\n        Row: \{\n(.*?)\n        \}", pub, re.M | re.S):
        t = m.group(1)
        if t in skip: continue
        cols = []
        for cm in re.finditer(r"^          (\w+): (.+)$", m.group(2), re.M):
            c, ty = cm.group(1), cm.group(2).replace(" | null", "").strip()
            if ty.endswith("[]"): sql = "uuid[]" if c.endswith("_ids") else "text[]"
            elif ty == "string": sql = "uuid" if (c == "id" or c.endswith("_id")) else ("timestamptz" if c.endswith("_at") else "text")
            elif ty == "number": sql = "numeric"
            elif ty == "boolean": sql = "boolean"
            elif ty == "Json": sql = "jsonb"
            elif 'Enums"]["' in ty:
                en = ty.split('Enums"]["')[1].split('"')[0]
                sql = f"public.{en}" if en in enums else "text"
            else: sql = "text"
            cols.append(f'"{c}" {sql}' + (" DEFAULT gen_random_uuid()" if c == "id" and sql == "uuid" else ""))
        if cols:
            out.append(f"CREATE TABLE IF NOT EXISTS public.{t}({', '.join(cols)});"); names.append(t)
    return "\n".join(out), names
