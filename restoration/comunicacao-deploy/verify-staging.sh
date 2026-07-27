#!/usr/bin/env bash
# verify-staging.sh — reexecuta postchecks/harness Fase 1/2, roda smoke read-only
# e, opcionalmente, chama communication-health autenticado para confirmar que
# TODAS as flags de entrega estão OFF. Sem execução dinâmica nem tracing.
# Nunca imprime JWT, DSN, headers, body ou URL completa.
set -Eeuo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "${HERE}/../.." && pwd)"
F1="${ROOT}/restoration/comunicacao-fase1"
F2="${ROOT}/restoration/comunicacao-fase2"
SMOKE="${HERE}/smoke-staging.sql"

log()  { printf '[verify] %s\n' "$*"; }
fail() { printf '[verify][ERRO] %s\n' "$*" >&2; exit 1; }

run_file() {
  local label="$1"; local file="$2"
  log "step: ${label}"
  if ! psql "${STAGING_DB_URL}" -v ON_ERROR_STOP=1 --single-transaction \
        -f "${file}" >/dev/null; then
    fail "step falhou: ${label} (log suprimido)."
  fi
  log "ok:   ${label}"
}

# Validação exige DB (psql + STAGING_DB_URL) e valida STAGING_PROJECT_REF.
REQUIRE_DATABASE=true bash "${HERE}/validate-staging.sh"

# 1) Reexecutar postchecks/harness Fase 1 e Fase 2 (obrigatórios).
run_file "fase1/postcheck" "${F1}/postcheck.sql"
run_file "fase2/postcheck" "${F2}/postcheck.sql"
run_file "fase2/harness"   "${F2}/harness-rls.sql"

# 2) Smoke read-only — obrigatório, mesmo sem JWT.
if [[ ! -f "${SMOKE}" ]]; then
  fail "smoke-staging.sql ausente no kit."
fi
run_file "smoke-staging" "${SMOKE}"

# 3) Health check REAL contra a Edge Function — SÓ com JWT admin de staging.
if [[ -z "${STAGING_TEST_ADMIN_JWT:-}" ]]; then
  log "SKIP: check communication-health (STAGING_TEST_ADMIN_JWT ausente)"
  log "verify concluído (parcial: SQL/smoke OK; health SKIP)."
  exit 0
fi

command -v curl >/dev/null 2>&1 || fail "curl ausente — necessário para health check."
command -v jq   >/dev/null 2>&1 || fail "jq ausente — necessário para health check."

# API_URL é derivado internamente e imutável: usa STAGING_PROJECT_REF já validado
# por regex ^[a-z0-9]{20}$ em validate-staging.sh. Domínio oficial Supabase:
# https://<PROJECT_REF>.supabase.co/functions/v1/<FUNCTION>.
# NUNCA aceitar host/URL por env — evita exfiltração do JWT admin.
API_URL="https://${STAGING_PROJECT_REF}.supabase.co/functions/v1"

log "step: communication-health (POST autenticado)"
tmp_body="$(mktemp)"
trap 'rm -f "$tmp_body"' EXIT

# -sS silencia progress mas mostra erros; body em arquivo temp; --max-time
# bloqueia hang. Nada é ecoado — nem cabeçalhos, nem body, nem JWT, nem URL.
http_code="$(curl -sS -o "$tmp_body" -w '%{http_code}' \
  --max-time 20 \
  -X POST "${API_URL}/communication-health" \
  -H "Authorization: Bearer ${STAGING_TEST_ADMIN_JWT}" \
  -H "content-type: application/json" \
  --data '{}' 2>/dev/null || true)"

if [[ "${http_code}" != "200" ]]; then
  fail "communication-health retornou HTTP ${http_code} (body não exibido)."
fi

# jq -e retorna 1 se filtro produzir false/null.
if ! jq -e '
      .ok == true
  and .delivery_enabled == false
  and .email.enabled == false
  and .whatsapp.enabled == false
  and .in_app.enabled == false
' "$tmp_body" >/dev/null 2>&1; then
  fail "communication-health: flags de entrega NÃO estão todas OFF ou ok!=true."
fi

log "ok:   communication-health (ok=true, todas as flags OFF)"
log "verify concluído (completo: SQL/smoke/health)."
