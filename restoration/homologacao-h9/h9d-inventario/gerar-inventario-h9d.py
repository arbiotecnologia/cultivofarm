#!/usr/bin/env python3
"""
H9-D — gerador do inventário e da classificação das funções SECURITY DEFINER
executáveis por `authenticated` na homologação (ikaauvsflpmamgxmkhoq).

METODOLOGIA (retificada — v2):
  1. Universo bruto (376) = consulta determinística ao catálogo de homologação.
  2. 84 funções já auditadas na H9-C entram como FORA_ESCOPO_H9D (evidência herdada).
  3. Escopo profundo H9-D = exatamente 292.
  4. Regex/posição é SOMENTE TRIAGEM e NUNCA promove uma função. Só é
     AUTH_COMPROVADA/NAO_APLICAVEL quem tiver decisão manual registrada em
     `decisoes-h9d.json` ou dossiê de lote (`dossie-l1.json`, `dossie-l2.json`), sempre chaveada
     pela ASSINATURA CANÔNICA COMPLETA (nome + tipos), nunca pelo nome — para
     não colidir com funções sobrecarregadas.
  5. Evidência vaga (ex.: "delegação a função guardada") é rejeitada e a
     assinatura volta para PENDENTE_EVIDENCIA, em lotes determinísticos.

Uso: python3 gerar-inventario-h9d.py
Entradas (no próprio diretório): secdef-authenticated-inventory-h9d.tsv,
decisoes-h9d.json, dossie-l1.json, dossie-l2.json. Nunca escreve no banco.
"""
from __future__ import annotations

import json
import pathlib

OUT = pathlib.Path(__file__).resolve().parent

LEDGER = 664
AMBIENTE = "ikaauvsflpmamgxmkhoq"
LOTE_TAM = 30

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

# Trechos que NÃO comprovam autorização; qualquer evidência que os contenha é
# rebaixada para PENDENTE_EVIDENCIA.
EVIDENCIA_VAGA = (
    "delegação a função guardada",
    "guarda de identidade/papel precede o primeiro acesso sensivel",
    "guarda de identidade/papel precede o primeiro acesso sensível",
)


def evidencia_dossie(sig: str, d: dict, lote: str = "H9-D-L1") -> str:
    return (
        f"Lote {lote} — definição integral lida do catálogo vivo e fingerprintada no dossiê dossie-l1.json "
        f"(definition_md5 {d['definition_md5']} = md5(pg_get_functiondef(oid)), definition_len {d['definition_len']}). "
        f"ACL: {d['acl']}; proconfig: {d['proconfig']}. "
        f"Guarda textual: \"{d['guarda_textual']}\". Cadeia transitiva: {d['cadeia_transitiva']}. "
        f"NULL fail-closed: {d['null_fail_closed']}. Tenant/BOLA/IDOR: {d['tenant_bola_idor']}. "
        f"SQL dinâmico: {d['sql_dinamico']}. Callsites reais: {d['callsites']}."
        + (f" Observação: {d['observacao']}." if d.get("observacao") else "")
    )


