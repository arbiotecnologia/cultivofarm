#!/usr/bin/env python3
"""Sem rede: funde a saída QA_TITLES_JSON do 05 (arquivo) e os limites fictícios do seed (A=5000, B=7000, C=9000) no
manifesto JÁ existente do root (não reprovisiona nada). Uso: merge_seed_manifest.py fixture-manifest.json titles.json"""
import json, sys
man, tj = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
LIM = {"A": 5000, "B": 7000, "C": 9000}
for k in "ABC":
    p = man["partners"][k]
    if not tj.get(k): sys.exit(f"STOP: sem título sentinela para {k}")
    p["titles"] = tj[k]; p["credit_limit"] = LIM[k]
json.dump(man, open(sys.argv[1], "w"), indent=1)
print("OK manifest atualizado:", {k: len(man["partners"][k]["titles"]) for k in "ABC"})
