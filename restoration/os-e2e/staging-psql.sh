#!/usr/bin/env bash
# Runner fail-closed: executa SQL EXCLUSIVAMENTE no staging ikaauvsflpmamgxmkhoq.
# Nunca imprime o DSN. Recusa producao navfzbwgwzruipouyfnk.
set -euo pipefail
PROD_REF="navfzbwgwzruipouyfnk"
EXPECTED_REF="ikaauvsflpmamgxmkhoq"
[[ -n "${STAGING_DSN:-}" ]] || { echo "ABORT: STAGING_DSN ausente" >&2; exit 4; }
case "$STAGING_DSN" in *"$PROD_REF"*) echo "ABORT: DSN aponta PRODUCAO" >&2; exit 2;; esac
case "$STAGING_DSN" in *"$EXPECTED_REF"*) : ;; *) echo "ABORT: DSN nao e o staging autorizado" >&2; exit 2;; esac
psql "$STAGING_DSN" -X -v ON_ERROR_STOP=1 "$@"