def main() -> int:
    base = [l.split("\t") for l in (OUT / "secdef-authenticated-inventory-h9d.tsv").read_text().strip().split("\n")]
    hdr, rows = base[0], [dict(zip(base[0], r)) for r in base[1:]]

    sigs = [r["signature"] for r in rows]
    if len(set(sigs)) != len(sigs):
        raise SystemExit("assinaturas duplicadas no inventário")

    decisoes = {k: v for k, v in json.loads((OUT / "decisoes-h9d.json").read_text()).items() if not k.startswith("_")}
    l1 = json.loads((OUT / "dossie-l1.json").read_text())["assinaturas"]
    l2 = json.loads((OUT / "dossie-l2.json").read_text())["assinaturas"]
    if set(l1) & set(l2):
        raise SystemExit("assinatura auditada em dois lotes")
    lotes = {**{k: ("H9-D-L1", v) for k, v in l1.items()}, **{k: ("H9-D-L2", v) for k, v in l2.items()}}

    # Colisão por overload: o mesmo nome pode ter várias assinaturas; conferimos
    # que toda chave de decisão/dossiê existe como assinatura completa.
    for chave in list(decisoes) + list(lotes):
        if "(" not in chave or chave not in sigs:
            raise SystemExit(f"chave não é assinatura canônica presente no inventário: {chave}")

    conclusivas, pendentes = [], []
    for r in rows:
        sig = r["signature"]
        if r["escopo_h9d"] != "ESCOPO_PROFUNDO_H9D":
            r["classificacao_h9d"] = "HERDADA_H9C"
            r["evidencia"] = (
                f"Fora do escopo profundo H9-D: classificação herdada da H9-C "
                f"({r['classificacao_h9c']}), ver restoration/homologacao-h9/03-h9c-secdef-authenticated.md"
            )
            continue
        if sig in lotes:
            lote, d = lotes[sig]
            r["classificacao_h9d"] = d["classificacao"]
            r["evidencia"] = evidencia_dossie(sig, d, lote)
        elif r["classificacao_h9d"] == "EXPOSICAO_COMPROVADA_CORRIGIDA":
            pass  # exposição comprovada e corrigida em rodada anterior (H9-D1)
        elif sig in decisoes:
            r["classificacao_h9d"], r["evidencia"] = decisoes[sig]
        elif r["classificacao_h9d"] in ("AUTH_COMPROVADA", "NAO_APLICAVEL") and not any(
            v in r["evidencia"] for v in EVIDENCIA_VAGA
        ):
            pass  # evidência específica já registrada em rodada anterior
        else:
            r["classificacao_h9d"] = "PENDENTE_EVIDENCIA"
            r["evidencia"] = ""
        if r["classificacao_h9d"] == "PENDENTE_EVIDENCIA":
            pendentes.append(r)
        else:
            conclusivas.append(r)

    # Lotes determinísticos: L1 já auditado; pendentes recebem L2..Ln por ordem
    # de assinatura, em blocos de 30.
    for i, r in enumerate(sorted(pendentes, key=lambda x: x["signature"])):
        lote = (i // LOTE_TAM) + 3
        if not r["evidencia"]:
            r["evidencia"] = (
                "Triagem por regex/posição não é prova. Corpo ainda não lido integralmente com guarda "
                f"textual, cadeia transitiva e callsites. Lote determinístico H9-D-L{lote}."
            )
        else:
            r["evidencia"] = (
                f"{r['evidencia']} Sem prova de autorização nesta rodada. "
                f"Lote determinístico H9-D-L{lote}."
            )

    resumo = {}
    for r in rows:
        resumo[r["classificacao_h9d"]] = resumo.get(r["classificacao_h9d"], 0) + 1

    (OUT / "secdef-authenticated-inventory-h9d.tsv").write_text(
        "\t".join(HEADER) + "\n" + "\n".join("\t".join(str(r.get(c, "")) for c in HEADER) for r in rows) + "\n"
    )
    (OUT / "classificacao-h9d.tsv").write_text(
        "signature\tescopo_h9d\tclassificacao_h9d\tevidencia\n"
        + "\n".join(f"{r['signature']}\t{r['escopo_h9d']}\t{r['classificacao_h9d']}\t{r['evidencia']}" for r in rows)
        + "\n"
    )
    escopo = {k: v for k, v in resumo.items() if k != "HERDADA_H9C"}
    (OUT / "resumo-h9d.json").write_text(
        json.dumps(
            {
                "ambiente": AMBIENTE,
                "ledger": LEDGER,
                "total_bruto": len(rows),
                "fora_escopo_h9d": resumo.get("HERDADA_H9C", 0),
                "escopo_h9d": sum(escopo.values()),
                "por_classificacao": escopo,
                "lotes_auditados": ["H9-D-L1", "H9-D-L2"],
                "forwards_aplicados": ["20261006000000", "20261007000000", "20261008000000"],
                "metodologia": (
                    "regex apenas triagem; AUTH_COMPROVADA/NAO_APLICAVEL exigem decisão manual por assinatura "
                    "canônica completa, com guarda textual, cadeia transitiva, fail-closed e callsites"
                ),
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
