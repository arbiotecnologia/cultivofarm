#!/usr/bin/env bash
# H6c apply — SOMENTE staging ikaauvsflpmamgxmkhoq. Guard duro contra producao.
set -euo pipefail
: "${STAGING_DSN:?STAGING_DSN ausente}"
case "$STAGING_DSN" in
  *navfzbwgwzruipouyfnk*) echo "ABORT: DSN aponta para PRODUCAO"; exit 2;;
  *ikaauvsflpmamgxmkhoq*) : ;;
  *) echo "ABORT: DSN nao reconhecido como staging"; exit 2;;
esac
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 \
  -f "$(dirname "$0")/20260917000000_h6c_financeiro_snapshot_b2b_credito.sql"
echo "H6C_APPLY_OK"
