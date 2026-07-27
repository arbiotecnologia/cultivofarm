#!/usr/bin/env bash
# validate-staging.sh — checa variáveis e confirmações antes de mutar.
# Nunca imprime DSN, tokens ou senhas. Não usa eval nem set -x.
#
# Dependências:
#  - psql: SEMPRE obrigatório.
#  - supabase CLI: obrigatório apenas quando REQUIRE_SUPABASE_CLI=true
#    (chamado por deploy-functions-staging.sh).
#  - curl/jq: verificados condicionalmente por verify-staging.sh quando
#    STAGING_TEST_ADMIN_JWT estiver presente.
set -Eeuo pipefail

CONFIGURED_REF="navfzbwgwzruipouyfnk"

log()  { printf '[validate] %s\n' "$*"; }
fail() { printf '[validate][ERRO] %s\n' "$*" >&2; exit 1; }

# 1) Dependência mínima (SQL/rollback/verify precisam de psql)
command -v psql >/dev/null 2>&1 || fail "psql ausente no PATH."

# supabase CLI só é obrigatória para o script de deploy de funções.
if [[ "${REQUIRE_SUPABASE_CLI:-false}" == "true" ]]; then
  command -v supabase >/dev/null 2>&1 || fail "Supabase CLI ausente no PATH (necessária para deploy)."
fi

# 2) Variáveis obrigatórias
: "${STAGING_PROJECT_REF:?STAGING_PROJECT_REF obrigatório}"
: "${STAGING_CONFIRM_REF:?STAGING_CONFIRM_REF obrigatório}"
: "${STAGING_DB_URL:?STAGING_DB_URL obrigatório}"

# 3) Confirmação dupla
if [[ "${STAGING_PROJECT_REF}" != "${STAGING_CONFIRM_REF}" ]]; then
  fail "STAGING_PROJECT_REF != STAGING_CONFIRM_REF (confirmação recusada)."
fi

# 4) Recusar ref configurado por padrão
if [[ "${STAGING_PROJECT_REF}" == "${CONFIGURED_REF}" ]]; then
  if [[ "${I_UNDERSTAND_CONFIGURED_REF_IS_STAGING:-false}" != "true" ]]; then
    fail "Ref configurado do repositório recusado como destino. Se realmente for STAGING, exporte I_UNDERSTAND_CONFIGURED_REF_IS_STAGING=true."
  fi
  log "AVISO: usando ref configurado sob override explícito."
fi

# 5) DSN mínima (sem imprimir valor)
case "${STAGING_DB_URL}" in
  postgres://*|postgresql://*) : ;;
  *) fail "STAGING_DB_URL não parece uma DSN Postgres válida." ;;
esac

# 6) Ping ao banco sem imprimir DSN
if ! PGCONNECT_TIMEOUT=8 psql "${STAGING_DB_URL}" -Atqc "select 1" >/dev/null 2>&1; then
  fail "Falha ao conectar no banco de staging (DSN redigida por segurança)."
fi

log "OK — ambiente pronto."
