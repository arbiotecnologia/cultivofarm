#!/usr/bin/env python3
"""H7O — Evidência de consumidores no REPOSITÓRIO para cada função SECURITY DEFINER do catálogo.

Lê secdef_catalog.tsv (gerado no staging) e varre o repositório procurando referências:
  fe_strong  : chamada literal `.rpc("nome")` / `/rpc/nome` em src/ (fora de src/test)
  fe_weak    : literal "nome" / 'nome' / `nome` em src/ (mapas de nomes, constantes, chamadas indiretas)
  edge_strong: `.rpc("nome")` em supabase/functions/
  edge_weak  : literal em supabase/functions/
  tests      : src/test/, e2e/, scripts/, supabase/tests/, tests/, playwright-fixture.ts
  harness    : restoration/**/*.sql|*.sh (exceto h7n-inventario/h7o-inventario)
  migrations : quantas migrations mencionam o nome (informativo; não é consumidor de runtime)
Saída: repo_refs.tsv (uma linha por nome de função, com arquivos:linha como evidência).
Não imprime segredos: só nomes de arquivo e números de linha.
"""
import os, re, sys, csv
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
HERE = os.path.dirname(os.path.abspath(__file__))
CATALOG = os.path.join(HERE, "secdef_catalog.tsv")
OUT = os.path.join(HERE, "repo_refs.tsv")

SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".lovable", "h7n-inventario", "h7o-inventario"}
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".sql", ".sh", ".py", ".toml", ".json", ".md"}

def walk(rel):
    base = os.path.join(ROOT, rel)
    if os.path.isfile(base):
        yield base
        return
    for dp, dns, fns in os.walk(base):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for f in fns:
            if os.path.splitext(f)[1] in CODE_EXT:
                yield os.path.join(dp, f)

def load(paths):
    files = {}
    for rel in paths:
        for p in walk(rel):
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as fh:
                    files[os.path.relpath(p, ROOT)] = fh.read()
            except OSError:
                pass
    return files

fe_files = {k: v for k, v in load(["src"]).items() if not k.startswith("src/test/") and k != "src/integrations/supabase/types.ts"}
test_files = load(["src/test", "e2e", "scripts", "supabase/tests", "tests", "playwright-fixture.ts"])
edge_files = load(["supabase/functions"])
harness_files = {k: v for k, v in load(["restoration"]).items() if k.endswith((".sql", ".sh"))}
mig_files = load(["supabase/migrations"])

names = []
with open(CATALOG, encoding="utf-8") as fh:
    for row in fh:
        if row.startswith("#") or row.startswith("sig\t"):
            continue
        sig = row.split("\t", 1)[0]
        names.append(sig.split("(", 1)[0])
names = sorted(set(names))

def lines_matching(text, rx):
    out = []
    for i, line in enumerate(text.split("\n"), 1):
        if rx.search(line):
            out.append(i)
    return out

def scan(files, name, strong_rx, weak_rx, limit=6):
    strong, weak = [], []
    for path, text in files.items():
        if name not in text:
            continue
        for ln in lines_matching(text, strong_rx):
            strong.append(f"{path}:{ln}")
        if not strong or True:
            for ln in lines_matching(text, weak_rx):
                weak.append(f"{path}:{ln}")
    return strong[:limit], len(strong), weak[:limit], len(weak)

rows = []
for name in names:
    esc = re.escape(name)
    strong_rx = re.compile(r"""\.rpc\(\s*["'`]""" + esc + r"""["'`]|/rpc/""" + esc + r"""\b""")
    weak_rx = re.compile(r"""["'`]""" + esc + r"""["'`]""")
    sql_rx = re.compile(r"\b" + esc + r"\s*\(")
    fe_s, fe_sn, fe_w, fe_wn = scan(fe_files, name, strong_rx, weak_rx)
    ed_s, ed_sn, ed_w, ed_wn = scan(edge_files, name, strong_rx, weak_rx)
    te_s, te_sn, te_w, te_wn = scan(test_files, name, strong_rx, re.compile(weak_rx.pattern + "|" + sql_rx.pattern))
    ha = []
    for path, text in harness_files.items():
        if name in text:
            for ln in lines_matching(text, sql_rx):
                ha.append(f"{path}:{ln}")
    mig_n = sum(1 for t in mig_files.values() if re.search(sql_rx, t))
    rows.append({
        "name": name,
        "fe_strong_n": fe_sn, "fe_strong": " ; ".join(fe_s),
        "fe_weak_n": fe_wn, "fe_weak": " ; ".join(fe_w),
        "edge_strong_n": ed_sn, "edge_strong": " ; ".join(ed_s),
        "edge_weak_n": ed_wn, "edge_weak": " ; ".join(ed_w),
        "tests_n": te_sn + te_wn, "tests": " ; ".join((te_s + te_w)[:6]),
        "harness_n": len(ha), "harness": " ; ".join(ha[:6]),
        "migrations_n": mig_n,
    })

with open(OUT, "w", encoding="utf-8", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()), delimiter="\t")
    w.writeheader()
    for r in rows:
        w.writerow(r)

tot = len(rows)
fe = sum(1 for r in rows if r["fe_strong_n"] or r["fe_weak_n"])
ed = sum(1 for r in rows if r["edge_strong_n"] or r["edge_weak_n"])
te = sum(1 for r in rows if r["tests_n"])
ha = sum(1 for r in rows if r["harness_n"])
none = sum(1 for r in rows if not (r["fe_strong_n"] or r["fe_weak_n"] or r["edge_strong_n"] or r["edge_weak_n"]))
print(f"funções: {tot} | com ref frontend: {fe} | com ref edge: {ed} | com ref testes: {te} | com ref harness: {ha} | sem ref frontend/edge: {none}")
