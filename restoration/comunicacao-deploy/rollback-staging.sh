#!/usr/bin/env bash
# rollback-staging.sh — desfaz APENAS Fase 2. Nunca toca Fase 1 ou dados de negócio.
set -Eeuo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${HERE}/../.." && pwd)"
F2="${ROOT}/restoration/comunicacao-fase2"

log()  { printf '[rollback] %s\n' "$*"; }
fail() { printf '[rollback][ERRO] %s\n' "$*" >&2; exit 1; }

REQUIRE_DATABASE=true bash "${HERE}/validate-staging.sh"

if [[ "${ROLLBACK_COMMUNICATION:-false}" != "true" ]]; then
  fail "Rollback recusado: exporte ROLLBACK_COMMUNICATION=true para confirmar."
fi

log "step: fase2/rollback"
if ! psql "${STAGING_DB_URL}" -v ON_ERROR_STOP=1 --single-transaction \
      -f "${F2}/rollback.sql" >/dev/null; then
  fail "rollback da Fase 2 falhou (log suprimido)."
fi
log "ok:   fase2/rollback"
log "Fase 1 e dados de negócio permanecem intactos."
