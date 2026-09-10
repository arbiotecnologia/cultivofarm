#!/usr/bin/env python3
"""Validação estática do manifesto de promoção H9 (P0). Somente leitura.

Não acessa banco, não escreve arquivos. Falha com exit != 0 em qualquer violação.
"""
import csv
import glob
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MANIFESTO = os.path.join(ROOT, "restoration/promocao-producao-h9/01-manifesto-migrations.csv")
QUARENTENA = os.path.join(ROOT, "restoration/homologacao-h7/h7p-repo-only-manifest.json")
PROD_MAX = "20260723000000"
SANDBOX = "yzszlzjpovmcteuxjznj"
CLASSES = {"PROMOVER", "STAGING_ONLY", "SUBSTITUIDA_SQUASHED", "BLOQUEADA_REQUER_DECISAO"}
ONDAS = {"P1", "P2", "P3", "P4", "P5", "—"}

rows = list(csv.DictReader(open(MANIFESTO, encoding="utf-8")))
quarentena = {e["version"] for e in json.load(open(QUARENTENA))["entries"]}
erros = []


def check(cond, msg):
    if not cond:
        erros.append(msg)


check(len(rows) == 192, f"manifesto deve ter 192 linhas, tem {len(rows)}")
versions = [r["version"] for r in rows]
check(len(set(versions)) == len(versions), "há versão duplicada no manifesto")
check(not (set(versions) & quarentena), "manifesto contém migration em quarentena")
check(all(v > PROD_MAX for v in versions), "manifesto contém versão já aplicada em produção")
check(versions == sorted(versions), "manifesto não está em ordem cronológica")

for r in rows:
    v = r["version"]
    check(r["classificacao"] in CLASSES, f"{v}: classificação inválida {r['classificacao']}")
    check(r["onda"] in ONDAS, f"{v}: onda inválida {r['onda']}")
    if r["classificacao"] == "PROMOVER":
        check(r["onda"] != "—", f"{v}: PROMOVER sem onda atribuída")
    else:
        check(r["onda"] == "—", f"{v}: não promovível não pode ter onda")
    p = os.path.join(ROOT, r["arquivo"])
    check(os.path.isfile(p), f"{v}: arquivo ausente {r['arquivo']}")
    if not os.path.isfile(p):
        continue
    s = open(p, encoding="utf-8", errors="replace").read()
    check(SANDBOX not in s, f"{v}: referencia o sandbox proibido")
    check(os.path.basename(p).startswith(v), f"{v}: nome do arquivo não bate com a versão")
    if r["classificacao"] == "PROMOVER":
        check("STAGING_GUARD" not in s, f"{v}: PROMOVER com guarda fixa de staging")
        check("ikaauvsflpmamgxmkhoq" not in s, f"{v}: PROMOVER com ref literal de homologação")
        check(
            not re.search(r"'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'", s),
            f"{v}: PROMOVER com UUID literal (possível dado de homologação)",
        )
        check(
            not re.search(r"(?i)\b(drop\s+table|truncate|drop\s+column)\b", s),
            f"{v}: PROMOVER com DDL destrutivo",
        )
        check(
            not re.search(r"(?i)-----BEGIN [A-Z ]*PRIVATE KEY", s),
            f"{v}: PROMOVER contém material de chave privada",
        )

# dependência: dentro de cada onda a ordem cronológica é preservada
for onda in ("P1", "P2", "P3", "P4", "P5"):
    sel = [r["version"] for r in rows if r["onda"] == onda]
    check(sel == sorted(sel), f"{onda}: ordem cronológica quebrada")

# artefatos obrigatórios da P0
for nome in (
    "00-preflight-readonly.md",
    "01-manifesto-migrations.csv",
    "02-plano-ondas.md",
    "03-prechecks.sql",
    "04-postchecks.sql",
    "05-rollback-por-onda.md",
    "06-runbook-execucao.md",
    "07-prompt-execucao-producao.md",
):
    check(
        os.path.isfile(os.path.join(ROOT, "restoration/promocao-producao-h9", nome)),
        f"artefato ausente: {nome}",
    )

# os SQL desta fase são somente leitura
for sqlf in glob.glob(os.path.join(ROOT, "restoration/promocao-producao-h9", "*.sql")):
    body = "\n".join(
        l for l in open(sqlf, encoding="utf-8").read().splitlines() if not l.strip().startswith("--")
    )
    check(
        not re.search(r"(?i)\b(insert|update|delete|drop|create|alter|grant|revoke|truncate)\b", body),
        f"{os.path.basename(sqlf)}: contém comando de escrita",
    )

if erros:
    print("FALHOU:")
    for e in erros:
        print(" -", e)
    sys.exit(1)

from collections import Counter

print("VALIDACAO_ESTATICA_OK")
print("total:", len(rows))
print("por classificação:", dict(Counter(r["classificacao"] for r in rows)))
print("por onda:", dict(Counter(r["onda"] for r in rows)))
