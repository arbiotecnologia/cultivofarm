#!/usr/bin/env bash
# H6d paridade REPO x LIVE — SOMENTE staging ikaauvsflpmamgxmkhoq.
# Somente leitura efetiva: a transacao termina em ROLLBACK.
set -euo pipefail
: "${STAGING_DSN:?STAGING_DSN ausente}"
case "$STAGING_DSN" in
  *navfzbwgwzruipouyfnk*) echo "ABORT: DSN aponta para PRODUCAO"; exit 2;;
  *ikaauvsflpmamgxmkhoq*) : ;;
  *) echo "ABORT: DSN nao reconhecido como staging"; exit 2;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p /tmp/h6d
# Etapa 2 sem BEGIN/COMMIT proprios, para nao encerrar o ROLLBACK global.
sed -e 's/^BEGIN;$/-- BEGIN (paridade)/' -e 's/^COMMIT;$/-- COMMIT (paridade)/' \
  "$ROOT/supabase/migrations/20260917010000_h6c_backfill_payment_terms_link.sql" \
  > /tmp/h6d/f2_notx.sql

cd "$ROOT"
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f restoration/homologacao-h6/49-h6d-paridade-repo-live.sql
