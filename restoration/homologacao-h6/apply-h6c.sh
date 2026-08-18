#!/usr/bin/env bash
# H6c apply — SOMENTE staging ikaauvsflpmamgxmkhoq. Guard duro contra producao.
# H6d: aplica AS DUAS etapas, na ordem canonica, a partir de supabase/migrations.
# Ambas as etapas sao idempotentes/reexecutaveis (CREATE OR REPLACE,
# DROP TRIGGER IF EXISTS, backfill condicional apenas onde inequivoco).
set -euo pipefail
: "${STAGING_DSN:?STAGING_DSN ausente}"
case "$STAGING_DSN" in
  *navfzbwgwzruipouyfnk*) echo "ABORT: DSN aponta para PRODUCAO"; exit 2;;
  *ikaauvsflpmamgxmkhoq*) : ;;
  *) echo "ABORT: DSN nao reconhecido como staging"; exit 2;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$ROOT/supabase/migrations"

for f in \
  "20260917000000_h6c_financeiro_snapshot_b2b_credito.sql" \
  "20260917010000_h6c_backfill_payment_terms_link.sql"
do
  test -f "$MIG/$f" || { echo "ABORT: migration canonica ausente: $f"; exit 3; }
done

psql "$STAGING_DSN" -v ON_ERROR_STOP=1 \
  -f "$MIG/20260917000000_h6c_financeiro_snapshot_b2b_credito.sql"
echo "H6C_STEP1_OK"

psql "$STAGING_DSN" -v ON_ERROR_STOP=1 \
  -f "$MIG/20260917010000_h6c_backfill_payment_terms_link.sql"
echo "H6C_STEP2_OK"

echo "H6C_APPLY_OK"
