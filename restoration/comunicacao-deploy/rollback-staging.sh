#!/usr/bin/env bash
# rollback-staging.sh — desfaz APENAS Fase 2. Nunca toca Fase 1 ou dados de negócio.
set -Eeuo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${HERE}/../.." && pwd)"
F2="${ROOT}/restoration/comunicacao-fase2"
F4="${ROOT}/restoration/comunicacao-fase4"

log()  { printf '[rollback] %s\n' "$*"; }
fail() { printf '[rollback][ERRO] %s\n' "$*" >&2; exit 1; }

REQUIRE_DATABASE=true bash "${HERE}/validate-staging.sh"

# Fase 4 primeiro (aditiva sobre Fase 2): pode ser removida isoladamente.
if [[ "${ROLLBACK_COMMUNICATION_FASE4:-false}" == "true" ]]; then
  log "step: fase4/rollback"
  if ! psql "${STAGING_DB_URL}" -v ON_ERROR_STOP=1 --single-transaction \
        -f "${F4}/rollback.sql" >/dev/null; then
    fail "rollback da Fase 4 falhou (log suprimido)."
  fi
  log "ok:   fase4/rollback"
else
  log "skip: fase4/rollback (ROLLBACK_COMMUNICATION_FASE4 != true)"
fi

# Fase 2 só é revertida com confirmação explícita separada e SÓ depois da Fase 4.
if [[ "${ROLLBACK_COMMUNICATION:-false}" != "true" ]]; then
  log "skip: fase2/rollback (ROLLBACK_COMMUNICATION != true)"
  log "Fase 1 e dados de negócio permanecem intactos."
  exit 0
fi

log "step: fase2/rollback"
if ! psql "${STAGING_DB_URL}" -v ON_ERROR_STOP=1 --single-transaction \
      -f "${F2}/rollback.sql" >/dev/null; then
  fail "rollback da Fase 2 falhou (log suprimido)."
fi
log "ok:   fase2/rollback"
log "Fase 1 e dados de negócio permanecem intactos."
