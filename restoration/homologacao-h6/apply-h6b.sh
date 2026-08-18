#!/usr/bin/env bash
# H6b apply — SOMENTE staging ikaauvsflpmamgxmkhoq. Guard duro contra producao.
set -euo pipefail
: "${STAGING_DSN:?STAGING_DSN ausente}"
case "$STAGING_DSN" in
  *navfzbwgwzruipouyfnk*) echo "ABORT: DSN aponta para PRODUCAO"; exit 2;;
  *ikaauvsflpmamgxmkhoq*) : ;;
  *) echo "ABORT: DSN nao reconhecido como staging"; exit 2;;
esac
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f "$(dirname "$0")/20260916000000_h6b_financeiro_idempotencia_valor_canonico.sql"
echo "H6B_APPLY_OK"
