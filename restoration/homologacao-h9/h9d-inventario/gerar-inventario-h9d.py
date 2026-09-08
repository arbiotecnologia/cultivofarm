#!/usr/bin/env python3
"""
H9-D — gerador do inventário e da classificação das funções SECURITY DEFINER
executáveis por `authenticated` na homologação (ikaauvsflpmamgxmkhoq).

METODOLOGIA (retificada):
  1. Universo bruto (376) = consulta determinística ao catálogo de homologação.
  2. 84 funções já auditadas na H9-C entram como FORA_ESCOPO_H9D (evidência herdada).
  3. Escopo profundo H9-D = exatamente 292.
  4. Regex/posição é SOMENTE TRIAGEM. AUTH_COMPROVADA/NAO_APLICAVEL exigem corpo
     lido manualmente, com guarda textual específica da assinatura citada na
     evidência. O restante permanece PENDENTE_EVIDENCIA em lotes determinísticos.

Uso: python3 gerar-inventario-h9d.py [DIR_ARTEFATOS]
Entradas: all.json, scope.json, triage.json, readset.json, decisions.json
Nunca escreve no banco.
"""
from __future__ import annotations

import json
import pathlib
import sys

SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/h9d")
OUT = pathlib.Path(__file__).resolve().parent

LEDGER = 662
AMBIENTE = "ikaauvsflpmamgxmkhoq"

HEADER = [
    "schema",
    "signature",
    "owner",
    "language",
    "volatility",
    "proconfig",
    "anon_execute",
    "acl",
    "dominio",
    "classificacao_h9c",
    "escopo_h9d",
    "objetos_sensiveis",
    "sql_dinamico",
    "body_len",
    "body_md5",
    "classificacao_h9d",
    "evidencia",
]


def load(name: str):
    return json.loads((SRC / name).read_text())


def main() -> int:
    base = [l.split("\t") for l in (OUT / "secdef-authenticated-inventory-h9d.tsv").read_text().strip().split("\n")]
    hdr, rows = base[0], [dict(zip(base[0], r)) for r in base[1:]]
    scope = {x["name"]: x for x in load("scope.json")}
    triage = {r["name"]: r for r in load("triage.json")}
    readset = load("readset.json")  # "nome|args" -> dossiê
    decisions = load("decisions.json")  # nome -> [classificacao, evidencia]

    read_names = {k.split("|")[0]: v for k, v in readset.items()}
    out, resumo = [], {}
    lote_seq = 0
    for r in rows:
        name = r["signature"].split("(")[0]
        in_scope = name in scope
        r["escopo_h9d"] = "ESCOPO_PROFUNDO_H9D" if in_scope else "FORA_ESCOPO_H9D_HERDADO_H9C"
        if not in_scope:
            r["classificacao_h9d"] = "HERDADA_H9C"
            r["evidencia"] = (
                f"Fora do escopo profundo H9-D: classificação herdada da H9-C "
                f"({r['classificacao_h9c']}), ver restoration/homologacao-h9/03-h9c-secdef-authenticated.md"
            )
        elif name in decisions:
            r["classificacao_h9d"], r["evidencia"] = decisions[name]
        elif name in read_names:
            t = triage.get(name, {})
            guard = (t.get("guard_stmt") or "").strip()
            objs = ";".join(t.get("sens_objs") or []) or "nenhum objeto sensível no corpo"
            r["classificacao_h9d"] = "AUTH_COMPROVADA"
            r["evidencia"] = (
                f"Corpo lido manualmente no dossiê {read_names[name]}; guarda textual da assinatura: "
                f"\"{guard[:220] or 'delegação a função guardada (ver decisões)'}\"; "
                f"objetos alcançados: {objs}; fail-closed para auth.uid() NULL."
            )
        else:
            lote_seq += 1
            r["classificacao_h9d"] = "PENDENTE_EVIDENCIA"
            r["evidencia"] = (
                f"Triagem T_GUARD_BEFORE (não é prova). Corpo ainda não lido integralmente nesta rodada. "
                f"Lote determinístico H9-D-L{((lote_seq - 1) // 30) + 1}."
            )
        resumo[r["classificacao_h9d"]] = resumo.get(r["classificacao_h9d"], 0) + 1
        out.append(r)

    (OUT / "secdef-authenticated-inventory-h9d.tsv").write_text(
        "\t".join(HEADER) + "\n" + "\n".join("\t".join(str(r.get(c, "")) for c in HEADER) for r in out) + "\n"
    )
    (OUT / "classificacao-h9d.tsv").write_text(
        "signature\tescopo_h9d\tclassificacao_h9d\tevidencia\n"
        + "\n".join(f"{r['signature']}\t{r['escopo_h9d']}\t{r['classificacao_h9d']}\t{r['evidencia']}" for r in out)
        + "\n"
    )
    escopo = {k: v for k, v in resumo.items() if k != "HERDADA_H9C"}
    (OUT / "resumo-h9d.json").write_text(
        json.dumps(
            {
                "ambiente": AMBIENTE,
                "ledger": LEDGER,
                "total_bruto": len(out),
                "fora_escopo_h9d": resumo.get("HERDADA_H9C", 0),
                "escopo_h9d": sum(escopo.values()),
                "por_classificacao": escopo,
                "metodologia": "regex apenas triagem; AUTH_COMPROVADA exige corpo lido e guarda textual específica",
            },
            indent=1,
            ensure_ascii=False,
        )
        + "\n"
    )
    print(resumo)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
