#!/usr/bin/env python3
"""P0c — fecha a classificação das 192 versões. Não acessa banco, não edita migrations."""
import csv, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
P = os.path.join(ROOT, "restoration/promocao-producao-h9")
STG = "ikaauvsflpmamgxmkhoq"
MARK = ("_fiscal_staging_marker", "fiscal_environment_marker")

# 11-destrutivas-precheck-rollback.md: efeito real por version
DESTRUTIVAS_OK = {
    "20260724000000": "DELETE apenas no corpo de funcao (runtime, sob RLS/ACL); nao destrutiva na aplicacao",
    "20260727161544": "limpeza de Vault no corpo de funcao; nao destrutiva na aplicacao",
    "20260727162402": "limpeza de Vault no corpo de funcao; nao destrutiva na aplicacao",
    "20260727165826": "REVOKE ... TRUNCATE: alteracao de privilegio, nao de dados; rollback por GRANT",
    "20260728031553": "limpeza de provider no corpo de funcao; nao destrutiva na aplicacao",
    "20260728031714": "limpeza de provider no corpo de funcao; nao destrutiva na aplicacao",
    "20260729024657": "substituicao de parcelas no corpo de funcao; nao destrutiva na aplicacao",
    "20260729034935": "REVOKE ... TRUNCATE: alteracao de privilegio, nao de dados; rollback por GRANT",
    "20260803214628": "substituicao de parcelas a receber no corpo de funcao; nao destrutiva na aplicacao",
    "20260804000000": "falso positivo: DROP COLUMN aparece apenas em comentario de rollback",
    "20260804030304": "remocao de itens orfaos no corpo de funcao; nao destrutiva na aplicacao",
    "20261014000000": "DELETE dentro de RPCs de exclusao segura; nao destrutiva na aplicacao",
}


# Adapters fiscais SIMULADOS: a checagem de ambiente esta no corpo da funcao e o
# proprio objeto so existe para homologacao. Nao promover.
STAGING_ONLY = {
    "20260731164849": "adapter fiscal simulado de homologacao; guarda no corpo da funcao; NAO PROMOVER",
    "20260803215023": "adapter fiscal simulado de homologacao; guarda no corpo da funcao; NAO PROMOVER",
    "20260803215909": "adapter fiscal simulado de homologacao; guarda no corpo da funcao; NAO PROMOVER",
}


def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return "\n".join(l for l in s.splitlines() if not l.strip().startswith("--"))


def main():
    art = {r["version"]: r for r in csv.DictReader(
        open(os.path.join(P, "10-manifesto-artefatos-promocao.csv"), encoding="utf-8"))}

    path = os.path.join(P, "01-manifesto-migrations.csv")
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    cols = list(rows[0].keys())

    n_art = n_g0 = n_dest = n_so = 0
    problemas = []
    for r in rows:
        if r["classificacao"] != "BLOQUEADA_REQUER_DECISAO":
            continue
        v = r["version"]

        if v in STAGING_ONLY:
            r["classificacao"] = "STAGING_ONLY"
            r["motivo"] = STAGING_ONLY[v]
            r["onda"] = "—"
            n_so += 1
            continue

        if v in DESTRUTIVAS_OK:
            r["classificacao"] = "PROMOVER"
            r["motivo"] = DESTRUTIVAS_OK[v]
            if r["onda"] == "—":
                r["onda"] = "P2"
            n_dest += 1
            continue

        a = art.get(v)
        if a and a["classe"] == "PROMOVIVEL_COM_ARTEFATO" and a["artefato"] not in ("", "—"):
            r["classificacao"] = "PROMOVIVEL_COM_ARTEFATO"
            r["motivo"] = ("guarda de homologacao substituida pela guarda canonica de promocao; "
                           "aplicar o artefato derivado, nunca o arquivo historico")
            n_art += 1
            continue

        # G0: menção ao ref/marcador apenas em comentário → promover o histórico
        exe = strip_comments(open(os.path.join(ROOT, r["arquivo"]), encoding="utf-8").read())
        if STG in exe or any(m in exe for m in MARK):
            problemas.append(v)
            continue
        r["classificacao"] = "PROMOVER"
        r["motivo"] = ("ref/marcador de homologacao aparece apenas em comentario; codigo executavel "
                       "neutro; promover o arquivo historico original")
        n_g0 += 1

    if problemas:
        print("FALHA — versoes com guarda executavel e sem artefato:", problemas)
        return 1

    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    from collections import Counter
    print(f"artefato={n_art} g0={n_g0} destrutivas_reclassificadas={n_dest} staging_only={n_so}")
    print("01:", Counter(r["classificacao"] for r in rows), "linhas:", len(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
