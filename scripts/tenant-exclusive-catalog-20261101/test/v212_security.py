"""Fechamento v2.12 (captura READ ONLY de produção 02/11, SHA-256 6b8fc306…8b6d): 21 relações, 450 colunas, 200 constraints,
70 policies, 76 gatilhos (com corpo/MD5 da função), ACL e flags RLS reais, fn_fiscal_base_components_valid(jsonb) e a view
vw_os_integridade_esteira. Sem linhas de dados.

Integração sem stub/simulação:
- 6 relações novas (fiscal_invoices, fiscal_document_series, payable_payments, financial_documents, financial_receipts,
  financial_report_exports) entram pela MESMA via das extras reais (extras_schema.X);
- as 15 relações já integradas exigem colunas/constraints IDÊNTICAS entre capturas (divergência aborta);
- segurança das 21: RLS/FORCE reais, policies verbatim (as 7 já existentes nas extras devem ser idênticas), gatilhos
  verbatim com a função do próprio anexo (MD5 de pg_get_functiondef conferido) e ACL de tabela reconstruída de relacl.
"""
import hashlib, json
import extras_schema as XS

PATH = XS.ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/captura-v212-seguranca-20261102/fechamento-v212-seguranca-20261102.json"
SHA = "6b8fc30604136116404d713b0b4fc4bef2cc16c2bdafccfb1fbe006d1f5a8b6d"
assert hashlib.sha256(PATH.read_bytes()).hexdigest() == SHA, "captura v2.12 divergente"
D = json.loads(PATH.read_text())
assert tuple(len(D[k]) for k in ("relations", "columns", "constraints", "policies", "triggers", "functions", "views")) == (21, 450, 200, 70, 76, 1, 1)
assert all(t["enabled"] == "O" for t in D["triggers"])

# v2.13: public.fiscal_certificates (captura READ ONLY produção 02/11, SOMENTE esquema, sem linhas/certificados/segredos).
# Convertida verbatim para o formato v2.12: colunas, constraints, policy, 2 gatilhos (MD5 do corpo conferido), ACL de
# information_schema.table_privileges reconstruída em letras relacl e índices não-constraint executados verbatim.
PATH13 = XS.ROOT / "docs/auditorias/evidencias/catalogo-exclusivo-tenant-20261101/captura-v213-fiscal-certificates-20261102/fiscal-certificates-schema-20261102.json"
SHA13 = "b0c4265b1b5b685d0a475816fcc8923aecf34ef0478d00019e31653ede6bab84"
assert hashlib.sha256(PATH13.read_bytes()).hexdigest() == SHA13, "captura v2.13 divergente"
D13 = json.loads(PATH13.read_text())
assert (len(D13["columns"]), len(D13["constraints"]), len(D13["policies"]), len(D13["triggers"]), len(D13["grants"]), len(D13["indexes"])) == (22, 6, 1, 2, 28, 3)
_L = {v: k for k, v in {"r": "SELECT", "a": "INSERT", "w": "UPDATE", "d": "DELETE", "D": "TRUNCATE", "x": "REFERENCES", "t": "TRIGGER"}.items()}
_acl = {}
for g in D13["grants"]:
    assert (g["table_schema"], g["table_name"], g["grantor"]) == ("public", "fiscal_certificates", "postgres")
    _acl.setdefault(g["grantee"], "")
    _acl[g["grantee"]] += _L[g["privilege_type"]] + ("*" if g["is_grantable"] == "YES" else "")
D["relations"].append(dict(oid=None, nspname="public", relname="fiscal_certificates", relacl=[f"{k}={v}/postgres" for k, v in _acl.items()],
                           relrowsecurity=D13["rls"]["enabled"], relforcerowsecurity=D13["rls"]["forced"]))
D["columns"] += [dict(name=c["name"], type=c["type"], table="fiscal_certificates", schema="public", default=c["default"],
                      identity="", generated="", not_null=c["not_null"]) for c in D13["columns"]]
D["constraints"] += [dict(name=c["name"], table="fiscal_certificates", schema="public", definition=c["definition"]) for c in D13["constraints"]]
D["policies"] += D13["policies"]
for t in D13["triggers"]:
    assert hashlib.md5(t["function"].encode()).hexdigest() == t["md5"], t["name"]
    D["triggers"].append(dict(name=t["name"], table="fiscal_certificates", schema="public", enabled="O", definition=t["definition"],
                              function_md5=t["md5"], function_definition=t["function"]))
INDEXES13 = [i for i in D13["indexes"] if " fiscal_certificates_pkey " not in i]   # pkey já vem da constraint
RELS = {(r["nspname"], r["relname"]): r for r in D["relations"]}
PRIV = {"r": "SELECT", "a": "INSERT", "w": "UPDATE", "d": "DELETE", "D": "TRUNCATE", "x": "REFERENCES", "t": "TRIGGER", "m": "MAINTAIN"}
CMD = {"ALL": "*", "SELECT": "r", "INSERT": "a", "UPDATE": "w", "DELETE": "d"}
KIND = (("PRIMARY KEY", "p"), ("UNIQUE", "u"), ("FOREIGN KEY", "f"), ("CHECK", "c"), ("EXCLUDE", "x"))


def _kind(defn):
    for pre, k in KIND:
        if defn.startswith(pre): return k
    raise AssertionError("tipo de constraint desconhecido: " + defn[:60])


