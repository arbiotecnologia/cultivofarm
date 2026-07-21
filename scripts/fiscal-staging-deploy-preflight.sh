#!/usr/bin/env bash
# Fase Fiscal 3.10 — DEPLOY EXPLÍCITO E STAGING-ONLY do fiscal-preflight.
#
# Este comando é intencionalmente SEPARADO do orquestrador certify. Ele nunca
# roda automaticamente. Requer todas as variáveis de STAGING + --confirm.
#
# Uso:
#   FISCAL_TEST_ENV=STAGING \
#   FISCAL_TEST_PROJECT_REF=<ref-staging> \
#   scripts/fiscal-staging-deploy-preflight.sh --confirm
set -euo pipefail

PROD_REF="navfzbwgwzruipouyfnk"

: "${FISCAL_TEST_ENV:?FISCAL_TEST_ENV obrigatório (=STAGING)}"
: "${FISCAL_TEST_PROJECT_REF:?FISCAL_TEST_PROJECT_REF obrigatório}"

if [[ "${FISCAL_TEST_ENV}" != "STAGING" ]]; then
  echo "ABORT: FISCAL_TEST_ENV != STAGING" >&2; exit 2
fi
if [[ "${FISCAL_TEST_PROJECT_REF}" == "${PROD_REF}" ]]; then
  echo "ABORT: FISCAL_TEST_PROJECT_REF aponta produção" >&2; exit 2
fi

CONFIRM="${1:-}"
if [[ "$CONFIRM" != "--confirm" ]]; then
  echo "ABORT: passe --confirm explicitamente para prosseguir" >&2
  exit 3
fi

# Preferir supabase CLI se presente. NUNCA usar service_role neste script.
if ! command -v supabase >/dev/null 2>&1; then
  echo "ABORT: supabase CLI ausente — instale localmente antes do deploy" >&2
  exit 4
fi

echo "[deploy-preflight] project-ref=${FISCAL_TEST_PROJECT_REF} (staging)"
supabase functions deploy fiscal-preflight --project-ref "${FISCAL_TEST_PROJECT_REF}" --no-verify-jwt=false
echo "[deploy-preflight] OK"
