#!/usr/bin/env bash
# H6c (ACL) apply — SOMENTE staging ikaauvsflpmamgxmkhoq. Guard duro contra producao.
set -euo pipefail
: "${STAGING_DSN:?STAGING_DSN ausente}"
case "$STAGING_DSN" in
  *navfzbwgwzruipouyfnk*) echo "ABORT: DSN aponta para PRODUCAO"; exit 2;;
  *ikaauvsflpmamgxmkhoq*) : ;;
  *) echo "ABORT: DSN nao reconhecido como staging"; exit 2;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$ROOT/supabase/migrations/20260928000000_h6c_fin_helpers_acl_v1.sql"
test -f "$MIG" || { echo "ABORT: migration canonica ausente"; exit 3; }

psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f "$MIG"
echo "H6C_ACL_APPLY_OK"
