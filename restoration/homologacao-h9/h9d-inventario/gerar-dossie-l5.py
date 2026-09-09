#!/usr/bin/env python3
"""Gera o dossie-l5.json do lote H9-D-L5 a partir do catalogo vivo do staging.

Uso: STAGING_DSN=... python3 gerar-dossie-l5.py
Somente leitura no banco. As decisoes por assinatura sao curadas manualmente
(leitura integral de pg_get_functiondef + provas dinamicas); o script apenas
carimba os fingerprints vivos (md5/len/acl/proconfig/volatilidade).
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "dossie-l5.json")
DECISOES = os.path.join(HERE, "decisoes-l5.json")

FONTE_HASH_SQL = (
    "SELECT p.proname||'('||pg_catalog.oidvectortypes(p.proargtypes)||')' AS sig, "
    "md5(pg_get_functiondef(p.oid)) AS definition_md5, "
    "length(pg_get_functiondef(p.oid))::text AS definition_len, "
    "coalesce(p.proacl::text,'') AS acl, coalesce(p.proconfig::text,'') AS proconfig, "
    "p.provolatile::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
    "WHERE n.nspname='public' AND p.prosecdef;"
)

FINGERPRINT_SQL = (
    "SELECT md5(string_agg(pg_get_functiondef(p.oid),'|' ORDER BY p.proname)) "
    "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' "
    "AND p.proname IN ('rpc_enviar_visita_aprovacao','rpc_get_visita_workspace',"
    "'rpc_get_my_visit_by_client_uuid');"
)

VOL = {"i": "IMMUTABLE", "s": "STABLE", "v": "VOLATILE"}


def psql(dsn, sql):
    r = subprocess.run(["psql", dsn, "-At", "-F", "|", "-c", sql],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(r.stderr)
    return r.stdout


def catalogo(dsn):
    rows = psql(dsn, """
      select p.proname||'('||coalesce((select string_agg(format_type(t,null),',' order by ord)
             from unnest(p.proargtypes) with ordinality u(t,ord)),'')||')',
             md5(pg_get_functiondef(p.oid)), length(pg_get_functiondef(p.oid)),
             coalesce(p.proacl::text,''), coalesce(p.proconfig::text,''), p.provolatile
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef;""")
    cat = {}
    for line in rows.strip().splitlines():
        c = line.split("|")
        if len(c) >= 6:
            cat[c[0].replace(" ", "")] = c
    return cat


def main():
    dsn = os.environ.get("STAGING_DSN")
    if not dsn:
        sys.exit("STAGING_DSN ausente")
    decisoes = json.load(open(DECISOES, encoding="utf-8"))
    cat = catalogo(dsn)
    fp = psql(dsn, FINGERPRINT_SQL).strip()
    ledger = psql(dsn, "select count(*) from supabase_migrations.schema_migrations;").strip()
    ultima = psql(dsn, "select max(version) from supabase_migrations.schema_migrations;").strip()

    assinaturas = {}
    resumo = {}
    for sig, dec in decisoes["assinaturas"].items():
        key = sig.replace(" ", "")
        if key not in cat:
            sys.exit(f"assinatura ausente no catalogo vivo: {sig}")
        c = cat[key]
        entry = {
            "definition_md5": c[1],
            "definition_len": int(c[2]),
            "acl": c[3],
            "proconfig": c[4],
            "volatilidade": VOL[c[5]],
        }
        entry.update(dec)
        assinaturas[sig] = entry
        resumo[dec["classificacao"]] = resumo.get(dec["classificacao"], 0) + 1

    dossie = {
        "ambiente": "ikaauvsflpmamgxmkhoq",
        "producao_proibida": "navfzbwgwzruipouyfnk",
        "ledger": int(ledger),
        "ultima_migration": ultima,
        "lote": "H9-D-L5",
        "total": len(assinaturas),
        "commit_base": decisoes["commit_base"],
        "forward_aplicado": decisoes["forward_aplicado"],
        "fonte_hash_sql": FONTE_HASH_SQL,
        "fingerprint_forward": fp,
        "fingerprint_rollback": decisoes["fingerprint_rollback"],
        "fingerprint_sql": FINGERPRINT_SQL,
        "metodo": decisoes["metodo"],
        "resumo_classificacao": resumo,
        "assinaturas": assinaturas,
    }
    if len(assinaturas) != 30:
        sys.exit(f"dossie L5 deve conter exatamente 30 assinaturas; obtido {len(assinaturas)}")
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(dossie, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(json.dumps(resumo, ensure_ascii=False), "fingerprint_forward=", fp, "ledger=", ledger)


if __name__ == "__main__":
    main()
