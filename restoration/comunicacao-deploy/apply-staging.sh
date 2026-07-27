#!/usr/bin/env bash
# apply-staging.sh — Fase 1 postcheck; Fase 2 precheck+migration+postcheck em
# transação única (falha reverte migration); depois harness read-only e,
# opcionalmente, seeds da Fase 2. Nunca executa seeds da Fase 1.
set -Eeuo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${HERE}/../.." && pwd)"
F1="${ROOT}/restoration/comunicacao-fase1"
F2="${ROOT}/restoration/comunicacao-fase2"

log()  { printf '[apply] %s\n' "$*"; }
fail() { printf '[apply][ERRO] %s\n' "$*" >&2; exit 1; }

run_file() {
  local label="$1"; local file="$2"
  log "step: ${label}"
  if ! psql "${STAGING_DB_URL}" -v ON_ERROR_STOP=1 --single-transaction \
        -f "${file}" >/dev/null; then
    fail "step falhou: ${label} (log suprimido por segurança)."
  fi
  log "ok:   ${label}"
}

# Aplica múltiplos arquivos SQL em UMA única conexão/transação psql.
# Falha em qualquer um → ROLLBACK de tudo (postcheck reverte migration).
run_files_atomic() {
  local label="$1"; shift
  log "step: ${label} (transação única)"
  local args=()
  local f
  for f in "$@"; do args+=("-f" "$f"); done
  if ! psql "${STAGING_DB_URL}" -v ON_ERROR_STOP=1 --single-transaction \
        "${args[@]}" >/dev/null; then
    fail "step falhou: ${label} (rollback aplicado; log suprimido)."
  fi
  log "ok:   ${label}"
}

bash "${HERE}/validate-staging.sh"

# 1) Fase 1 — apenas certificar que já está aplicada.
run_file "fase1/postcheck" "${F1}/postcheck.sql"

# 2) Fase 2 — precheck + migration + postcheck em UMA transação.
#    Se o postcheck falhar, a migration é revertida junto.
run_files_atomic "fase2/precheck+migration+postcheck" \
  "${F2}/precheck.sql" "${F2}/migration.sql" "${F2}/postcheck.sql"

# 3) Fase 2 — harness read-only (fora da transação anterior).
run_file "fase2/harness" "${F2}/harness-rls.sql"

# 4) Seeds opcionais — SOMENTE Fase 2 e após tudo verde.
if [[ "${APPLY_COMMUNICATION_SEEDS:-false}" == "true" ]]; then
  run_file "fase2/seeds" "${F2}/seeds.sql"
else
  log "skip: fase2/seeds (APPLY_COMMUNICATION_SEEDS != true)"
fi

log "apply concluído. Prossiga com deploy-functions-staging.sh."
