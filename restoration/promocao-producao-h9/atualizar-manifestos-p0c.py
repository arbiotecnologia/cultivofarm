#!/usr/bin/env python3
"""P0c — aplica as decisões de fechamento nos manifestos. Não acessa banco."""
import csv, hashlib, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
P = os.path.join(ROOT, "restoration/promocao-producao-h9")


def sha(rel):
    return hashlib.sha256(open(os.path.join(ROOT, rel), encoding="utf-8").read().encode()).hexdigest()


DECISOES = {
    # version: (classificacao, motivo, onda)
    "20260729004013": ("STAGING_ONLY",
                       "drill de rollback: altera apenas comentario da funcao e restaura a definicao "
                       "na mesma migration; nao entrega capacidade de negocio; NAO PROMOVER", "—"),
    "20260727161408": ("PROMOVIVEL_COM_ARTEFATO",
                       "schema public com FK de leitura para auth.users e dependencia de runtime do "
                       "Vault; Vault existe e e legivel em producao; slots de segredo NULL e flags de "
                       "entrega false; artefato com precheck de Vault e pos-check de flags/NULL", "P3"),
    "20260903182144": ("PROMOVIVEL_COM_ARTEFATO",
                       "hardening H7L preservado integralmente; guarda de homologacao trocada pela "
                       "guarda canonica de promocao + precheck de existencia e RLS das 3 tabelas base", "P4"),
    "20261023000000": ("PROMOVIVEL_COM_ARTEFATO",
                       "H9-E2 preservado; removidos ledger fixo, marcador e OIDs; baseline semantico "
                       "por regprocedure/SECDEF/owner/search_path/ACL e precheck do indice unico", "P5"),
    "20261003000000": ("PROMOVIVEL_COM_ARTEFATO",
                       "artefato de cron com baseline REAL de producao (md5 e14782b8984dd461684fdbdc2c4008ff); "
                       "troca somente created_at->performed_at e created_at->changed_at; rollback real "
                       "por captura do command", "P2"),
    "20260727035330": ("PROMOVIVEL_CONDICIONADO",
                       "DROP COLUMN condicional: monitoramento_avisos.data_referencia NAO existe no "
                       "baseline de producao, logo o caminho destrutivo nao e acionado; manter precheck "
                       "fail-closed (attgenerated + contagem) e abortar se a coluna aparecer", "P2"),
    "20260730030920": ("PROMOVIVEL_CONDICIONADO",
                       "DROP TABLE de tabela de provas: public._motor_b2b_fase7_proofs NAO existe em "
                       "producao, portanto no-op; precheck aborta em vez de apagar caso exista", "P2"),
    "20260804022556": ("PROMOVIVEL_CONDICIONADO",
                       "DELETE de orfaos: contagem de orfaos de estoque_movimentacoes = 0 no baseline "
                       "de producao; precheck na mesma transacao aborta e escala se aparecer 1 ou mais", "P2"),
}


def main():
    # ---------- 01-manifesto-migrations.csv ----------
    path = os.path.join(P, "01-manifesto-migrations.csv")
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    cols = list(rows[0].keys())
    hit = 0
    for r in rows:
        d = DECISOES.get(r["version"])
        if d:
            r["classificacao"], r["motivo"], r["onda"] = d
            hit += 1
    assert hit == len(DECISOES), f"decisoes nao aplicadas: {hit}/{len(DECISOES)}"
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    # ---------- 10-manifesto-artefatos-promocao.csv ----------
    path = os.path.join(P, "10-manifesto-artefatos-promocao.csv")
    arows = list(csv.DictReader(open(path, encoding="utf-8")))
    acols = list(arows[0].keys())
    by = {r["version"]: r for r in arows}

    extras = [
        ("20260727161408",
         "supabase/migrations/20260727161408_f3b6bc19-55b3-473b-80aa-14481e58cbf0.sql",
         "restoration/promocao-producao-h9/promotion-sql/20260727161408__promocao.sql",
         "guarda canonica de promocao + precheck de Vault/auth + pos-check de flags=false, "
         "secret_* IS NULL, ACL deny-by-default e RPC service_role-only; corpo historico intacto",
         "P3", "comunicacao"),
        ("20261101000000",
         "restoration/promocao-producao-h9/promotion-sql/20261101000000_promocao_convergencia_ledger_v1.sql",
         "restoration/promocao-producao-h9/promotion-sql/20261101000000_promocao_convergencia_ledger_v1.sql",
         "migration de convergencia CRIADA e NAO EXECUTADA; aplicada em producao e tambem em "
         "homologacao no inicio da onda P1",
         "P1", "promocao"),
    ]
    for version, origem, artefato, tr, onda, dom in extras:
        r = by.get(version) or {c: "" for c in acols}
        r.update(version=version, origem=origem, sha256_origem=sha(origem),
                 artefato=artefato, sha256_artefato=sha(artefato), transformacao=tr,
                 guardas_removidas="0", classe="PROMOVIVEL_COM_ARTEFATO", pendencia="—",
                 onda=onda, dominio=dom)
        if version not in by:
            arows.append(r)
            by[version] = r

    # refresca hashes de todos os artefatos existentes
    for r in arows:
        if r["artefato"] and r["artefato"] != "—":
            r["sha256_artefato"] = sha(r["artefato"])
        if r["origem"] and r["origem"] != "—":
            r["sha256_origem"] = sha(r["origem"])

    arows.sort(key=lambda r: r["version"])
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=acols)
        w.writeheader()
        w.writerows(arows)

    from collections import Counter
    print("01:", Counter(r["classificacao"] for r in rows))
    print("10:", Counter(r["classe"] for r in arows), "linhas:", len(arows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
