#!/usr/bin/env bash
# H6c-002 — ROLLBACK AUTOMATIZÁVEL do H6b (+H6c, que redefiniu as mesmas funções).
# SOMENTE staging ikaauvsflpmamgxmkhoq. Falha fechada se o ambiente não for staging.
# Uso: STAGING_DSN=... restoration/homologacao-h6/rollback-h6b.sh
set -euo pipefail
: "${STAGING_DSN:?STAGING_DSN ausente}"
case "$STAGING_DSN" in
  *navfzbwgwzruipouyfnk*) echo "ABORT: DSN aponta para PRODUCAO"; exit 2;;
  *ikaauvsflpmamgxmkhoq*) : ;;
  *) echo "ABORT: DSN nao reconhecido como staging"; exit 2;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# Marcador de staging no proprio banco (defesa em profundidade).
MARK="$(psql "$STAGING_DSN" -Atc "SELECT project_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1")"
[ "$MARK" = "ikaauvsflpmamgxmkhoq" ] || { echo "ABORT: marcador de staging ausente/invalido"; exit 2; }

# O arquivo de rollback e GERADO — regenera antes de aplicar para garantir
# paridade com as migrations canonicas do repositorio.
python3 restoration/homologacao-h6/50-gerar-rollback-h6b.py

psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f restoration/homologacao-h6/rollback-h6b.sql
echo "ROLLBACK_H6B_OK"
