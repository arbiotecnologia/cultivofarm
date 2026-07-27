#!/usr/bin/env bash
# deploy-functions-staging.sh — publica APENAS communication-health e
# process-communication-outbox. Sem secrets, sem habilitar delivery.
set -Eeuo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${HERE}/../.." && pwd)"

# Lista fechada, hard-coded — não aceita override por env/args.
readonly FUNCTIONS=("communication-health" "process-communication-outbox")

log()  { printf '[deploy-fn] %s\n' "$*"; }
fail() { printf '[deploy-fn][ERRO] %s\n' "$*" >&2; exit 1; }

bash "${HERE}/validate-staging.sh"

for fn in "${FUNCTIONS[@]}"; do
  if [[ ! -f "${ROOT}/supabase/functions/${fn}/index.ts" ]]; then
    fail "função ausente no repositório: ${fn}"
  fi
done

for fn in "${FUNCTIONS[@]}"; do
  log "deploy: ${fn} → project-ref=${STAGING_PROJECT_REF}"
  # --no-verify-jwt=false mantém verificação JWT padrão. Sem set-secrets.
  if ! supabase functions deploy "${fn}" \
        --project-ref "${STAGING_PROJECT_REF}" >/dev/null 2>&1; then
    fail "falha ao publicar ${fn} (log suprimido por segurança)."
  fi
  log "ok:     ${fn}"
done

log "deploy concluído. Flags de entrega permanecem OFF por padrão."
