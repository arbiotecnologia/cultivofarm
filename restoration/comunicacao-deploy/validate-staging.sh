#!/usr/bin/env bash
# validate-staging.sh — checa variáveis e confirmações antes de mutar.
# Nunca imprime DSN, tokens, senhas nem JWT. Sem execução dinâmica nem tracing.
#
# Dependências (todas condicionais, defaults seguros):
#  - psql + STAGING_DB_URL: obrigatórios quando REQUIRE_DATABASE=true (default).
#    apply/verify/rollback exigem DB; deploy-functions-staging desliga.
#  - supabase CLI: obrigatória apenas quando REQUIRE_SUPABASE_CLI=true
#    (setado por deploy-functions-staging.sh).
#  - curl/jq: verificados por verify-staging.sh apenas quando o operador
#    fornece STAGING_TEST_ADMIN_JWT.
set -Eeuo pipefail

CONFIGURED_REF="navfzbwgwzruipouyfnk"

log()  { printf '[validate] %s\n' "$*"; }
fail() { printf '[validate][ERRO] %s\n' "$*" >&2; exit 1; }

# 0) Validação estrita do formato do project ref (Supabase = 20 chars lowercase alfanumérico).
#    Executada SEMPRE, antes de qualquer uso do valor em URL/CLI/DSN.
: "${STAGING_PROJECT_REF:?STAGING_PROJECT_REF obrigatório}"
: "${STAGING_CONFIRM_REF:?STAGING_CONFIRM_REF obrigatório}"
if ! [[ "${STAGING_PROJECT_REF}" =~ ^[a-z0-9]{20}$ ]]; then
  fail "STAGING_PROJECT_REF fora do formato Supabase (20 chars lowercase alfanumérico)."
fi
if ! [[ "${STAGING_CONFIRM_REF}" =~ ^[a-z0-9]{20}$ ]]; then
  fail "STAGING_CONFIRM_REF fora do formato Supabase (20 chars lowercase alfanumérico)."
fi

# 1) Confirmação dupla — sempre exigida.
if [[ "${STAGING_PROJECT_REF}" != "${STAGING_CONFIRM_REF}" ]]; then
  fail "STAGING_PROJECT_REF != STAGING_CONFIRM_REF (confirmação recusada)."
fi

# 2) Recusar ref configurado por padrão — sempre exigido.
if [[ "${STAGING_PROJECT_REF}" == "${CONFIGURED_REF}" ]]; then
  if [[ "${I_UNDERSTAND_CONFIGURED_REF_IS_STAGING:-false}" != "true" ]]; then
    fail "Ref configurado do repositório recusado como destino. Se realmente for STAGING, exporte I_UNDERSTAND_CONFIGURED_REF_IS_STAGING=true."
  fi
  log "AVISO: usando ref configurado sob override explícito."
fi

# 3) Dependência de banco — condicional.
if [[ "${REQUIRE_DATABASE:-true}" == "true" ]]; then
  command -v psql >/dev/null 2>&1 || fail "psql ausente no PATH."
  : "${STAGING_DB_URL:?STAGING_DB_URL obrigatório}"
  case "${STAGING_DB_URL}" in
    postgres://*|postgresql://*) : ;;
    *) fail "STAGING_DB_URL não parece uma DSN Postgres válida." ;;
  esac
  if ! PGCONNECT_TIMEOUT=8 psql "${STAGING_DB_URL}" -Atqc "select 1" >/dev/null 2>&1; then
    fail "Falha ao conectar no banco de staging (DSN redigida por segurança)."
  fi
fi

# 4) Dependência de Supabase CLI — condicional (apenas deploy de funções).
if [[ "${REQUIRE_SUPABASE_CLI:-false}" == "true" ]]; then
  command -v supabase >/dev/null 2>&1 || fail "Supabase CLI ausente no PATH (necessária para deploy)."
fi

log "OK — ambiente pronto."
