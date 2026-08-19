#!/usr/bin/env bash
# H6d — ROLLBACK. SOMENTE staging ikaauvsflpmamgxmkhoq (fail-closed).
set -euo pipefail
: "${STAGING_DSN:?STAGING_DSN ausente}"
case "$STAGING_DSN" in
  *navfzbwgwzruipouyfnk*) echo "ABORT: DSN aponta para PRODUCAO"; exit 2;;
  *ikaauvsflpmamgxmkhoq*) : ;;
  *) echo "ABORT: DSN nao reconhecido como staging"; exit 2;;
esac
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f restoration/homologacao-h6/rollback-h6d.sql
echo "ROLLBACK_H6D_OK"
