"""Dependências v2.11 (captura READ ONLY de produção 02/11, SHA-256 6eed148a…30cc): 15 relações (294 colunas, 120
constraints), 10 funções (8 nomes, overloads public/platform_private), a view _src_vw_esteira_laboratorio e 2 sequências
(sem last_value). Sem linhas de dados.

Integração sem stub: as relações entram na MESMA via das extras reais (extras_schema.X) — colunas/tipos/defaults/NOT NULL
e PK/UNIQUE/CHECK/FK reais; enums novos vêm da captura de enums. accounts_payable já estava nas extras e é idêntica
(colunas e constraints) — não é duplicada, a igualdade é verificada aqui. Flags de RLS/policies/gatilhos/ACL das 15
relações NÃO foram capturados: as relações são marcadas `rls_unknown` e nenhuma flag é inventada.
Sequências: parâmetros reais; max_value chega como float JSON (9.223372036854776e18) = máximo de bigint.
"""
import hashlib, json
from pathlib import Path
import extras_schema as XS

PATH = XS.ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/captura-v211-dependencias-20261102/fechamento-v211-dependencias-20261102.json"
SHA = "6eed148aa04283c13d8bd99962bf0ed9781ceebc8af5602aa77b1a2c489030cc"
assert hashlib.sha256(PATH.read_bytes()).hexdigest() == SHA, "captura v2.11 divergente"
D = json.loads(PATH.read_text())
assert D["source"].startswith("production READ ONLY swzpzcwiasxmjutrmvkm")
assert (len(D["columns"]), len(D["constraints"]), len(D["functions"]), len(D["views"]), len(D["sequences"])) == (294, 120, 10, 1, 2)

KIND = (("PRIMARY KEY", "p"), ("UNIQUE", "u"), ("FOREIGN KEY", "f"), ("CHECK", "c"), ("EXCLUDE", "x"))


def _kind(defn):
    for pre, k in KIND:
        if defn.startswith(pre): return k
    raise AssertionError("tipo de constraint desconhecido: " + defn[:60])


def merge():
    """Acrescenta as relações novas a XS.X (idempotente). Devolve resumo."""
    if XS.X.get("_v211"): return XS.X["_v211"]
    have = {(r["nspname"], r["relname"]) for r in XS.X["relations"]}
    tabs = []
    for c in D["columns"]:
        k = (c["schema"], c["table"])
        if k not in tabs: tabs.append(k)
    overlap = [k for k in tabs if k in have]
    for s, t in overlap:   # igualdade exigida (default None≡'')
        old = [(c["column_name"], c["type_sql"], c["default_expression"] or "", c["not_null"])
               for c in sorted(XS.X["columns"], key=lambda c: c["position"]) if (c["schema_name"], c["table_name"]) == (s, t)]
        new = [(c["name"], c["type"], c["default"] or "", c["not_null"]) for c in D["columns"] if (c["schema"], c["table"]) == (s, t)]
        assert old == new, f"{s}.{t}: colunas divergentes entre capturas"
        oc = {c["name"]: c["definition"] for c in XS.X["constraints"] if (c["schema_name"], c["table_name"]) == (s, t)}
        nc = {c["name"]: c["definition"] for c in D["constraints"] if (c["schema"], c["table"]) == (s, t)}
        assert oc == nc, f"{s}.{t}: constraints divergentes entre capturas"
    pos = {}
    for c in D["columns"]:
        k = (c["schema"], c["table"])
        if k in overlap: continue
        pos[k] = pos.get(k, 0) + 1
        XS.X["columns"].append(dict(schema_name=k[0], table_name=k[1], column_name=c["name"], type_sql=c["type"],
                                    default_expression=c["default"] or None, identity=c["identity"], generated=c["generated"],
                                    not_null=c["not_null"], position=pos[k]))
    for c in D["constraints"]:
        k = (c["schema"], c["table"])
        if k in overlap: continue
        XS.X["constraints"].append(dict(name=c["name"], type=_kind(c["definition"]), validated="NOT VALID" not in c["definition"],
                                        definition=c["definition"].replace(" NOT VALID", ""), table_name=k[1], schema_name=k[0]))
    for k in tabs:
        if k not in overlap:
            XS.X["relations"].append(dict(oid=None, nspname=k[0], relkind="r", relname=k[1], relrowsecurity=None,
                                          relforcerowsecurity=None, rls_unknown=True))
    XS.X["_v211"] = dict(new_relations=[f"{a}.{b}" for a, b in tabs if (a, b) not in overlap],
                         identical_overlap=[f"{a}.{b}" for a, b in overlap])
    return XS.X["_v211"]


def sequences_sql():
    out = []
    for s in D["sequences"]:
        mx = "NO MAXVALUE" if s["max_value"] >= 9.2e18 else f"MAXVALUE {int(s['max_value'])}"
        out.append(f"CREATE SEQUENCE IF NOT EXISTS {XS.fq(s['schemaname'], s['sequencename'])} AS {s['data_type']} "
                   f"INCREMENT BY {s['increment_by']} MINVALUE {s['min_value']} {mx} START WITH {s['start_value']} "
                   f"CACHE {s['cache_size']} {'CYCLE' if s['cycle'] else 'NO CYCLE'};")
    return out


def view_sql():
    v = D["views"][0]
    return v["name"], f"CREATE OR REPLACE VIEW {XS.fq(v['schema'], v['name'])} AS {v['definition']}"


def functions():
    return [dict(schema=f["schema"], name=f["name"], args=f["identity_args"], definition=f["definition"], md5=f["md5"])
            for f in D["functions"]]


def md5_sql(f):
    return (f"SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p WHERE p.proname='{f['name']}' "
            f"AND p.pronamespace=to_regnamespace('{f['schema']}') AND pg_get_function_identity_arguments(p.oid)='{f['args']}'")
