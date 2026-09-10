#!/usr/bin/env python3
# =====================================================================
# PROMOÇÃO CULTIVOFARM — CLASSIFICADOR DETERMINÍSTICO DAS MIGRATIONS
#
# Lê supabase/migrations e produz 21-manifesto-migrations.csv com uma
# linha por arquivo: ordem, arquivo, decisao, motivo, sha256, linhas.
#
# NÃO acessa banco. NÃO executa SQL. NÃO modifica migrations.
# Execução idempotente: mesma árvore -> mesmo CSV byte a byte.
#
# Decisões possíveis:
#   INCLUIDA          -> entra no pacote estrutural
#   EXCLUIDA_SANDBOX  -> as 20 migrations do sandbox yzszl
#   EXCLUIDA_HARNESS  -> harness/fixture/seed/smoke declarados no nome
#   EXCLUIDA_MARKER   -> marcador de ambiente de homologação
#   REVISAO_REF_GUARD -> guarda de ref de outro projeto embutida no SQL
#   REVISAO_DML       -> estrutural, mas com DML detectado: revisão humana
#
# Uso:
#   python3 restoration/promocao-cultivofarm/20-classificar-migrations.py
# =====================================================================
from __future__ import annotations

import csv
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
OUT_CSV = Path(__file__).resolve().parent / "21-manifesto-migrations.csv"

# --- Faixa de sandbox: intervalo fechado de timestamps -----------------
SANDBOX_MIN = "20260812134101"
SANDBOX_MAX = "20260812135640"
SANDBOX_UUID_NAME = re.compile(
    r"^\d{14}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.sql$"
)

# --- Nomes que denunciam artefato de teste -----------------------------
HARNESS_NAME = re.compile(r"(harness|fixture|seed|smoke|_teste_|_test_)", re.I)

# --- Refs de outros projetos embutidos no SQL (guardas fail-closed) ----
REFS_ESTRANHOS = (
    "ikaauvsflpmamgxmkhoq",  # homologação AR Bio
    "navfzbwgwzruipouyfnk",  # produção AR Bio
    "yzszlzjpovmcteuxjznj",  # sandbox proibido
)

# --- Marcadores de ambiente de homologação -----------------------------
MARKER_PATTERNS = (
    "_fiscal_staging_marker",
    "arbio-staging.test",
    "H6B-",
    "TESTE_ENTREGA_E2E_",
    "F42-HARNESS-",
)

# --- DML sobre linhas (ignora INSERT em catálogos internos de controle) -
DML = re.compile(r"^\s*(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|TRUNCATE)\b", re.I | re.M)

# Tabelas de controle cujo INSERT é parte legítima da estrutura.
DML_TOLERADO = (
    "supabase_migrations.schema_migrations",
    "cron.job",
    "storage.buckets",
)


def timestamp_of(name: str) -> str:
    return name[:14]


def classify(path: Path) -> tuple[str, str]:
    name = path.name
    ts = timestamp_of(name)

    if SANDBOX_MIN <= ts <= SANDBOX_MAX and SANDBOX_UUID_NAME.match(name):
        return ("EXCLUIDA_SANDBOX",
                "Migration do sandbox yzszl (BLOQUEADA_PERMANENTE): recria app_role/user_roles")

    if HARNESS_NAME.search(name):
        return ("EXCLUIDA_HARNESS", "Nome declara harness/fixture/seed/smoke")

    try:
        body = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:  # pragma: no cover
        return ("REVISAO_DML", f"Falha de leitura: {exc}")

    for marker in MARKER_PATTERNS:
        if marker in body:
            return ("EXCLUIDA_MARKER", f"Contem marcador de ambiente/teste '{marker}'")

    hits = [m.group(0).strip() for m in DML.finditer(body)]
    if hits:
        relevantes = []
        for line in body.splitlines():
            if DML.match(line) and not any(t in line for t in DML_TOLERADO):
                relevantes.append(line.strip())
        if relevantes:
            return ("REVISAO_DML",
                    f"{len(relevantes)} comando(s) DML detectado(s); revisar antes de incluir")

    return ("INCLUIDA", "Estrutural: DDL/RLS/policies/grants/funcoes/triggers/views")


def main() -> int:
    if not MIGRATIONS.is_dir():
        print(f"ABORT: {MIGRATIONS} inexistente", file=sys.stderr)
        return 2

    arquivos = sorted(p for p in MIGRATIONS.iterdir() if p.suffix == ".sql")
    linhas = []
    for i, path in enumerate(arquivos, start=1):
        decisao, motivo = classify(path)
        raw = path.read_bytes()
        linhas.append({
            "ordem": i,
            "arquivo": path.name,
            "decisao": decisao,
            "motivo": motivo,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "linhas": raw.count(b"\n") + (0 if raw.endswith(b"\n") or not raw else 1),
        })

    with OUT_CSV.open("w", encoding="utf-8", newline="\n") as fh:
        writer = csv.DictWriter(
            fh, fieldnames=["ordem", "arquivo", "decisao", "motivo", "sha256", "linhas"],
            lineterminator="\n")
        writer.writeheader()
        writer.writerows(linhas)

    resumo: dict[str, int] = {}
    for row in linhas:
        resumo[row["decisao"]] = resumo.get(row["decisao"], 0) + 1

    print(f"TOTAL={len(linhas)}")
    for k in sorted(resumo):
        print(f"{k}={resumo[k]}")
    print(f"CSV={OUT_CSV.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