def _pol(p):
    return dict(name=p["policyname"], schema_name=p["schemaname"], table_name=p["tablename"], command=CMD[p["cmd"]],
                permissive=p["permissive"] == "PERMISSIVE", roles=list(p["roles"]), using=p["qual"], check=p["with_check"])


def merge():
    """Chamar DEPOIS de v211_deps.merge(): acrescenta 6 relações, confere as 15 e aplica flags/policies reais. Idempotente."""
    if XS.X.get("_v212"): return XS.X["_v212"]
    have = {(r["nspname"], r["relname"]): r for r in XS.X["relations"]}
    overlap, new = [k for k in RELS if k in have], [k for k in RELS if k not in have]
    for s, t in overlap:
        old = [(c["column_name"], c["type_sql"], c["default_expression"] or "", c["not_null"])
               for c in sorted(XS.X["columns"], key=lambda c: c["position"]) if (c["schema_name"], c["table_name"]) == (s, t)]
        nw = [(c["name"], c["type"], c["default"] or "", c["not_null"]) for c in D["columns"] if (c["schema"], c["table"]) == (s, t)]
        assert old == nw, f"{s}.{t}: colunas divergentes entre capturas"
        oc = {c["name"]: c["definition"] + ("" if c["validated"] else " NOT VALID") for c in XS.X["constraints"] if (c["schema_name"], c["table_name"]) == (s, t)}
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
        if (c["schema"], c["table"]) in overlap: continue
        XS.X["constraints"].append(dict(name=c["name"], type=_kind(c["definition"]), validated="NOT VALID" not in c["definition"],
                                        definition=c["definition"].replace(" NOT VALID", ""), table_name=c["table"], schema_name=c["schema"]))
    for k in new:
        XS.X["relations"].append(dict(oid=None, nspname=k[0], relkind="r", relname=k[1]))
    for r in XS.X["relations"]:   # flags reais substituem rls_unknown
        k = (r["nspname"], r["relname"])
        if k in RELS:
            assert r.get("rls_unknown") or r.get("relrowsecurity") is None or r["relrowsecurity"] == RELS[k]["relrowsecurity"], k
            r.update(relrowsecurity=RELS[k]["relrowsecurity"], relforcerowsecurity=RELS[k]["relforcerowsecurity"], rls_unknown=False)
    xp = {(p["schema_name"], p["table_name"], p["name"]): p for p in XS.X["policies"]}
    same, added = [], []
    for p in D["policies"]:
        np_ = _pol(p); k = (np_["schema_name"], np_["table_name"], np_["name"])
        if k in xp:
            o = xp[k]
            assert (o["command"], o["permissive"], sorted(o["roles"]), o["using"], o["check"]) == \
                   (np_["command"], np_["permissive"], sorted(np_["roles"]), np_["using"], np_["check"]), f"policy divergente {k}"
            same.append(k[2])
        else:
            XS.X["policies"].append(np_); added.append(k[2])
    XS.X["_v212"] = dict(new_relations=[f"{a}.{b}" for a, b in new], identical_overlap=len(overlap),
                         policies_identical=len(same), policies_added=len(added))
    return XS.X["_v212"]


def function():
    f = D["functions"][0]
    return dict(schema=f["schema"], name=f["name"], args="_c jsonb", definition=f["definition"], md5=f["md5"])


def view_sql():
    v = D["views"][0]
    return v["name"], f"CREATE OR REPLACE VIEW {XS.fq(v['schema'], v['name'])} AS {v['definition']}"


def trigger_functions():
    """Funções distintas dos gatilhos: (nome qualificado, definição, md5)."""
    out = {}
    for t in D["triggers"]:
        fn = t["function_definition"].split("(", 1)[0].split()[-1]
        if fn in out: assert out[fn][1] == t["function_md5"], f"md5 divergente para {fn}"
        out[fn] = (t["function_definition"], t["function_md5"])
    return out


def triggers():
    return [(t["schema"], t["table"], t["name"], t["definition"]) for t in D["triggers"]]


def acl_sql(server_major):
    """REVOKE ALL dos papéis clientes + GRANT exato de relacl. MAINTAIN só existe no PG17+: declarado se ausente."""
    out, dropped = [], []
    for (s, t), r in RELS.items():
        rel = XS.fq(s, t)
        out.append(f"REVOKE ALL ON {rel} FROM PUBLIC, anon, authenticated, service_role;")
        for a in r["relacl"] or []:
            who, rest = a.split("=", 1); privs = rest.split("/")[0]
            if who in ("postgres", ""): continue
            ps = []
            for ch in privs.replace("*", ""):
                if ch == "m" and server_major < 17: dropped.append(f"{s}.{t}:{who}:MAINTAIN"); continue
                ps.append(PRIV[ch])
            if ps: out.append(f"GRANT {', '.join(ps)} ON {rel} TO {XS.q(who)};")
    return out, dropped


def acl_expected():
    """{(tabela, papel): set(letras)} sem MAINTAIN para conferência via has_table_privilege."""
    exp = {}
    for (s, t), r in RELS.items():
        for a in r["relacl"] or []:
            who, rest = a.split("=", 1)
            if who in ("postgres", ""): continue
            exp[(f"{s}.{t}", who)] = set(rest.split("/")[0].replace("*", "")) - {"m"}
    return exp
