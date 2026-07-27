#!/usr/bin/env bash
# apply-staging.sh — aplica Fase 1 postcheck + Fase 2 precheck/migration/postcheck/harness.
# Fail-fast; nunca imprime DSN. Seeds só com APPLY_COMMUNICATION_SEEDS=true.
set -Eeuo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${HERE}/../.." && pwd)"
F1="${ROOT}/restoration/comunicacao-fase1"
F2="${ROOT}/restoration/comunicacao-fase2"

log()  { printf '[apply] %s\n' "$*"; }
fail() { printf '[apply][ERRO] %s\n' "$*" >&2; exit 1; }
run()  {
  local label="$1"; shift
  log "step: ${label}"
  if ! psql "${STAGING_DB_URL}" -v ON_ERROR_STOP=1 --single-transaction -f "$1" >/dev/null; then
    fail "step falhou: ${label} (log detalhado suprimido por segurança)."
  fi
  log "ok:   ${label}"
}

bash "${HERE}/validate-staging.sh"

# Fase 1 — apenas certificar que já está aplicada; NÃO reexecuta migration.
run "fase1/postcheck"  "${F1}/postcheck.sql"

# Seeds opcionais (Fase 1)
if [[ "${APPLY_COMMUNICATION_SEEDS:-false}" == "true" ]]; then
  run "fase1/seeds"     "${F1}/seeds.sql"
else
  log "skip: fase1/seeds (APPLY_COMMUNICATION_SEEDS != true)"
fi

# Fase 2 — precheck / migration / postcheck / harness
run "fase2/precheck"   "${F2}/precheck.sql"
run "fase2/migration"  "${F2}/migration.sql"
run "fase2/postcheck"  "${F2}/postcheck.sql"
run "fase2/harness"    "${F2}/harness-rls.sql"

log "apply concluído. Prossiga com deploy-functions-staging.sh."
